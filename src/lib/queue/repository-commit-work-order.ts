import { formatWorkspacePathForDisplay } from '$lib/workspaces/workspace-path-format';
import {
	createManualQueueWorkOrder,
	createQueueWorkOrderFileName,
	serializeQueueArtifact,
	type WorkduckQueueResponseLanguage
} from './queue-artifacts';
import { writeQueueWorkOrderFile, type QueueFolderError } from './queue-folder';
import { dispatchQueueFilesChanged } from './queue-read-state';

export type RepositoryCommitWorkOrderSource = 'project' | 'workspace' | 'sync';
type RepositoryCommitWorkOrderLanguage = Exclude<WorkduckQueueResponseLanguage, 'auto'>;

export type RepositoryCommitWorkOrderResult =
	| {
			readonly ok: true;
			readonly relativePath: string;
	  }
	| {
			readonly ok: false;
			readonly error: QueueFolderError;
	  };

export interface RepositoryCommitWorkOrderInput {
	readonly workspaceId: string;
	readonly workspacePath: string;
	readonly repositoryName: string;
	readonly repositoryPath: string;
	readonly source: RepositoryCommitWorkOrderSource;
	readonly responseLanguage: WorkduckQueueResponseLanguage;
	readonly projectIds?: readonly string[];
}

export async function enqueueRepositoryCommitWorkOrder(
	input: RepositoryCommitWorkOrderInput
): Promise<RepositoryCommitWorkOrderResult> {
	const language = normalizeRepositoryCommitWorkOrderLanguage(input.responseLanguage);
	const title = createRepositoryCommitWorkOrderTitle(input.repositoryName, language);
	const emptyWorkOrder = createManualQueueWorkOrder(
		title,
		'',
		'normal',
		[],
		[],
		[],
		{
			responseLanguage: language,
			projectIds: input.projectIds ?? []
		}
	);
	const workOrderFileName = createQueueWorkOrderFileName(emptyWorkOrder);
	const workOrder = {
		...emptyWorkOrder,
		tasks: emptyWorkOrder.tasks.map((task) => ({
			...task,
			body: createRepositoryCommitWorkOrderBody(input, language, workOrderFileName)
		}))
	};
	const result = await writeQueueWorkOrderFile(
		input.workspacePath,
		workOrderFileName,
		serializeQueueArtifact(workOrder)
	);

	if (!result.ok) {
		return { ok: false, error: result.error };
	}

	dispatchQueueFilesChanged(input.workspaceId);

	return { ok: true, relativePath: result.relativePath };
}

