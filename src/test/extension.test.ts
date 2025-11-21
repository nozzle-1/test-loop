import * as assert from 'assert';
import * as vscode from 'vscode';

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

});
