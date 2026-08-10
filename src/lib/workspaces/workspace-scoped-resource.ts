export interface WorkspaceResourceScope {
	readonly workspaceId: string;
	readonly workspacePath: string;
}

interface WorkspaceResourceRequest extends WorkspaceResourceScope {
	readonly generation: number;
}

interface WorkspaceResourceLoad<T> {
	readonly scope: WorkspaceResourceScope;
	readonly load: () => Promise<T>;
	readonly apply: (value: T) => void;
	readonly fail?: (error: unknown) => void;
}

export interface WorkspaceScopedResourceStore {
	load<T>(request: WorkspaceResourceLoad<T>): () => void;
	invalidate(scope?: WorkspaceResourceScope): void;
}

export function createWorkspaceScopedResourceStore(): WorkspaceScopedResourceStore {
	let generation = 0;
	let currentRequest: WorkspaceResourceRequest | null = null;

	function owns(request: WorkspaceResourceRequest) {
		return (
			currentRequest?.generation === request.generation &&
			currentRequest.workspaceId === request.workspaceId &&
			currentRequest.workspacePath === request.workspacePath
		);
	}

	function invalidate(scope?: WorkspaceResourceScope) {
		if (
			scope !== undefined &&
			(currentRequest?.workspaceId !== scope.workspaceId ||
				currentRequest.workspacePath !== scope.workspacePath)
		) {
			return;
		}

		generation += 1;
		currentRequest = null;
	}

	function load<T>({ scope, load: read, apply, fail }: WorkspaceResourceLoad<T>) {
		const request: WorkspaceResourceRequest = {
			...scope,
			generation: generation + 1
		};
		generation = request.generation;
		currentRequest = request;

		void read().then(
			(value) => {
				if (owns(request)) apply(value);
			},
			(error: unknown) => {
				if (owns(request)) fail?.(error);
			}
		);

		return () => {
			if (owns(request)) invalidate();
		};
	}

	return { load, invalidate };
}
