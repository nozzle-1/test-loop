// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

class TestWatcher implements vscode.Disposable {
	private fileWatcher?: vscode.FileSystemWatcher;
	private disposables: vscode.Disposable[] = [];
	private statusBar: vscode.StatusBarItem;
	private running = false;
	private debounceTimer?: NodeJS.Timeout;
	private executing = false;
	private configDisposable?: vscode.Disposable;
	private cooldownMs: number | undefined = 200;
	private debounceMs: number | undefined = 300;

	// Paths to ignore to avoid loops (this will be loaded from settings `test-loop.ignorePatterns`)
	private ignoreSegments: string[] = [];

	// Fallback default list (used if no configuration is provided)
	private readonly defaultIgnorePatterns: string[] = [
		'node_modules',
		'bower_components',
		'/out/',
		'/dist/',
		'/build/',
		'/bin/',
		'/obj/',
		'/target/',
		'/release/',
		'/debug/',
		'.git/',
		'.vscode/',
		'.idea/',
		'.dart_tool',
		'.gradle/',
		'.pytest_cache',
		'__pycache__',
		'.mypy_cache',
		'.venv',
		'/venv/',
		'/env/',
		'.cache',
		'.nyc_output',
		'coverage',
		'test-results',
		'reports',
		'.sass-cache',
		'.parcel-cache',
		'.next',
		'.nuxt',
		'.turbo',
		'.history',
		'.DS_Store',
		'__MACOSX',
		'Thumbs.db',
		'desktop.ini',
		'$RECYCLE.BIN',
		'lost+found',
		'System Volume Information',
		'.idea/workspace.xml'
	];

	private isIgnoredPath(path: string): boolean {
		// Normalize to forward slashes
		const p = path.replace(/\\/g, '/');
		const parts = p.split('/').filter(Boolean);

		for (const seg of this.ignoreSegments) {
			if (!seg || seg.trim().length === 0) {
				continue;
			}

			// If pattern contains a slash, test contains or endsWith for specific sub-paths
			if (seg.includes('/')) {
				// normalize pattern
				const norm = seg.replace(/\\/g, '/');
				if (p.includes(norm) || p.endsWith(norm)) {
					return true;
				}
				continue;
			}

			const normSeg = seg.replace(/^\/+|\/+$/g, '').toLowerCase();

			// Exact segment match (folder or file name)
			for (const part of parts) {
				if (part.toLowerCase() === normSeg) {
					return true;
				}
			}

			// If pattern contains a dot (likely a filename or extension), also check filename
			if (normSeg.includes('.')) {
				const filename = parts.length ? parts[parts.length - 1].toLowerCase() : '';
				if (filename === normSeg) {
					return true;
				}
			}
		}

		return false;
	}

	private sourceExtensions = new Set([
		'dart', 'ts', 'tsx', 'js', 'jsx', 'py', 'java', 'kt', 'kts', 'swift', 'rs', 'go', 'c', 'cpp', 'cs', 'php', 'rb', 'm', 'mm', 'scala', 'hs'
	]);


	private formatStatusBarText(text: string): string {
		return `Test Loop: ${text}`;
	}

	private isTestPath(path: string): boolean {
		const p = path.replace(/\\/g, '/');
		const filename = p.split('/').pop() || '';

		// Common test folders
		if (/\/test(s)?\//i.test(p) || /\/__tests__\//i.test(p)) {
			return true;
		}

		// Common test filename patterns
		if (/(_test|\.test|\.spec|_spec)\./i.test(filename) || /(^test_)/i.test(filename) || /(Spec\.|Spec$)/i.test(filename)) {
			return true;
		}

		// Dart specific
		if (/[_-]test\.dart$/i.test(filename) || /_test\.dart$/i.test(filename) || /test_.*\.dart$/i.test(filename)) {
			return true;
		}

		return false;
	}

	private isSourcePath(path: string): boolean {
		const p = path.replace(/\\/g, '/');
		const filename = p.split('/').pop() || '';
		const dot = filename.lastIndexOf('.');
		if (dot === -1) {
			return false;
		}
		const ext = filename.substring(dot + 1).toLowerCase();
		return this.sourceExtensions.has(ext);
	}

