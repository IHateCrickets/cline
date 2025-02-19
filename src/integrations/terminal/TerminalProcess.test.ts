import * as assert from "assert"
import { describe, it } from "mocha"
import { TerminalProcess } from "./TerminalProcess"
import { EventEmitter } from "events"
import * as vscode from "vscode"

// Mock VSCode Terminal
class MockTerminal implements Partial<vscode.Terminal> {
	private commandOutput: string[]
	shellIntegration?: {
		executeCommand?: (command: string) => {
			read: () => AsyncIterable<string>
		}
	}

	constructor(output: string[] = []) {
		this.commandOutput = output
		this.shellIntegration = {
			executeCommand: (command: string) => ({
				read: async function* () {
					for (const line of output) {
						yield line + "\n"
					}
				},
			}),
		}
	}

	sendText(text: string, addNewLine = true): void {}
}

describe("TerminalProcess", () => {
	describe("Output Processing", () => {
		it("deduplicates repeated progress lines", async () => {
			const terminal = new MockTerminal([
				"Installing packages...",
				"[....] Installing",
				"[=...] Installing",
				"[==..] Installing",
				"[===.] Installing",
				"[====] Installing",
				"Done!",
			])

			const process = new TerminalProcess()
			const emittedLines: string[] = []

			process.on("line", (line) => {
				emittedLines.push(line)
			})

			await process.run(terminal as any, "npm install")

			// Should only emit first and last progress lines
			assert.deepStrictEqual(emittedLines, [
				"", // Empty line for spinner
				"Installing packages...",
				"Done!",
			])
		})

		it("preserves error messages during deduplication", async () => {
			const terminal = new MockTerminal([
				"Building project...",
				"[....] Building",
				"[=...] Building",
				"Error: Failed to compile",
				"[==..] Building",
				"[===.] Building",
			])

			const process = new TerminalProcess()
			const emittedLines: string[] = []

			process.on("line", (line) => {
				emittedLines.push(line)
			})

			await process.run(terminal as any, "npm run build")

			// Should preserve the error message
			assert.ok(emittedLines.includes("Error: Failed to compile"))
		})

		it("handles truncation of large output", async () => {
			// Generate large output
			const largeOutput = Array(1000).fill("Some repeated output line")
			const terminal = new MockTerminal(largeOutput)

			const process = new TerminalProcess()
			const emittedLines: string[] = []
			let sawTruncationMessage = false

			process.on("line", (line) => {
				if (line === "[...output truncated...]") {
					sawTruncationMessage = true
				}
				emittedLines.push(line)
			})

			await process.run(terminal as any, "some-long-running-command")

			assert.ok(sawTruncationMessage, "Should emit truncation message")
			assert.ok(emittedLines.length < largeOutput.length, "Output should be truncated")
		})

		it("handles VSCode shell integration sequences", async () => {
			const terminal = new MockTerminal(["]633;C", "actual output line", "]633;D", "more output", "]633;A"])

			const process = new TerminalProcess()
			const emittedLines: string[] = []

			process.on("line", (line) => {
				emittedLines.push(line)
			})

			await process.run(terminal as any, "echo test")

			// Should strip shell integration sequences
			assert.ok(!emittedLines.some((line) => line.includes("]633")))
			assert.ok(emittedLines.includes("actual output line"))
			assert.ok(emittedLines.includes("more output"))
		})

		it("clears output processor state on continue", async () => {
			const terminal = new MockTerminal(["First line", "Second line"])

			const process = new TerminalProcess()
			const emittedLines: string[] = []

			process.on("line", (line) => {
				emittedLines.push(line)
			})

			await process.run(terminal as any, "echo test")
			process.continue()

			// Run another command - should not see effects of previous output
			const terminal2 = new MockTerminal(["Another line"])

			await process.run(terminal2 as any, "echo test2")

			// The second command's output should be processed independently
			assert.ok(!emittedLines.includes("Another line"), "Should not emit lines after continue")
		})

		it("preserves empty line emission for spinner behavior", async () => {
			const terminal = new MockTerminal(["Starting long process...", "Working...", "Done!"])

			const process = new TerminalProcess()
			const emittedLines: string[] = []

			process.on("line", (line) => {
				emittedLines.push(line)
			})

			await process.run(terminal as any, "long-process")

			assert.strictEqual(emittedLines[0], "", "First line should be empty for spinner")
		})
	})
})
