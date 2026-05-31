import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
	createCliEnvironmentVariables,
	normalizeCliEnvironmentVariableName,
	resolveCliEnvironmentVariableName
} from './cli-environment-variables';
import type { EnvironmentSecretRecord } from './environment-vault';

describe('CLI environment variable derivation', () => {
	test('keeps provider-specific API key aliases for existing LLM entries', () => {
		assert.equal(
			resolveCliEnvironmentVariableName(secret({ name: 'openai_llm', tags: ['llm'] })),
			'OPENAI_API_KEY'
		);
		assert.equal(
			resolveCliEnvironmentVariableName(secret({ name: 'deepseek_llm', tags: ['llm'] })),
			'DEEPSEEK_API_KEY'
		);
		assert.equal(
			resolveCliEnvironmentVariableName(secret({ name: 'open_router', tags: ['openrouter'] })),
			'OPENROUTER_API_KEY'
		);
	});

	test('derives generic CLI environment names from saved secret names', () => {
		assert.equal(
			resolveCliEnvironmentVariableName(secret({ name: 'custom_publish_token', kind: 'token' })),
			'CUSTOM_PUBLISH_TOKEN'
		);
		assert.equal(
			resolveCliEnvironmentVariableName(secret({ name: 'github pat 0disoft', kind: 'token' })),
			'GITHUB_PAT_0DISOFT'
		);
		assert.equal(
			resolveCliEnvironmentVariableName(secret({ name: '1password token' })),
			'_1PASSWORD_TOKEN'
		);
	});

	test('maps npm publish tokens to the standard npm auth variable', () => {
		assert.equal(
			resolveCliEnvironmentVariableName(secret({ name: 'npm_publish', kind: 'token' })),
			'NODE_AUTH_TOKEN'
		);
	});

	test('skips duplicate derived names without exposing secret values', () => {
		const variables = createCliEnvironmentVariables([
			secret({ name: 'custom_publish_token', value: 'first' }),
			secret({ name: 'custom publish token', value: 'second' }),
			secret({ name: 'openai_llm', value: 'third', tags: ['llm'] })
		]);

		assert.deepEqual(variables, [
			{ name: 'CUSTOM_PUBLISH_TOKEN', value: 'first' },
			{ name: 'OPENAI_API_KEY', value: 'third' }
		]);
	});

	test('rejects empty, oversized, and reserved environment names', () => {
		assert.equal(normalizeCliEnvironmentVariableName('***'), null);
		assert.equal(normalizeCliEnvironmentVariableName('a'.repeat(129)), null);
		assert.equal(normalizeCliEnvironmentVariableName('path'), null);
		assert.equal(normalizeCliEnvironmentVariableName('SYSTEMROOT'), null);
	});
});

function secret(input: {
	readonly name: string;
	readonly kind?: EnvironmentSecretRecord['kind'];
	readonly tags?: readonly EnvironmentSecretRecord['tags'][number][];
	readonly value?: string;
}): EnvironmentSecretRecord {
	return {
		id: `secret-${input.name}`,
		name: input.name,
		kind: input.kind ?? 'api-key',
		tags: input.tags ?? [],
		value: input.value ?? 'secret-value',
		createdAt: '2026-05-31T00:00:00.000Z',
		updatedAt: '2026-05-31T00:00:00.000Z'
	};
}
