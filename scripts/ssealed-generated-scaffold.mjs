import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { scaffoldDensity, scaffoldRunner } from './ssealed-scaffold-artifacts.mjs';

const nativeKinds = new Set(['agent', 'checklist', 'contract', 'diagram', 'document', 'github', 'hygiene', 'validation']);
const generatedKinds = new Set([...nativeKinds, 'runner', 'manifest']);

export async function collectGeneratedSsealedScaffold(scaffoldPath, { version, scope, profile }) {
	const manifest = JSON.parse(await readFile(join(scaffoldPath, '.ssealed/manifest.json'), 'utf8'));
	if (manifest?.tool !== 'ssealed' || manifest.schemaVersion !== 1 ||
		manifest.version !== version || manifest.generatorVersion !== version ||
		manifest.scope !== scope || manifest.profile !== profile ||
		manifest.density !== scaffoldDensity || manifest.runner !== scaffoldRunner ||
		!Array.isArray(manifest.addons) || manifest.addons.length !== 0 ||
		!Array.isArray(manifest.files) || manifest.files.length === 0) {
		throw new Error('Generated ssealed manifest does not match the installed version and requested settings.');
	}
	const records = new Map();
	for (const file of manifest.files) {
		if (typeof file?.path !== 'string' || !file.path || records.has(file.path) ||
			!generatedKinds.has(file.kind) || typeof file.checksum !== 'string') {
			throw new Error('Generated ssealed manifest has invalid or duplicate file records.');
		}
		records.set(file.path, file);
	}
	const files = [];
	async function visit(directoryPath) {
		for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
			const absolutePath = join(directoryPath, entry.name);
			if (entry.isDirectory()) {
				await visit(absolutePath);
			} else if (entry.isFile()) {
				const path = relative(scaffoldPath, absolutePath).split(sep).join('/');
				if (path === '.ssealed/manifest.json') continue;
				const record = records.get(path);
				if (!record) throw new Error(`Generated ssealed file is not registered: ${path}`);
				const content = await readFile(absolutePath, 'utf8');
				const checksum = 'sha256:' + createHash('sha256').update(content).digest('hex');
				if (record.checksum !== checksum) {
					throw new Error(`Generated ssealed file checksum mismatch: ${path}`);
				}
				files.push({ path, content, kind: nativeKinds.has(record.kind) ? record.kind : 'document' });
			} else {
				throw new Error(`Generated ssealed scaffold contains a link or unsupported entry: ${entry.name}`);
			}
		}
	}
	await visit(scaffoldPath);
	if (files.length !== records.size) {
		throw new Error('Generated ssealed manifest references missing files.');
	}
	return files.sort((left, right) => left.path.localeCompare(right.path));
}
