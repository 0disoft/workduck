import { enCommonMessages } from './en/common';
import { enNavigationMessages } from './en/navigation';
import { enUpdaterMessages } from './en/updater';
import { enWorkspaceMessages } from './en/workspace';
import { enQueueMessages } from './en/queue';
import { enEnvironmentMessages } from './en/environment';
import { enProjectsMessages } from './en/projects';
import { enReferencesMessages } from './en/references';
import { enSettingsMessages } from './en/settings';
import { enAgentsMessages } from './en/agents';
import { enPersonasMessages } from './en/personas';
import { enSkillsMessages } from './en/skills';
import { enTerminalsMessages } from './en/terminals';
import { enProcessesMessages } from './en/processes';

export const enMessages = {
	common: enCommonMessages,
	navigation: enNavigationMessages,
	updater: enUpdaterMessages,
	workspace: enWorkspaceMessages,
	queue: enQueueMessages,
	environment: enEnvironmentMessages,
	projects: enProjectsMessages,
	references: enReferencesMessages,
	settings: enSettingsMessages,
	agents: enAgentsMessages,
	personas: enPersonasMessages,
	skills: enSkillsMessages,
	terminals: enTerminalsMessages,
	processes: enProcessesMessages
} as const;
