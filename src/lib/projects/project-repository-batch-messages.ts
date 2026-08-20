import type { WorkduckLanguageId } from '$lib/i18n/workduck-language';
import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import {
	isProjectRepositoryBatchOwnError,
	type ProjectRepositoryBatchAction,
	type ProjectRepositoryBatchItemState,
	type ProjectRepositoryBatchOwnError
} from './project-repository-batch';
import {
	getProjectFormErrorMessage,
	type ProjectFormError
} from './project-board-errors';

export interface ProjectRepositoryBatchMessages {
	readonly title: string;
	readonly selectedCount: string;
	readonly selectVisible: string;
	readonly clearSelection: string;
	readonly concurrency: string;
	readonly progress: string;
	readonly summary: string;
	readonly noSelection: string;
	readonly selectRepository: string;
	readonly actions: Readonly<Record<ProjectRepositoryBatchAction, string>>;
	readonly states: Readonly<Record<ProjectRepositoryBatchItemState, string>>;
	readonly errors: Readonly<Record<ProjectRepositoryBatchOwnError, string>>;
}

const commonEnglishErrors = {
	'project-repository-batch-action-unavailable': 'This action is not available for the repository.',
	'project-repository-batch-operation-failed': 'The repository operation failed.',
	'project-repository-batch-operation-not-started': 'The repository operation did not start.',
	'project-repository-batch-repository-busy': 'Another operation is already running.',
	'project-repository-batch-repository-path-missing': 'The repository folder is not registered.',
	'project-repository-batch-task-failed': 'The repository task failed.',
	'project-repository-batch-task-stopped': 'The repository task stopped before completion.',
	'project-repository-batch-task-timeout': 'Timed out while waiting for the repository task.',
	'project-repository-batch-unexpected-failure': 'The batch worker failed unexpectedly.',
	'project-repository-batch-workspace-unavailable': 'The active workspace is unavailable.'
} satisfies Record<ProjectRepositoryBatchOwnError, string>;

