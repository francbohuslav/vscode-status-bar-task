# StatusBarTask

[![Version](https://img.shields.io/badge/version-1.0.10-blue.svg)](https://github.com/francbohuslav/vscode-status-bar-task)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.104.0+-blue.svg)](https://code.visualstudio.com/)

**StatusBarTask** is a VS Code extension that automatically executes external tasks (shell commands) and displays their results directly in the Status Bar. Perfect for monitoring build processes, linters, tests, or any other scripts without leaving your editor.

## ✨ Features

- **🔄 Automatic Execution**: Runs tasks automatically on file save, creation, or deletion
- **📊 Status Bar Integration**: Real-time status indicators (running, success, error) with execution time
- **⚡ Async & Sync Support**: Run tasks in parallel (async) or sequentially (sync)
- **🎯 Error Navigation**: Click on failed tasks in the status bar to jump directly to error locations
- **🔒 Security**: Validates configuration file integrity with checksum to prevent unauthorized command execution
- **⚙️ Flexible Configuration**: Define tasks in `.statusBarTask.json` in your workspace or parent directory
- **🎛️ Task Management**: Enable or disable specific tasks on the fly

## 🚀 Getting Started

### Installation

#### Option 1: Install from Pre-built VSIX (Recommended)

If pre-built `.vsix` files are available in the [Releases](https://github.com/francbohuslav/vscode-status-bar-task/releases) section:

1. Download the latest `.vsix` file from the releases page
2. Open VS Code
3. Go to Extensions (Ctrl+Shift+X)
4. Click the `...` menu (top right) → "Install from VSIX..."
5. Select the downloaded `.vsix` file
6. Reload VS Code when prompted

#### Option 2: Build from Source

1. **Clone the repository**:
   ```bash
   git clone https://github.com/francbohuslav/vscode-status-bar-task.git
   cd vscode-status-bar-task
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension**:
   ```bash
   npm run package
   ```

4. **Create VSIX package** (requires `@vscode/vsce`):
   ```bash
   npm install -g @vscode/vsce
   vsce package
   ```
   
   Or use the provided script:
   ```bash
   _create_vsix.cmd
   ```

5. **Install the VSIX**:
   - Open VS Code
   - Go to Extensions (Ctrl+Shift+X)
   - Click the `...` menu (top right) → "Install from VSIX..."
   - Select the generated `.vsix` file from the project directory
   - Reload VS Code when prompted

### Quick Start

1. **Create a configuration file** `.statusBarTask.json` in your workspace root:

```json
{
  "asyncScriptsDelay": 2000,
  "syncScriptsDelay": 2000,
  "asyncScripts": [
    {
      "label": "Lint",
      "command": "npm run lint",
      "problemMatcher": {
        "matchPattern": "^(.+):(\\d+):(\\d+) - error .+",
        "replacePattern": "${workspaceFolder}/${1}:${2}:${3}"
      }
    }
  ],
  "syncScripts": [
    {
      "label": "Build",
      "command": "npm run build"
    }
  ]
}
```

2. **Reload VS Code** or run the command `StatusBarTask: Reload configuration` from the Command Palette (Ctrl+Shift+P)

3. Tasks will automatically run when you save files!

## 📖 Configuration

### Configuration File Location

The extension looks for `.statusBarTask.json` in:
1. Workspace root directory
2. Parent directory (one level up from workspace)

### Configuration Schema

```json
{
  "asyncScriptsDelay": 2000,
  "syncScriptsDelay": 2000,
  "asyncScripts": [
    {
      "label": "Task Name",
      "command": "command to execute",
      "delay": 1000,
      "problemMatcher": {
        "matchPattern": "regex pattern",
        "replacePattern": "file path template"
      }
    }
  ],
  "syncScripts": [
    {
      "label": "Task Name",
      "command": "command to execute",
      "problemMatcher": {
        "matchPattern": "regex pattern",
        "replacePattern": "file path template"
      }
    }
  ]
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `asyncScriptsDelay` | number | `2000` | Global delay (debounce) in milliseconds before running async scripts after a file event |
| `syncScriptsDelay` | number | `2000` | Global delay in milliseconds for synchronous scripts |
| `asyncScripts` | array | `[]` | Array of scripts to run in parallel |
| `syncScripts` | array | `[]` | Array of scripts to run sequentially |

### Script Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `label` | string | ✅ | The name displayed in the status bar |
| `command` | string | ✅ | The shell command to execute (runs in workspace directory) |
| `delay` | number | ❌ | Overrides global delay for this specific async script |
| `problemMatcher` | object | ❌ | Configures how to parse errors from output |

### Problem Matcher

The `problemMatcher` allows you to extract file paths and line numbers from command output for error navigation:

- **`matchPattern`**: Regular expression with capture groups to find error lines
- **`replacePattern`**: Template string to format the file path:
  - `${workspaceFolder}` - Replaced with workspace root path
  - `${0}`, `${1}`, `${2}`, etc. - Replaced with regex capture groups

### Example Configurations

#### TypeScript/JavaScript Project

```json
{
  "asyncScriptsDelay": 2000,
  "syncScriptsDelay": 2000,
  "asyncScripts": [
    {
      "label": "ESLint",
      "command": "npm run lint",
      "problemMatcher": {
        "matchPattern": "^(.+?):(\\d+):(\\d+)\\s+(error|warning)",
        "replacePattern": "${workspaceFolder}/${1}:${2}:${3}"
      }
    },
    {
      "label": "Type Check",
      "command": "npx tsc --noEmit",
      "problemMatcher": {
        "matchPattern": "^(.+?)\\((\\d+),(\\d+)\\):\\s+error",
        "replacePattern": "${workspaceFolder}/${1}:${2}:${3}"
      }
    }
  ],
  "syncScripts": [
    {
      "label": "Build",
      "command": "npm run build"
    }
  ]
}
```

## 🎮 Usage Tips

### Status Bar Indicators

- **⌚**: Task is pending/waiting to run
- **🔃**: Task is currently running
- **✅**: Task completed successfully (shows execution time)
- **❌**: Task failed (shows error count)
- **Gray color**: Task is disabled

### Interacting with Tasks

- **Click on a status bar item**: If the task has errors, clicking cycles through error locations and opens them in the editor

### Task Execution Behavior

- **Async Scripts**: Run in parallel, each with its own delay timer. If a file changes while a script is running, it will be queued to run again after completion.
- **Sync Scripts**: Run sequentially one after another. If a file changes during execution, the sequence will restart after current scripts finish.

### Best Practices

1. **Use async scripts** for independent checks (linting, type checking)
2. **Use sync scripts** for dependent operations (build, then test)
3. **Set appropriate delays** to avoid running tasks too frequently
4. **Use problemMatcher** for better error navigation experience
5. **Disable tasks** you don't need to improve performance

## ⌨️ Commands

Access commands via Command Palette (Ctrl+Shift+P):

| Command | Description |
|---------|-------------|
| `StatusBarTask: Execute tasks` | Manually trigger all enabled tasks |
| `StatusBarTask: Reload configuration` | Reload the `.statusBarTask.json` file |
| `StatusBarTask: Enable/disable tasks` | Open a picker to enable or disable specific tasks |

## 🔒 Security

When the `.statusBarTask.json` file changes, the extension will prompt you to approve the change. This prevents malicious repositories from automatically running harmful commands when you open them.

**Always review configuration changes** before approving, especially when:
- Opening a new repository
- Pulling changes from git
- Working with untrusted code

## 🐛 Troubleshooting

### Tasks not running

- Check that `.statusBarTask.json` exists in workspace root or parent directory
- Verify the configuration file is valid JSON
- Check the Output panel (View → Output → StatusBarTask) for error messages
- Run `StatusBarTask: Reload configuration` command

### Status bar items not showing

- Ensure at least one task is defined in the configuration
- Check that tasks are not all disabled (run `StatusBarTask: Enable/disable tasks`)
- Reload the window (Ctrl+R or Cmd+R)

### Errors not navigating correctly

- Verify your `problemMatcher.matchPattern` correctly captures file paths and line numbers
- Check that `replacePattern` uses correct capture group references (\${1}, \${2}, etc.)
- Ensure file paths in output are relative to workspace or use `${workspaceFolder}`

### Tasks running too frequently

- Increase `asyncScriptsDelay` or `syncScriptsDelay` values
- Add individual `delay` to specific async scripts
- Disable tasks you don't need frequently

## 📝 License

[MIT](LICENSE) © Bohuslav Franc

## 🔗 Links

- [Repository](https://github.com/francbohuslav/vscode-status-bar-task)
- [Issues](https://github.com/francbohuslav/vscode-status-bar-task/issues)
