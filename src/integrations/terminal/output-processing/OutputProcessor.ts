import { CircularBuffer } from "./CircularBuffer"

export interface OutputProcessorConfig {
	// Deduplication settings
	similarityThreshold: number // 0.0 to 1.0, higher means more strict matching
	recentLinesSize: number // Number of recent lines to keep for pattern matching

	// Truncation settings
	maxBufferSize: number // Maximum total size in bytes
	keepFirstLines: number // Number of lines to keep from start
	keepLastLines: number // Number of lines to keep from end

	// Pattern matching
	knownPatterns: {
		[key: string]: RegExp
	}
}

export interface ProcessedLine {
	skip: boolean // Whether to skip this line (e.g., if it's a duplicate)
	line?: string // The processed line (if not skipped)
	truncated?: boolean // Whether truncation was applied
}

export const DEFAULT_CONFIG: OutputProcessorConfig = {
	similarityThreshold: 0.9,
	recentLinesSize: 100,
	maxBufferSize: 1024 * 1024, // 1MB
	keepFirstLines: 100,
	keepLastLines: 50,
	knownPatterns: {
		npm: /\[.*\] ⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/,
		webpack: /\[\d+%\]/,
		progress: /^progress/i,
		spinner: /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/,
	},
}

export class OutputProcessor {
	private recentLines: CircularBuffer
	private patternCache: Map<string, boolean>
	private config: OutputProcessorConfig
	private totalSize: number = 0
	private allLines: string[] = []
	private importantLines: Set<number> = new Set() // Line numbers containing errors/warnings

	constructor(config: Partial<OutputProcessorConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.recentLines = new CircularBuffer(this.config.recentLinesSize)
		this.patternCache = new Map()
	}

	/**
	 * Process a new line of output
	 */
	processLine(line: string): ProcessedLine {
		// Always preserve error/warning messages
		if (this.isImportantLine(line)) {
			this.importantLines.add(this.allLines.length)
			this.allLines.push(line)
			this.totalSize += line.length
			return { skip: false, line }
		}

		// Check for known patterns (progress bars, spinners, etc)
		if (this.isKnownPattern(line)) {
			return { skip: true }
		}

		// Check for near-duplicate lines
		if (this.shouldDeduplicate(line)) {
			return { skip: true }
		}

		// Add to buffer and check size
		this.allLines.push(line)
		this.totalSize += line.length
		this.recentLines.add(line)

		// Check if we need to truncate
		if (this.shouldTruncate()) {
			return this.truncateBuffer()
		}

		return { skip: false, line }
	}

	/**
	 * Check if a line matches any known patterns (e.g., progress bars)
	 */
	private isKnownPattern(line: string): boolean {
		const cacheKey = `pattern:${line}`
		if (this.patternCache.has(cacheKey)) {
			return this.patternCache.get(cacheKey)!
		}

		const result = Object.values(this.config.knownPatterns).some((pattern) => pattern.test(line))
		this.patternCache.set(cacheKey, result)
		return result
	}

	/**
	 * Check if a line should be deduplicated based on similarity to recent lines
	 */
	private shouldDeduplicate(line: string): boolean {
		const cacheKey = `dedup:${line}`
		if (this.patternCache.has(cacheKey)) {
			return this.patternCache.get(cacheKey)!
		}

		const recentLines = this.recentLines.getRecent(10) // Check last 10 lines
		const isDuplicate = recentLines.some(
			(recentLine) => this.calculateSimilarity(line, recentLine) >= this.config.similarityThreshold,
		)

		this.patternCache.set(cacheKey, isDuplicate)
		return isDuplicate
	}

	/**
	 * Calculate similarity between two strings (0.0 to 1.0)
	 */
	private calculateSimilarity(a: string, b: string): number {
		if (a === b) {
			return 1.0
		}
		if (!a || !b) {
			return 0.0
		}

		// Use Levenshtein distance for similarity
		const distance = this.levenshteinDistance(a, b)
		const maxLength = Math.max(a.length, b.length)
		return 1 - distance / maxLength
	}

	/**
	 * Calculate Levenshtein distance between two strings
	 */
	private levenshteinDistance(a: string, b: string): number {
		const matrix: number[][] = []

		for (let i = 0; i <= b.length; i++) {
			matrix[i] = [i]
		}

		for (let j = 0; j <= a.length; j++) {
			matrix[0][j] = j
		}

		for (let i = 1; i <= b.length; i++) {
			for (let j = 1; j <= a.length; j++) {
				if (b.charAt(i - 1) === a.charAt(j - 1)) {
					matrix[i][j] = matrix[i - 1][j - 1]
				} else {
					matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
				}
			}
		}

		return matrix[b.length][a.length]
	}

	/**
	 * Check if the buffer needs truncation
	 */
	private shouldTruncate(): boolean {
		return this.totalSize > this.config.maxBufferSize
	}

	/**
	 * Truncate the buffer while preserving important lines
	 */
	private truncateBuffer(): ProcessedLine {
		const { keepFirstLines, keepLastLines } = this.config
		const totalLines = this.allLines.length

		// If we have fewer lines than we want to keep, no truncation needed
		if (totalLines <= keepFirstLines + keepLastLines) {
			return { skip: false, line: this.allLines[totalLines - 1] }
		}

		// Create new array with first N and last N lines
		const newLines: string[] = []

		// Add first N lines
		for (let i = 0; i < keepFirstLines; i++) {
			if (this.importantLines.has(i)) {
				newLines.push(this.allLines[i])
			}
		}

		// Add last N lines
		const startLastN = Math.max(keepFirstLines, totalLines - keepLastLines)
		for (let i = startLastN; i < totalLines; i++) {
			if (this.importantLines.has(i)) {
				newLines.push(this.allLines[i])
			}
		}

		// Update state
		this.allLines = newLines
		this.totalSize = newLines.reduce((sum, line) => sum + line.length, 0)
		this.importantLines.clear()

		return {
			skip: false,
			line: this.allLines[this.allLines.length - 1],
			truncated: true,
		}
	}

	/**
	 * Check if a line contains important information that should be preserved
	 */
	private isImportantLine(line: string): boolean {
		const importantPatterns = [/error/i, /warning/i, /fail/i, /exception/i, /critical/i]

		return importantPatterns.some((pattern) => pattern.test(line))
	}

	/**
	 * Get all processed lines
	 */
	getProcessedLines(): string[] {
		return [...this.allLines]
	}

	/**
	 * Clear the processor state
	 */
	clear(): void {
		this.recentLines.clear()
		this.patternCache.clear()
		this.allLines = []
		this.totalSize = 0
		this.importantLines.clear()
	}
}
