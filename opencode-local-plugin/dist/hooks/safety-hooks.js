import { promises as fs } from 'fs';
import * as path from 'path';
// 민감 경로/파일 패턴
const SENSITIVE_PATTERNS = [
    '.ssh', '.env', '.aws', '.docker', 'Library/Keychains', '.gnupg', '.pki',
    '.npmrc', '.pypirc', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
    '.pem', '.p12', '.pfx', '.key', '.crt', '.cer', '.der',
    '계약', '인사', '급여', '성과평가', '면접', '입사', '퇴사',
    'password', 'secret', 'private', 'credential', 'token', 'apikey', 'api_key',
];
// 승인이 필요한 툴 목록
const REQUIRES_APPROVAL = ['plan_apply'];
/**
 * 민감 경로 확인
 */
function containsSensitivePath(args) {
    const pathsToCheck = [];
    // 경로 관련 인수 추출
    if (args.root)
        pathsToCheck.push(String(args.root));
    if (args.path)
        pathsToCheck.push(String(args.path));
    if (args.from)
        pathsToCheck.push(String(args.from));
    if (args.to)
        pathsToCheck.push(String(args.to));
    // plan 낸부의 경로도 확인
    if (args.plan) {
        const plan = args.plan;
        if (plan.moves) {
            for (const move of plan.moves) {
                if (move.from)
                    pathsToCheck.push(String(move.from));
                if (move.to)
                    pathsToCheck.push(String(move.to));
            }
        }
    }
    for (const checkPath of pathsToCheck) {
        const lowerPath = checkPath.toLowerCase();
        for (const pattern of SENSITIVE_PATTERNS) {
            if (lowerPath.includes(pattern.toLowerCase())) {
                return { isSensitive: true, matchedPattern: pattern };
            }
        }
    }
    return { isSensitive: false, matchedPattern: null };
}
/**
 * 승인 확인
 */
function hasValidApproval(args) {
    // approvedBy 필드가 있고 비어있지 않은지 확인
    if (args.approvedBy && typeof args.approvedBy === 'string' && args.approvedBy.trim().length > 0) {
        // 추가 검증: @advisor 패턴 확인
        if (args.approvedBy.includes('@advisor') || args.approvedBy.includes('승인')) {
            return true;
        }
    }
    return false;
}
/**
 * tool.execute.before 훅
 * - 민감 경로 차단
 * - plan_apply 승인 확인
 */
export async function beforeToolExecute(context) {
    const { tool, args } = context;
    console.log(`[doc-janitor][before] 툴 실행 검사: ${tool}`);
    // 1. 민감 경로 확인 (모든 툴에 적용)
    const sensitiveCheck = containsSensitivePath(args);
    if (sensitiveCheck.isSensitive) {
        console.warn(`[doc-janitor][before] 민감 경로 감지: ${sensitiveCheck.matchedPattern}`);
        return {
            allowed: false,
            reason: `민감 경로/파일이 감지되었습니다: ${sensitiveCheck.matchedPattern}. @advisor 승인이 필요합니다.`,
        };
    }
    // 2. 승인 필요 툴 확인
    if (REQUIRES_APPROVAL.includes(tool)) {
        if (!hasValidApproval(args)) {
            console.warn(`[doc-janitor][before] 승인 없음: ${tool}`);
            return {
                allowed: false,
                reason: `${tool} 실행에는 @advisor의 승인(approvedBy)이 필요합니다.`,
            };
        }
        console.log(`[doc-janitor][before] 승인 확인됨: ${args.approvedBy}`);
    }
    return { allowed: true };
}
/**
 * 감사 로그 저장
 */
async function saveAuditLog(tool, args, result) {
    const auditDir = path.join(process.cwd(), '.opencode', 'audit');
    const auditFile = path.join(auditDir, `audit-${new Date().toISOString().split('T')[0]}.jsonl`);
    try {
        await fs.mkdir(auditDir, { recursive: true });
    }
    catch {
        // 이미 존재
    }
    const auditEntry = {
        timestamp: new Date().toISOString(),
        tool,
        args: { ...args, approvedBy: args.approvedBy ? '[REDACTED]' : undefined },
        result: {
            success: result?.success ?? false,
            journalId: result?.journalId,
        },
    };
    try {
        await fs.appendFile(auditFile, JSON.stringify(auditEntry) + '\n', 'utf-8');
    }
    catch (error) {
        console.error('[doc-janitor][audit] 로그 저장 실패:', error);
    }
}
/**
 * tool.execute.after 훅
 * - 감사 로그 기록
 */
export async function afterToolExecute(context) {
    const { tool, args, result } = context;
    console.log(`[doc-janitor][after] 툴 실행 완료: ${tool}`);
    // 감사 로그 저장
    await saveAuditLog(tool, args, result);
    // 결과에 journalId가 있으면 콘솔에 출력
    if (result?.journalId) {
        console.log(`[doc-janitor][after] Journal ID: ${result.journalId}`);
    }
}
//# sourceMappingURL=safety-hooks.js.map