const projectRepositoryBatchMessages = {
	en: {
		title: 'Repository batch actions',
		selectedCount: '{selected} selected of {visible}',
		selectVisible: 'Select visible',
		clearSelection: 'Clear selection',
		concurrency: 'Parallel jobs',
		progress: '{completed} of {total} completed',
		summary: 'Succeeded {succeeded} · Failed {failed} · Skipped {skipped}',
		noSelection: 'Select repositories to run a bounded batch action.',
		selectRepository: 'Select {repository} for batch actions',
		actions: {
			fetch: 'Fetch',
			pull: 'Pull',
			build: 'Build',
			'update-dependencies': 'Update dependencies'
		},
		states: {
			queued: 'Queued',
			running: 'Running',
			succeeded: 'Succeeded',
			failed: 'Failed',
			skipped: 'Skipped'
		},
		errors: commonEnglishErrors
	},
	ko: {
		title: '저장소 일괄 작업',
		selectedCount: '표시된 {visible}개 중 {selected}개 선택',
		selectVisible: '표시된 저장소 모두 선택',
		clearSelection: '선택 해제',
		concurrency: '동시 실행',
		progress: '{total}개 중 {completed}개 완료',
		summary: '성공 {succeeded} · 실패 {failed} · 건너뜀 {skipped}',
		noSelection: '저장소를 선택한 뒤 제한 병렬 작업을 실행하세요.',
		selectRepository: '{repository} 저장소를 일괄 작업 대상으로 선택',
		actions: {
			fetch: '가져오기',
			pull: '당겨오기',
			build: '빌드',
			'update-dependencies': '의존성 갱신'
		},
		states: {
			queued: '대기',
			running: '실행 중',
			succeeded: '성공',
			failed: '실패',
			skipped: '건너뜀'
		},
		errors: {
			'project-repository-batch-action-unavailable': '이 저장소에서는 해당 작업을 실행할 수 없습니다.',
			'project-repository-batch-operation-failed': '저장소 작업이 실패했습니다.',
			'project-repository-batch-operation-not-started': '저장소 작업이 시작되지 않았습니다.',
			'project-repository-batch-repository-busy': '다른 작업이 이미 실행 중입니다.',
			'project-repository-batch-repository-path-missing': '저장소 폴더가 등록되지 않았습니다.',
			'project-repository-batch-task-failed': '저장소 작업이 실패했습니다.',
			'project-repository-batch-task-stopped': '저장소 작업이 완료 전에 중단됐습니다.',
			'project-repository-batch-task-timeout': '저장소 작업 완료를 기다리다 제한 시간을 넘겼습니다.',
			'project-repository-batch-unexpected-failure': '일괄 작업 워커에서 예기치 않은 오류가 발생했습니다.',
			'project-repository-batch-workspace-unavailable': '활성 워크스페이스를 사용할 수 없습니다.'
		}
	},
	es: {
		title: 'Acciones por lotes de repositorios',
		selectedCount: '{selected} seleccionados de {visible}',
		selectVisible: 'Seleccionar visibles',
		clearSelection: 'Borrar selección',
		concurrency: 'Trabajos paralelos',
		progress: '{completed} de {total} completados',
		summary: 'Correctos {succeeded} · Fallidos {failed} · Omitidos {skipped}',
		noSelection: 'Selecciona repositorios para ejecutar una acción por lotes limitada.',
		selectRepository: 'Seleccionar {repository} para acciones por lotes',
		actions: {
			fetch: 'Obtener',
			pull: 'Actualizar',
			build: 'Compilar',
			'update-dependencies': 'Actualizar dependencias'
		},
		states: {
			queued: 'En cola',
			running: 'En curso',
			succeeded: 'Correcto',
			failed: 'Fallido',
			skipped: 'Omitido'
		},
		errors: commonEnglishErrors
	},
	fr: {
		title: 'Actions groupées des dépôts',
		selectedCount: '{selected} sélectionnés sur {visible}',
		selectVisible: 'Sélectionner les visibles',
		clearSelection: 'Effacer la sélection',
		concurrency: 'Tâches parallèles',
		progress: '{completed} sur {total} terminés',
		summary: 'Réussis {succeeded} · Échecs {failed} · Ignorés {skipped}',
		noSelection: 'Sélectionnez des dépôts pour lancer une action groupée limitée.',
		selectRepository: 'Sélectionner {repository} pour les actions groupées',
		actions: {
			fetch: 'Récupérer',
			pull: 'Tirer',
			build: 'Compiler',
			'update-dependencies': 'Mettre à jour les dépendances'
		},
		states: {
			queued: 'En attente',
			running: 'En cours',
			succeeded: 'Réussi',
			failed: 'Échec',
			skipped: 'Ignoré'
		},
		errors: commonEnglishErrors
	},
	zh: {
		title: '仓库批量操作',
		selectedCount: '已选择 {selected} 个，共显示 {visible} 个',
		selectVisible: '选择当前显示项',
		clearSelection: '清除选择',
		concurrency: '并行任务数',
		progress: '已完成 {completed}/{total}',
		summary: '成功 {succeeded} · 失败 {failed} · 跳过 {skipped}',
		noSelection: '选择仓库后运行受限并行批量操作。',
		selectRepository: '选择 {repository} 进行批量操作',
		actions: {
			fetch: '获取',
			pull: '拉取',
			build: '构建',
			'update-dependencies': '更新依赖'
		},
		states: {
			queued: '排队中',
			running: '运行中',
			succeeded: '成功',
			failed: '失败',
			skipped: '已跳过'
		},
		errors: commonEnglishErrors
	},
	hi: {
		title: 'रिपॉज़िटरी बैच क्रियाएँ',
		selectedCount: '{visible} में से {selected} चयनित',
		selectVisible: 'दिखाई दे रहे सभी चुनें',
		clearSelection: 'चयन साफ़ करें',
		concurrency: 'समानांतर कार्य',
		progress: '{total} में से {completed} पूर्ण',
		summary: 'सफल {succeeded} · विफल {failed} · छोड़े गए {skipped}',
		noSelection: 'सीमित बैच क्रिया चलाने के लिए रिपॉज़िटरी चुनें।',
		selectRepository: 'बैच क्रियाओं के लिए {repository} चुनें',
		actions: {
			fetch: 'फ़ेच',
			pull: 'पुल',
			build: 'बिल्ड',
			'update-dependencies': 'निर्भरताएँ अपडेट करें'
		},
		states: {
			queued: 'कतार में',
			running: 'चल रहा है',
			succeeded: 'सफल',
			failed: 'विफल',
			skipped: 'छोड़ा गया'
		},
		errors: commonEnglishErrors
	}
} satisfies Record<WorkduckLanguageId, ProjectRepositoryBatchMessages>;

export function getProjectRepositoryBatchMessages(languageId: WorkduckLanguageId) {
	return projectRepositoryBatchMessages[languageId];
}

export function formatProjectRepositoryBatchMessage(
	template: string,
	values: Readonly<Record<string, string | number>>
) {
	return Object.entries(values).reduce(
		(message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
		template
	);
}

export function getProjectRepositoryBatchErrorMessage(
	error: string,
	languageId: WorkduckLanguageId,
	projectErrorMessages: WorkduckMessages['projects']['errors']
) {
	if (isProjectRepositoryBatchOwnError(error)) {
		return projectRepositoryBatchMessages[languageId].errors[error];
	}

	return getProjectFormErrorMessage(error as ProjectFormError, projectErrorMessages) ?? error;
}
