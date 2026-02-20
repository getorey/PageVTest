import { z } from 'zod';
export const docClassifyArgs = {
    inventory: z.array(z.object({
        path: z.string(),
        relativePath: z.string(),
        size: z.number(),
        modifiedAt: z.union([z.string(), z.date()]),
        extension: z.string(),
        isDirectory: z.boolean(),
    })).describe("스캔된 파일 목록"),
    ruleset: z.object({
        patterns: z.record(z.string(), z.array(z.string())).describe("카테고리별 패턴 (예: {'회의록': ['회의록', 'minutes', 'meeting']})"),
        extensionMapping: z.record(z.string(), z.string()).optional().describe("확장자별 기본 카테고리 매핑"),
        sensitivePatterns: z.array(z.string()).optional().describe("민감 파일 패턴 (기본 이동 금지)"),
    }).describe("분류 규칙"),
};
const DocClassifyArgsSchema = z.object(docClassifyArgs);
const DEFAULT_EXTENSION_MAPPING = {
    '.pdf': '문서',
    '.doc': '문서',
    '.docx': '문서',
    '.ppt': '발표자료',
    '.pptx': '발표자료',
    '.xls': '데이터',
    '.xlsx': '데이터',
    '.csv': '데이터',
    '.txt': '텍스트',
    '.md': '마크다운',
};
const DEFAULT_SENSITIVE_PATTERNS = [
    '계약', '인사', '급여', '성과평가', '면접', '입사', '퇴사',
    'password', 'secret', 'private', 'credential', 'auth',
    '.pem', '.p12', '.key', '.pfx', '.crt', '.cer',
];
export async function executeDocClassify(args) {
    const { inventory, ruleset } = args;
    const { patterns, extensionMapping = DEFAULT_EXTENSION_MAPPING, sensitivePatterns = DEFAULT_SENSITIVE_PATTERNS, } = ruleset;
    const classifiedItems = [];
    for (const file of inventory) {
        const fileName = file.relativePath.toLowerCase();
        let category = '기타';
        let reason = '기본 분류';
        let isSensitive = false;
        // 민감 패턴 확인
        for (const pattern of sensitivePatterns) {
            if (fileName.includes(pattern.toLowerCase()) ||
                file.relativePath.toLowerCase().includes(pattern.toLowerCase())) {
                isSensitive = true;
                reason = `민감 패턴 감지: ${pattern}`;
                category = '민감_승인필요';
                break;
            }
        }
        // 패턴 기반 분류 (민감이 아닌 경우에만)
        if (!isSensitive) {
            for (const [cat, catPatterns] of Object.entries(patterns)) {
                const patternsArray = catPatterns;
                for (const pattern of patternsArray) {
                    if (fileName.includes(pattern.toLowerCase())) {
                        category = cat;
                        reason = `파일명 패턴 일치: ${pattern}`;
                        break;
                    }
                }
                if (reason !== '기본 분류')
                    break;
            }
        }
        // 확장자 기반 분류 (패턴 미일치 시)
        const extMapping = extensionMapping;
        if (category === '기타' && extMapping[file.extension.toLowerCase()]) {
            category = extMapping[file.extension.toLowerCase()];
            reason = `확장자 기반: ${file.extension}`;
        }
        // 타겟 경로 생성
        const targetPath = isSensitive
            ? `[승인필요]/${category}/${file.relativePath}`
            : `WorkDocs/정리/${category}/${file.relativePath}`;
        classifiedItems.push({
            file: file,
            category,
            targetPath,
            reason,
            isSensitive,
        });
    }
    return classifiedItems;
}
//# sourceMappingURL=doc-classify.js.map