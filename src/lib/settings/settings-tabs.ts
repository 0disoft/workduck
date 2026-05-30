export const DEFAULT_SETTINGS_TAB_ID = 'appearance';

export const settingsTabs = [
	{ id: 'appearance', label: 'Appearance' },
	{ id: 'workspaces', label: 'Workspaces' },
	{ id: 'sync', label: 'Sync' },
	{ id: 'system', label: 'System' }
] as const;

export type SettingsTabId = (typeof settingsTabs)[number]['id'];

export function normalizeSettingsTabId(value: string | null): SettingsTabId {
	return settingsTabs.some((tab) => tab.id === value)
		? (value as SettingsTabId)
		: DEFAULT_SETTINGS_TAB_ID;
}
