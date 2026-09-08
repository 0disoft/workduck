import type { WorkduckLanguageId } from '$lib/i18n/workduck-language-options';

const en = {
	title: 'Agent briefs', newBrief: 'New brief', empty: 'Save the instructions for your next repository task.',
	select: 'Select a brief or create one.', chooseRepository: 'Choose a repository', noRepositories: 'Add a repository in Projects first.',
	saved: 'Brief saved.', loading: 'Loading briefs…', saving: 'Saving…', loadFailed: 'Could not read briefs. Refresh to try again; no files were overwritten.',
	saveFailed: 'Could not save. Your draft is still here.', conflict: 'The file changed elsewhere. Copy your draft, then refresh before saving again.',
	invalid: 'Choose a repository and enter a title and instructions within the limits.',
	archive: 'Archive', restore: 'Restore', showArchived: 'Show archived', archived: 'Archived',
	export: 'Copy for Codex', copied: 'Copied to clipboard.', copyFailed: 'Could not copy. Select and copy the preview instead.',
	discard: 'Discard the unsaved changes?', unsaved: 'Unsaved changes', preview: 'Codex brief preview',
	storage: 'Saved in .workduck/briefs.json. Do not include passwords or API keys.', missingRepository: 'The linked repository is no longer registered.'
} as const;

type BriefMessages = { readonly [K in keyof typeof en]: string };

