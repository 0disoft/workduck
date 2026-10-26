import type { TerminalSessionSnapshot } from './terminal-session';

export const TERMINAL_OUTPUT_MAX_BYTES = 128 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

export function mergeTerminalOutput(
	current: string,
	snapshot: Pick<TerminalSessionSnapshot, 'output' | 'outputReset'>
): string {
	// The current display window is already bounded; idle polls need no copies.
	if (!snapshot.outputReset && snapshot.output.length === 0) return current;
	const content = snapshot.outputReset ? snapshot.output : current + snapshot.output;
	if (content.length * 3 <= TERMINAL_OUTPUT_MAX_BYTES) return content;
	const bytes = encoder.encode(content);
	if (bytes.length <= TERMINAL_OUTPUT_MAX_BYTES) return content;
	let start = bytes.length - TERMINAL_OUTPUT_MAX_BYTES;
	while ((bytes[start]! & 0xc0) === 0x80) start += 1;
	return decoder.decode(bytes.subarray(start));
}