function createRepositoryCommitWorkOrderBody(
	input: RepositoryCommitWorkOrderInput,
	language: RepositoryCommitWorkOrderLanguage,
	workOrderFileName: string
) {
	const repositoryPath = formatWorkspacePathForDisplay(input.repositoryPath);
	const workspacePath = formatWorkspacePathForDisplay(input.workspacePath);
	const sourceLabel = getRepositoryCommitWorkOrderSourceLabel(input.source, language);

	if (language === 'ko') {
		return [
			'이 작업은 Codex가 수행합니다.',
			'',
			`대상: ${input.repositoryName}`,
			`종류: ${sourceLabel}`,
			`저장소 경로: ${repositoryPath}`,
			`워크스페이스 경로: ${workspacePath}`,
			'',
			'요청:',
			'- 이 저장소의 커밋되지 않은 변경사항을 git status와 git diff로 확인하세요.',
			'- 변경사항을 논리 단위로 나누어 필요한 만큼 커밋하세요.',
			'- 커밋 메시지는 실제 변경 내용을 기준으로 작성하세요.',
			'- 커밋 전 저장소에 맞는 검증 명령을 확인하고 가능한 범위에서 실행하세요.',
			'- 관련 없는 사용자 변경은 되돌리지 마세요.',
			'- 커밋할 가치가 없는 빈 파일, 임시 파일, 실수로 생성된 package-manager lockfile만 남아 있다면 안전한 범위에서 삭제하거나 무시 처리해 git status가 깨끗해지게 하세요.',
			'- Push는 별도 요청이 있을 때만 수행하세요.',
			`- 작업이 끝났거나 커밋할 변경이 없다고 판단되면 queue/work-orders/${workOrderFileName} 파일의 status를 archived로 바꿔 실행 대기열에 남기지 마세요.`
		].join('\n');
	}

	if (language === 'es') {
		return [
			'Esta tarea es para Codex.',
			'',
			`Objetivo: ${input.repositoryName}`,
			`Tipo: ${sourceLabel}`,
			`Ruta del repositorio: ${repositoryPath}`,
			`Ruta del espacio de trabajo: ${workspacePath}`,
			'',
			'Solicitud:',
			'- Revisa los cambios sin confirmar de este repositorio con git status y git diff.',
			'- Divide los cambios en commits lógicos según sea necesario.',
			'- Escribe los mensajes de commit a partir de los cambios reales.',
			'- Antes de confirmar, identifica y ejecuta los comandos de verificación más estrechos disponibles para este repositorio.',
			'- No reviertas cambios de usuario que no estén relacionados.',
			'- Si solo quedan archivos vacíos, temporales o lockfiles del gestor de paquetes creados por accidente y no valen un commit, elimínalos o ignóralos dentro de un alcance seguro para que git status quede limpio.',
			'- Haz push solo si se solicita por separado.',
			`- Cuando el trabajo termine, o si decides que no hay cambios dignos de commit, cambia el status del archivo queue/work-orders/${workOrderFileName} a archived para que no quede en la cola pendiente.`
		].join('\n');
	}

	if (language === 'fr') {
		return [
			'Cette tâche est destinée à Codex.',
			'',
			`Cible : ${input.repositoryName}`,
			`Type : ${sourceLabel}`,
			`Chemin du dépôt : ${repositoryPath}`,
			`Chemin de l'espace de travail : ${workspacePath}`,
			'',
			'Demande :',
			'- Examine les changements non commités de ce dépôt avec git status et git diff.',
			'- Sépare les changements en commits logiques selon les besoins.',
			"- Rédige les messages de commit d'après les changements réels.",
			'- Avant de committer, identifie et exécute les commandes de vérification les plus ciblées disponibles pour ce dépôt.',
			'- Ne rétablis pas les changements utilisateur sans rapport.',
			"- S'il ne reste que des fichiers vides, temporaires ou des lockfiles de gestionnaire de paquets créés par erreur et sans valeur de commit, supprime-les ou ignore-les dans un périmètre sûr afin que git status soit propre.",
			'- Ne fais un push que si cela est demandé séparément.',
			`- Une fois le travail terminé, ou si tu décides qu'il n'y a aucun changement à committer, passe le fichier queue/work-orders/${workOrderFileName} au status archived afin qu'il ne reste pas dans la file en attente.`
		].join('\n');
	}

	if (language === 'zh') {
		return [
			'这项任务由 Codex 执行。',
			'',
			`目标：${input.repositoryName}`,
			`类型：${sourceLabel}`,
			`仓库路径：${repositoryPath}`,
			`工作区路径：${workspacePath}`,
			'',
			'请求：',
			'- 使用 git status 和 git diff 检查此仓库中尚未提交的更改。',
			'- 根据需要将更改拆分为逻辑清晰的提交。',
			'- 根据实际更改内容编写提交信息。',
			'- 提交前，找出并运行此仓库可用的最小合适验证命令。',
			'- 不要还原无关的用户更改。',
			'- 如果只剩空文件、临时文件，或误生成且不值得提交的包管理器 lockfile，请在安全范围内删除或忽略，让 git status 保持干净。',
			'- 只有在另行要求时才执行 push。',
			`- 工作完成后，或确认没有值得提交的更改后，将 queue/work-orders/${workOrderFileName} 文件的 status 改为 archived，避免它继续留在待处理队列中。`
		].join('\n');
	}

	if (language === 'hi') {
		return [
			'यह कार्य Codex के लिए है।',
			'',
			`लक्ष्य: ${input.repositoryName}`,
			`प्रकार: ${sourceLabel}`,
			`रिपॉजिटरी पथ: ${repositoryPath}`,
			`वर्कस्पेस पथ: ${workspacePath}`,
			'',
			'अनुरोध:',
			'- इस रिपॉजिटरी के बिना-कमिट बदलावों को git status और git diff से जांचें।',
			'- जरूरत के अनुसार बदलावों को तार्किक कमिट इकाइयों में बांटें।',
			'- कमिट संदेश वास्तविक बदलावों के आधार पर लिखें।',
			'- कमिट करने से पहले इस रिपॉजिटरी के लिए उपलब्ध सबसे संकीर्ण उपयुक्त सत्यापन कमांड पहचानें और चलाएं।',
			'- असंबंधित उपयोगकर्ता बदलावों को वापस न करें।',
			'- अगर केवल खाली फ़ाइलें, अस्थायी फ़ाइलें, या गलती से बने package-manager lockfile बचे हैं और वे कमिट के योग्य नहीं हैं, तो सुरक्षित दायरे में उन्हें हटाएं या अनदेखा करें ताकि git status साफ हो जाए।',
			'- Push केवल अलग से अनुरोध होने पर करें।',
			`- काम पूरा होने पर, या यह तय करने पर कि कमिट योग्य बदलाव नहीं हैं, queue/work-orders/${workOrderFileName} फ़ाइल का status archived करें ताकि वह लंबित कतार में न रहे।`
		].join('\n');
	}

	return [
		'This task is for Codex.',
		'',
		`Target: ${input.repositoryName}`,
		`Kind: ${sourceLabel}`,
		`Repository path: ${repositoryPath}`,
		`Workspace path: ${workspacePath}`,
		'',
		'Request:',
		'- Inspect this repository with git status and git diff.',
		'- Split the uncommitted changes into logical commits as needed.',
		'- Write commit messages from the actual changes.',
		'- Before committing, identify and run the narrowest suitable verification commands available.',
		'- Do not revert unrelated user changes.',
		'- If only empty files, temporary files, or accidentally generated package-manager lockfiles remain and they are not commit-worthy, remove or ignore them safely so git status becomes clean.',
		'- Push only when separately requested.',
		`- After the work is done, or after deciding there are no commit-worthy changes, set queue/work-orders/${workOrderFileName} status to archived so it leaves the pending queue.`
	].join('\n');
}

