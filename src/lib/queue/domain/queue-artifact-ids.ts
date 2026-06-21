export function createQueueId(prefix: string) {
	const normalizedPrefix = prefix === 'work-order' ? 'wo' : prefix;

	return `${normalizedPrefix}_${Date.now().toString(36)}_${createQueueRandomToken()}`;
}

export function createQueueArtifactFileId(id: string, fallback: string) {
	const normalizedId = createQueueFileSlug(id, 80, '_');

	return normalizedId.length > 0 ? normalizedId : createQueueId(fallback);
}

export function createQueueFileSlug(value: string, maxLength: number, extraAllowed = '') {
	const allowedPattern = extraAllowed.includes('_')
		? /[^\p{Letter}\p{Number}_-]+/gu
		: /[^\p{Letter}\p{Number}-]+/gu;

	return normalizeQueueText(value)
		.toLowerCase()
		.replaceAll(allowedPattern, '-')
		.replaceAll(/-+/g, '-')
		.replaceAll(/^-|-$/g, '')
		.slice(0, maxLength)
		.replaceAll(/^-|-$/g, '');
}

function createQueueRandomToken() {
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		const values = new Uint8Array(10);
		crypto.getRandomValues(values);

		return Array.from(values, (value) => value.toString(36).padStart(2, '0')).join('').slice(0, 16);
	}

	throw new Error('Secure random values are unavailable.');
}

function normalizeQueueText(value: string) {
	return value.trim().replace(/\s+/g, ' ');
}
