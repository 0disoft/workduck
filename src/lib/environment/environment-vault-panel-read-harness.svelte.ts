import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import EnvironmentVaultPanel from './EnvironmentVaultPanel.svelte';

interface VaultPanelReadTestPort {
	setPasswordForTest(password: string): void;
	submitForTest(event: Pick<SubmitEvent, 'preventDefault'>): Promise<void>;
	readErrorForTest(): string | null;
}

export function createVaultPanelReadHarness(workspace: WorkspaceRecord) {
	let panel!: VaultPanelReadTestPort;
	const dispose = $effect.root(() => {
		panel = EnvironmentVaultPanel(null as never, { workspace, title: 'Environment' }) as unknown as VaultPanelReadTestPort;
	});
	return {
		dispose,
		async submit() {
			panel.setPasswordForTest('test-password');
			await panel.submitForTest({ preventDefault() {} });
		},
		get error() { return panel.readErrorForTest(); }
	};
}
