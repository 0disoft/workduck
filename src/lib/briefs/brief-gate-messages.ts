import type { WorkduckLanguageId } from '#lib/i18n/workduck-language-options.ts';
import type { BriefGateReason } from './brief-gate';
type GateMessages = Record<BriefGateReason | 'title' | 'passed' | 'blocked' | 'pending' | 'scope', string>;
export const briefGateMessages: Record<WorkduckLanguageId, GateMessages> = {
	en: {
		unavailable: 'The linked queue source could not be fully checked.',
		title: 'Gate', passed: 'Passed', blocked: 'Blocked', pending: 'Unverified',
		buildPassed: 'The linked native build completed with exit code 0.', executionFailed: 'The linked execution failed.', executionStopped: 'The execution was stopped.', running: 'The execution is still running.',
		unverified: 'There is no completed native build check for this run.', missing: 'The source is missing, ambiguous, or outside this repository.', reportNeedsReview: 'A result report is available, but its verification text is not machine-verified evidence.',
		scope: 'This gate reflects the linked execution only. It does not certify code correctness, approve a release, or start another task.'
	},
	ko: {
		unavailable: '연결된 대기열 원본을 끝까지 확인하지 못했어요.',
		title: '검증 판정', passed: '통과', blocked: '차단', pending: '미검증',
		buildPassed: '연결된 네이티브 빌드가 종료 코드 0으로 끝났어요.', executionFailed: '연결된 실행이 실패했어요.', executionStopped: '실행이 중단됐어요.', running: '아직 실행 중이에요.',
		unverified: '이 실행에는 완료된 네이티브 빌드 검증이 없어요.', missing: '원본이 없거나 중복됐거나, 이 저장소에 속하지 않아요.', reportNeedsReview: '결과 보고서가 있지만, 보고서의 검증 문구는 실제 실행으로 확인된 근거가 아니에요.',
		scope: '이 판정은 연결된 실행에만 해당해요. 코드의 정확성이나 출시를 승인하거나 다음 작업을 자동 실행하지 않아요.'
	},
	es: {
		unavailable: 'No se pudo comprobar completamente el origen de cola vinculado.',
		title: 'Control', passed: 'Superado', blocked: 'Bloqueado', pending: 'Sin verificar',
		buildPassed: 'La compilación nativa vinculada terminó con código 0.', executionFailed: 'La ejecución vinculada falló.', executionStopped: 'La ejecución se detuvo.', running: 'La ejecución sigue en curso.',
		unverified: 'Esta ejecución no tiene una comprobación de compilación nativa completada.', missing: 'El origen falta, es ambiguo o no pertenece a este repositorio.', reportNeedsReview: 'Hay un informe, pero su texto de verificación no es evidencia verificada automáticamente.',
		scope: 'Este control refleja solo la ejecución vinculada. No certifica el código, autoriza una publicación ni inicia otra tarea.'
	},
	fr: {
		unavailable: 'La source de file associée n’a pas pu être entièrement vérifiée.',
		title: 'Contrôle', passed: 'Réussi', blocked: 'Bloqué', pending: 'Non vérifié',
		buildPassed: 'La compilation native associée s’est terminée avec le code 0.', executionFailed: 'L’exécution associée a échoué.', executionStopped: 'L’exécution a été arrêtée.', running: 'L’exécution est toujours en cours.',
		unverified: 'Aucun contrôle de compilation native terminé n’est disponible.', missing: 'La source est absente, ambiguë ou extérieure à ce dépôt.', reportNeedsReview: 'Un rapport est disponible, mais ses affirmations de vérification ne constituent pas une preuve vérifiée par la machine.',
		scope: 'Ce contrôle concerne uniquement l’exécution associée. Il ne certifie pas le code, n’autorise pas une publication et ne lance aucune autre tâche.'
	},
	zh: {
		unavailable: '无法完整检查关联的队列来源。',
		title: '验证判定', passed: '通过', blocked: '阻止', pending: '未验证',
		buildPassed: '关联的原生构建已完成，退出代码为 0。', executionFailed: '关联的运行失败。', executionStopped: '运行已停止。', running: '仍在运行。',
		unverified: '此运行没有已完成的原生构建检查。', missing: '来源缺失、存在歧义或不属于此仓库。', reportNeedsReview: '已有结果报告，但其中的验证文字不属于机器验证的证据。',
		scope: '此判定仅反映关联运行，不保证代码正确、不批准发布，也不会启动其他任务。'
	},
	hi: {
		unavailable: 'जुड़े कतार स्रोत की पूरी जाँच नहीं हो सकी।',
		title: 'सत्यापन निर्णय', passed: 'उत्तीर्ण', blocked: 'अवरुद्ध', pending: 'असत्यापित',
		buildPassed: 'जुड़ा नेटिव बिल्ड निकास कोड 0 के साथ पूरा हुआ।', executionFailed: 'जुड़ा निष्पादन विफल हुआ।', executionStopped: 'निष्पादन रोक दिया गया।', running: 'निष्पादन अभी चल रहा है।',
		unverified: 'इस निष्पादन का पूरा हुआ नेटिव बिल्ड सत्यापन उपलब्ध नहीं है।', missing: 'स्रोत गायब, अस्पष्ट या इस रिपॉज़िटरी से बाहर है।', reportNeedsReview: 'परिणाम रिपोर्ट उपलब्ध है, लेकिन उसमें लिखा सत्यापन मशीन से प्रमाणित साक्ष्य नहीं है।',
		scope: 'यह निर्णय केवल जुड़े निष्पादन का है। यह कोड की शुद्धता या रिलीज़ को मंज़ूरी नहीं देता और अगला कार्य शुरू नहीं करता।'
	}
};
