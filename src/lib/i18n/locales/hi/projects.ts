export const hiProjectsMessages = {
	newProject: 'नई परियोजना',
	newGroup: 'नया समूह',
	newRepository: 'नई रिपॉजिटरी',
	registeredCount: '{count} मुख्य परियोजनाएं',
	filters: {
		pullNeeded: 'पुल की आवश्यकता है',
		pushNeeded: 'पुश की आवश्यकता है',
		commitNeeded: 'कमिट की आवश्यकता है',
		searchLabel: 'रिपॉजिटरी नाम या टैग फ़िल्टर',
		searchPlaceholder: 'नाम या टैग'
	},
	kinds: {
		project: 'परियोजना',
		group: 'समूह'
	},
	counts: {
		group: 'समूह',
		groups: 'समूह',
		repo: 'रिपॉजिटरी',
		repos: 'रिपॉजिटरी'
	},
	lastRepositoryOperation: 'पिछली कार्रवाई: {timestamp}',
	repository: {
		uncommittedChanges: 'अप्रतिबद्ध (Uncommitted) बदलाव',
		queueCommitWorkOrder: 'कमिट कार्य जोड़ें',
		commitWorkOrderQueued: 'कमिट कार्य जोड़ा गया: {relativePath}',
		githubCredentialSaved: 'GitHub क्रेडेंशियल सहेजा गया।'
	},
	operations: {
		running: {
			clone: 'रिपॉजिटरी क्लोन की जा रही है',
			init: 'Git रिपॉजिटरी प्रारंभ की जा रही है',
			fetch: 'रिपॉजिटरी फ़ेच की जा रही है',
			pull: 'रिपॉजिटरी पुल की जा रही है',
			push: 'रिपॉजिटरी पुश की जा रही है',
			publish: 'रिपॉजिटरी प्रकाशित की जा रही है'
		},
		done: {
			clone: 'रिपॉजिटरी क्लोन की गई।',
			init: 'रिपॉजिटरी प्रारंभ की गई।',
			fetch: 'रिपॉजिटरी फ़ेच की गई।',
			pull: 'रिपॉजिटरी पुल की गई।',
			push: 'रिपॉजिटरी पुश की गई।',
			publish: 'रिपॉजिटरी प्रकाशित की गई।'
		},
		failed: {
			clone: 'क्लोन करना विफल रहा।',
			init: 'प्रारंभ करना विफल रहा।',
			fetch: 'फ़ेच करना विफल रहा।',
			pull: 'पुल करना विफल रहा।',
			push: 'पुश करना विफल रहा।',
			publish: 'प्रकाशित करना विफल रहा।'
		},
		buttonRunning: {
			clone: 'क्लोन किया जा रहा है',
			init: 'प्रारंभ',
			fetch: 'फ़ेच किया जा रहा है',
			pull: 'पुल किया जा रहा है',
			push: 'पुश किया जा रहा है',
			publish: 'प्रकाशित किया जा रहा है'
		},
		buttonIdle: {
			clone: 'क्लोन करें',
			init: 'Git प्रारंभ',
			fetch: 'फ़ेच करें',
			pull: 'पुल करें',
			push: 'पुश करें',
			publish: 'प्रकाशित करें'
		}
	},
	detailsDialog: {
		title: 'परियोजना संपादित करें',
		name: 'नाम',
		path: 'पथ',
		saving: 'सहेजा जा रहा है',
		save: 'सहेजें',
		cancel: 'रद्द करें',
		saved: 'परियोजना विवरण सहेजा गया।'
	},
	deleteDialog: {
		titles: {
			project: 'परियोजना हटाएं',
			group: 'समूह हटाएं',
			repository: 'रिपॉजिटरी हटाएं'
		},
		text: 'वर्कडक (Workduck) से {name} को हटाएं?',
		textWithAffected:
			'वर्कडक (Workduck) से {name} को हटाएं? यह परियोजना सूची से {affected} को भी हटा देगा।',
		affectedGroups: '{count} बाल समूह',
		affectedGroup: '{count} बाल समूह',
		affectedRepositories: '{count} रिपॉजिटरी',
		affectedRepository: '{count} रिपॉजिटरी',
		localProjectFolder: 'इस परियोजना फ़ोल्डर को भी हटाएं',
		localGroupFolder: 'इस समूह फ़ोल्डर को भी हटाएं',
		localRepositoryFolder: 'इस रिपॉजिटरी फ़ोल्डर को भी हटाएं',
		localFolderUnavailable:
			'स्थानीय फ़ोल्डर हटाना केवल इस कार्यक्षेत्र के अंतर्गत आने वाले फ़ोल्डरों के लिए उपलब्ध है।',
		localRepositoryFolderUnavailable:
			'स्थानीय फ़ोल्डर हटाना केवल इस कार्यक्षेत्र के अंतर्गत रिपॉजिटरी फ़ोल्डरों के लिए उपलब्ध है।',
		repositoryRemoved: 'रिपॉजिटरी हटा दी गई।',
		repositoryAndFolderRemoved: 'रिपॉजिटरी और स्थानीय फ़ोल्डर हटा दिए गए।',
		projectRemoved: 'परियोजना हटा दी गई।',
		projectAndFolderRemoved: 'परियोजना और स्थानीय फ़ोल्डर हटा दिए गए।',
		groupRemoved: 'समूह हटा दिया गया।',
		groupAndFolderRemoved: 'समूह और स्थानीय फ़ोल्डर हटा दिए गए।',
		cancel: 'रद्द करें',
		remove: 'हटाएं',
		removing: 'हटाया जा रहा है'
	},
	contextMenu: {
		openFolder: 'फ़ोल्डर खोलें',
		editDetails: 'नाम और पथ संपादित करें',
		editDescription: 'विवरण संपादित करें',
		githubCredential: 'GitHub क्रेडेंशियल',
		remoteUrl: 'रिमोट URL',
		editTags: 'टैग संपादित करें',
		delete: 'हटाएं',
		clone: 'क्लोन करें',
		initializeGit: 'Git प्रारंभ करें',
		publish: 'प्रकाशित करें',
		applySsealed: 'ssealed लागू करें',
		openTerminal: 'टर्मिनल खोलें',
		installDependencies: 'निर्भरता इंस्टॉल टर्मिनल खोलें',
		updateDependencies: 'निर्भरता अपडेट टर्मिनल खोलें',
		startDevServer: 'देव सर्वर टर्मिनल खोलें',
		build: 'बिल्ड टर्मिनल खोलें',
		preview: 'प्रीव्यू टर्मिनल खोलें'
	},
	repositoryTasks: {
		terminalOpened: 'टर्मिनल खोला गया।',
		commandTerminalOpened:
			'इस कमांड के साथ एक टर्मिनल खोला गया: {command}। परिणाम के साथ रिपॉजिटरी कार्ड अपडेट हो जाएगा।',
		installDependenciesTerminalOpened:
			'निर्भरता इंस्टॉल कमांड के साथ एक टर्मिनल खोला गया। परिणाम के साथ रिपॉजिटरी कार्ड अपडेट हो जाएगा।',
		updateDependenciesTerminalOpened:
			'निर्भरता अपडेट कमांड के साथ एक टर्मिनल खोला गया। परिणाम के साथ रिपॉजिटरी कार्ड अपडेट हो जाएगा।',
		startDevServerTerminalOpened:
			'देव सर्वर कमांड के साथ एक टर्मिनल खोला गया。 परिणाम के साथ रिपॉजिटरी कार्ड अपडेट हो जाएगा।',
		buildTerminalOpened:
			'बिल्ड कमांड के साथ एक टर्मिनल खोला गया। परिणाम के साथ रिपॉजिटरी कार्ड अपडेट हो जाएगा।',
		previewTerminalOpened:
			'प्रीव्यू कमांड के साथ एक टर्मिनल खोला गया। परिणाम के साथ रिपॉजिटरी कार्ड अपडेट हो जाएगा।',
		taskRunning: '{task} चल रहा है।',
		taskSucceeded: '{task} सफल रहा।',
		taskStopped: '{task} रुक गया।',
		taskFailed: '{task} विफल रहा।',
		taskFailedWithExitCode: '{task} विफल रहा। निकास कोड: {exitCode}।',
		tasks: {
			openTerminal: 'टर्मिनल',
			installDependencies: 'निर्भरता इंस्टॉल',
			updateDependencies: 'निर्भरता अपडेट',
			startDevServer: 'देव सर्वर',
			build: 'बिल्ड',
			preview: 'प्रीव्यू'
		}
	},
	ssealedScaffold: {
		title: 'ssealed लागू करें',
		scaffoldLabel: 'Scaffold',
		createScaffoldLabel: 'ssealed scaffold',
		profileLabel: 'रिपॉजिटरी प्रोफ़ाइल',
		none: 'कोई नहीं',
		createWithoutFiles: 'ssealed फ़ाइलें जोड़े बिना फ़ोल्डर बनाएं।',
		filePreviewLabel: 'ssealed फ़ाइल पूर्वावलोकन',
		checkingFiles: 'फ़ाइलों की जांच हो रही है।',
		noPreview: 'अभी कोई पूर्वावलोकन नहीं है।',
		allFilesMatch: 'सभी फ़ाइलें पहले से मेल खाती हैं।',
		previewSummary:
			'{missing} गायब, {unchanged} अपरिवर्तित, {conflicts} विरोध छोड़े गए।',
		conflictSkipNote:
			'विरोध वाली फ़ाइलों को ओवरराइट नहीं किया जाता। Workduck उन्हें बिना बदले छोड़ता है।',
		moreFiles: '{count} और फ़ाइलें।',
		cancel: 'रद्द करें',
		checking: 'जांच हो रही है',
		refresh: 'रीफ़्रेश',
		applying: 'लागू हो रहा है',
		apply: 'लागू करें',
		applyWithoutConflicts: 'विरोध छोड़कर लागू करें',
		appliedSummary: 'ssealed लागू हो गया। {added} फ़ाइलें जोड़ी गईं।',
		appliedWithSkippedConflictsSummary:
			'ssealed लागू हो गया। {added} फ़ाइलें जोड़ी गईं और {conflicts} विरोध छोड़े गए।',
		optionText: '{label} - {description}',
		fallbackScopeDescription: '{label} ssealed scaffold इस्तेमाल करें।',
		fallbackProfileDescription: '{label} रिपॉजिटरी के लिए scaffold समायोजित करें।',
		fileStatuses: {
			missing: 'जोड़ें',
			added: 'जोड़ा गया',
			unchanged: 'रखें',
			conflict: 'विरोध छोड़ा गया'
		},
		optionLabels: {
			backend: 'Backend',
			frontend: 'Frontend',
			fullstack: 'Fullstack',
			general: 'General',
			mobile: 'Mobile',
			infra: 'Infra',
			data: 'Data',
			generic: 'Generic',
			'cli-tool': 'CLI tool',
			'api-service': 'API service',
			'desktop-app': 'Desktop app',
			library: 'Library',
			'web-app': 'Web app',
			'mobile-app': 'Mobile app',
			sdk: 'SDK',
			'worker-service': 'Worker service',
			'infra-module': 'Infra module',
			'data-pipeline': 'Data pipeline',
			'github-action': 'GitHub Action',
			'browser-extension': 'Browser extension',
			plugin: 'Plugin',
			'docs-site': 'Docs site',
			monorepo: 'Monorepo'
		},
		scopeDescriptions: {
			backend: 'Server API, database, jobs और backend ownership docs.',
			frontend: 'Browser UI, routes, components और client behavior docs.',
			fullstack: 'एक application repo के frontend और backend boundaries.',
			general: 'Stack तय न हो तो product और architecture docs.',
			mobile: 'Mobile app ownership, release, device और runtime docs.',
			infra: 'Infrastructure, deployment, operations और runbook docs.',
			data: 'Data pipeline, lineage, quality और analytics contract docs.'
		},
		profileDescriptions: {
			generic: 'सामान्य रिपॉजिटरी के लिए neutral defaults.',
			'cli-tool': 'Commands, options और release docs वाले command-line tools.',
			'api-service': 'API contracts और operation docs वाली HTTP या RPC services.',
			'desktop-app': 'Packaging, update और runtime docs वाली desktop apps.',
			library: 'Public API और compatibility docs वाले reusable packages.',
			'web-app': 'Routing, rendering और deployment docs वाली web applications.',
			'mobile-app': 'Platform, store और device docs वाली mobile applications.',
			sdk: 'Client API और versioning docs वाले developer SDKs.',
			'worker-service': 'Background workers, queues, schedulers और retry docs.',
			'infra-module': 'Plan, apply और rollback docs वाले infrastructure modules.',
			'data-pipeline': 'Ingestion, transformation, lineage और data quality docs.',
			'github-action': 'Inputs, permissions और release docs वाली GitHub Actions.',
			'browser-extension': 'Permissions और store release docs वाले browser extensions.',
			plugin: 'Host contracts और lifecycle docs वाली plugin-style integrations.',
			'docs-site': 'Navigation और publishing docs वाली documentation sites.',
			monorepo: 'Workspace और ownership docs वाली multi-package repositories.'
		}
	},
	errors: {
		'project-github-credential-required': 'GitHub क्रेडेंशियल चुनें।',
		'project-github-credential-vault-locked':
			'चयनित GitHub क्रेडेंशियल का उपयोग करने के लिए पर्यावरण (Environment) को अनलॉक करें।',
		'project-github-credential-missing': 'चयनित GitHub क्रेडेंशियल नहीं मिला।',
		'project-github-credential-invalid': 'चयनित GitHub क्रेडेंशियल एक GitHub टोकन होना चाहिए।',
		'project-name-required': 'नाम आवश्यक है।',
		'project-name-duplicate': 'यह नाम यहाँ पहले से मौजूद है।',
		'project-parent-not-found': 'अभिभावक (Parent) परियोजना नहीं मिली।',
		'project-parent-invalid': 'समूहों को केवल एक परियोजना के अंतर्गत जोड़ा जा सकता है।',
		'project-node-not-found': 'परियोजना नहीं मिली।',
		'project-path-required': 'परियोजना पथ आवश्यक है।',
		'project-path-duplicate': 'परियोजना पथ पहले से पंजीकृत है।',
		'project-tags-too-many': 'बहुत सारे टैग हैं। कुछ टैग हटाएं और पुनः प्रयास करें।',
		'project-tag-too-long': 'टैग बहुत लंबे हैं। टैग छोटे करें और पुनः प्रयास करें।',
		'project-repository-target-invalid': 'रिपॉजिटरी को केवल समूहों से जोड़ा जा सकता है।',
		'project-repository-not-found': 'रिपॉजिटरी लिंक नहीं मिला।',
		'project-folder-workspace-required': 'कार्यक्षेत्र पथ आवश्यक है।',
		'project-folder-workspace-not-absolute': 'कार्यक्षेत्र पथ पूर्ण होना चाहिए।',
		'project-folder-workspace-not-found': 'कार्यक्षेत्र पथ नहीं मिला।',
		'project-folder-workspace-not-directory': 'कार्यक्षेत्र पथ एक फ़ोल्डर होना चाहिए।',
		'project-folder-workspace-permission-denied': 'कार्यक्षेत्र पथ लिखने योग्य नहीं है।',
		'project-folder-workspace-unreadable': 'कार्यक्षेत्र पथ की जांच नहीं की जा सकी।',
		'project-folder-root-invalid': 'परियोजना फ़ोल्डर उपयोग करने योग्य नहीं है।',
		'project-folder-parent-required': 'अभिभावक फ़ोल्डर उपयोग करने योग्य नहीं है।',
		'project-folder-parent-invalid': 'अभिभावक फ़ोल्डर उपयोग करने योग्य नहीं है।',
		'project-folder-parent-not-found': 'अभिभावक फ़ोल्डर उपयोग करने योग्य नहीं है।',
		'project-folder-path-required': 'परियोजना फ़ोल्डर पथ आवश्यक है।',
		'project-folder-path-invalid': 'परियोजना फ़ोल्डर पथ उपयोग करने योग्य नहीं है।',
		'project-folder-name-required': 'नाम आवश्यक है।',
		'project-folder-name-invalid': 'नाम का उपयोग फ़ोल्डर के रूप में नहीं किया जा सकता।',
		'project-folder-conflict': 'फ़ोल्डर पथ उपयोग करने योग्य नहीं है।',
		'project-folder-create-failed': 'फ़ोल्डर नहीं बनाया जा सका।',
		'project-folder-ssealed-scaffold-failed': 'ssealed scaffold नहीं बनाया जा सका।',
		'project-folder-open-path-required': 'फ़ोल्डर पथ आवश्यक है।',
		'project-folder-open-path-not-absolute': 'फ़ोल्डर पथ पूर्ण होना चाहिए।',
		'project-folder-open-path-not-found': 'फ़ोल्डर पथ नहीं मिला।',
		'project-folder-open-path-not-directory': 'फ़ोल्डर पथ एक फ़ोल्डर होना चाहिए।',
		'project-folder-open-path-permission-denied': 'फ़ोल्डर पथ नहीं खोला जा सका।',
		'project-folder-repository-path-outside-workspace':
			'रिपॉजिटरी फ़ोल्डर वर्तमान workspace के अंदर होना चाहिए।',
		'project-folder-open-failed': 'फ़ोल्डर नहीं खोला जा सका।',
		'project-folder-delete-path-required': 'फ़ोल्डर पथ आवश्यक है।',
		'project-folder-delete-path-not-absolute': 'फ़ोल्डर पथ पूर्ण होना चाहिए।',
		'project-folder-delete-path-not-found': 'फ़ोल्डर पथ नहीं मिला।',
		'project-folder-delete-path-not-directory': 'फ़ोल्डर पथ एक फ़ोल्डर होना चाहिए।',
		'project-folder-delete-path-outside-workspace':
			'केवल इस कार्यक्षेत्र परियोजना फ़ोल्डर के अंतर्गत फ़ोल्डरों को ही यहाँ हटाया जा सकता है।',
		'project-folder-delete-path-permission-denied': 'फ़ोल्डर पथ हटाया नहीं जा सका।',
		'project-folder-delete-failed': 'फ़ोल्डर हटाया नहीं जा सका।',
		'project-folder-unavailable': 'परियोजना फ़ोल्डर डेस्कटॉप ऐप में उपलब्ध हैं।',
		'project-repository-name-required': 'रिपॉजिटरी नाम आवश्यक है।',
		'project-repository-source-required': 'रिपॉजिटरी फ़ोल्डर या URL आवश्यक है।',
		'project-repository-path-required': 'रिपॉजिटरी पथ आवश्यक है।',
		'project-repository-path-outside-workspace':
			'रिपॉजिटरी पथ वर्तमान कार्यक्षेत्र के अंदर होना चाहिए।',
		'project-repository-path-duplicate': 'रिपॉजिटरी पथ पहले से ही लिंक है।',
		'project-repository-remote-url-invalid': 'रिपॉजिटरी URL उपयोग करने योग्य नहीं है।',
		'project-repository-remote-url-duplicate': 'रिपॉजिटरी URL पहले से पंजीकृत है।',
		'project-repository-clone-unavailable': 'रिपॉजिटरी क्लोन सुविधा डेस्कटॉप ऐप में उपलब्ध है।',
		'project-repository-workspace-required': 'कार्यक्षेत्र पथ उपयोग करने योग्य नहीं है।',
		'project-repository-workspace-not-absolute': 'कार्यक्षेत्र पथ उपयोग करने योग्य नहीं है।',
		'project-repository-workspace-not-found': 'कार्यक्षेत्र पथ उपयोग करने योग्य नहीं है।',
		'project-repository-workspace-not-directory': 'कार्यक्षेत्र पथ उपयोग करने योग्य नहीं है।',
		'project-repository-workspace-permission-denied': 'कार्यक्षेत्र पथ उपयोग करने योग्य नहीं है。',
		'project-repository-workspace-unreadable': 'कार्यक्षेत्र पथ उपयोग करने योग्य नहीं है。',
		'project-repository-group-path-required': 'रिपॉजिटरी समूह फ़ोल्डर उपयोग करने योग्य नहीं है।',
		'project-repository-group-path-invalid': 'रिपॉजिटरी समूह फ़ोल्डर उपयोग करने योग्य नहीं है।',
		'project-repository-group-path-not-found': 'रिपॉजिटरी समूह फ़ोल्डर उपयोग करने योग्य नहीं है।',
		'project-repository-group-path-not-directory': 'रिपॉजिटरी समूह फ़ोल्डर उपयोग करने योग्य नहीं है।',
		'project-repository-name-invalid': 'रिपॉजिटरी नाम का उपयोग फ़ोल्डर के रूप में नहीं किया जा सकता।',
		'project-repository-remote-url-required': 'रिपॉजिटरी URL आवश्यक है।',
		'project-repository-clone-target-exists': 'क्लोन लक्ष्य फ़ोल्डर पहले से मौजूद है।',
		'project-repository-clone-command-unavailable': 'Git कमांड नहीं मिला।',
		'project-repository-clone-command-timed-out': 'रिपॉजिटरी क्लोन का समय समाप्त हो गया।',
		'project-repository-clone-path-too-long':
			'क्लोन Windows पथ लंबाई सीमा से टकराया। छोटा प्रोजेक्ट पथ इस्तेमाल करें या Windows और Git में लंबे पथ चालू करें।',
		'project-repository-clone-token-invalid':
			'GitHub टोकन अमान्य या समाप्त हो गया है। पर्यावरण चर में GitHub PAT अपडेट करें।',
		'project-repository-clone-permission-denied':
			'GitHub टोकन के पास रिपॉजिटरी पहुंच नहीं है। रिपॉजिटरी चयन और सामग्री पढ़ने की अनुमति जांचें।',
		'project-repository-clone-repository-not-found':
			'रिपॉजिटरी नहीं मिली। निजी रिपॉजिटरी के लिए, GitHub यह तब दिखा सकता है जब टोकन के पास पहुंच न हो।',
		'project-repository-clone-organization-restricted':
			'GitHub संगठन की पहुंच प्रतिबंधित है। संगठन या SSO के लिए टोकन को अधिकृत करें।',
		'project-repository-clone-access-denied':
			'GitHub द्वारा रिपॉजिटरी पहुंच अस्वीकार कर दी गई। URL, टोकन पहुंच और संगठन नीति की जांच करें।',
		'project-repository-clone-auth-required':
			'रिपॉजिटरी क्लोन के लिए Git प्रमाणीकरण की आवश्यकता है। इस परियोजना के लिए एक GitHub क्रेडेंशियल चुनें।',
		'project-repository-clone-failed':
			'रिपॉजिटरी क्लोन विफल रहा। URL, नेटवर्क और Git क्रेडेंशियल की जांच करें।',
		'project-repository-git-path-required': 'रिपॉजिटरी पथ आवश्यक है।',
		'project-repository-git-path-not-absolute': 'रिपॉजिटरी पथ पूर्ण होना चाहिए।',
		'project-repository-git-path-not-found': 'रिपॉजिटरी पथ नहीं मिला।',
		'project-repository-git-path-not-directory': 'रिपॉजिटरी पथ एक फ़ोल्डर होना चाहिए।',
		'project-repository-git-path-permission-denied': 'रिपॉजिटरी पथ पढ़ा नहीं जा सकता।',
		'project-repository-git-path-unreadable': 'रिपॉजिटरी पथ की जांच नहीं की जा सकी।',
		'project-repository-git-command-unavailable': 'Git कमांड नहीं मिला।',
		'project-repository-git-command-failed':
			'Git कमांड विफल रहा। रिपॉजिटरी पथ और Git स्थापना की जांच करें।',
		'project-repository-git-command-timed-out': 'Git कमांड का समय समाप्त हो गया।',
		'project-repository-git-not-repository': 'रिपॉजिटरी फ़ोल्डर Git के लिए प्रारंभ नहीं किया गया है।',
		'project-repository-git-init-failed': 'Git रिपॉजिटरी प्रारंभ नहीं की जा सकी।',
		'project-repository-git-remote-missing': 'Git रिमोट कॉन्फ़िगर नहीं है।',
		'project-repository-git-push-auth-required': 'Git पुश के लिए प्रमाणीकरण आवश्यक है।',
		'project-repository-git-push-empty': 'रिपॉजिटरी में पुश करने के लिए कोई कमिट नहीं है।',
		'project-repository-git-push-failed':
			'Git पुश विफल रहा। रिमोट URL, शाखा, नेटवर्क और क्रेडेंशियल जांचें।',
		'project-repository-git-fetch-auth-required': 'Git फ़ेच के लिए प्रमाणीकरण आवश्यक है।',
		'project-repository-git-fetch-failed':
			'Git फ़ेच विफल रहा। रिमोट URL, नेटवर्क और क्रेडेंशियल जांचें।',
		'project-repository-git-pull-auth-required': 'Git पुल के लिए प्रमाणीकरण आवश्यक है।',
		'project-repository-git-pull-conflict':
			'Git पुल रोक दिया गया क्योंकि इस चेकआउट में स्थानीय परिवर्तन या विरोध हैं। स्थानीय परिवर्तनों को कमिट, स्टैश या त्यागें, फिर से पुल करें।',
		'project-repository-git-pull-failed':
			'Git पुल विफल रहा। रिमोट URL, शाखा, नेटवर्क और क्रेडेंशियल जांचें।',
		'project-repository-github-repo-name-required': 'GitHub रिपॉजिटरी नाम आवश्यक है।',
		'project-repository-github-repo-name-invalid': 'GitHub रिपॉजिटरी नाम उपयोग करने योग्य नहीं है।',
		'project-repository-github-commit-message-required': 'कमिट संदेश आवश्यक है।',
		'project-repository-github-commit-message-invalid': 'कमिट संदेश उपयोग करने योग्य नहीं है।',
		'project-repository-github-visibility-invalid': 'GitHub दृश्यता उपयोग करने योग्य नहीं है।',
		'project-repository-github-cli-unavailable': 'GitHub CLI नहीं मिला।',
		'project-repository-github-auth-required': 'GitHub CLI को प्रमाणीकरण की आवश्यकता है।',
		'project-repository-github-remote-exists': 'Git रिमोट स्रोत पहले से मौजूद है।',
		'project-repository-github-empty': 'रिपॉजिटरी में प्रकाशित करने के लिए कोई कमिट नहीं है।',
		'project-repository-github-commit-identity-missing':
			'Git लेखक का नाम या ईमेल कॉन्फ़िगर नहीं है।',
		'project-repository-github-commit-index-locked':
			'Git अनुक्रमणिका (index) किसी अन्य प्रक्रिया द्वारा लॉक की गई है।',
		'project-repository-github-commit-hook-failed':
			'प्रारंभिक कमिट को Git हुक द्वारा रोक दिया गया था।',
		'project-repository-github-commit-failed': 'प्रारंभिक कमिट नहीं बनाई जा सकी।',
		'project-repository-github-create-failed':
			'GitHub रिपॉजिटरी नहीं बनाई जा सकी। GitHub प्रमाणीकरण और रिपॉजिटरी नाम जांचें।',
		'project-repository-task-unavailable': 'रिपॉजिटरी कार्य डेस्कटॉप ऐप में उपलब्ध हैं।',
		'project-repository-task-workspace-required': 'कार्यक्षेत्र पथ उपयोग करने योग्य नहीं है।',
		'project-repository-task-workspace-not-absolute': 'कार्यक्षेत्र पथ उपयोग करने योग्य नहीं है।',
		'project-repository-task-workspace-not-found': 'कार्यक्षेत्र पथ उपयोग करने योग्य नहीं है।',
		'project-repository-task-workspace-not-directory': 'कार्यक्षेत्र पथ उपयोग करने योग्य नहीं है।',
		'project-repository-task-workspace-unreadable': 'कार्यक्षेत्र पथ उपयोग करने योग्य नहीं है।',
		'project-repository-task-path-required': 'रिपॉजिटरी पथ उपयोग करने योग्य नहीं है।',
		'project-repository-task-path-not-absolute': 'रिपॉजिटरी पथ उपयोग करने योग्य नहीं है।',
		'project-repository-task-path-not-found': 'रिपॉजिटरी पथ उपयोग करने योग्य नहीं है।',
		'project-repository-task-path-not-directory': 'रिपॉजिटरी पथ उपयोग करने योग्य नहीं है।',
		'project-repository-task-path-outside-workspace':
			'रिपॉजिटरी पथ वर्तमान कार्यक्षेत्र के अंदर होना चाहिए।',
		'project-repository-task-path-unreadable': 'रिपॉजिटरी पथ उपयोग करने योग्य नहीं है।',
		'project-repository-task-invalid': 'रिपॉजिटरी कार्य उपयोग करने योग्य नहीं है।',
		'project-repository-task-command-unavailable':
			'इस रिपॉजिटरी के लिए कोई मिलान कमांड नहीं मिला।',
		'project-repository-task-terminal-unavailable': 'कोई समर्थित टर्मिनल नहीं मिला।',
		'project-repository-task-terminal-unsupported-platform':
			'रिपॉजिटरी टर्मिनल कार्य वर्तमान में केवल विंडोज़ (Windows) पर समर्थित हैं।',
		'project-repository-task-launch-failed': 'कमांड टर्मिनल नहीं खोला जा सका।',
		'project-repository-task-record-write-failed':
			'रिपॉजिटरी कार्य रिकॉर्ड सहेजा नहीं जा सका।',
		'project-repository-task-record-read-failed':
			'रिपॉजिटरी कार्य रिकॉर्ड लोड नहीं किए जा सके।',
		'project-registry-read-failed': 'परियोजनाएं लोड नहीं की जा सकीं।',
		'project-registry-version-unsupported':
			'परियोजना डेटा नए प्रारूप का उपयोग करता है। परियोजनाओं को फिर से खोलने से पहले वर्कडक को अपडेट करें।',
		'project-registry-write-failed': 'परियोजनाएं सहेजी नहीं जा सकीं।',
		'project-repository-operation-read-failed':
			'रिपॉजिटरी ऑपरेशन रिकॉर्ड लोड नहीं किए जा सके।',
		'project-repository-operation-write-failed':
			'रिपॉजिटरी ऑपरेशन रिकॉर्ड सहेजा नहीं जा सका।'
	}
} as const;
