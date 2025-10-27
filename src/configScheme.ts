import type * as vscode from "vscode";

export namespace Scheme {
  export interface Config {
    asyncScriptsDelay: number;
    asyncScripts: AsyncScript[];

    syncScriptsDelay: number;
    syncScripts: Script[];
  }
  export interface Script {
    label: string;
    command: string;
    problemMatcher: ProblemMatcher;

    // Internal
    /** Unique code of script */
    code: string;
    delayTimer?: NodeJS.Timeout;
    isRunning: boolean;
    isPending: boolean;
    lastErrorList: string[];
    /** Index of error to show on click */
    errorClickIndex: number;
    statusBarItem: vscode.StatusBarItem;
  }

  export interface AsyncScript extends Script {
    delay?: number;
  }

  export interface ProblemMatcher {
    matchPattern: string;
    replacePattern: string;
  }
}
