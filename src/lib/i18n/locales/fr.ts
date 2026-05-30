import type { WorkduckMessages } from '../workduck-message-contract';

import { frCommonMessages } from './fr/common';
import { frNavigationMessages } from './fr/navigation';
import { frUpdaterMessages } from './fr/updater';
import { frWorkspaceMessages } from './fr/workspace';
import { frQueueMessages } from './fr/queue';
import { frEnvironmentMessages } from './fr/environment';
import { frProjectsMessages } from './fr/projects';
import { frReferencesMessages } from './fr/references';
import { frSettingsMessages } from './fr/settings';
import { frAgentsMessages } from './fr/agents';
import { frPersonasMessages } from './fr/personas';
import { frSkillsMessages } from './fr/skills';
import { frTerminalsMessages } from './fr/terminals';
import { frProcessesMessages } from './fr/processes';

export const frMessages = {
	common: frCommonMessages,
	navigation: frNavigationMessages,
	updater: frUpdaterMessages,
	workspace: frWorkspaceMessages,
	queue: frQueueMessages,
	environment: frEnvironmentMessages,
	projects: frProjectsMessages,
	references: frReferencesMessages,
	settings: frSettingsMessages,
	agents: frAgentsMessages,
	personas: frPersonasMessages,
	skills: frSkillsMessages,
	terminals: frTerminalsMessages,
	processes: frProcessesMessages
} as const satisfies WorkduckMessages;