	private hasErrors(): boolean {
		const all = vscode.languages.getDiagnostics();
		for (const [, diags] of all) {
			for (const d of diags) {
				if (d.severity === vscode.DiagnosticSeverity.Error) {
					return true;
				}
			}
		}
		return false;
	}

	constructor() {
		// Listen for configuration changes so ignorePatterns and timing can be updated live
		this.configDisposable = vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('test-loop')) {
				this.loadConfiguration();
			}
		});
		this.disposables.push(this.configDisposable);

		this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
		this.statusBar.text = this.formatStatusBarText('Off');
		this.statusBar.command = 'test-loop.toggleWatch';
		this.statusBar.tooltip = 'Toggle Test Loop';
		this.statusBar.show();

		this.loadConfiguration();
	}

	public toggle() {
		if (this.running) {
			this.stop();
		} else {
			// start may perform async checks (e.g. detect Flutter projects)
			void this.start();
		}
	}

	public async start() {
		if (this.running) {
			return;
		}

		this.running = true;

		this.statusBar.text = this.formatStatusBarText('On');

		this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*', true);

		const onChange = (uri: vscode.Uri) => {
			// Filter out changes from ignored paths to prevent watch loops
			const path = uri.fsPath.replace(/\\/g, '/');
			if (this.isIgnoredPath(path)) {
				return;
			}
			// Only schedule runs for changes in source or test files (language-aware)
			const isTest = this.isTestPath(path);
			const isSource = this.isSourcePath(path);

			if (!isTest && !isSource) {
				// ignore non-source/test files
				return;
			}


			this.scheduleRun(`file change: ${uri.fsPath}`);
		};
		this.disposables.push(this.fileWatcher.onDidChange(onChange));
		this.disposables.push(this.fileWatcher.onDidCreate(onChange));
		this.disposables.push(this.fileWatcher.onDidDelete(onChange));

		// Note: not listening to `vscode.tests.onDidChangeTest` because it's not available
		// in the stable types; file changes above cover most watch scenarios.

		// Run immediately when starting
		this.runTests('watch-start');
	}

	private loadConfiguration() {
		const cfg = vscode.workspace.getConfiguration('test-loop');

		try {
			const configured = cfg.get<string[]>('ignorePatterns');
			if (Array.isArray(configured) && configured.length) {
				this.ignoreSegments = configured.slice();
			} else {
				this.ignoreSegments = this.defaultIgnorePatterns.slice();
			}
		} catch (e) {
			this.ignoreSegments = this.defaultIgnorePatterns.slice();
		}

		this.cooldownMs = cfg.get<number>('cooldownMs', 200);
		this.debounceMs = cfg.get<number>('debounceMs', 300);
	}

	public stop() {
		if (!this.running) {
			return;
		}
		this.running = false;
		this.statusBar.text = this.formatStatusBarText('Off');

		if (this.fileWatcher) {
			this.fileWatcher.dispose();
			this.fileWatcher = undefined;
		}
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = undefined;
		}
	}

	public runNow() {
		this.runTests('manual');
	}

	private scheduleRun(reason: string) {
		// Debounce rapid file events
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = setTimeout(() => {
			this.runTests(reason);
			this.debounceTimer = undefined;
		}, this.debounceMs);
	}

	private async runTests(reason?: string) {
		if (this.hasErrors()) {
			await vscode.commands.executeCommand('testing.clearTestResults');
			return;
		}

		if (this.executing) {
			// already running tests; skip
			return;
		}
		this.executing = true;
		try {
			// Try the built-in testing.runAll command first
			await vscode.commands.executeCommand('testing.runAll');
		} catch (err) {
			// Fallback: try generic testing.run
			try {
				await vscode.commands.executeCommand('testing.run');
			} catch (e) {
				vscode.window.showWarningMessage('Unable to start test run. Ensure a test adapter is installed.');
			}
		} finally {
			// small delay after tests finish to avoid immediate file events
			setTimeout(() => { this.executing = false; }, this.cooldownMs);
		}
	}

	dispose() {
		this.stop();
		this.statusBar.dispose();
	}
}

export function activate(context: vscode.ExtensionContext) {
	const watcher = new TestWatcher();

	context.subscriptions.push(vscode.commands.registerCommand('test-loop.toggleWatch', () => watcher.toggle()));
	context.subscriptions.push(watcher);

	// Provide a quick info to indicate activation in the console
	console.log('test-loop: activated');
}

export function deactivate() { }
