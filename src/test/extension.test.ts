import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

suite('Extension Test Suite', () => {

	test('activate extension and register command', async () => {
		// Activate the extension
		const ext = vscode.extensions.getExtension('nozzle-1.test-loop');
		assert.ok(ext, 'Extension should be present in extensions list');

		await ext!.activate();

		// The toggle command should be registered
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('test-loop.toggleWatch'), 'toggle command should be registered');
	});

	test('toggle watcher command executes without error', async () => {
		// Execute the toggle command twice (start and stop)
		await vscode.commands.executeCommand('test-loop.toggleWatch');

		// small delay to allow async start logic to run
		await new Promise(resolve => setTimeout(resolve, 500));

		await vscode.commands.executeCommand('test-loop.toggleWatch');

		// and another delay for stop
		await new Promise(resolve => setTimeout(resolve, 100));

		// If no exceptions were thrown, consider the toggle working in this environment
		assert.ok(true);
	});

	test('file system watcher triggers a test run on source change', async function () {
		this.timeout(20000);

		const ext = vscode.extensions.getExtension('nozzle-1.test-loop');
		assert.ok(ext, 'Extension should be present');
		await ext!.activate();

		// Ensure there's a workspace folder; if not, create a temporary one
		let addedFolder = false;
		let tmpDir: string | undefined;
		let folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
		if (!folder) {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-loop-'));
			fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
			const ok = vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.file(tmpDir), name: 'tmp-workspace' });
			assert.ok(ok, 'should be able to add workspace folder');
			folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
			addedFolder = true;
		}

		// Register a fake testing.runAll command to observe when the watcher triggers it
		let runCalled = false;
		let disp: vscode.Disposable | undefined;
		const runPromise = new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('timed out waiting for testing.runAll')), 12000);
			disp = vscode.commands.registerCommand('testing.runAll', () => {
				clearTimeout(timeout);
				runCalled = true;
				if (disp) { disp.dispose(); }
				resolve();
			});
		});

		// Start the watcher
		await vscode.commands.executeCommand('test-loop.toggleWatch');

		// small delay to allow watcher to initialize
		await new Promise(r => setTimeout(r, 500));

		// Create a source file that should trigger the watcher (ts extension recognized as source)
		folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
		assert.ok(folder, 'Workspace folder is required for this test');
		const fileUri = vscode.Uri.joinPath(folder!.uri, 'src', 'watcher-trigger.test.ts');

		await vscode.workspace.fs.writeFile(fileUri, Buffer.from('// trigger\n'));

		// Wait for the fake testing.runAll to be called
		await runPromise;

		// Stop the watcher
		await vscode.commands.executeCommand('test-loop.toggleWatch');

		// Cleanup the file and workspace folder if we created one
		try { await vscode.workspace.fs.delete(fileUri); } catch (e) { /* ignore */ }
		if (addedFolder && tmpDir) {
			vscode.workspace.updateWorkspaceFolders(0, 1);
			try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
		}

		assert.strictEqual(runCalled, true, 'testing.runAll should have been triggered by file change');
	});

});
