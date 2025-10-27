import { exec } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import type { Scheme } from "./configScheme";

const disabledTasksKey = "statusbartask.disabledTasks";
const checksumKey = "statusbartask.checksum";

export const Commands = {
  executeScripts: "statusbartask.executeScripts",
  goToError: "statusbartask.goToError",
  reInit: "statusbartask.reInit",
  toggleTasks: "statusbartask.toggleTasks",
} as const;

export class Controller {
  workspaceFolder: string | undefined;
  config: Scheme.Config | undefined;
  /** True if at least one sync script is running */
  areSyncScriptsRunning: boolean = false;
  /** True if at least one sync script is pending to run again */
  areSyncScriptsPending: boolean = false;
  scriptsByCode: Map<string, Scheme.Script> = new Map();
  syncDelayTimer?: NodeJS.Timeout;
  lastChangeTime: number = 0;

  constructor(
    private context: vscode.ExtensionContext,
    private outputChannel: vscode.OutputChannel,
  ) {}

  public async reInit(): Promise<void> {
    this.removeStatusButtons();
    this.config = undefined;

    this.workspaceFolder = this.getWorkspaceFolder();
    if (!this.workspaceFolder) {
      this.logToOutput("Not workspace");
      return;
    }

    // Try to load from workspace folder
    const configFilePathInWs = join(this.workspaceFolder, ".statusBarTask.json");
    if (existsSync(configFilePathInWs)) {
      await this._loadConfigWithChecksum(configFilePathInWs);
    } else {
      // If not in workspace, try to load from parent directory
      const configFilePathInParent = join(this.workspaceFolder!, "..", ".statusBarTask.json");
      if (existsSync(configFilePathInParent)) {
        await this._loadConfigWithChecksum(configFilePathInParent);
      } else {
        this.logToOutput(`Config file not found in workspace or parent directory.`);
      }
    }
  }

  private _loadConfig(configFilePath: string) {
    this.logToOutput(`Load config file ${configFilePath}`);
    try {
      const config: Scheme.Config = JSON.parse(readFileSync(configFilePath, "utf-8"));
      const disabledTasks = this.getDisabledTasks();
      this.config = config;
      this.scriptsByCode = new Map();
      config.asyncScripts ??= [];
      config.asyncScripts.forEach((script: Scheme.AsyncScript, index) => {
        script.code = `async:${index}`;
        this.prepareScript(script, disabledTasks.has(script.code));
      });
      config.syncScripts ??= [];
      config.syncScripts.forEach((script: Scheme.Script, index) => {
        script.code = `sync:${index}`;
        this.prepareScript(script, disabledTasks.has(script.code));
      });
      config.asyncScriptsDelay ??= 2000;
      config.syncScriptsDelay ??= 2000;
      this.areSyncScriptsRunning = false;
    } catch (e) {
      this.logToOutput(`Error: ${e instanceof Error ? e.message : e}`);
      this.config = undefined;
    }
  }

  public async toggleTasks(): Promise<void> {
    if (!this.config) {
      vscode.window.showInformationMessage("No tasks found in .statusBarTask.json");
      return;
    }

    const allScripts = [...this.config.asyncScripts, ...this.config.syncScripts];
    const disabledTasks = this.getDisabledTasks();

    const taskItems: TaskQuickPickItem[] = allScripts.map((script) => ({
      code: script.code,
      label: script.label,
      picked: !disabledTasks.has(script.code),
    }));

    const selectedItems = await vscode.window.showQuickPick(taskItems, {
      placeHolder: "Select tasks to enable",
      canPickMany: true,
    });

    if (selectedItems) {
      const enabledCodes = new Set(selectedItems.map((item) => item.code));
      const newDisabledTasks = allScripts
        .filter((script) => !enabledCodes.has(script.code))
        .map((script) => script.code);

      await this.context.workspaceState.update(disabledTasksKey, newDisabledTasks);
      this.reInit();
    }
  }

  public async executeScripts(): Promise<void> {
    if (!this.workspaceFolder || !this.config) {
      return;
    }
    this.outputChannel.appendLine(``);
    this.logToOutput(`Execute scripts`);
    this.lastChangeTime = Date.now();

    const disabledTasks = this.getDisabledTasks();
    for (const script of this.config.asyncScripts) {
      if (!disabledTasks.has(script.code)) {
        this.executeAsyncScript(script);
      }
    }
    this.executeSyncScripts(this.config.syncScriptsDelay, disabledTasks);
  }

