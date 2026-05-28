import { formatWorkspacePathForDisplay } from '$lib/workspaces/workspace-path-format';
import {
	createManualQueueWorkOrder,
	createQueueWorkOrderFileName,
	serializeQueueArtifact,
	type WorkduckQueueResponseLanguage
} from './queue-artifacts';
import { writeQueueWorkOrderFile, type QueueFolderError } from './queue-folder';

export type RepositoryCommitWorkOrderSource = 'project' | 'workspace' | 'sync';

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
	const language = input.responseLanguage === 'en' ? 'en' : 'ko';
	const title =
		language === 'ko'
			? `커밋 정리: ${input.repositoryName}`
			: `Commit changes: ${input.repositoryName}`;
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

	return result.ok
		? { ok: true, relativePath: result.relativePath }
		: { ok: false, error: result.error };
}

function createRepositoryCommitWorkOrderBody(
	input: RepositoryCommitWorkOrderInput,
	language: Exclude<WorkduckQueueResponseLanguage, 'auto'>,
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
	language: Exclude<WorkduckQueueResponseLanguage, 'auto'>
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

	switch (source) {
		case 'project':
			return 'Project repository';
		case 'workspace':
			return 'Workspace repository';
		case 'sync':
			return 'Sync repository';
	}
}
