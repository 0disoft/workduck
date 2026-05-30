import type { WorkduckMessages } from '../workduck-message-contract';

import { hiCommonMessages } from './hi/common';
import { hiNavigationMessages } from './hi/navigation';
import { hiUpdaterMessages } from './hi/updater';
import { hiWorkspaceMessages } from './hi/workspace';
import { hiQueueMessages } from './hi/queue';
import { hiEnvironmentMessages } from './hi/environment';
import { hiProjectsMessages } from './hi/projects';
import { hiReferencesMessages } from './hi/references';
import { hiSettingsMessages } from './hi/settings';
import { hiAgentsMessages } from './hi/agents';
import { hiPersonasMessages } from './hi/personas';
import { hiSkillsMessages } from './hi/skills';
import { hiTerminalsMessages } from './hi/terminals';
import { hiProcessesMessages } from './hi/processes';

export const hiMessages = {
	common: hiCommonMessages,
	navigation: hiNavigationMessages,
	updater: hiUpdaterMessages,
	workspace: hiWorkspaceMessages,
	queue: hiQueueMessages,
	environment: hiEnvironmentMessages,
	projects: hiProjectsMessages,
	references: hiReferencesMessages,
	settings: hiSettingsMessages,
	agents: hiAgentsMessages,
	personas: hiPersonasMessages,
	skills: hiSkillsMessages,
	terminals: hiTerminalsMessages,
	processes: hiProcessesMessages
} as const satisfies WorkduckMessages;
