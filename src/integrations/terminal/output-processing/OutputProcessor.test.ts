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

		it("preserves error messages during truncation", () => {
			const processor = new OutputProcessor({
				maxBufferSize: 50, // Small size to force truncation
				keepFirstChars: 20,
				keepLastChars: 20,
			})

			// Add some normal lines
			processor.processLine("Normal line 1")
			processor.processLine("Error: Important error")
			processor.processLine("Normal line 2")
			processor.processLine("Normal line 3")

			// Get processed output
			const output = processor.getProcessedOutput()
			assert.ok(output.includes("Error: Important error"))
		})
	})

	describe("Truncation", () => {
		it("truncates when buffer size is exceeded", () => {
			const processor = new OutputProcessor({
				maxBufferSize: 50, // Small size to force truncation
				keepFirstChars: 20,
				keepLastChars: 20,
			})

			// Add lines until truncation is needed
			for (let i = 0; i < 10; i++) {
				processor.processLine(`Line ${i}`)
			}

			const output = processor.getProcessedOutput()
			assert.ok(output.includes("[...output truncated...]"))
			assert.ok(output.length <= 50 + 100) // Allow some extra for truncation message
		})

		it("indicates truncation in result", () => {
			const processor = new OutputProcessor({
				maxBufferSize: 50,
				keepFirstChars: 20,
				keepLastChars: 20,
			})

			// Add lines until truncation is needed
			let result
			for (let i = 0; i < 10; i++) {
				result = processor.processLine(`Line ${i}`)
			}

			assert.strictEqual(result?.truncated, true)
		})

		it("only indicates truncation once", () => {
			const processor = new OutputProcessor({
				maxBufferSize: 50,
				keepFirstChars: 20,
				keepLastChars: 20,
			})

			let truncationCount = 0
			for (let i = 0; i < 20; i++) {
				const result = processor.processLine(`Line ${i}`)
				if (result.truncated) {
					truncationCount++
				}
			}

			assert.strictEqual(truncationCount, 1, "Should only indicate truncation once")
		})
	})

	describe("Configuration", () => {
		it("uses default config when none provided", () => {
			const processor = new OutputProcessor()
			assert.deepStrictEqual(processor.getConfig(), DEFAULT_CONFIG)
		})

		it("merges partial config with defaults", () => {
			const processor = new OutputProcessor({
				maxBufferSize: 500,
			})
			const config = processor.getConfig()
			assert.strictEqual(config.maxBufferSize, 500)
			assert.strictEqual(config.keepFirstChars, DEFAULT_CONFIG.keepFirstChars)
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
			assert.strictEqual(processor.getProcessedOutput(), "")
			assert.strictEqual(processor.getTotalSize(), 0)
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
