/**
 * A fixed-size circular buffer for storing recent terminal output lines.
 * Once the buffer reaches its maximum size, new items replace the oldest ones.
 */
export class CircularBuffer {
	private buffer: string[]
	private head: number = 0
	private size: number = 0

	constructor(private maxSize: number) {
		if (maxSize <= 0) {
			throw new Error("Buffer size must be greater than 0")
		}
		this.buffer = new Array(maxSize)
	}

	/**
	 * Add a new line to the buffer. If the buffer is full,
	 * the oldest line will be overwritten.
	 */
	add(line: string): void {
		this.buffer[this.head] = line
		this.head = (this.head + 1) % this.maxSize
		if (this.size < this.maxSize) {
			this.size++
		}
	}

	/**
	 * Get the n most recent lines from the buffer.
	 * @param n Number of recent lines to retrieve
	 * @returns Array of the most recent lines, oldest first
	 */
	getRecent(n: number): string[] {
		if (n <= 0) {
			return []
		}
		if (n > this.size) {
			n = this.size
		}

		const result: string[] = new Array(n)
		let index = (this.head - n + this.maxSize) % this.maxSize

		for (let i = 0; i < n; i++) {
			result[i] = this.buffer[index]
			index = (index + 1) % this.maxSize
		}

		return result
	}

	/**
	 * Get all lines currently in the buffer.
	 * @returns Array of all lines, oldest first
	 */
	getAll(): string[] {
		return this.getRecent(this.size)
	}

	/**
	 * Clear all lines from the buffer.
	 */
	clear(): void {
		this.buffer = new Array(this.maxSize)
		this.head = 0
		this.size = 0
	}

	/**
	 * Get the current number of lines in the buffer.
	 */
	getCurrentSize(): number {
		return this.size
	}

	/**
	 * Get the maximum size of the buffer.
	 */
	getMaxSize(): number {
		return this.maxSize
	}
}
