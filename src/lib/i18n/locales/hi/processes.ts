export const hiProcessesMessages = {
	title: 'प्रक्रियाएं',
	list: 'प्रक्रिया सूची',
	details: 'प्रक्रिया विवरण',
	registeredCount: '{count} चल रही प्रक्रियाएं',
	pid: 'PID',
	kind: 'प्रकार',
	command: 'कमांड',
	ports: 'सुनने वाले पोर्ट',
	memory: 'मेमोरी',
	forceKill: 'बलपूर्वक समाप्त करें',
	forceKillConfirm: '{name} को बलपूर्वक समाप्त करें?',
	empty: 'कोई विकास प्रक्रियाएं नहीं चल रही हैं।',
	refreshed: 'ताज़ा किया गया।',
	killSucceeded: 'प्रक्रिया समाप्त कर दी गई।',
	errors: {
		unavailable: 'प्रक्रिया निरीक्षण सुविधा डेस्कटॉप ऐप में उपलब्ध है।',
		readFailed: 'प्रक्रियाओं को पढ़ा नहीं जा सका।',
		killDenied: 'वर्कडक (Workduck) इस प्रक्रिया को समाप्त नहीं कर सकता।',
		killFailed: 'प्रक्रिया समाप्त नहीं की जा सकी।'
	}
} as const;
