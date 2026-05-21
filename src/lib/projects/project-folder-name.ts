const DEFAULT_PROJECT_FOLDER_NAME_MAX_LENGTH = 80;

export function createProjectFolderNameFromDisplayName(
	displayName: string,
	maxLength = DEFAULT_PROJECT_FOLDER_NAME_MAX_LENGTH
) {
	const normalizedMaxLength = Math.max(1, Math.trunc(maxLength));
	const trimmedName = displayName.trim();
	const asciiSlug = trimmedName
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.toLocaleLowerCase('en-US')
		.replace(/['’]/gu, '')
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
		.slice(0, normalizedMaxLength)
		.replace(/-+$/gu, '');

	if (asciiSlug.length > 0) {
		return asciiSlug;
	}

	return (
		trimmedName
			.replace(/[\\/]+/gu, '-')
			.replace(/\s+/gu, '-')
			.replace(/^-+|-+$/gu, '')
			.slice(0, normalizedMaxLength)
			.replace(/-+$/gu, '') || 'untitled'
	);
}
