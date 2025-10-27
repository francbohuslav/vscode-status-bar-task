import * as vscode from "vscode";
import { Commands, Controller } from "./controller";

let outputChannel: vscode.OutputChannel;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("StatusBarTask");

  const controller = new Controller(context, outputChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand(Commands.executeScripts, async () => await controller.executeScripts()),
  );
  context.subscriptions.push(vscode.commands.registerCommand(Commands.goToError, (args) => controller.goToError(args)));
  context.subscriptions.push(vscode.commands.registerCommand(Commands.reInit, async () => await controller.reInit()));
  context.subscriptions.push(vscode.commands.registerCommand(Commands.toggleTasks, () => controller.toggleTasks()));

  const workspace = vscode.workspace;
  workspace.onDidChangeWorkspaceFolders(async () => await controller.reInit());
  workspace.onDidCreateFiles(async () => await controller.executeScripts());
  workspace.onDidDeleteFiles(async () => await controller.executeScripts());
  workspace.onDidSaveTextDocument(async () => await controller.executeScripts());

  controller.reInit();
}

// This method is called when your extension is deactivated
export function deactivate() {}
