export const hiAgentsMessages = {
	title: 'एजेंट',
	list: 'एजेंट सूची',
	details: 'एजेंट विवरण',
	registeredCount: '{count} एजेंट',
	newAgent: 'नया एजेंट',
	editAgent: 'एजेंट संपादित करें',
	provider: 'प्रदाता',
	model: 'मॉडल',
	modelId: 'मॉडल आईडी',
	defaultModel: 'डिफ़ॉल्ट मॉडल',
	customModel: 'कस्टम मॉडल',
	apiKeyPlaceholder: 'एक एपीआई कुंजी चुनें',
	vaultLockedHint: 'पर्यावरण वॉल्ट लॉक है। नया एजेंट बनाने से पहले इसे पर्यावरण में अनलॉक करें।',
	noLlmApiKeysHint: 'एलएलएम के लिए कोई एपीआई कुंजी टैग नहीं है। पर्यावरण में एक एपीआई कुंजी जोड़ें और इसे llm टैग दें।',
	missingApiKeyHint: 'लिंक्ड एपीआई कुंजी वर्तमान वॉल्ट में नहीं मिली। दूसरी कुंजी चुनें या पर्यावरण की जांच करें。',
	removeConfirm: 'एजेंट "{name}" हटाएं?',
	providers: {
		auto: 'ऑटो',
		openrouter: 'OpenRouter',
		umans: 'Umans',
		deepseek: 'DeepSeek',
		openai: 'OpenAI'
	},
	saved: 'सहेज लिया गया।',
	removed: 'हटा दिया गया।',
	evaluation: {
		title: 'मूल्यांकन',
		overviewTitle: 'मूल्यांकन अवलोकन',
		overviewEmpty: 'कोई एजेंट पंजीकृत नहीं है।',
		empty: 'कोई मूल्यांकन नहीं',
		noScore: '-',
		rankBy: 'क्रमबद्ध करें',
		overallScore: 'समग्र स्कोर',
		count: '{count} मूल्यांकन',
		reset: 'मूल्यांकन रीसेट करें',
		resetConfirm: 'इस एजेंट के संचित मूल्यांकन रीसेट करें?',
		resetSaved: 'मूल्यांकन रीसेट कर दिए गए।',
		resetAt: 'रीसेट का समय: {date}',
		criteria: {
			problemUnderstanding: {
				label: 'समस्या की समझ',
				description: 'जांचता है कि क्या वास्तविक इरादा, बाधाएं और संदर्भ समझ में आ गए थे।'
			},
			logicalValidity: {
				label: 'तार्किक वैधता',
				description: 'जांचता है कि क्या दावे और निष्कर्ष असमर्थित छलांगों से बचते हैं।'
			},
			practicalFeasibility: {
				label: 'व्यावहारिक व्यवहार्यता',
				description: 'जांचता है कि क्या उत्तर वास्तविक बाजार, टीम और तकनीकी बाधाओं के तहत काम कर सकता है।'
			},
			creativeInsight: {
				label: 'रचनात्मक अंतर्दृष्टि',
				description: 'जांचता है कि क्या उत्तर परिचित रीमिक्स के बजाय एक नया और उपयोगी दृष्टिकोण प्रदान करता है।'
			},
			riskDetection: {
				label: 'जोखिम का पता लगाना',
				description: 'जांचता है कि क्या विफलता मोड, छिपी हुई लागत और साइड इफेक्ट्स की पहचान की गई थी।'
			}
		}
	},
	errors: {
		nameRequired: 'नाम आवश्यक है।',
		authRequired: 'एक एपीआई कुंजी चुनें।',
		nameDuplicate: 'नाम पहले से मौजूद है।',
		notFound: 'एजेंट नहीं मिला।',
		readFailed: 'एजेंटों को नहीं पढ़ा जा सका।',
		saveFailed: 'एजेंटों को सहेजा नहीं जा सका।'
	}
} as const;
