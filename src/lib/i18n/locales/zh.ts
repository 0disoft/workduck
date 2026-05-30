import type { WorkduckMessages } from '../workduck-message-contract';

import { zhCommonMessages } from './zh/common';
import { zhNavigationMessages } from './zh/navigation';
import { zhUpdaterMessages } from './zh/updater';
import { zhWorkspaceMessages } from './zh/workspace';
import { zhQueueMessages } from './zh/queue';
import { zhEnvironmentMessages } from './zh/environment';
import { zhProjectsMessages } from './zh/projects';
import { zhReferencesMessages } from './zh/references';
import { zhSettingsMessages } from './zh/settings';
import { zhAgentsMessages } from './zh/agents';
import { zhPersonasMessages } from './zh/personas';
import { zhSkillsMessages } from './zh/skills';
import { zhTerminalsMessages } from './zh/terminals';
import { zhProcessesMessages } from './zh/processes';

export const zhMessages = {
	common: zhCommonMessages,
	navigation: zhNavigationMessages,
	updater: zhUpdaterMessages,
	workspace: zhWorkspaceMessages,
	queue: zhQueueMessages,
	environment: zhEnvironmentMessages,
	projects: zhProjectsMessages,
	references: zhReferencesMessages,
	settings: zhSettingsMessages,
	agents: zhAgentsMessages,
	personas: zhPersonasMessages,
	skills: zhSkillsMessages,
	terminals: zhTerminalsMessages,
	processes: zhProcessesMessages
} as const satisfies WorkduckMessages;
