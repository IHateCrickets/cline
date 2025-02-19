import * as assert from "assert"
import { describe, it } from "mocha"
import { OutputProcessor, DEFAULT_CONFIG } from "./OutputProcessor"

describe("OutputProcessor", () => {
	it("processes normal lines without modification", () => {
		const processor = new OutputProcessor()
		const result = processor.processLine("normal line")
		assert.strictEqual(result.skip, false)
		assert.strictEqual(result.line, "normal line")
		assert.strictEqual(result.truncated, undefined)
	})

	describe("Pattern Matching", () => {
		it("detects and skips npm progress patterns", () => {
			const processor = new OutputProcessor()
			const result = processor.processLine("[..................] ⠋ installing dependencies")
			assert.strictEqual(result.skip, true)
		})

		it("detects and skips webpack progress patterns", () => {
			const processor = new OutputProcessor()
			const result = processor.processLine("[75%] Building...")
			assert.strictEqual(result.skip, true)
		})

		it("detects and skips spinner patterns", () => {
			const processor = new OutputProcessor()
			const spinnerChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

			spinnerChars.forEach((char) => {
				const result = processor.processLine(`${char} Processing...`)
				assert.strictEqual(result.skip, true)
			})
		})
	})

	describe("Deduplication", () => {
		it("deduplicates identical lines", () => {
			const processor = new OutputProcessor()
			processor.processLine("duplicate line")
			const result = processor.processLine("duplicate line")
			assert.strictEqual(result.skip, true)
		})

		it("deduplicates similar lines based on threshold", () => {
			const processor = new OutputProcessor({
				similarityThreshold: 0.8,
			})
			processor.processLine("Processing item 123...")
			const result = processor.processLine("Processing item 124...")
			assert.strictEqual(result.skip, true)
		})

		it("keeps lines that are below similarity threshold", () => {
			const processor = new OutputProcessor({
				similarityThreshold: 0.9,
			})
			processor.processLine("Processing item 123...")
			const result = processor.processLine("Different line entirely")
			assert.strictEqual(result.skip, false)
		})
	})

	describe("Important Line Preservation", () => {
		it("always keeps error messages", () => {
			const processor = new OutputProcessor()
			const result = processor.processLine("Error: Something went wrong")
			assert.strictEqual(result.skip, false)
			assert.strictEqual(result.line, "Error: Something went wrong")
		})

		it("always keeps warning messages", () => {
			const processor = new OutputProcessor()
			const result = processor.processLine("Warning: Deprecated feature used")
			assert.strictEqual(result.skip, false)
			assert.strictEqual(result.line, "Warning: Deprecated feature used")
		})

		it("preserves error messages even during truncation", () => {
			const processor = new OutputProcessor({
				maxBufferSize: 50, // Small size to force truncation
				keepFirstLines: 2,
				keepLastLines: 2,
			})

			// Add some normal lines
			processor.processLine("Normal line 1")
			processor.processLine("Error: Important error")
			processor.processLine("Normal line 2")
			processor.processLine("Normal line 3")

			// Get all processed lines
			const lines = processor.getProcessedLines()
			assert.ok(lines.includes("Error: Important error"))
		})
	})

	describe("Truncation", () => {
		it("truncates when buffer size is exceeded", () => {
			const processor = new OutputProcessor({
				maxBufferSize: 50, // Small size to force truncation
				keepFirstLines: 2,
				keepLastLines: 2,
			})

			// Add lines until truncation is needed
			for (let i = 0; i < 10; i++) {
				processor.processLine(`Line ${i}`)
			}

			const lines = processor.getProcessedLines()
			assert.ok(lines.length <= 4) // 2 first + 2 last lines
		})

		it("indicates truncation in result", () => {
			const processor = new OutputProcessor({
				maxBufferSize: 50,
				keepFirstLines: 2,
				keepLastLines: 2,
			})

			// Add lines until truncation is needed
			let result
			for (let i = 0; i < 10; i++) {
				result = processor.processLine(`Line ${i}`)
			}

			assert.strictEqual(result?.truncated, true)
		})
	})

	describe("Configuration", () => {
		it("uses default config when none provided", () => {
			const processor = new OutputProcessor()
			assert.deepStrictEqual(processor["config"], DEFAULT_CONFIG)
		})

		it("merges partial config with defaults", () => {
			const processor = new OutputProcessor({
				similarityThreshold: 0.95,
			})
			assert.strictEqual(processor["config"].similarityThreshold, 0.95)
			assert.strictEqual(processor["config"].recentLinesSize, DEFAULT_CONFIG.recentLinesSize)
		})
	})

	describe("State Management", () => {
		it("clears all internal state", () => {
			const processor = new OutputProcessor()

			// Add some lines
			processor.processLine("Line 1")
			processor.processLine("Line 2")
			processor.processLine("Error: Some error")

			// Clear state
			processor.clear()

			// Verify state is cleared
			assert.deepStrictEqual(processor.getProcessedLines(), [])
			assert.strictEqual(processor["totalSize"], 0)
			assert.strictEqual(processor["importantLines"].size, 0)
		})
	})

	describe("Edge Cases", () => {
		it("handles empty lines", () => {
			const processor = new OutputProcessor()
			const result = processor.processLine("")
			assert.strictEqual(result.skip, false)
			assert.strictEqual(result.line, "")
		})

		it("handles lines with special characters", () => {
			const processor = new OutputProcessor()
			const result = processor.processLine("Line with 特殊文字 and 🎉 emoji")
			assert.strictEqual(result.skip, false)
			assert.strictEqual(result.line, "Line with 特殊文字 and 🎉 emoji")
		})

		it("handles very long lines", () => {
			const processor = new OutputProcessor()
			const longLine = "a".repeat(10000)
			const result = processor.processLine(longLine)
			assert.strictEqual(result.skip, false)
			assert.strictEqual(result.line, longLine)
		})
	})
})
