<p align="center">
  <img src="./docs/banner.png" alt="Test Loop banner" style="max-width:300px;width:100%;height:auto;" />
</p>

# Test Loop — Automatic Test Execution for VS Code

**Test Loop** is a Visual Studio Code extension that automatically re-runs your unit tests whenever you modify your source code or test files.  
It is designed for an efficient Test‑Driven Development (TDD) workflow and is inspired by the *Live Unit Testing* feature available in Visual Studio 2022.

Test Loop works with most programming languages and testing frameworks by letting you define the command used to run your tests.

### Quick highlights

- **Status bar item**: shows `Test Loop: On/Off` and toggles the watcher.
- **Commands**: run via the Command Palette: `Test Loop: Toggle`
- **Configurable**: full control via `test-loop.ignorePatterns`, `test-loop.cooldownMs`, and `test-loop.debounceMs`.
- **Smart filtering**: ignores common build/cache folders by default to avoid loops (configurable).

**Note:** Test Loop relies on VS Code's testing commands (`testing.runAll` / `testing.run`) and the installed test adapters. If those are not available the extension will show a warning.

## Table of contents
- **Usage** — how to start and stop the watcher
- **Configuration** — settings you can tune
- **How it works** — internal behavior and tips
- **Troubleshooting** — common issues (hot reload / loops)

## Usage

- Toggle the watcher from the status bar item (`Test Loop: Off` / `On`) or open the Command Palette and run `Test Loop: Toggle`.
- The extension is activated at startup and will create the status bar item disabled by default. Use the toggle or the command to start watching.

**Start the Extension Development Host (for testing)**
- Press F5 to start an Extension Development Host where you can test the watcher.

## Configuration

All options are configurable in your User or Workspace `settings.json`. The main settings are:

- `test-loop.ignorePatterns` (array[string]) — Default list of folders/subpaths to ignore (OS, build and cache directories). Example defaults include `node_modules`, `.dart_tool`, `build`, `.git`, `.vscode`, `.DS_Store`, etc.
- `test-loop.extraIgnorePatterns` (array[string]) — Additional patterns appended to the ignore list.
- `test-loop.cooldownMs` (number) — Milliseconds to wait after a run finishes before accepting new events (default: 200). Helps avoid runs triggered by generated artifacts.
- `test-loop.debounceMs` (number) — Debounce time after a file change before starting a run (default: 300).

Example `settings.json` snippet:

```json
{
  "test-loop.ignorePatterns": ["node_modules", ".dart_tool", "build"],
  "test-loop.cooldownMs": 500,
  "test-loop.debounceMs": 300
}
```

## Troubleshooting

- If tests are triggered too often, add additional entries to `test-loop.ignorePatterns`.
- If cancellations do not stop the running test process, that is likely an adapter limitation; consider increasing `cooldownMs` to reduce churn.


## Contributing

Contributions and issues are welcome. Please open issues or pull requests on the repository.