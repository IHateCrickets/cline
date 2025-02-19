/**
 * Strips ANSI escape codes from a string.
 * This is a lightweight implementation that handles the most common ANSI escape sequences.
 */
export function stripAnsi(str: string): string {
	return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")
}
