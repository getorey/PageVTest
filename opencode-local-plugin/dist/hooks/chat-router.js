/**
 * chat.message 훅
 * - 문서 정리 관련 명령어 감지 및 라우팅
 */
// 문서 정리 관련 키워드
const CLEANUP_KEYWORDS = [
    '정리', '정리해', '정리해줘', '정리해 주세요',
    '정리좀', '정리 부탁', '정리 해줘',
    'clean', 'cleanup', 'organize', 'tidy',
    '파일 정리', '문서 정리', '폴다 정리',
];
// 실행 관련 키워드
const EXECUTE_KEYWORDS = [
    '실행', '실행해', '적용', '적용해', 'apply',
    '시작', '시작해', 'go', 'do it', '실행해줘',
];
// @janitor 호출 키워드
const JANITOR_KEYWORDS = [
    '@janitor', 'janitor', '알아서', '알아서 해',
    '알아서 정리', '알아서 다 해',
];
// @advisor 호출 키워드
const ADVISOR_KEYWORDS = [
    '@advisor', 'advisor', '검토', '검토해',
    '확인해', '승인', '승인해',
];
/**
 * 메시지에서 키워드 감지
 */
function detectKeywords(content, keywords) {
    const lowerContent = content.toLowerCase();
    return keywords.some(keyword => lowerContent.includes(keyword.toLowerCase()));
}
/**
 * chat.message 훅 핸들러
 */
export async function handleChatMessage(context) {
    const { message } = context;
    const content = message.content || '';
    console.log('[doc-janitor][chat] 메시지 감지');
    // 문서 정리 관련 메시지인지 확인
    const isCleanupRequest = detectKeywords(content, CLEANUP_KEYWORDS);
    const isExecuteRequest = detectKeywords(content, EXECUTE_KEYWORDS);
    const isJanitorRequest = detectKeywords(content, JANITOR_KEYWORDS);
    const isAdvisorRequest = detectKeywords(content, ADVISOR_KEYWORDS);
    // @janitor 직접 호출
    if (isJanitorRequest || (isCleanupRequest && !isExecuteRequest)) {
        return {
            handled: true,
            routeTo: '@janitor',
            suggestion: `@janitor를 호출하여 문서 정리 계획을 수립합니다. 실행 단계에서는 @advisor의 승인이 필요합니다.`,
        };
    }
    // @advisor 직접 호출
    if (isAdvisorRequest) {
        return {
            handled: true,
            routeTo: '@advisor',
            suggestion: `@advisor를 호출하여 계획을 검토하고 승인합니다.`,
        };
    }
    // 실행 요청 감지 (승인 없이 실행하려는 경우 경고)
    if (isExecuteRequest && isCleanupRequest) {
        return {
            handled: true,
            suggestion: `⚠️ 문서 정리 실행에는 @advisor의 승인이 필요합니다. 먼저 계획을 검토하세요.`,
        };
    }
    return { handled: false };
}
//# sourceMappingURL=chat-router.js.map