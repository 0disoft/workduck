import { deleteQueueFile, type QueueFolderError } from './queue-folder';

export type QueuePanelFileDeleteResult =
	| {
			readonly ok: true;
			readonly deletedRelativePaths: readonly string[];
	  }
	| {
			readonly ok: false;
			readonly error: QueueFolderError;
			readonly deletedRelativePaths: readonly string[];
	  };

export interface QueuePanelFileDeleteInput {
	readonly workspacePath: string;
	readonly relativePaths: readonly string[];
}

export async function deleteQueuePanelFiles(
	input: QueuePanelFileDeleteInput
): Promise<QueuePanelFileDeleteResult> {
	const deletedRelativePaths: string[] = [];

	for (const relativePath of input.relativePaths) {
		const result = await deleteQueueFile(input.workspacePath, relativePath);

		if (!result.ok) {
			return {
				ok: false,
				error: result.error,
				deletedRelativePaths
			};
		}

		deletedRelativePaths.push(result.relativePath);
	}

	return {
		ok: true,
		deletedRelativePaths
	};
}