export const briefMessages: Record<WorkduckLanguageId, BriefMessages> = {
	en,
	ko: {
		title: '작업 지시서', newBrief: '새 지시서', empty: '다음 저장소 작업에 쓸 지시사항을 저장하세요.',
		select: '지시서를 선택하거나 새로 만드세요.', chooseRepository: '저장소 선택', noRepositories: '먼저 프로젝트에서 저장소를 등록하세요.',
		saved: '지시서를 저장했어요.', loading: '지시서를 불러오는 중…', saving: '저장 중…', loadFailed: '지시서를 읽지 못했어요. 새로고침해 주세요. 기존 파일은 덮어쓰지 않았어요.',
		saveFailed: '저장하지 못했어요. 작성 중인 내용은 유지돼요.', conflict: '다른 곳에서 파일이 변경됐어요. 작성 내용을 복사한 뒤 새로고침하고 다시 저장해 주세요.',
		invalid: '저장소를 선택하고 길이 제한 안에서 제목과 지시사항을 입력하세요.',
		archive: '보관', restore: '복원', showArchived: '보관된 지시서 보기', archived: '보관됨',
		export: 'Codex용 복사', copied: '클립보드에 복사했어요.', copyFailed: '복사하지 못했어요. 미리보기 내용을 직접 선택해서 복사해 주세요.',
		discard: '저장하지 않은 변경사항을 버릴까요?', unsaved: '저장하지 않은 변경사항', preview: 'Codex용 지시서 미리보기',
		storage: '.workduck/briefs.json에 저장해요. 비밀번호나 API 키는 넣지 마세요.', missingRepository: '연결된 저장소가 더 이상 등록되어 있지 않아요.'
	},
	es: {
		title: 'Instrucciones de tarea', newBrief: 'Nuevas instrucciones', empty: 'Guarda las instrucciones para tu próxima tarea del repositorio.',
		select: 'Selecciona unas instrucciones o crea otras.', chooseRepository: 'Elige un repositorio', noRepositories: 'Añade primero un repositorio en Proyectos.',
		saved: 'Instrucciones guardadas.', loading: 'Cargando instrucciones…', saving: 'Guardando…', loadFailed: 'No se pudieron leer las instrucciones. Actualiza para reintentar; no se sobrescribió ningún archivo.',
		saveFailed: 'No se pudo guardar. El borrador se conserva.', conflict: 'El archivo cambió en otro lugar. Copia tu borrador y actualiza antes de guardar de nuevo.',
		invalid: 'Elige un repositorio e introduce un título e instrucciones dentro de los límites.',
		archive: 'Archivar', restore: 'Restaurar', showArchived: 'Mostrar archivadas', archived: 'Archivadas',
		export: 'Copiar para Codex', copied: 'Copiado al portapapeles.', copyFailed: 'No se pudo copiar. Selecciona y copia la vista previa.',
		discard: '¿Descartar los cambios sin guardar?', unsaved: 'Cambios sin guardar', preview: 'Vista previa para Codex',
		storage: 'Se guarda en .workduck/briefs.json. No incluyas contraseñas ni claves API.', missingRepository: 'El repositorio vinculado ya no está registrado.'
	},
	fr: {
		title: 'Consignes de tâche', newBrief: 'Nouvelles consignes', empty: 'Enregistrez les consignes de votre prochaine tâche dans le dépôt.',
		select: 'Sélectionnez des consignes ou créez-en.', chooseRepository: 'Choisir un dépôt', noRepositories: 'Ajoutez d’abord un dépôt dans Projets.',
		saved: 'Consignes enregistrées.', loading: 'Chargement des consignes…', saving: 'Enregistrement…', loadFailed: 'Lecture impossible. Actualisez pour réessayer ; aucun fichier n’a été écrasé.',
		saveFailed: 'Enregistrement impossible. Votre brouillon est conservé.', conflict: 'Le fichier a été modifié ailleurs. Copiez votre brouillon, puis actualisez avant de réessayer.',
		invalid: 'Choisissez un dépôt et saisissez un titre et des consignes dans les limites.',
		archive: 'Archiver', restore: 'Restaurer', showArchived: 'Afficher les archives', archived: 'Archivé',
		export: 'Copier pour Codex', copied: 'Copié dans le presse-papiers.', copyFailed: 'Copie impossible. Sélectionnez et copiez l’aperçu.',
		discard: 'Abandonner les modifications non enregistrées ?', unsaved: 'Modifications non enregistrées', preview: 'Aperçu pour Codex',
		storage: 'Enregistré dans .workduck/briefs.json. N’incluez ni mots de passe ni clés API.', missingRepository: 'Le dépôt associé n’est plus enregistré.'
	},
	zh: {
		title: '任务简报', newBrief: '新建简报', empty: '为下一次仓库任务保存操作说明。',
		select: '选择或新建简报。', chooseRepository: '选择仓库', noRepositories: '请先在项目中添加仓库。',
		saved: '简报已保存。', loading: '正在加载简报…', saving: '正在保存…', loadFailed: '无法读取简报。请刷新重试，原文件未被覆盖。',
		saveFailed: '无法保存，草稿仍保留。', conflict: '文件已在其他位置更改。请先复制草稿，再刷新并重新保存。',
		invalid: '请选择仓库，并在长度限制内填写标题和说明。',
		archive: '归档', restore: '恢复', showArchived: '显示已归档简报', archived: '已归档',
		export: '复制到 Codex', copied: '已复制到剪贴板。', copyFailed: '复制失败，请手动选择并复制预览内容。',
		discard: '放弃未保存的更改？', unsaved: '有未保存的更改', preview: 'Codex 简报预览',
		storage: '保存在 .workduck/briefs.json 中。请勿包含密码或 API 密钥。', missingRepository: '关联的仓库已不再注册。'
	},
	hi: {
		title: 'कार्य निर्देश', newBrief: 'नए निर्देश', empty: 'अगले रिपॉज़िटरी कार्य के लिए निर्देश सहेजें।',
		select: 'निर्देश चुनें या नए बनाएं।', chooseRepository: 'रिपॉज़िटरी चुनें', noRepositories: 'पहले परियोजनाओं में रिपॉज़िटरी जोड़ें।',
		saved: 'निर्देश सहेजे गए।', loading: 'निर्देश लोड हो रहे हैं…', saving: 'सहेजा जा रहा है…', loadFailed: 'निर्देश पढ़े नहीं जा सके। फिर से लोड करें; कोई फ़ाइल अधिलेखित नहीं हुई।',
		saveFailed: 'सहेजा नहीं जा सका। आपका मसौदा सुरक्षित है।', conflict: 'फ़ाइल कहीं और बदल गई है। मसौदा कॉपी करें, फिर दोबारा लोड करके सहेजें।',
		invalid: 'रिपॉज़िटरी चुनें और सीमा के भीतर शीर्षक व निर्देश दर्ज करें।',
		archive: 'संग्रहित करें', restore: 'पुनर्स्थापित करें', showArchived: 'संग्रहित निर्देश दिखाएं', archived: 'संग्रहित',
		export: 'Codex के लिए कॉपी करें', copied: 'क्लिपबोर्ड पर कॉपी किया गया।', copyFailed: 'कॉपी नहीं हुआ। पूर्वावलोकन चुनकर कॉपी करें।',
		discard: 'बिना सहेजे बदलाव छोड़ दें?', unsaved: 'बिना सहेजे बदलाव', preview: 'Codex निर्देश पूर्वावलोकन',
		storage: '.workduck/briefs.json में सहेजा जाता है। पासवर्ड या API कुंजी न डालें।', missingRepository: 'संबंधित रिपॉज़िटरी अब पंजीकृत नहीं है।'
	}
};
