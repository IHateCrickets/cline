import * as vscode from "vscode"

// Simple ANSI escape code stripper for tests
export function stripAnsi(str: string): string {
	return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")
}

// For testing purposes, we create a simplified mock that matches the shape
// of what we actually use from VSCode's Terminal interface, rather than
// implementing the full interface. This allows our tests to be more focused
// and resilient to VSCode API changes.
export class MockTerminal implements vscode.Terminal {
	private commandOutput: string[]
	private mockCwd: vscode.Uri

	// Required Terminal interface properties
	readonly name: string = "Mock Terminal"
	readonly processId: Thenable<number> = Promise.resolve(1)
	readonly creationOptions: vscode.TerminalOptions = {}
	readonly exitStatus: vscode.TerminalExitStatus | undefined = undefined
	readonly state: vscode.TerminalState = { isInteractedWith: true }
	// @ts-ignore - Intentionally extending VSCode types for backward compatibility
	readonly shellIntegration: {
		cwd: vscode.Uri
		executeCommand: (command: string) => {
			read: () => AsyncIterable<string>
		}
	}

	constructor(output: string[] = [], cwd?: string) {
		this.commandOutput = output
		this.mockCwd = vscode.Uri.file(cwd || process.cwd())

		// Initialize shellIntegration after mockCwd is set
		this.shellIntegration = {
			cwd: this.mockCwd,
			executeCommand: ((command: string) => {
				const output = this.commandOutput
				return {
					async *read() {
						for (const line of output) {
							yield line + "\n"
						}
					},
				}
			}).bind(this),
		}
	}

	show(preserveFocus?: boolean): void {}
	hide(): void {}
	dispose(): void {}
	sendText(text: string, addNewLine?: boolean): void {}
}