  private async executeSyncScripts(delay: number, disabledTasks?: Set<string>) {
    disabledTasks ??= this.getDisabledTasks();
    const syncScripts = this.config!.syncScripts.filter((script) => !disabledTasks.has(script.code));
    if (syncScripts.length === 0) {
      return;
    }

    this.logToOutput(`Sync scripts waiting ${delay} ms`);

    this.areSyncScriptsPending = true;
    syncScripts.forEach((script) => {
      this.drawPendingButton(script);
      script.isPending = true;
    });

    clearTimeout(this.syncDelayTimer);
    this.syncDelayTimer = setTimeout(async () => {
      if (this.areSyncScriptsRunning) {
        return;
      }
      this.areSyncScriptsRunning = true;
      this.areSyncScriptsPending = false;
      try {
        for (const script of syncScripts) {
          await this.executeSyncScript(script);
          if (this.areSyncScriptsPending) {
            break;
          }
        }
      } finally {
        this.areSyncScriptsRunning = false;
        if (this.areSyncScriptsPending) {
          this.logToOutput("Run again sync");
          this.areSyncScriptsPending = false;
          this.executeSyncScripts(Math.max(this.lastChangeTime + this.config!.syncScriptsDelay - Date.now(), 500));
        }
      }
    }, delay);
  }

  private async executeAsyncScript(script: Scheme.AsyncScript): Promise<void> {
    const delayBeforeExecution = script.delay ?? this.config!.asyncScriptsDelay;
    this.logToOutput(`${script.label}: waiting ${delayBeforeExecution} ms`);

    this.drawPendingButton(script);

    clearTimeout(script.delayTimer);
    script.delayTimer = setTimeout(async () => {
      if (script.isRunning) {
        this.logToOutput(`${script.label}: Already running`);
        script.isPending = true;
        return;
      }

      this.logToOutput(`${script.label}: Execute`);
      script.isPending = false;
      script.isRunning = true;
      try {
        await this.execAsPromise(script, script.statusBarItem);
      } catch {
        script.statusBarItem.text = `${script.label} $(error)`;
      } finally {
        script.isRunning = false;
        if (script.isPending) {
          this.logToOutput(`${script.label}: Run again`);
          script.isPending = false;
          this.executeAsyncScript(script);
        }
      }
    }, delayBeforeExecution);
  }

  private async executeSyncScript(script: Scheme.AsyncScript): Promise<void> {
    this.logToOutput(`${script.label}: Execute`);
    script.isPending = false;
    script.isRunning = true;
    try {
      await this.execAsPromise(script, script.statusBarItem);
    } catch {
      script.statusBarItem.text = `${script.label} $(error)`;
    } finally {
      script.isRunning = false;
    }
  }

  private drawPendingButton(script: Scheme.Script) {
    if (!script.isRunning) {
      script.statusBarItem.text = `${script.label} $(watch)`;
      script.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
  }

  public async goToError(scriptCode: string): Promise<void> {
    const script = this.scriptsByCode.get(scriptCode);
    if (script && script.lastErrorList.length > 0) {
      const fileAndLine = script.lastErrorList[script.errorClickIndex];
      script.errorClickIndex = (script.errorClickIndex + 1) % script.lastErrorList.length;
      if (fileAndLine) {
        const match = fileAndLine.match(/^(.+?)(:\d+)?(:\d+)?$/);
        if (match) {
          const filePath = match[1].replace("\\", "/");
          const file = vscode.Uri.file(filePath);
          const lineNumber = parseInt((match[2] || "1").replace(":", ""), 10) - 1;
          const columnNumber = parseInt((match[3] || "1").replace(":", ""), 10) - 1;
          try {
            await vscode.window.showTextDocument(file, {
              selection: new vscode.Range(lineNumber, columnNumber, lineNumber, columnNumber),
            });
          } catch (_e) {
            this.logToOutput(`Cannot find file: ${filePath}, line: ${lineNumber}, column: ${columnNumber}`);
            this.outputChannel.show();
          }
        }
      }
    }
  }

  private prepareScript(script: Scheme.Script, disabled: boolean) {
    this.scriptsByCode.set(script.code, script);
    script.isRunning = false;
    script.isPending = false;
    script.lastErrorList = [];
    script.errorClickIndex = 0;
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    statusBarItem.command = {
      title: script.label,
      command: Commands.goToError,
      arguments: [script.code],
    };
    this.context.subscriptions.push(statusBarItem);
    statusBarItem.text = script.label;
    statusBarItem.show();
    if (disabled) {
      statusBarItem.text = `$(close) ${statusBarItem.text}`;
      statusBarItem.color = "rgb(131, 131, 131)";
      statusBarItem.tooltip = "Disabled, run command 'StatusBarTask: Enable/disable tasks' for change";
    }
    script.statusBarItem = statusBarItem;
  }

  private removeStatusButtons() {
    for (const script of this.scriptsByCode.values()) {
      script.statusBarItem.dispose();
    }
  }

  private getWorkspaceFolder(): string | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    return workspaceFolder?.uri.fsPath;
  }

