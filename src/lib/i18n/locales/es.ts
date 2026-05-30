import type { WorkduckMessages } from '../workduck-message-contract';

import { esCommonMessages } from './es/common';
import { esNavigationMessages } from './es/navigation';
import { esUpdaterMessages } from './es/updater';
import { esWorkspaceMessages } from './es/workspace';
import { esQueueMessages } from './es/queue';
import { esEnvironmentMessages } from './es/environment';
import { esProjectsMessages } from './es/projects';
import { esReferencesMessages } from './es/references';
import { esSettingsMessages } from './es/settings';
import { esAgentsMessages } from './es/agents';
import { esPersonasMessages } from './es/personas';
import { esSkillsMessages } from './es/skills';
import { esTerminalsMessages } from './es/terminals';
import { esProcessesMessages } from './es/processes';

export const esMessages = {
	common: esCommonMessages,
	navigation: esNavigationMessages,
	updater: esUpdaterMessages,
	workspace: esWorkspaceMessages,
	queue: esQueueMessages,
	environment: esEnvironmentMessages,
	projects: esProjectsMessages,
	references: esReferencesMessages,
	settings: esSettingsMessages,
	agents: esAgentsMessages,
	personas: esPersonasMessages,
	skills: esSkillsMessages,
	terminals: esTerminalsMessages,
	processes: esProcessesMessages
} as const satisfies WorkduckMessages;
