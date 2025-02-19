import { EventEmitter } from "events"
import * as vscode from "vscode"
import { OutputProcessor, DEFAULT_CONFIG } from "./output-processing/OutputProcessor"
import "./types" // Import type declarations

export interface TerminalProcessEvents {
	line: [line: string]
	continue: []
	completed: []
	error: [error: Error]
	no_shell_integration: []
}

// how long to wait after a process outputs anything before we consider it "cool" again
const PROCESS_HOT_TIMEOUT_NORMAL = 2_000
const PROCESS_HOT_TIMEOUT_COMPILING = 15_000

export class TerminalProcess extends EventEmitter<TerminalProcessEvents> {
	waitForShellIntegration: boolean = true
	private isListening: boolean = true
	private buffer: string = ""
	private fullOutput: string = ""
	private lastRetrievedIndex: number = 0
	isHot: boolean = false
	private hotTimer: NodeJS.Timeout | null = null
	private outputProcessor: OutputProcessor
	private hasTruncationMessage: boolean = false

	constructor() {
		super()
		this.outputProcessor = new OutputProcessor({
			maxBufferSize: 100 * 1024, // 100KB buffer for testing
			keepFirstChars: 40 * 1024, // Keep first 40KB
			keepLastChars: 40 * 1024, // Keep last 40KB
		})
	}

	async run(terminal: vscode.Terminal, command: string) {
		if (terminal.shellIntegration && terminal.shellIntegration.executeCommand) {
			const execution = terminal.shellIntegration.executeCommand(command)
			const stream = execution.read()
			let isFirstChunk = true
			let didOutputNonCommand = false
			let didEmitEmptyLine = false
			this.hasTruncationMessage = false

			for await (let data of stream) {
				// Process first chunk specially to handle VSCode shell integration sequences
				if (isFirstChunk) {
					data = this.processFirstChunk(data)
					isFirstChunk = false
				}

				// Handle command echo
				if (!didOutputNonCommand) {
					const { processedData, foundNonCommand } = this.processCommandEcho(data, command)
					data = processedData
					didOutputNonCommand = foundNonCommand
				}

				// Remove VSCode shell integration sequences
				data = this.removeShellIntegrationSequences(data)

				// Handle hot state
				this.updateHotState(data)

				// Emit empty line for spinner if needed
				if (!didEmitEmptyLine && !this.fullOutput && data) {
					this.emit("line", "")
					didEmitEmptyLine = true
				}

				// Process output
				this.fullOutput += data
				if (this.isListening) {
					this.emitIfEol(data)
					this.lastRetrievedIndex = this.fullOutput.length - this.buffer.length
				}
			}

			this.emitRemainingBufferIfListening()
			this.cleanupHotState()
			this.emit("completed")
			this.emit("continue")
		} else {
			terminal.sendText(command, true)
			this.emit("completed")
			this.emit("continue")
			this.emit("no_shell_integration")
		}
	}