  private async _loadConfigWithChecksum(configFilePath: string): Promise<void> {
    const fileContent = readFileSync(configFilePath, "utf-8");
    const checksum = createHash("sha256").update(fileContent).digest("hex");
    const storedChecksum = this.context.workspaceState.get<string>(checksumKey);

    if (checksum === storedChecksum) {
      this._loadConfig(configFilePath);
    } else {
      const result = await vscode.window.showWarningMessage(
        `The .statusBarTask.json file at ${configFilePath} has changed. Do you want to load it?\nIf you want to check its content, press cancel, verify it and reload this extension from the command palette.`,
        {
          modal: true,
        },
        "Yes",
      );
      if (result === "Yes") {
        await this.context.workspaceState.update(checksumKey, checksum);
        this._loadConfig(configFilePath);
      } else {
        this.logToOutput(`Loading of .statusBarTask.json from ${configFilePath} aborted by user.`);
      }
    }
  }

  private logToOutput(message: string) {
    console.log(message);
    this.outputChannel.appendLine(
      `${new Date().toLocaleTimeString(undefined, {
        hour12: false,
      })}  ${message}`,
    );
  }

  private async execAsPromise(script: Scheme.Script, statusBarItem: vscode.StatusBarItem): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      statusBarItem.text = `${script.label} $(sync~spin)`;

      exec(script.command, { cwd: this.workspaceFolder }, (err, stdout, stderr) => {
        const end = performance.now();

        const result = [err?.message, stderr.trim(), stdout.trim()].join("\n").trim();
        this.logToOutput(`${script.label}: Output: ${result.trim()}`);

        const lastErrorSet = new Set<string>();
        if (script.problemMatcher) {
          const matches = result.matchAll(new RegExp(script.problemMatcher.matchPattern, "gm"));
          for (const match of matches) {
            let errorLine = match[0];
            if (script.problemMatcher.replacePattern) {
              errorLine = script.problemMatcher.replacePattern;
              errorLine = errorLine.replace(
                // biome-ignore lint/suspicious/noTemplateCurlyInString: this is correct
                "${workspaceFolder}",
                this.workspaceFolder!,
              );
              // Replace ${0}, ${1},... by match
              errorLine = errorLine.replaceAll(/\$\{(\d+)\}/g, (_, indexStr) => {
                return match[parseInt(indexStr, 10)];
              });
            }
            lastErrorSet.add(errorLine);
          }
        } else {
          result
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
            .forEach((l) => {
              lastErrorSet.add(l);
            });
        }
        script.lastErrorList = [...lastErrorSet];
        script.lastErrorList.sort();
        const isError = script.lastErrorList.length > 0;
        script.errorClickIndex = 0;

        statusBarItem.text =
          script.label +
          (isError ? ` $(error) ${script.lastErrorList.length}x` : ` ${((end - start) / 1000).toFixed(2)} s`);
        statusBarItem.backgroundColor = new vscode.ThemeColor(
          isError ? "statusBarItem.errorBackground" : "statusBarItem.successBackground",
        );

        resolve();
      });
    });
  }

  private getDisabledTasks(): Set<string> {
    return new Set(this.context.workspaceState.get<string[]>(disabledTasksKey, []));
  }
}

interface TaskQuickPickItem extends vscode.QuickPickItem {
  code: string;
}
