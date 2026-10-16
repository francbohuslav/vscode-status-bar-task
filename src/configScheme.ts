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
    lastErrorList: ErrorItem[];
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
    /** Optional template of the error message shown in the tooltip, supports `${0}`, `${1}`,... Default is the whole matched text. */
    messagePattern?: string;
  }

  export interface ErrorItem {
    /** File path with optional line and column, e.g. `/path/file.ts:10:5` */
    location: string;
    message: string;
  }
}
