export const enMessages = {
	common: {
		add: 'Add',
		save: 'Save',
		cancel: 'Cancel',
		edit: 'Edit',
		remove: 'Remove',
		refresh: 'Refresh',
		name: 'Name',
		title: 'Title',
		none: 'None',
		fetch: 'Fetch',
		pull: 'Pull',
		push: 'Push',
		export: 'Export',
		import: 'Import',
		load: 'Load',
		folder: 'Folder',
		file: 'File',
		password: 'Password',
		repository: 'Repository',
		reference: 'Reference',
		branch: 'Branch',
		apiKey: 'API key',
		skills: 'Skills',
		output: 'Output',
		description: 'Description',
		instructions: 'Instructions',
		agent: 'Agent',
		persona: 'Persona',
		skill: 'Skill',
		terminal: 'Terminal',
		builtIn: 'Built-in',
		noApiKey: 'No API key',
		linkedApiKey: 'Linked API key',
		missingApiKey: 'Missing API key',
		noPersona: 'No persona',
		linkedPersona: 'Linked persona',
		missingPersona: 'Missing persona',
		all: 'All',
		read: 'Read',
		unread: 'Unread',
		checking: 'Checking',
		create: 'Create',
		files: 'Files',
		checks: 'Checks',
		risks: 'Risks',
		comment: 'Comment',
		source: 'Source',
		question: 'Question',
		summary: 'Summary',
		recommended: 'Recommended',
		strengths: 'Strengths',
		recommendation: 'Recommendation',
		yes: 'Yes',
		no: 'No'
	},
	navigation: {
		projects: 'Projects',
		queue: 'Work queue',
		references: 'References',
		agents: 'Agents',
		personas: 'Personas',
		skills: 'Skills',
		terminals: 'Terminals',
		processes: 'Processes',
		environment: 'Environment variables',
		settings: 'Settings',
		noWorkspace: 'No workspace',
		unlockActiveWorkspace: 'Unlock the active workspace.',
		addWorkspaceFirst: 'Add a workspace in Settings first.',
		waitForOperation: 'Wait for the current operation to finish.',
		primary: 'Primary',
		settingsArea: 'Settings',
		resizeSidebar: 'Resize sidebar'
	},
	workspace: {
		addWorkspaceInSettings: 'Add a workspace in Settings.',
		locked: 'Workspace locked',
		folderUnavailable: 'Workspace folder unavailable',
		path: 'Path',
		reconnect: 'Reconnect',
		chooseFolder: 'Choose workspace folder',
		unlock: {
			submit: 'Unlock',
			tryAgainIn: 'Try again in {seconds}s.',
			passwordRequired: 'Password is required.',
			passwordMismatch: 'Password did not match.',
			passwordMismatchWithAttempts:
				'Password did not match. {attemptsRemaining} attempts left.',
			unavailable: 'Unlock is available in the desktop app.',
			invalidHash: 'Workspace lock data could not be read.'
		},
		pathErrors: {
			pathRequired: 'Workspace path is required.',
			pathNotAbsolute: 'Workspace path must be an absolute folder path.',
			pathNotFound: 'Workspace path does not exist.',
			pathNotDirectory: 'Workspace path must be a folder.',
			pathPermissionDenied: 'Workspace path is not readable.',
			pathUnreadable: 'Workspace path could not be checked.',
			pathValidationUnavailable: 'Workspace path can only be checked in the desktop app.',
			pathSelectionUnavailable: 'Workspace folder picker is unavailable.',
			pathSelectionFailed: 'Workspace folder could not be selected.',
			pathDuplicate: 'Workspace path is already registered.',
			workspaceNotFound: 'Workspace was not found.',
			registryReadFailed: 'Workspace settings could not be loaded.',
			registryWriteFailed: 'Workspace settings could not be saved.'
		}
	},
	queue: {
		list: 'Work queue files',
		detail: 'Work queue details',
		filters: 'Work queue filters',
		contextMenu: 'Work queue file actions',
		registeredCount: '{count} queue items',
		executionFilters: 'Work status filters',
		readFilters: 'Read status filters',
		pendingCountLabel: '{count} pending work items',
		resultReportReview: 'Result report review',
		workOrderView: 'Work order view',
		workOrderId: 'Work ID',
		proposalView: 'Proposal view',
		empty: 'Add report or work-order files.',
		noMatches: 'No matching work queue files.',
		addWork: 'Add work',
		newWork: 'New work',
		editWork: 'Edit work',
		workTitle: 'Work title',
		workType: 'Work type',
		workTypes: {
			instruction: 'Instruction',
			vote: 'Vote/selection'
		},
		workPriority: 'Priority',
		responseLanguage: 'Response language',
		responseLanguages: {
			auto: 'Match task language',
			ko: 'Korean',
			en: 'English'
		},
		noSkill: 'No skill',
		noAgent: 'No agent',
		noReference: 'No reference',
		linkedSkill: 'Linked skill',
		workAgents: 'Work agents',
		workReferences: 'Work references',
		selectionCount: '{count} selected',
		workBody: 'Work body',
		vote: {
			question: 'Question',
			options: 'Options',
			optionCountInput: 'Option count',
			optionName: 'Option name',
			optionDescription: 'Description',
			criteria: 'Criteria',
			result: 'Vote result',
			choice: 'Choice',
			count: '{count} votes',
			confidence: 'Confidence {score}/9',
			invalid: '{count} unparsed responses',
			optionCount: '{count} options',
			unparsed: 'Unparsed'
		},
		createWorkOrder: 'Create work order',
		creating: 'Creating',
		executeWorkOrder: 'Run',
		executing: 'Running',
		noFollowUpSelected: 'No follow-up selected.',
		createdFile: 'Created {relativePath}.',
		updatedFile: 'Updated {relativePath}.',
		deletedFile: 'Deleted {relativePath}.',
		executedFile: 'Created {relativePath} and completed the work order.',
		nextWorkOrders: 'Next work orders',
		priorities: {
			low: 'Low',
			normal: 'Normal',
			high: 'High',
			urgent: 'Urgent'
		},
		executionStates: {
			pending: 'Pending',
			completed: 'Completed'
		},
		readStates: {
			read: 'Read',
			unread: 'Unread'
		},
		fileKinds: {
			resultReport: 'Report JSON',
			workOrder: 'Work order',
			proposal: 'Proposal',
			unsupported: 'Unsupported'
		},
		reviewDecisions: {
			approved: 'Approve',
			needsWork: 'Needs work',
			rollback: 'Rollback'
		},
		evaluation: {
			title: 'Rate response',
			action: 'Rate',
			mode: 'Rating mode',
			manual: 'Manual rating',
			aiDelegated: 'Delegate to AI',
			copyPrompt: 'Copy prompt',
			promptCopied: 'Rating prompt copied.',
			clipboardUnavailable: 'Clipboard is not available.',
			delegationPrompt: 'Delegation prompt',
			saving: 'Saving',
			saved: 'Rating saved.'
		},
		errors: {
			workspaceRequired: 'Workspace path is required.',
			workspaceNotAbsolute: 'Workspace path must be absolute.',
			workspaceNotFound: 'Workspace path was not found.',
			workspaceNotDirectory: 'Workspace path must be a folder.',
			workspacePermissionDenied: 'Workspace path is not writable.',
			workspaceUnreadable: 'Workspace path could not be checked.',
			rootInvalid: 'Work queue folder is not usable.',
			createFailed: 'Work queue folder could not be created.',
			openFailed: 'Work queue folder could not be opened.',
			listFailed: 'Work queue files could not be listed.',
			fileInvalid: 'Work queue file path is not allowed.',
			fileNotFound: 'Work queue file was not found.',
			fileReadFailed: 'Work queue file could not be read.',
			fileWriteFailed: 'Work queue file could not be written.',
			fileDeleteFailed: 'Work queue file could not be deleted.',
			fileAlreadyExists: 'Work queue file already exists.',
			unavailable: 'Work queue folders are available in the desktop app.',
			executionNoTask: 'There is no task to run.',
			executionNoAgent: 'Select at least one work agent.',
			executionVaultLocked: 'Unlock the environment vault first.',
			executionAgentNotFound: 'The selected agent was not found.',
			executionSecretNotFound: 'The API key linked to the agent was not found.',
			executionProviderUnsupported: 'The LLM provider could not be detected. Select an agent provider or include DeepSeek, OpenAI, or OpenRouter in the API key name or tag.',
			executionApiKeyRequired: 'The API key is empty.',
			executionPromptRequired: 'The work prompt could not be created.',
			executionModelRequired: 'The model could not be selected.',
			executionRequestInvalid: 'The LLM request was invalid.',
			executionAuthenticationFailed: 'LLM authentication failed. Check the API key.',
			executionRateLimited: 'The LLM rate limit was reached. Try again later.',
			executionProviderRejected: 'The LLM provider rejected the request.',
			executionProviderUnavailable: 'The LLM provider could not be reached.',
			executionResponseInvalid: 'The LLM response could not be read as a report.',
			executionUnavailable: 'Work execution is available in the desktop app.'
		}
	},
	environment: {
		ariaLabel: 'Environment variables',
		registeredCount: '{count} environment variables',
		vaultPassword: 'Vault password',
		createVault: 'Create vault',
		unlockVault: 'Unlock',
		lockVault: 'Lock',
		kind: 'Type',
		tags: 'Tags',
		value: 'Value',
		select: 'Select',
		filters: 'Environment filters',
		kindFilter: 'Type filter',
		tagFilter: 'Tag filter',
		allKinds: 'All types',
		allTags: 'All tags',
		empty: 'No environment variables yet.',
		noMatches: 'No matching environment variables.',
		entries: 'Environment variable entries',
		copy: 'Copy',
		show: 'Show',
		hide: 'Hide',
		applyCliEnvironment: 'Apply CLI env',
		applyCliEnvironmentTooltip:
			'Save OpenRouter, OpenAI, and DeepSeek API keys as user environment variables.',
		secretKinds: {
			'api-key': 'API key',
			token: 'Token',
			'ssh-key': 'SSH key',
			account: 'Account',
			password: 'Password',
			other: 'Other'
		},
		secretTags: {
			llm: 'LLM',
			github: 'GitHub',
			gitlab: 'GitLab',
			openai: 'OpenAI',
			anthropic: 'Anthropic',
			openrouter: 'OpenRouter',
			cloud: 'Cloud',
			database: 'Database',
			auth: 'Auth',
			sync: 'Sync',
			deployment: 'Deployment',
			monitoring: 'Monitoring',
			payment: 'Payment',
			storage: 'Storage'
		},
		statuses: {
			created: 'Vault created.',
			saved: 'Saved.',
			removed: 'Removed.',
			copied: 'Copied.',
			cliEnvironmentApplied: '{count} CLI environment variables applied.'
		},
		errors: {
			vaultPasswordRequired: 'Vault password is required.',
			vaultPasswordTryAgain: 'Try again in {seconds}s.',
			vaultPasswordMismatch: 'Vault password did not match.',
			vaultPasswordMismatchWithAttempts:
				'Vault password did not match. {attemptsRemaining} attempts left.',
			vaultUnavailable: 'Vault is available in the desktop app.',
			vaultInvalid: 'Vault data could not be read.',
			vaultSaveFailed: 'Vault could not be saved.',
			vaultOperationFailed: 'Vault operation failed.',
			clipboardUnavailable: 'Clipboard is not available.',
			copyFailed: 'Copy failed.',
			nameRequired: 'Name is required.',
			kindRequired: 'Type is required.',
			tagRequired: 'Tag is required.',
			nameDuplicate: 'Name already exists.',
			valueRequired: 'Value is required.',
			notFound: 'Entry was not found.',
			cliEnvironmentNoVariables:
				'No OpenRouter, OpenAI, or DeepSeek API key environment variables were found.',
			cliEnvironmentApplyFailed: 'CLI environment variables could not be applied.',
			cliEnvironmentUnsupported:
				'User environment variables are not supported on this operating system.',
			cliEnvironmentUnavailable: 'CLI environment apply is available in the desktop app.'
		}
	},
	projects: {
		newProject: 'New project',
		newGroup: 'New group',
		newRepository: 'New repository',
		registeredCount: '{count} projects registered',
		filters: {
			pullNeeded: 'Pull needed',
			pushNeeded: 'Push needed',
			tagPlaceholder: 'tag'
		},
		kinds: {
			project: 'Project',
			group: 'Group'
		},
		counts: {
			group: 'group',
			groups: 'groups',
			repo: 'repo',
			repos: 'repos'
		},
		lastRepositoryOperation: 'Last action: {timestamp}',
		contextMenu: {
			openFolder: 'Open folder',
			editDescription: 'Edit description',
			githubCredential: 'GitHub credential',
			editTags: 'Edit tags',
			delete: 'Delete',
			clone: 'Clone',
			initializeGit: 'Initialize Git',
			publish: 'Publish',
			openTerminal: 'Open terminal',
			installDependencies: 'Install dependencies',
			updateDependencies: 'Update dependencies',
			startDevServer: 'Start dev server',
			build: 'Build'
		},
		repositoryTasks: {
			openTerminalStarted: 'Terminal opened.',
			commandStarted: 'Started in terminal: {command}',
			installDependenciesStarted: 'Dependency install started.',
			updateDependenciesStarted: 'Dependency update started.',
			startDevServerStarted: 'Dev server started.',
			buildStarted: 'Build started.'
		}
	},
	references: {
		title: 'References',
		list: 'Reference list',
		details: 'Reference details',
		registeredCount: '{count} references registered',
		newReference: 'New reference',
		editReference: 'Edit reference',
		sourceUrl: 'Source URL',
		tags: 'Tags',
		relatedProjects: 'Related projects',
		noProject: 'No project',
		projectSelectionCount: '{count} projects selected',
		content: 'Content',
		saved: 'Saved.',
		removed: 'Removed.',
		errors: {
			titleRequired: 'Title is required.',
			bodyOrSourceRequired: 'Source URL or content is required.',
			sourceUrlInvalid: 'Source URL must start with http:// or https://.',
			titleDuplicate: 'Title already exists.',
			notFound: 'Reference was not found.',
			readFailed: 'References could not be read.',
			saveFailed: 'References could not be saved.'
		}
	},
	settings: {
		title: 'Settings',
		pageTitle: 'Settings - Workduck',
		sections: 'Settings sections',
		tabs: {
			appearance: 'Appearance',
			workspaces: 'Workspaces',
			sync: 'Sync',
			system: 'System'
		},
		appearance: {
			section: 'Appearance',
			language: 'Language',
			interfaceFontSize: 'Interface font size',
			loadError: 'Appearance settings could not be loaded.',
			saveError: 'Appearance settings could not be saved.'
		},
		workspaces: {
			noWorkspaces: 'No workspaces.',
			status: 'Workspace status',
			active: 'Active',
			locked: 'Locked',
			switch: 'Switch',
			lock: 'Lock',
			reconnect: 'Reconnect',
			repository: {
				section: 'Workspace repository',
				useAsRepository: 'Use this workspace as a repository',
				prepare: 'Prepare repository',
				publish: 'Publish',
				prepareTitle: 'Prepare workspace repository',
				publishTitle: 'Publish workspace repository',
				githubRepository: 'GitHub repository',
				commitMessage: 'Commit message',
				visibility: 'GitHub visibility',
				private: 'Private',
				public: 'Public',
				initializeGit: 'Initialize Git repository',
				installMustflow: 'Install mustflow',
				installGitignore: 'Install Workduck .gitignore',
				gitReady: 'Git ready',
				remoteReady: 'Remote ready',
				pullNeeded: 'Pull {count}',
				pushNeeded: 'Push {count}',
				setupComplete: 'Workspace repository is ready.',
				setupPartial: 'Workspace was added, but repository setup failed.',
				setupFailed: 'Repository setup failed.',
				publishComplete: 'Workspace repository was published.',
				fetchComplete: 'Fetched.',
				pullComplete: 'Pulled.',
				pushComplete: 'Pushed.'
			},
			removeTitle: 'Remove workspace',
			removeDescription: 'Remove {name}? Local files are not deleted.',
			errors: {
				nameRequired: 'Workspace name is required.',
				passwordRequired: 'Workspace password is required.',
				passwordTooShort: 'Workspace password must be at least {minLength} characters.',
				passwordProtectFailed: 'Workspace password could not be protected.',
				passwordInvalidHash: 'Workspace lock data could not be read.',
				passwordUnavailable: 'Workspace password can only be protected in the desktop app.',
				passwordHashInvalid: 'Workspace lock data could not be saved.',
				repositoryChoiceRequired: 'Choose whether this workspace should be a repository.',
				repositoryWorkspaceRequired: 'Workspace folder is required.',
				repositoryWorkspaceNotAbsolute: 'Workspace path must be absolute.',
				repositoryWorkspaceNotFound: 'Workspace folder was not found.',
				repositoryWorkspaceNotDirectory: 'Workspace path must be a folder.',
				repositoryWorkspacePermissionDenied: 'Workspace folder access was denied.',
				repositoryWorkspaceUnreadable: 'Workspace folder could not be read.',
				repositoryLayoutInvalid: 'Existing workspace file layout is not usable.',
				repositoryCreateFailed: 'Workspace repository files could not be created.',
				repositoryGitUnavailable: 'Git is not available.',
				repositoryGitTimedOut: 'Git initialization timed out.',
				repositoryGitInitFailed: 'Git repository could not be initialized.',
				repositoryMustflowUnavailable: 'mustflow command is not available.',
				repositoryMustflowTimedOut: 'mustflow installation timed out.',
				repositoryMustflowFailed: 'mustflow installation failed.',
				repositoryMustflowPackageFailed: 'mustflow package metadata could not be prepared.',
				repositoryGitignoreFailed: '.gitignore could not be prepared.',
				repositoryUnavailable: 'Workspace repository setup is available in the desktop app.',
				repositoryGitPathRequired: 'Repository path is required.',
				repositoryGitPathNotAbsolute: 'Repository path must be absolute.',
				repositoryGitPathNotFound: 'Repository folder was not found.',
				repositoryGitPathNotDirectory: 'Repository path must be a folder.',
				repositoryGitPathPermissionDenied: 'Repository folder access was denied.',
				repositoryGitPathUnreadable: 'Repository folder could not be checked.',
				repositoryGitCommandUnavailable: 'Git command was not found.',
				repositoryGitCommandFailed: 'Git command failed.',
				repositoryGitCommandTimedOut: 'Git command timed out.',
				repositoryGitNotRepository: 'Folder is not initialized for Git.',
				repositoryGitRemoteMissing: 'Git remote is not configured.',
				repositoryGitPushAuthRequired:
					'Git push needs authentication. Configure System Git credentials or add a GitHub token to the Environment vault.',
				repositoryGitPushEmpty: 'Repository has no commits to push.',
				repositoryGitPushFailed: 'Git push failed.',
				repositoryGitFetchAuthRequired:
					'Git fetch needs authentication. Configure System Git credentials or add a GitHub token to the Environment vault.',
				repositoryGitFetchFailed: 'Git fetch failed.',
				repositoryGitPullAuthRequired:
					'Git pull needs authentication. Configure System Git credentials or add a GitHub token to the Environment vault.',
				repositoryGitPullConflict: 'Resolve Git conflicts first.',
				repositoryGitPullFailed: 'Git pull failed.',
				repositoryGithubNameRequired: 'GitHub repository name is required.',
				repositoryGithubNameInvalid: 'GitHub repository name is not usable.',
				repositoryGithubCommitMessageRequired: 'Commit message is required.',
				repositoryGithubCommitMessageInvalid: 'Commit message is not usable.',
				repositoryGithubVisibilityInvalid: 'GitHub visibility is not usable.',
				repositoryGithubCliUnavailable: 'GitHub CLI was not found.',
				repositoryGithubAuthRequired: 'GitHub authentication is required.',
				repositoryGithubRemoteExists: 'Remote origin is already configured.',
				repositoryGithubEmpty: 'Repository has no commits to publish.',
				repositoryGithubCommitIdentityMissing: 'Git author name or email is not configured.',
				repositoryGithubCommitIndexLocked: 'Git index is locked by another process.',
				repositoryGithubCommitHookFailed: 'Initial commit was blocked by a Git hook.',
				repositoryGithubCommitFailed: 'Initial commit could not be created.',
				repositoryGithubCreateFailed: 'GitHub repository could not be created.'
			},
			tooltips: {
				unlock: 'Enter this workspace password to make it available on this device.',
				prepareRepository:
					'Prepare Git, mustflow, and the Workduck .gitignore in this workspace.',
				publishRepository: 'Publish this workspace repository to GitHub for the first time.',
				fetchRepository: 'Check remote changes for this workspace repository.',
				pullRepository: 'Pull remote workspace changes into this folder.',
				pushRepository: 'Push local workspace changes to the remote repository.',
				reconnect: 'Choose a local folder again when this workspace was synced from another device.',
				switch: 'Make this workspace the current working area.',
				lock: 'Lock this workspace again until its password is entered.',
				remove: 'Remove this workspace from Workduck. Local files are not deleted.'
			}
		},
		sync: {
			section: 'Sync',
			encryptedData: 'Encrypted data',
			noFolder: 'No folder',
			checking: 'Checking',
			noRepository: 'No repository',
			unavailable: 'Unavailable',
			noBranch: 'No branch',
			tooltips: {
				folder: 'Choose the folder that stores the sync file.',
				fetch: 'Check the sync repository remote.',
				pull: 'Bring remote sync file changes into this folder.',
				push: 'Commit and upload this sync file.',
				export:
					'Encrypt the current workspace and project data into the text area below. Use this when copying sync data manually without a file.',
				import:
					'Apply the encrypted data pasted in the text area below. The data must have been exported with the same password.',
				save:
					'Encrypt the current workspace and project data, then write it to the selected sync folder file. Use this before Git push.',
				load:
					'Read the encrypted file from the selected sync folder and apply it to this app. Use this after Git pull.'
			},
			statuses: {
				exported: 'Exported.',
				imported: 'Imported.',
				saved: 'Saved {fileName}.',
				loaded: 'Loaded {fileName}.',
				fetched: 'Fetched.',
				pulled: 'Pulled. Use Load to apply.',
				pushed: 'Pushed.',
				committedAndPushed: 'Committed and pushed.'
			},
			operations: {
				fetchLabel: 'Fetching sync',
				pullLabel: 'Pulling sync',
				pushLabel: 'Pushing sync',
				fetchDetail: 'Checking remote changes.',
				pullDetail: 'Updating the sync folder.',
				pushDetail: 'Uploading the sync file.'
			},
			errors: {
				gitActionInvalid: 'Git action is invalid.',
				passwordRequired: 'Password is required.',
				folderRequired: 'Folder is required.',
				folderNotAbsolute: 'Folder path must be absolute.',
				folderNotFound: 'Folder was not found.',
				folderNotDirectory: 'Path must be a folder.',
				folderPermissionDenied: 'Folder access was denied.',
				fileNameRequired: 'Sync file is required.',
				fileNameInvalid: 'Sync file name is invalid.',
				contentRequired: 'Encrypted data is required.',
				fileNotFound: 'Sync file was not found.',
				fileTooLarge: 'Sync file is too large.',
				fileTargetInvalid: 'Sync file path is not usable.',
				fileReadFailed: 'Sync file could not be read.',
				fileWriteFailed: 'Sync file could not be saved.',
				fileUnavailable: 'Sync files are available in the desktop app.',
				gitNotRepository: 'Folder is not a Git repository.',
				gitRemoteMissing: 'Git remote is not set.',
				gitBranchMissing: 'Git branch was not found.',
				gitUnavailable: 'Git is not available.',
				gitTimedOut: 'Git command timed out.',
				gitAuthRequired:
					'Git authentication is required. Configure System Git credentials or add a GitHub token to the Environment vault.',
				gitIdentityRequired: 'Git user name or email is not set.',
				gitRemoteHasChanges: 'Remote has changes. Pull first.',
				gitFastForwardRequired: 'Pull needs a manual merge.',
				gitTrustRequired: 'Git repository trust must be configured.',
				gitCommandFailed: 'Git command failed.',
				gitReadFailed: 'Git repository could not be read.',
				gitSyncUnavailable: 'Git sync is available in the desktop app.',
				envelopeInvalid: 'Encrypted data is invalid.',
				encryptedDataDamaged: 'Encrypted data is damaged.',
				exportFailed: 'Export failed.',
				passwordMismatch: 'Password did not match.',
				workspaceDataInvalid: 'Workspace data is invalid.',
				projectReadFailed: 'Project metadata could not be loaded.',
				projectWriteFailed: 'Project metadata could not be saved.',
				encryptionUnavailable: 'Sync encryption is available in the desktop app.',
				settingsSaveFailed: 'Sync settings could not be saved.'
			}
		},
		system: {
			section: 'System',
			startOnSignIn: 'Start on Windows sign-in',
			showTrayIcon: 'Show tray icon',
			minimizeToTray: 'Minimize to tray',
			workspaceIdleLock: 'Lock after inactivity',
			workspaceIdleLockNever: 'Never',
			workspaceIdleLockMinutes: '{minutes} minutes',
			loadError: 'System settings could not be loaded.',
			saveError: 'System settings could not be saved.',
			autostartUnavailable: 'Autostart is available in the desktop app.',
			autostartReadFailed: 'Autostart status could not be loaded.',
			autostartSaveFailed: 'Autostart setting could not be saved.'
		}
	},
	agents: {
		title: 'Agents',
		list: 'Agent list',
		details: 'Agent details',
		registeredCount: '{count} agents registered',
		newAgent: 'New agent',
		editAgent: 'Edit agent',
		provider: 'Provider',
		model: 'Model',
		modelId: 'Model ID',
		defaultModel: 'Default model',
		customModel: 'Custom model',
		providers: {
			auto: 'Auto',
			openrouter: 'OpenRouter',
			deepseek: 'DeepSeek',
			openai: 'OpenAI'
		},
		saved: 'Saved.',
		removed: 'Removed.',
		evaluation: {
			title: 'Evaluation',
			empty: 'No evaluations',
			noScore: '-',
			count: '{count} ratings',
			reset: 'Reset ratings',
			resetConfirm: "Reset this agent's accumulated ratings?",
			resetSaved: 'Ratings were reset.',
			resetAt: 'Reset at: {date}',
			criteria: {
				problemUnderstanding: {
					label: 'Problem understanding',
					description: 'Tracks whether the real intent, constraints, and context were understood.'
				},
				logicalValidity: {
					label: 'Logical validity',
					description: 'Tracks whether claims and conclusions avoid unsupported leaps.'
				},
				practicalFeasibility: {
					label: 'Practical feasibility',
					description: 'Tracks whether the answer can work under real market, team, and technical constraints.'
				},
				creativeInsight: {
					label: 'Creative insight',
					description: 'Tracks whether the answer offers a useful new angle rather than a familiar remix.'
				},
				riskDetection: {
					label: 'Risk detection',
					description: 'Tracks whether failure modes, hidden costs, and side effects were identified.'
				}
			}
		},
		errors: {
			nameRequired: 'Name is required.',
			authRequired: 'Select an API key.',
			nameDuplicate: 'Name already exists.',
			notFound: 'Agent was not found.',
			readFailed: 'Agents could not be read.',
			saveFailed: 'Agents could not be saved.'
		}
	},
	personas: {
		title: 'Personas',
		list: 'Persona list',
		details: 'Persona details',
		registeredCount: '{count} personas registered',
		newPersona: 'New persona',
		editPersona: 'Edit persona',
		randomSpectrums: 'Random traits',
		agentAssignment: {
			label: 'Agents without persona',
			placeholder: 'Select agents',
			none: 'None',
			selectedCount: '{count} selected'
		},
		styles: {
			title: 'Response style',
			items: {
				responseLength: {
					label: 'Response length',
					options: {
						short: 'Short',
						standard: 'Standard',
						detailed: 'Detailed'
					}
				},
				emotionalTone: {
					label: 'Emotional tone',
					options: {
						calm: 'Calm',
						neutral: 'Neutral',
						bright: 'Bright'
					}
				},
				judgmentAttitude: {
					label: 'Judgment stance',
					options: {
						critical: 'Critical',
						balanced: 'Balanced',
						supportive: 'Supportive'
					}
				},
				confidenceLevel: {
					label: 'Confidence level',
					options: {
						cautious: 'Cautious',
						realistic: 'Realistic',
						decisive: 'Decisive'
					}
				},
				socialDistance: {
					label: 'Social distance',
					options: {
						formal: 'Formal',
						comfortable: 'Comfortable',
						friendly: 'Friendly'
					}
				}
			}
		},
		spectrums: {
			title: 'Traits',
			items: {
				developmentApproach: {
					label: 'Development approach',
					levels: {
						1: { name: 'Design-first', description: 'Fixes structure, boundaries, and data flow before implementation.' },
						2: { name: 'Design-led', description: 'Sets direction and rules before moving into implementation.' },
						3: { name: 'Balanced explorer', description: 'Alternates between small prototypes and design adjustments.' },
						4: { name: 'Experiment-led', description: 'Builds quickly and uses results to choose direction.' },
						5: { name: 'Hacker', description: 'Working code first. The code being alive matters most.' }
					}
				},
				qualityStandard: {
					label: 'Stability and quality',
					levels: {
						1: { name: 'Lab-grade', description: 'Treats validation, types, tests, and security very strictly.' },
						2: { name: 'Production-stable', description: 'Tries to maintain production-grade reliability.' },
						3: { name: 'Pragmatic tradeoff', description: 'Balances risk and speed by situation.' },
						4: { name: 'Ship-first', description: 'Prefers fixing issues in operation when needed.' },
						5: { name: 'Experimental', description: 'Prioritizes speed and attempts over the cost of failure.' }
					}
				},
				structureBias: {
					label: 'Structure bias',
					levels: {
						1: { name: 'System designer', description: 'Treats boundaries, layers, and module relationships as critical.' },
						2: { name: 'Module-oriented', description: 'Consistently considers reuse and maintainability.' },
						3: { name: 'Practical structure', description: 'Structures only as much as needed.' },
						4: { name: 'Direct builder', description: 'Prefers direct implementation over abstraction.' },
						5: { name: 'Improvised assembler', description: 'Prioritizes fast connection and results over structure.' }
					}
				},
				productivityStrategy: {
					label: 'Productivity strategy',
					levels: {
						1: { name: 'Craftsperson', description: 'Minimizes dependencies and automation to keep direct control.' },
						2: { name: 'Selective automation', description: 'Adds only necessary tools carefully.' },
						3: { name: 'Practical tooling', description: 'Uses automation when it improves productivity.' },
						4: { name: 'Automation-centered', description: 'Automates repeat work whenever possible.' },
						5: { name: 'Orchestrator', description: 'Combines tools, agents, and pipelines to operate the work.' }
					}
				},
				operationPhilosophy: {
					label: 'Operations and release',
					levels: {
						1: { name: 'Change-restrictive', description: 'Delays release when failure risk is visible.' },
						2: { name: 'Stable release', description: 'Releases after enough verification and observability.' },
						3: { name: 'Incremental operations', description: 'Ships small changes often and watches stability.' },
						4: { name: 'Fast response', description: 'Actively uses operational fixes and hotfixes.' },
						5: { name: 'Live evolution', description: 'Treats the service as something that keeps changing in real time.' }
					}
				},
				collaborationPhilosophy: {
					label: 'Collaboration context',
					levels: {
						1: { name: 'Document-contract', description: 'Collaborates through documents, rules, and contracts.' },
						2: { name: 'Explicit collaboration', description: 'Makes intent and standards as visible as possible.' },
						3: { name: 'Context sharing', description: 'Shares core context and leaves the rest autonomous.' },
						4: { name: 'Tacit collaboration', description: 'Prefers fast collaboration based on experience and judgment.' },
						5: { name: 'Autonomous agents', description: 'Gives goals and expects people and AI to judge independently.' }
					}
				}
			}
		},
		saved: 'Saved.',
		removed: 'Removed.',
		errors: {
			nameRequired: 'Name is required.',
			nameDuplicate: 'Name already exists.',
			instructionsRequired: 'Instructions are required.',
			notFound: 'Persona was not found.',
			readFailed: 'Personas could not be read.',
			saveFailed: 'Personas could not be saved.'
		}
	},
	skills: {
		title: 'Skills',
		list: 'Skill list',
		details: 'Skill details',
		registeredCount: '{count} skills registered',
		newSkill: 'New skill',
		editSkill: 'Edit skill',
		copySkill: 'Copy to edit',
		copyNameSuffix: 'copy',
		saved: 'Saved.',
		removed: 'Removed.',
		outputTypes: {
			'work-order': 'Work order',
			proposal: 'Proposal',
			'result-report': 'Result report',
			'agent-evaluation': 'Agent evaluation'
		},
		builtIn: {
			proposalWriter: {
				name: 'Proposal writer',
				description:
					'Compare options and produce a proposal with recommendation and follow-up work.',
				instructions:
					'Return a workduck.queue-proposal/v1 artifact. Compare viable options, state tradeoffs, choose one recommendation, and include only concrete follow-up work orders when action is needed.'
			},
			agentResponseEvaluator: {
				name: 'Agent response evaluator',
				description: 'Rate an agent response with the five-criterion 1-9 rubric.',
				instructions:
					'Rate the response from only the task and the agent answer. Score problem understanding, logical validity, practical feasibility, creative insight, and risk detection from 1 to 9. Do not reward length by itself. Judge constraints, actionability, evidence, and risk handling. After choosing scores, save them to the same workspace with the workduck agent evaluate command.'
			}
		},
		errors: {
			nameRequired: 'Name is required.',
			nameDuplicate: 'Name already exists.',
			outputTypeRequired: 'Output type is required.',
			instructionsRequired: 'Instructions are required.',
			notFound: 'Skill was not found.',
			builtInReadonly: 'Built-in skill cannot be changed.',
			readFailed: 'Skills could not be read.',
			saveFailed: 'Skills could not be saved.'
		}
	},
	terminals: {
		title: 'Terminals',
		list: 'Terminal list',
		details: 'Terminal details',
		registeredCount: '{count} terminals registered',
		newTerminal: 'New terminal',
		editTerminal: 'Edit terminal',
		defaultSessionName: 'Terminal',
		kind: 'Type',
		command: 'Command',
		status: 'Status',
		screen: 'Terminal screen',
		connected: 'Connected',
		notConnected: 'Not connected',
		connect: 'Connect',
		disconnect: 'Disconnect',
		send: 'Send',
		inputPlaceholder: 'Enter a command',
		missingTerminal: 'Missing terminal',
		noAvailableTerminal: 'No available terminal',
		saved: 'Saved.',
		removed: 'Removed.',
		errors: {
			nameRequired: 'Name is required.',
			nameDuplicate: 'Name already exists.',
			kindRequired: 'Terminal type is required.',
			notFound: 'Terminal was not found.',
			readFailed: 'Terminals could not be read.',
			saveFailed: 'Terminals could not be saved.',
			catalogUnavailable: 'Terminal detection is available in the desktop app.',
			catalogReadFailed: 'Terminal types could not be checked.',
			sessionUnavailable: 'Terminal connections are available in the desktop app.',
			sessionStartFailed: 'Terminal could not be started.',
			sessionReadFailed: 'Terminal output could not be read.',
			sessionWriteFailed: 'Terminal input could not be written.',
			sessionStopFailed: 'Terminal could not be disconnected.'
		}
	},
	processes: {
		title: 'Processes',
		list: 'Process list',
		details: 'Process details',
		registeredCount: '{count} running',
		pid: 'PID',
		kind: 'Type',
		command: 'Command',
		ports: 'Listening ports',
		memory: 'Memory',
		forceKill: 'Force kill',
		forceKillConfirm: 'Force kill {name}?',
		empty: 'No development processes are running.',
		refreshed: 'Refreshed.',
		killSucceeded: 'Process killed.',
		errors: {
			unavailable: 'Process inspection is available in the desktop app.',
			readFailed: 'Processes could not be read.',
			killDenied: 'Workduck cannot kill this process.',
			killFailed: 'Process could not be killed.'
		}
	}
} as const;
