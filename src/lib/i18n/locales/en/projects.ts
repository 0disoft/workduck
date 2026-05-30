export const enProjectsMessages = {
		newProject: 'New project',
		newGroup: 'New group',
		newRepository: 'New repository',
		registeredCount: '{count} root projects',
		filters: {
			pullNeeded: 'Pull needed',
			pushNeeded: 'Push needed',
			commitNeeded: 'Commit needed',
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
		repository: {
			uncommittedChanges: 'Uncommitted changes',
			queueCommitWorkOrder: 'Add commit work',
			commitWorkOrderQueued: 'Added commit work: {relativePath}'
		},
		operations: {
			running: {
				clone: 'Cloning repository',
				init: 'Initializing Git repository',
				fetch: 'Fetching repository',
				pull: 'Pulling repository',
				push: 'Pushing repository',
				publish: 'Publishing repository'
			},
			done: {
				clone: 'Repository cloned.',
				init: 'Repository initialized.',
				fetch: 'Repository fetched.',
				pull: 'Repository pulled.',
				push: 'Repository pushed.',
				publish: 'Repository published.'
			},
			failed: {
				clone: 'Clone failed.',
				init: 'Initializing failed.',
				fetch: 'Fetch failed.',
				pull: 'Pull failed.',
				push: 'Push failed.',
				publish: 'Publish failed.'
			},
			buttonRunning: {
				clone: 'Cloning',
				init: 'Init',
				fetch: 'Fetching',
				pull: 'Pulling',
				push: 'Pushing',
				publish: 'Publishing'
			},
			buttonIdle: {
				clone: 'Clone',
				init: 'Git Init',
				fetch: 'Fetch',
				pull: 'Pull',
				push: 'Push',
				publish: 'Publish'
			}
		},
		detailsDialog: {
			title: 'Edit project',
			name: 'Name',
			path: 'Path',
			saving: 'Saving',
			save: 'Save',
			cancel: 'Cancel',
			saved: 'Project details saved.'
		},
		deleteDialog: {
			titles: {
				project: 'Remove project',
				group: 'Remove group',
				repository: 'Remove repository'
			},
			text: 'Remove {name} from Workduck?',
			textWithAffected:
				'Remove {name} from Workduck? This also removes {affected} from the project list.',
			affectedGroups: '{count} child groups',
			affectedGroup: '{count} child group',
			affectedRepositories: '{count} repositories',
			affectedRepository: '{count} repository',
			localProjectFolder: 'Also delete this project folder',
			localGroupFolder: 'Also delete this group folder',
			localRepositoryFolder: 'Also delete this repository folder',
			localFolderUnavailable:
				'Local folder deletion is only available for folders under this workspace.',
			localRepositoryFolderUnavailable:
				'Local folder deletion is only available for repository folders under this workspace.',
			repositoryRemoved: 'Repository removed.',
			repositoryAndFolderRemoved: 'Repository and local folder removed.',
			projectRemoved: 'Project removed.',
			projectAndFolderRemoved: 'Project and local folder removed.',
			groupRemoved: 'Group removed.',
			groupAndFolderRemoved: 'Group and local folder removed.',
			cancel: 'Cancel',
			remove: 'Remove',
			removing: 'Removing'
		},
		contextMenu: {
			openFolder: 'Open folder',
			editDetails: 'Edit name and path',
			editDescription: 'Edit description',
			githubCredential: 'GitHub credential',
			editTags: 'Edit tags',
			delete: 'Delete',
			clone: 'Clone',
			initializeGit: 'Initialize Git',
			publish: 'Publish',
			openTerminal: 'Open terminal',
			installDependencies: 'Open dependency install terminal',
			updateDependencies: 'Open dependency update terminal',
			startDevServer: 'Open dev server terminal',
			build: 'Open build terminal'
		},
		repositoryTasks: {
			terminalOpened: 'Terminal opened.',
			commandTerminalOpened: 'Opened a terminal with this command: {command}. The repository card will update with the result.',
			installDependenciesTerminalOpened: 'Opened a terminal with the dependency install command. The repository card will update with the result.',
			updateDependenciesTerminalOpened: 'Opened a terminal with the dependency update command. The repository card will update with the result.',
			startDevServerTerminalOpened: 'Opened a terminal with the dev server command. The repository card will update with the result.',
			buildTerminalOpened: 'Opened a terminal with the build command. The repository card will update with the result.',
			taskRunning: '{task} running.',
			taskSucceeded: '{task} succeeded.',
			taskStopped: '{task} stopped.',
			taskFailed: '{task} failed.',
			taskFailedWithExitCode: '{task} failed. Exit code: {exitCode}.',
			tasks: {
				openTerminal: 'Terminal',
				installDependencies: 'Dependency install',
				updateDependencies: 'Dependency update',
				startDevServer: 'Dev server',
				build: 'Build'
			}
		},
		errors: {
			'project-github-credential-vault-locked':
				'Unlock Environment to use the selected GitHub credential.',
			'project-github-credential-missing': 'Selected GitHub credential was not found.',
			'project-github-credential-invalid': 'Selected GitHub credential must be a GitHub token.',
			'project-name-required': 'Name is required.',
			'project-name-duplicate': 'Name already exists here.',
			'project-parent-not-found': 'Parent project was not found.',
			'project-parent-invalid': 'Groups can only be added under a project.',
			'project-node-not-found': 'Project was not found.',
			'project-path-required': 'Project path is required.',
			'project-path-duplicate': 'Project path is already registered.',
			'project-tags-too-many': 'Too many tags. Remove some tags and try again.',
			'project-tag-too-long': 'Tags are too long. Shorten tags and try again.',
			'project-repository-target-invalid': 'Repositories can only be linked to groups.',
			'project-repository-not-found': 'Repository link was not found.',
			'project-folder-workspace-required': 'Workspace path is required.',
			'project-folder-workspace-not-absolute': 'Workspace path must be absolute.',
			'project-folder-workspace-not-found': 'Workspace path was not found.',
			'project-folder-workspace-not-directory': 'Workspace path must be a folder.',
			'project-folder-workspace-permission-denied': 'Workspace path is not writable.',
			'project-folder-workspace-unreadable': 'Workspace path could not be checked.',
			'project-folder-root-invalid': 'Projects folder is not usable.',
			'project-folder-parent-required': 'Parent folder is not usable.',
			'project-folder-parent-invalid': 'Parent folder is not usable.',
			'project-folder-parent-not-found': 'Parent folder is not usable.',
			'project-folder-path-required': 'Project folder path is required.',
			'project-folder-path-invalid': 'Project folder path is not usable.',
			'project-folder-name-required': 'Name is required.',
			'project-folder-name-invalid': 'Name cannot be used as a folder.',
			'project-folder-conflict': 'Folder path is not usable.',
			'project-folder-create-failed': 'Folder could not be created.',
			'project-folder-open-path-required': 'Folder path is required.',
			'project-folder-open-path-not-absolute': 'Folder path must be absolute.',
			'project-folder-open-path-not-found': 'Folder path was not found.',
			'project-folder-open-path-not-directory': 'Folder path must be a folder.',
			'project-folder-open-path-permission-denied': 'Folder path could not be opened.',
			'project-folder-open-failed': 'Folder could not be opened.',
			'project-folder-delete-path-required': 'Folder path is required.',
			'project-folder-delete-path-not-absolute': 'Folder path must be absolute.',
			'project-folder-delete-path-not-found': 'Folder path was not found.',
			'project-folder-delete-path-not-directory': 'Folder path must be a folder.',
			'project-folder-delete-path-outside-workspace':
				'Only folders under this workspace projects folder can be deleted here.',
			'project-folder-delete-path-permission-denied': 'Folder path could not be deleted.',
			'project-folder-delete-failed': 'Folder could not be deleted.',
			'project-folder-unavailable': 'Project folders are available in the desktop app.',
			'project-repository-name-required': 'Repository name is required.',
			'project-repository-source-required': 'Repository folder or URL is required.',
			'project-repository-path-required': 'Repository path is required.',
			'project-repository-path-outside-workspace':
				'Repository path must stay inside the current workspace.',
			'project-repository-path-duplicate': 'Repository path is already linked.',
			'project-repository-remote-url-invalid': 'Repository URL is not usable.',
			'project-repository-remote-url-duplicate': 'Repository URL is already registered.',
			'project-repository-clone-unavailable': 'Repository clone is available in the desktop app.',
			'project-repository-workspace-required': 'Workspace path is not usable.',
			'project-repository-workspace-not-absolute': 'Workspace path is not usable.',
			'project-repository-workspace-not-found': 'Workspace path is not usable.',
			'project-repository-workspace-not-directory': 'Workspace path is not usable.',
			'project-repository-workspace-permission-denied': 'Workspace path is not usable.',
			'project-repository-workspace-unreadable': 'Workspace path is not usable.',
			'project-repository-group-path-required': 'Repository group folder is not usable.',
			'project-repository-group-path-invalid': 'Repository group folder is not usable.',
			'project-repository-group-path-not-found': 'Repository group folder is not usable.',
			'project-repository-group-path-not-directory': 'Repository group folder is not usable.',
			'project-repository-name-invalid': 'Repository name cannot be used as a folder.',
			'project-repository-remote-url-required': 'Repository URL is required.',
			'project-repository-clone-target-exists': 'Clone target folder already exists.',
			'project-repository-clone-command-unavailable': 'Git command was not found.',
			'project-repository-clone-command-timed-out': 'Repository clone timed out.',
			'project-repository-clone-token-invalid':
				'GitHub token is invalid or expired. Update the GitHub PAT in Environment variables.',
			'project-repository-clone-permission-denied':
				'GitHub token does not have repository access. Check repository selection and Contents read permission.',
			'project-repository-clone-repository-not-found':
				'Repository was not found. For private repositories, GitHub may show this when the token has no access.',
			'project-repository-clone-organization-restricted':
				'GitHub organization access is restricted. Authorize the token for the organization or SSO.',
			'project-repository-clone-access-denied':
				'Repository access was denied by GitHub. Check URL, token access, and organization policy.',
			'project-repository-clone-auth-required':
				'Repository clone needs Git authentication. Select a GitHub credential for this project.',
			'project-repository-clone-failed':
				'Repository clone failed. Check the URL, network, and Git credentials.',
			'project-repository-git-path-required': 'Repository path is required.',
			'project-repository-git-path-not-absolute': 'Repository path must be absolute.',
			'project-repository-git-path-not-found': 'Repository path was not found.',
			'project-repository-git-path-not-directory': 'Repository path must be a folder.',
			'project-repository-git-path-permission-denied': 'Repository path is not readable.',
			'project-repository-git-path-unreadable': 'Repository path could not be checked.',
			'project-repository-git-command-unavailable': 'Git command was not found.',
			'project-repository-git-command-failed':
				'Git command failed. Check the repository path and Git installation.',
			'project-repository-git-command-timed-out': 'Git command timed out.',
			'project-repository-git-not-repository': 'Repository folder is not initialized for Git.',
			'project-repository-git-init-failed': 'Git repository could not be initialized.',
			'project-repository-git-remote-missing': 'Git remote is not configured.',
			'project-repository-git-push-auth-required': 'Git push needs authentication.',
			'project-repository-git-push-empty': 'Repository has no commits to push.',
			'project-repository-git-push-failed':
				'Git push failed. Check the remote URL, branch, network, and credentials.',
			'project-repository-git-fetch-auth-required': 'Git fetch needs authentication.',
			'project-repository-git-fetch-failed':
				'Git fetch failed. Check the remote URL, network, and credentials.',
			'project-repository-git-pull-auth-required': 'Git pull needs authentication.',
			'project-repository-git-pull-conflict':
				'Git pull was stopped because this checkout has local changes or conflicts. Commit, stash, or discard the local changes, then pull again.',
			'project-repository-git-pull-failed':
				'Git pull failed. Check the remote URL, branch, network, and credentials.',
			'project-repository-github-repo-name-required': 'GitHub repository name is required.',
			'project-repository-github-repo-name-invalid': 'GitHub repository name is not usable.',
			'project-repository-github-commit-message-required': 'Commit message is required.',
			'project-repository-github-commit-message-invalid': 'Commit message is not usable.',
			'project-repository-github-visibility-invalid': 'GitHub visibility is not usable.',
			'project-repository-github-cli-unavailable': 'GitHub CLI was not found.',
			'project-repository-github-auth-required': 'GitHub CLI needs authentication.',
			'project-repository-github-remote-exists': 'Git remote origin already exists.',
			'project-repository-github-empty': 'Repository has no commits to publish.',
			'project-repository-github-commit-identity-missing':
				'Git author name or email is not configured.',
			'project-repository-github-commit-index-locked':
				'Git index is locked by another process.',
			'project-repository-github-commit-hook-failed':
				'Initial commit was blocked by a Git hook.',
			'project-repository-github-commit-failed': 'Initial commit could not be created.',
			'project-repository-github-create-failed':
				'GitHub repository could not be created. Check GitHub CLI authentication and repository name.',
			'project-repository-task-unavailable': 'Repository tasks are available in the desktop app.',
			'project-repository-task-workspace-required': 'Workspace path is not usable.',
			'project-repository-task-workspace-not-absolute': 'Workspace path is not usable.',
			'project-repository-task-workspace-not-found': 'Workspace path is not usable.',
			'project-repository-task-workspace-not-directory': 'Workspace path is not usable.',
			'project-repository-task-workspace-unreadable': 'Workspace path is not usable.',
			'project-repository-task-path-required': 'Repository path is not usable.',
			'project-repository-task-path-not-absolute': 'Repository path is not usable.',
			'project-repository-task-path-not-found': 'Repository path is not usable.',
			'project-repository-task-path-not-directory': 'Repository path is not usable.',
			'project-repository-task-path-outside-workspace':
				'Repository path must stay inside the current workspace.',
			'project-repository-task-path-unreadable': 'Repository path is not usable.',
			'project-repository-task-invalid': 'Repository task is not usable.',
			'project-repository-task-command-unavailable':
				'No matching command was found for this repository.',
			'project-repository-task-terminal-unavailable': 'No supported terminal was found.',
			'project-repository-task-terminal-unsupported-platform':
				'Repository terminal tasks are currently supported only on Windows.',
			'project-repository-task-launch-failed': 'Command terminal could not be opened.',
			'project-repository-task-record-write-failed':
				'Repository task record could not be saved.',
			'project-repository-task-record-read-failed':
				'Repository task records could not be loaded.',
			'project-registry-read-failed': 'Projects could not be loaded.',
			'project-registry-version-unsupported':
				'Project data uses a newer format. Update Workduck before opening projects again.',
			'project-registry-write-failed': 'Projects could not be saved.',
			'project-repository-operation-read-failed':
				'Repository operation records could not be loaded.',
			'project-repository-operation-write-failed':
				'Repository operation record could not be saved.'
		}
	} as const;
