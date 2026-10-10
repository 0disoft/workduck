import type { WorkduckLanguageId } from '#lib/i18n/workduck-language-options.ts';
const en = {
	unavailable: 'The linked source could not be fully checked. Refresh to retry.',
	title: 'Linked runs', link: 'Link existing run', choose: 'Choose a repository task or work order', empty: 'No linked runs yet.',
	noCandidates: 'Only runs from this repository and work orders with its repository ID are eligible.',
	partial: 'Some execution sources could not be read or exceed the 200-file scan limit. Queue linking is unavailable until the complete source can be read.',
	loadFailed: 'Could not load run links. Existing links were not changed.', saveFailed: 'Could not save the link. Refresh and try again.',
	conflict: 'Run links changed elsewhere. Refresh before trying again.', linked: 'Run linked.', unlink: 'Unlink', confirmUnlink: 'Remove this link? The original execution record will not be deleted.',
	missing: 'The original record is missing, ambiguous, or no longer belongs to this repository.', snapshot: 'Instructions at link time',
	refreshed: 'Execution records refreshed.', sourceId: 'Source ID', reports: 'Result reports',
	stateRunning: 'Running', stateSucceeded: 'Succeeded', stateFailed: 'Failed', stateStopped: 'Stopped', statePending: 'Pending', stateArchived: 'Archived'
} as const;
type Messages = { readonly [K in keyof typeof en]: string };
export const briefRunMessages: Record<WorkduckLanguageId, Messages> = {
	en,
	ko: {
		unavailable: '연결된 원본을 끝까지 확인하지 못했어요. 새로고침해서 다시 시도해 주세요.',
		title: '연결된 실행', link: '기존 실행 연결', choose: '저장소 작업 또는 대기열 작업 선택', empty: '연결된 실행이 없어요.',
		noCandidates: '이 저장소의 실행 기록과 저장소 ID가 지정된 대기열 작업만 연결할 수 있어요.',
		partial: '일부 실행 자료를 읽지 못했거나 검색 한도인 200개 파일을 넘었어요. 전체 자료를 읽을 수 있을 때 대기열 작업을 연결할 수 있어요.',
		loadFailed: '실행 연결을 읽지 못했어요. 기존 연결은 변경하지 않았어요.', saveFailed: '연결을 저장하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.',
		conflict: '다른 곳에서 실행 연결이 변경됐어요. 새로고침한 뒤 다시 시도해 주세요.', linked: '실행을 연결했어요.', unlink: '연결 해제', confirmUnlink: '연결을 해제할까요? 원래 실행 기록은 삭제하지 않아요.',
		missing: '원래 기록이 없거나 중복됐거나, 더 이상 이 저장소에 속하지 않아요.', snapshot: '연결 당시 지시사항',
		refreshed: '실행 기록을 새로 불러왔어요.', sourceId: '원본 ID', reports: '결과 보고서',
		stateRunning: '실행 중', stateSucceeded: '성공', stateFailed: '실패', stateStopped: '중단됨', statePending: '대기 중', stateArchived: '보관됨'
	},
	es: {
		unavailable: 'No se pudo comprobar completamente el origen vinculado. Actualiza para reintentar.',
		title: 'Ejecuciones vinculadas', link: 'Vincular ejecución existente', choose: 'Elige una tarea del repositorio o una orden', empty: 'No hay ejecuciones vinculadas.',
		noCandidates: 'Solo se admiten ejecuciones de este repositorio y órdenes con su ID.', partial: 'No se pudieron leer algunas fuentes o se superó el límite de 200 archivos. La vinculación de órdenes requiere una lectura completa.',
		loadFailed: 'No se pudieron cargar los vínculos. No se modificaron los existentes.', saveFailed: 'No se pudo guardar el vínculo. Actualiza y reintenta.',
		conflict: 'Los vínculos cambiaron en otro lugar. Actualiza antes de reintentar.', linked: 'Ejecución vinculada.', unlink: 'Desvincular', confirmUnlink: '¿Quitar el vínculo? El registro original no se eliminará.',
		missing: 'El registro original falta, es ambiguo o ya no pertenece al repositorio.', snapshot: 'Instrucciones al vincular', refreshed: 'Registros actualizados.', sourceId: 'ID de origen', reports: 'Informes de resultados',
		stateRunning: 'En curso', stateSucceeded: 'Correcta', stateFailed: 'Fallida', stateStopped: 'Detenida', statePending: 'Pendiente', stateArchived: 'Archivada'
	},
	fr: {
		unavailable: 'La source associée n’a pas pu être entièrement vérifiée. Actualisez pour réessayer.',
		title: 'Exécutions associées', link: 'Associer une exécution', choose: 'Choisir une tâche du dépôt ou un ordre de travail', empty: 'Aucune exécution associée.',
		noCandidates: 'Seules les exécutions de ce dépôt et les tâches portant son identifiant sont proposées.', partial: 'Certaines sources sont illisibles ou dépassent la limite de 200 fichiers. Une lecture complète est requise pour associer des ordres de travail.',
		loadFailed: 'Impossible de charger les liens. Les liens existants sont inchangés.', saveFailed: 'Impossible d’enregistrer le lien. Actualisez puis réessayez.',
		conflict: 'Les liens ont été modifiés ailleurs. Actualisez avant de réessayer.', linked: 'Exécution associée.', unlink: 'Dissocier', confirmUnlink: 'Supprimer ce lien ? Le résultat original sera conservé.',
		missing: 'Le résultat original est absent, ambigu ou n’appartient plus à ce dépôt.', snapshot: 'Consignes lors de l’association', refreshed: 'Résultats actualisés.', sourceId: 'Identifiant source', reports: 'Rapports de résultats',
		stateRunning: 'En cours', stateSucceeded: 'Réussie', stateFailed: 'Échouée', stateStopped: 'Arrêtée', statePending: 'En attente', stateArchived: 'Archivée'
	},
	zh: {
		unavailable: '无法完整检查关联来源，请刷新后重试。',
		title: '关联运行', link: '关联现有运行', choose: '选择仓库任务或工作单', empty: '尚未关联运行。',
		noCandidates: '仅可关联此仓库的运行记录及指定了此仓库 ID 的工作单。', partial: '部分来源无法读取或超过 200 个文件的扫描上限。完整读取后才能关联工作单。',
		loadFailed: '无法加载关联，现有关联未更改。', saveFailed: '无法保存关联，请刷新后重试。',
		conflict: '关联已在其他位置更改，请刷新后重试。', linked: '已关联运行。', unlink: '取消关联', confirmUnlink: '取消此关联？不会删除原始运行记录。',
		missing: '原始记录缺失、存在歧义或已不属于此仓库。', snapshot: '关联时的说明', refreshed: '运行记录已刷新。', sourceId: '来源 ID', reports: '结果报告',
		stateRunning: '运行中', stateSucceeded: '成功', stateFailed: '失败', stateStopped: '已停止', statePending: '待处理', stateArchived: '已归档'
	},
	hi: {
		unavailable: 'जुड़े स्रोत की पूरी जाँच नहीं हो सकी। फिर से लोड करके कोशिश करें।',
		title: 'जुड़े निष्पादन', link: 'मौजूदा निष्पादन जोड़ें', choose: 'रिपॉज़िटरी कार्य या कार्य आदेश चुनें', empty: 'अभी कोई निष्पादन जुड़ा नहीं है।',
		noCandidates: 'केवल इस रिपॉज़िटरी के निष्पादन और इसके ID वाले कार्य आदेश जोड़े जा सकते हैं।', partial: 'कुछ स्रोत पढ़े नहीं गए या 200 फ़ाइलों की सीमा पार हो गई। कार्य आदेश जोड़ने के लिए पूरी जानकारी पढ़ना ज़रूरी है।',
		loadFailed: 'लिंक लोड नहीं हुए। मौजूदा लिंक नहीं बदले गए।', saveFailed: 'लिंक सहेजा नहीं गया। दोबारा लोड करके कोशिश करें।',
		conflict: 'लिंक कहीं और बदल गए हैं। फिर से लोड करके कोशिश करें।', linked: 'निष्पादन जुड़ गया।', unlink: 'लिंक हटाएं', confirmUnlink: 'यह लिंक हटाएं? मूल निष्पादन रिकॉर्ड नहीं हटेगा।',
		missing: 'मूल रिकॉर्ड गायब, अस्पष्ट या अब इस रिपॉज़िटरी का नहीं है।', snapshot: 'जोड़ते समय के निर्देश', refreshed: 'निष्पादन रिकॉर्ड फिर से लोड हुए।', sourceId: 'स्रोत ID', reports: 'परिणाम रिपोर्ट',
		stateRunning: 'चल रहा है', stateSucceeded: 'सफल', stateFailed: 'विफल', stateStopped: 'रुका हुआ', statePending: 'लंबित', stateArchived: 'संग्रहित'
	}
};
