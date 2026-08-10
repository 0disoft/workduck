import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createWorkspaceScopedResourceStore } from './workspace-scoped-resource';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
}

async function settlePromises() {
	await Promise.resolve();
	await Promise.resolve();
}

describe('workspace-scoped resource store', () => {
	test('rejects an older workspace response after a workspace switch', async () => {
		const store = createWorkspaceScopedResourceStore();
		const oldRead = deferred<string>();
		const newRead = deferred<string>();
		const applied: string[] = [];

		store.load({
			scope: { workspaceId: 'old', workspacePath: 'C:\\workspaces\\old' },
			load: () => oldRead.promise,
			apply: (value) => applied.push(value)
		});
		store.load({
			scope: { workspaceId: 'new', workspacePath: 'C:\\workspaces\\new' },
			load: () => newRead.promise,
			apply: (value) => applied.push(value)
		});

		newRead.resolve('new');
		await settlePromises();
		oldRead.resolve('old');
		await settlePromises();

		assert.deepEqual(applied, ['new']);
	});

	test('invalidates an in-flight read when a subscription publishes newer state', async () => {
		const store = createWorkspaceScopedResourceStore();
		const read = deferred<string>();
		const scope = { workspaceId: 'workspace-1', workspacePath: 'C:\\workspaces\\one' };
		const applied: string[] = [];

		store.load({ scope, load: () => read.promise, apply: (value) => applied.push(value) });
		store.invalidate(scope);
		applied.push('subscription');
		read.resolve('stale-read');
		await settlePromises();

		assert.deepEqual(applied, ['subscription']);
	});
});
