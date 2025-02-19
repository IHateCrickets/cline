import * as vscode from "vscode"

declare module "vscode" {
	interface Terminal {
		shellIntegration?: {
			cwd?: vscode.Uri
			executeCommand?: (command: string) => {
				read: () => AsyncIterable<string>
			}
		}
	}

	interface Window {
		onDidStartTerminalShellExecution?: (
			listener: (e: any) => any,
			thisArgs?: any,
			disposables?: vscode.Disposable[],
		) => vscode.Disposable
	}
}
