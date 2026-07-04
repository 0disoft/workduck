export const hiWorkspaceMessages = {
	addWorkspaceInSettings: 'सेटिंग्स में एक कार्यक्षेत्र जोड़ें।',
	locked: 'कार्यक्षेत्र लॉक है',
	folderUnavailable: 'कार्यक्षेत्र फ़ोल्डर अनुपलब्ध है',
	checkingFolder: 'कार्यक्षेत्र फ़ोल्डर की जांच की जा रही है...',
	path: 'पथ',
	reconnect: 'पुनः कनेक्ट करें',
	chooseFolder: 'कार्यक्षेत्र फ़ोल्डर चुनें',
	unlock: {
		submit: 'अनलॉक करें',
		tryAgainIn: '{seconds} सेकंड में पुनः प्रयास करें।',
		passwordRequired: 'पासवर्ड आवश्यक है।',
		passwordMismatch: 'पासवर्ड मेल नहीं खाया।',
		passwordMismatchWithAttempts:
			'पासवर्ड मेल नहीं खाया। {attemptsRemaining} प्रयास बचे हैं।',
		unavailable: 'अनलॉक सुविधा डेस्कटॉप ऐप में उपलब्ध है।',
		invalidHash: 'कार्यक्षेत्र लॉक डेटा नहीं पढ़ा जा सका।'
	},
	pathErrors: {
		pathRequired: 'कार्यक्षेत्र पथ आवश्यक है।',
		pathNotAbsolute: 'कार्यक्षेत्र पथ एक पूर्ण फ़ोल्डर पथ होना चाहिए।',
		pathNotFound: 'कार्यक्षेत्र पथ मौजूद नहीं है।',
		pathNotDirectory: 'कार्यक्षेत्र पथ एक फ़ोल्डर होना चाहिए।',
		pathPermissionDenied: 'कार्यक्षेत्र पथ पढ़ा नहीं जा सकता।',
		pathUnreadable: 'कार्यक्षेत्र पथ की जांच नहीं की जा सकी।',
		pathValidationUnavailable: 'कार्यक्षेत्र पथ की जांच केवल डेस्कटॉप ऐप में की जा सकती है।',
		pathSelectionUnavailable: 'कार्यक्षेत्र फ़ोल्डर चयनकर्ता अनुपलब्ध है।',
		pathSelectionFailed: 'कार्यक्षेत्र फ़ोल्डर नहीं चुना जा सका।',
		pathDuplicate: 'कार्यक्षेत्र पथ पहले से ही पंजीकृत है।',
		workspaceNotFound: 'कार्यक्षेत्र नहीं मिला।',
		registryReadFailed: 'कार्यक्षेत्र सेटिंग्स लोड नहीं की जा सकीं।',
		registryWriteFailed: 'कार्यक्षेत्र सेटिंग्स सहेजी नहीं जा सकीं।'
	}
} as const;
