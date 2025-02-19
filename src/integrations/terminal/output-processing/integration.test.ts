import * as assert from "assert"
import { describe, it } from "mocha"
import { TerminalProcess } from "../TerminalProcess"
import { OutputProcessor } from "./OutputProcessor"

describe("Terminal Output Processing Integration", () => {
	it("handles a realistic npm install scenario", async () => {
		// Mock terminal that simulates npm install output
		const mockTerminal = {
			shellIntegration: {
				executeCommand: (command: string) => ({
					read: async function* () {
						// Initial output
						yield "npm install\n"
						yield "added 100 packages\n"

						// Progress bar updates
						for (let i = 0; i < 50; i++) {
							yield `[${i}%] Building...\n`
						}

						// Some warnings
						yield "warn deprecated package@1.0.0\n"

						// More progress
						for (let i = 50; i < 100; i++) {
							yield `[${i}%] Building...\n`
						}

						// Final output
						yield "added 150 packages in 5s\n"
						yield "Done!\n"
					},
				}),
			},
		}

		const process = new TerminalProcess()
		const emittedLines: string[] = []

		process.on("line", (line) => {
			emittedLines.push(line)
		})

		await process.run(mockTerminal as any, "npm install")

		// Verify output processing
		assert.ok(emittedLines.includes("added 100 packages"))
		assert.ok(emittedLines.includes("warn deprecated package@1.0.0"))
		assert.ok(emittedLines.includes("added 150 packages in 5s"))
		assert.ok(emittedLines.includes("Done!"))
	})

	it("handles a webpack build with errors scenario", async () => {
		const mockTerminal = {
			shellIntegration: {
				executeCommand: (command: string) => ({
					read: async function* () {
						// Initial output
						yield "webpack build\n"

						// Progress with spinners
						const spinners = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
						for (const spinner of spinners) {
							yield `${spinner} Compiling...\n`
						}

						// Error output
						yield "ERROR in ./src/index.js\n"
						yield "Module not found: Error: Can't resolve './missing'\n"
						yield "@ ./src/index.js 10:0-20\n"

						// More progress
						for (const spinner of spinners) {
							yield `${spinner} Finishing...\n`
						}

						// Final output
						yield "webpack 5.0.0 compiled with 1 error\n"
					},
				}),
			},
		}

		const process = new TerminalProcess()
		const emittedLines: string[] = []

		process.on("line", (line) => {
			emittedLines.push(line)
		})

		await process.run(mockTerminal as any, "webpack build")

		// Verify error preservation
		assert.ok(emittedLines.includes("ERROR in ./src/index.js"))
		assert.ok(emittedLines.includes("Module not found: Error: Can't resolve './missing'"))
		assert.ok(emittedLines.includes("webpack 5.0.0 compiled with 1 error"))
	})

	it("handles a large git clone output", async () => {
		const mockTerminal = {
			shellIntegration: {
				executeCommand: (command: string) => ({
					read: async function* () {
						// Initial output
						yield "Cloning into 'large-repo'...\n"

						// Progress lines
						for (let i = 0; i < 1000; i++) {
							yield `Receiving objects: ${i / 10}% (${i}/1000)\n`
						}

						// Some important messages mixed in
						yield "warning: large-repo: 150 MB of unexpected data\n"

						// More progress
						for (let i = 0; i < 1000; i++) {
							yield `Resolving deltas: ${i / 10}% (${i}/1000)\n`
						}

						// Final output
						yield "Successfully cloned large-repo\n"
					},
				}),
			},
		}

		const process = new TerminalProcess()
		const emittedLines: string[] = []
		let sawTruncationMessage = false

		process.on("line", (line) => {
			if (line === "[...output truncated...]") {
				sawTruncationMessage = true
			}
			emittedLines.push(line)
		})

		await process.run(mockTerminal as any, "git clone large-repo")

		// Verify truncation
		assert.ok(sawTruncationMessage, "Should show truncation message")

		// Verify important message preservation
		assert.ok(emittedLines.includes("warning: large-repo: 150 MB of unexpected data"))

		// Verify start and end preservation
		assert.ok(emittedLines.includes("Cloning into 'large-repo'..."))
		assert.ok(emittedLines.includes("Successfully cloned large-repo"))
	})
})
