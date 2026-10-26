import { expect, test } from 'bun:test';
import { mergeTerminalOutput, TERMINAL_OUTPUT_MAX_BYTES } from './terminal-output';

test('a reset replaces the previous window and an empty reset clears it', () => {
	expect(mergeTerminalOutput('old output', { output: 'new output', outputReset: true })).toBe('new output');
	expect(mergeTerminalOutput('old output', { output: '', outputReset: true })).toBe('');
	expect(mergeTerminalOutput('existing output', { output: '', outputReset: false })).toBe('existing output');
});

test('a full snapshot is also bounded to its newest bytes', () => {
	const output = 'x'.repeat(TERMINAL_OUTPUT_MAX_BYTES) + 'latest';
	const result = mergeTerminalOutput('', { output, outputReset: true });
	expect(result).toBe(output.slice(-TERMINAL_OUTPUT_MAX_BYTES));
});

for (const character of ['가', '😀']) {
	test(`trimming a partial ${character} keeps valid UTF-8 code points`, () => {
		const suffix = 'x'.repeat(TERMINAL_OUTPUT_MAX_BYTES - 1);
		const result = mergeTerminalOutput('', { output: character + suffix, outputReset: true });
		expect(result).toBe(suffix);
		expect(result).not.toContain('\ufffd');
		expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(TERMINAL_OUTPUT_MAX_BYTES);
	});
}

test('a multibyte window at the exact byte limit is preserved', () => {
	const output = '가'.repeat(Math.floor(TERMINAL_OUTPUT_MAX_BYTES / 3)) + 'xx';
	expect(new TextEncoder().encode(output).length).toBe(TERMINAL_OUTPUT_MAX_BYTES);
	expect(mergeTerminalOutput('', { output, outputReset: true })).toBe(output);
});

test('trimming preserves a byte-order mark inside terminal text', () => {
	const suffix = '\ufeff' + 'x'.repeat(TERMINAL_OUTPUT_MAX_BYTES - 3);
	const result = mergeTerminalOutput('', { output: 'old' + suffix, outputReset: true });
	expect(result).toBe(suffix);
});
