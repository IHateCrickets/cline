import { stripAnsi } from "../../../utils/ansi"

export interface OutputProcessorConfig {
	maxBufferSize: number
	keepFirstChars: number
	keepLastChars: number
}

export interface ProcessedLine {
	skip: boolean
	line?: string
	truncated?: boolean
}

export const DEFAULT_CONFIG: OutputProcessorConfig = {
	maxBufferSize: 1024 * 1024, // 1MB
	keepFirstChars: 10000, // First 10KB
	keepLastChars: 10000, // Last 10KB
}

export class OutputProcessor {
	private buffer: string = ""
	private totalSize: number = 0
	private wasTruncated: boolean = false
	private config: OutputProcessorConfig

	constructor(config: Partial<OutputProcessorConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config }
	}

	processLine(line: string): ProcessedLine {
		// Strip ANSI escape codes first
		const cleanLine = stripAnsi(line)

		// Always preserve error/warning messages
		if (this.isImportantLine(cleanLine)) {
			this.addToBuffer(cleanLine + "\n")
			return { skip: false, line: cleanLine }
		}

		// Add to buffer
		this.addToBuffer(cleanLine + "\n")

		// Check for truncation
		if (this.shouldTruncate()) {
			this.truncateBuffer()
			return {
				skip: false,
				line: cleanLine,
				truncated: !this.wasTruncated, // Only set truncated=true the first time
			}
		}

		return { skip: false, line: cleanLine }
	}

	private addToBuffer(text: string): void {
		this.buffer += text
		this.totalSize += text.length
	}

	private shouldTruncate(): boolean {
		return this.totalSize > this.config.maxBufferSize
	}

	private truncateBuffer(): void {
		const { keepFirstChars, keepLastChars } = this.config

		// If buffer is smaller than what we want to keep, no truncation needed
		if (this.buffer.length <= keepFirstChars + keepLastChars) {
			return
		}

		// Keep first N and last N characters
		const firstPart = this.buffer.slice(0, keepFirstChars)
		const lastPart = this.buffer.slice(-keepLastChars)

		// Update buffer
		this.buffer = firstPart + "\n[...output truncated...]\n" + lastPart
		this.totalSize = this.buffer.length
		this.wasTruncated = true
	}

	private isImportantLine(line: string): boolean {
		return /error|warning|fail|exception|critical/i.test(line)
	}

	getProcessedOutput(): string {
		return this.buffer
	}

	getTotalSize(): number {
		return this.totalSize
	}

	getConfig(): OutputProcessorConfig {
		return { ...this.config }
	}

	clear(): void {
		this.buffer = ""
		this.totalSize = 0
		this.wasTruncated = false
	}
}
