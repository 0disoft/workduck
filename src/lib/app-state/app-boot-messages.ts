import type { WorkduckLanguageId } from '#lib/i18n/workduck-language-options.ts';

interface AppBootMessages {
	readonly title: string;
	readonly settingsFailed: string;
	readonly interfaceFailed: string;
	readonly retry: string;
	readonly retrying: string;
}

const messages: Record<WorkduckLanguageId, AppBootMessages> = {
	en: {
		title: 'Could not open Workduck',
		settingsFailed: 'To protect your saved data, the workspace has not been opened. Restore access to the settings store and try again.',
		interfaceFailed: 'The interface could not be loaded. Try reloading Workduck.',
		retry: 'Try again',
		retrying: 'Trying again…'
	},
	ko: {
		title: 'Workduck을 열지 못했어요',
		settingsFailed: '저장된 데이터를 보호하기 위해 워크스페이스를 열지 않았어요. 설정 저장소에 접근할 수 있는지 확인한 뒤 다시 시도해 주세요.',
		interfaceFailed: '화면을 불러오지 못했어요. Workduck을 다시 불러와 주세요.',
		retry: '다시 시도',
		retrying: '다시 시도 중…'
	},
	es: {
		title: 'No se pudo abrir Workduck',
		settingsFailed: 'Para proteger tus datos guardados, no se ha abierto el espacio de trabajo. Restablece el acceso al almacén de configuración e inténtalo de nuevo.',
		interfaceFailed: 'No se pudo cargar la interfaz. Intenta recargar Workduck.',
		retry: 'Reintentar',
		retrying: 'Reintentando…'
	},
	fr: {
		title: 'Impossible d’ouvrir Workduck',
		settingsFailed: 'Pour protéger vos données enregistrées, l’espace de travail n’a pas été ouvert. Rétablissez l’accès au stockage des paramètres et réessayez.',
		interfaceFailed: 'Impossible de charger l’interface. Essayez de recharger Workduck.',
		retry: 'Réessayer',
		retrying: 'Nouvelle tentative…'
	},
	zh: {
		title: '无法打开 Workduck',
		settingsFailed: '为保护已保存的数据，工作区尚未打开。请恢复对设置存储的访问，然后重试。',
		interfaceFailed: '无法加载界面。请尝试重新加载 Workduck。',
		retry: '重试',
		retrying: '正在重试…'
	},
	hi: {
		title: 'Workduck नहीं खुल सका',
		settingsFailed: 'आपके सहेजे गए डेटा की सुरक्षा के लिए कार्यक्षेत्र नहीं खोला गया है। सेटिंग संग्रह तक पहुँच बहाल करें और फिर से कोशिश करें।',
		interfaceFailed: 'इंटरफ़ेस लोड नहीं हो सका। Workduck को फिर से लोड करें।',
		retry: 'फिर से कोशिश करें',
		retrying: 'फिर से कोशिश हो रही है…'
	}
};

export function getAppBootMessages(languageId: WorkduckLanguageId): AppBootMessages {
	return messages[languageId];
}
