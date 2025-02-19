import * as assert from "assert"
import { describe, it } from "mocha"
import { CircularBuffer } from "./CircularBuffer"

describe("CircularBuffer", () => {
	it("throws error for invalid size", () => {
		assert.throws(() => new CircularBuffer(0), Error("Buffer size must be greater than 0"))
		assert.throws(() => new CircularBuffer(-1), Error("Buffer size must be greater than 0"))
	})

	it("handles add and getAll with buffer not full", () => {
		const buffer = new CircularBuffer(3)
		buffer.add("line1")
		buffer.add("line2")

		assert.deepStrictEqual(buffer.getAll(), ["line1", "line2"])
		assert.strictEqual(buffer.getCurrentSize(), 2)
	})

	it("handles add and getAll with buffer full", () => {
		const buffer = new CircularBuffer(3)
		buffer.add("line1")
		buffer.add("line2")
		buffer.add("line3")
		buffer.add("line4")

		assert.deepStrictEqual(buffer.getAll(), ["line2", "line3", "line4"])
		assert.strictEqual(buffer.getCurrentSize(), 3)
	})

	it("handles getRecent with various sizes", () => {
		const buffer = new CircularBuffer(5)
		buffer.add("line1")
		buffer.add("line2")
		buffer.add("line3")
		buffer.add("line4")
		buffer.add("line5")

		assert.deepStrictEqual(buffer.getRecent(3), ["line3", "line4", "line5"])
		assert.deepStrictEqual(buffer.getRecent(1), ["line5"])
		assert.deepStrictEqual(buffer.getRecent(5), ["line1", "line2", "line3", "line4", "line5"])
		assert.deepStrictEqual(buffer.getRecent(6), ["line1", "line2", "line3", "line4", "line5"])
	})

	it("handles getRecent with invalid sizes", () => {
		const buffer = new CircularBuffer(3)
		buffer.add("line1")

		assert.deepStrictEqual(buffer.getRecent(0), [])
		assert.deepStrictEqual(buffer.getRecent(-1), [])
	})

	it("handles clear operation", () => {
		const buffer = new CircularBuffer(3)
		buffer.add("line1")
		buffer.add("line2")
		buffer.clear()

		assert.deepStrictEqual(buffer.getAll(), [])
		assert.strictEqual(buffer.getCurrentSize(), 0)

		buffer.add("line3")
		assert.deepStrictEqual(buffer.getAll(), ["line3"])
	})

	it("handles wrapping around buffer multiple times", () => {
		const buffer = new CircularBuffer(3)

		// First round
		buffer.add("line1")
		buffer.add("line2")
		buffer.add("line3")
		assert.deepStrictEqual(buffer.getAll(), ["line1", "line2", "line3"])

		// Second round
		buffer.add("line4")
		buffer.add("line5")
		buffer.add("line6")
		assert.deepStrictEqual(buffer.getAll(), ["line4", "line5", "line6"])

		// Partial third round
		buffer.add("line7")
		assert.deepStrictEqual(buffer.getAll(), ["line5", "line6", "line7"])
	})

	it("returns correct max size", () => {
		const buffer = new CircularBuffer(5)
		assert.strictEqual(buffer.getMaxSize(), 5)
	})

	it("updates current size correctly", () => {
		const buffer = new CircularBuffer(3)
		assert.strictEqual(buffer.getCurrentSize(), 0)

		buffer.add("line1")
		assert.strictEqual(buffer.getCurrentSize(), 1)

		buffer.add("line2")
		buffer.add("line3")
		assert.strictEqual(buffer.getCurrentSize(), 3)

		buffer.add("line4")
		assert.strictEqual(buffer.getCurrentSize(), 3)

		buffer.clear()
		assert.strictEqual(buffer.getCurrentSize(), 0)
	})
})