	private processFirstChunk(data: string): string {
		// Extract content between command markers if present
		const outputBetweenSequences = this.removeLastLineArtifacts(data.match(/\]633;C([\s\S]*?)\]633;D/)?.[1] || "").trim()

		// Remove all shell integration sequences
		data = this.removeShellIntegrationSequences(data)

		// Add back extracted content if any
		if (outputBetweenSequences) {
			data = outputBetweenSequences + "\n" + data
		}

		// Clean up the data
		const lines = data.split("\n")
		if (lines.length > 0) {
			// Remove non-printable characters
			lines[0] = lines[0].replace(/[^\x20-\x7E]/g, "")
			// Remove duplicate first character
			if (lines[0].length >= 2 && lines[0][0] === lines[0][1]) {
				lines[0] = lines[0].slice(1)
			}
			// Clean up first two lines
			lines[0] = lines[0].replace(/^[^a-zA-Z0-9]*/, "")
			if (lines.length > 1) {
				lines[1] = lines[1].replace(/^[^a-zA-Z0-9]*/, "")
			}
		}

		return lines.join("\n")
	}

	private processCommandEcho(data: string, command: string): { processedData: string; foundNonCommand: boolean } {
		const lines = data.split("\n")
		let foundNonCommand = false

		for (let i = 0; i < lines.length; i++) {
			if (command.includes(lines[i].trim())) {
				lines.splice(i, 1)
				i--
			} else {
				foundNonCommand = true
				break
			}
		}

		return {
			processedData: lines.join("\n"),
			foundNonCommand,
		}
	}

	private removeShellIntegrationSequences(data: string): string {
		// Remove VSCode shell integration sequences
		data = data.replace(/\x1b\]633;.[^\x07]*\x07/g, "")
		// Remove any remaining ]633 sequences that might have been malformed
		data = data.replace(/\]633;[^\n]*/g, "")
		// Remove random commas (temporary fix for shell integration issue)
		data = data.replace(/,/g, "")
		return data
	}

	private updateHotState(data: string) {
		this.isHot = true
		if (this.hotTimer) {
			clearTimeout(this.hotTimer)
		}

		const compilingMarkers = ["compiling", "building", "bundling", "transpiling", "generating", "starting"]
		const markerNullifiers = [
			"compiled",
			"success",
			"finish",
			"complete",
			"succeed",
			"done",
			"end",
			"stop",
			"exit",
			"terminate",
			"error",
			"fail",
		]

		const isCompiling =
			compilingMarkers.some((marker) => data.toLowerCase().includes(marker.toLowerCase())) &&
			!markerNullifiers.some((nullifier) => data.toLowerCase().includes(nullifier.toLowerCase()))

		this.hotTimer = setTimeout(
			() => {
				this.isHot = false
			},
			isCompiling ? PROCESS_HOT_TIMEOUT_COMPILING : PROCESS_HOT_TIMEOUT_NORMAL,
		)
	}

	private cleanupHotState() {
		if (this.hotTimer) {
			clearTimeout(this.hotTimer)
		}
		this.isHot = false
	}

	private emitIfEol(chunk: string) {
		this.buffer += chunk
		let lineEndIndex: number

		while ((lineEndIndex = this.buffer.indexOf("\n")) !== -1) {
			const line = this.buffer.slice(0, lineEndIndex).trimEnd()
			const result = this.outputProcessor.processLine(line)

			if (!result.skip) {
				if (result.truncated && !this.hasTruncationMessage) {
					this.emit("line", "[...output truncated...]")
					this.hasTruncationMessage = true
				}
				if (result.line) {
					this.emit("line", result.line)
				}
			}

			this.buffer = this.buffer.slice(lineEndIndex + 1)
		}
	}

	private emitRemainingBufferIfListening() {
		if (this.buffer && this.isListening) {
			const remainingBuffer = this.removeLastLineArtifacts(this.buffer)
			if (remainingBuffer) {
				const result = this.outputProcessor.processLine(remainingBuffer)
				if (!result.skip) {
					if (result.truncated && !this.hasTruncationMessage) {
						this.emit("line", "[...output truncated...]")
						this.hasTruncationMessage = true
					}
					if (result.line) {
						this.emit("line", result.line)
					}
				}
			}
			this.buffer = ""
			this.lastRetrievedIndex = this.fullOutput.length
		}
	}

	continue() {
		this.emitRemainingBufferIfListening()
		this.isListening = false
		this.removeAllListeners("line")
		this.outputProcessor.clear()
		this.emit("continue")
	}

	getUnretrievedOutput(): string {
		const unretrieved = this.fullOutput.slice(this.lastRetrievedIndex)
		this.lastRetrievedIndex = this.fullOutput.length
		return this.removeLastLineArtifacts(unretrieved)
	}

	private removeLastLineArtifacts(output: string): string {
		const lines = output.trimEnd().split("\n")
		if (lines.length > 0) {
			const lastLine = lines[lines.length - 1]
			lines[lines.length - 1] = lastLine.replace(/[%$#>]\s*$/, "")
		}
		return lines.join("\n").trimEnd()
	}
}

export type TerminalProcessResultPromise = TerminalProcess & Promise<void>

export function mergePromise(process: TerminalProcess, promise: Promise<void>): TerminalProcessResultPromise {
	const nativePromisePrototype = (async () => {})().constructor.prototype
	const descriptors = ["then", "catch", "finally"].map(
		(property) => [property, Reflect.getOwnPropertyDescriptor(nativePromisePrototype, property)] as const,
	)
	for (const [property, descriptor] of descriptors) {
		if (descriptor) {
			const value = descriptor.value.bind(promise)
			Reflect.defineProperty(process, property, { ...descriptor, value })
		}
	}
	return process as TerminalProcessResultPromise
}