function getRepositoryCommitWorkOrderSourceLabel(
	source: RepositoryCommitWorkOrderSource,
	language: RepositoryCommitWorkOrderLanguage
) {
	if (language === 'ko') {
		switch (source) {
			case 'project':
				return '프로젝트 저장소';
			case 'workspace':
				return '워크스페이스 저장소';
			case 'sync':
				return '동기화 저장소';
		}
	}

	if (language === 'es') {
		switch (source) {
			case 'project':
				return 'Repositorio de proyecto';
			case 'workspace':
				return 'Repositorio de espacio de trabajo';
			case 'sync':
				return 'Repositorio de sincronización';
		}
	}

	if (language === 'fr') {
		switch (source) {
			case 'project':
				return 'Dépôt de projet';
			case 'workspace':
				return "Dépôt d'espace de travail";
			case 'sync':
				return 'Dépôt de synchronisation';
		}
	}

	if (language === 'zh') {
		switch (source) {
			case 'project':
				return '项目仓库';
			case 'workspace':
				return '工作区仓库';
			case 'sync':
				return '同步仓库';
		}
	}

	if (language === 'hi') {
		switch (source) {
			case 'project':
				return 'प्रोजेक्ट रिपॉजिटरी';
			case 'workspace':
				return 'वर्कस्पेस रिपॉजिटरी';
			case 'sync':
				return 'सिंक रिपॉजिटरी';
		}
	}

	switch (source) {
		case 'project':
			return 'Project repository';
		case 'workspace':
			return 'Workspace repository';
		case 'sync':
			return 'Sync repository';
	}
}

function normalizeRepositoryCommitWorkOrderLanguage(
	language: WorkduckQueueResponseLanguage
): RepositoryCommitWorkOrderLanguage {
	return language === 'auto' ? 'en' : language;
}

function createRepositoryCommitWorkOrderTitle(
	repositoryName: string,
	language: RepositoryCommitWorkOrderLanguage
) {
	switch (language) {
		case 'ko':
			return `커밋 정리: ${repositoryName}`;
		case 'es':
			return `Preparar commits: ${repositoryName}`;
		case 'fr':
			return `Préparer les commits : ${repositoryName}`;
		case 'zh':
			return `整理提交：${repositoryName}`;
		case 'hi':
			return `कमिट व्यवस्थित करें: ${repositoryName}`;
		case 'en':
			return `Commit changes: ${repositoryName}`;
	}
}
