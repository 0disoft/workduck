export type CliEnvironmentApplyError =
	| 'cli-environment-empty'
	| 'cli-environment-too-large'
	| 'cli-environment-name-unsupported'
	| 'cli-environment-name-duplicate'
	| 'cli-environment-value-invalid'
	| 'cli-environment-write-failed'
	| 'cli-environment-unsupported'
	| 'cli-environment-unavailable';

export interface CliEnvironmentVariableInput {
	readonly name: string;
	readonly value: string;
}

export type CliEnvironmentApplyResult =
	| {
			readonly ok: true;
			readonly appliedNames: readonly string[];
	  }
	| {
			readonly ok: false;
			readonly error: CliEnvironmentApplyError;
	  };

interface TauriCoreApi {
	readonly invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriGlobalWindow {
	readonly __TAURI__?: {
		readonly core?: TauriCoreApi;
	};
}

interface CliEnvironmentApplyResponse {
	readonly ok: boolean;
	readonly appliedNames?: readonly string[] | null;
	readonly error?: CliEnvironmentApplyError | null;
}

export async function applyCliEnvironmentVariables(
	variables: readonly CliEnvironmentVariableInput[]
): Promise<CliEnvironmentApplyResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'cli-environment-unavailable' };
	}

	try {
		const response = await invoke<CliEnvironmentApplyResponse>(
			'apply_cli_environment_variables',
			{
				variables
			}
		);

		if (response.ok) {
			return {
				ok: true,
				appliedNames: Array.isArray(response.appliedNames) ? response.appliedNames : []
			};
		}

		return {
			ok: false,
			error: isCliEnvironmentApplyError(response.error)
				? response.error
				: 'cli-environment-write-failed'
		};
	} catch {
		return { ok: false, error: 'cli-environment-write-failed' };
	}
}

function getTauriInvoke() {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return (window as unknown as TauriGlobalWindow).__TAURI__?.core?.invoke;
}

function isCliEnvironmentApplyError(value: unknown): value is CliEnvironmentApplyError {
	return (
		value === 'cli-environment-empty' ||
		value === 'cli-environment-too-large' ||
		value === 'cli-environment-name-unsupported' ||
		value === 'cli-environment-name-duplicate' ||
		value === 'cli-environment-value-invalid' ||
		value === 'cli-environment-write-failed' ||
		value === 'cli-environment-unsupported' ||
		value === 'cli-environment-unavailable'
	);
}
