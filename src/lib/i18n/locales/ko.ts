import type { WorkduckMessages } from '../workduck-message-contract';

import { koCommonMessages } from './ko/common';
import { koNavigationMessages } from './ko/navigation';
import { koUpdaterMessages } from './ko/updater';
import { koWorkspaceMessages } from './ko/workspace';
import { koQueueMessages } from './ko/queue';
import { koEnvironmentMessages } from './ko/environment';
import { koProjectsMessages } from './ko/projects';
import { koReferencesMessages } from './ko/references';
import { koSettingsMessages } from './ko/settings';
import { koAgentsMessages } from './ko/agents';
import { koPersonasMessages } from './ko/personas';
import { koSkillsMessages } from './ko/skills';
import { koTerminalsMessages } from './ko/terminals';
import { koProcessesMessages } from './ko/processes';

export const koMessages = {
	common: koCommonMessages,
	navigation: koNavigationMessages,
	updater: koUpdaterMessages,
	workspace: koWorkspaceMessages,
	queue: koQueueMessages,
	environment: koEnvironmentMessages,
	projects: koProjectsMessages,
	references: koReferencesMessages,
	settings: koSettingsMessages,
	agents: koAgentsMessages,
	personas: koPersonasMessages,
	skills: koSkillsMessages,
	terminals: koTerminalsMessages,
	processes: koProcessesMessages
} as const satisfies WorkduckMessages;
