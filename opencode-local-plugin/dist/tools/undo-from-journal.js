import { z } from 'zod';
import { promises as fs } from 'fs';
import * as path from 'path';
export const undoFromJournalArgs = {
    journalId: z.string().describe("실행 취소할 저널 ID"),
    steps: z.number().optional().describe("취소할 단계 수 (기본: 전체)"),
};
const UndoFromJournalArgsSchema = z.object(undoFromJournalArgs);
// 저널 파일에서 특정 ID 찾기
async function findJournalEntry(journalId) {
    const journalDir = path.join(process.cwd(), '.opencode', 'journals');
    try {
        const files = await fs.readdir(journalDir);
        for (const file of files) {
            if (!file.endsWith('.jsonl'))
                continue;
            const content = await fs.readFile(path.join(journalDir, file), 'utf-8');
            const lines = content.trim().split('\n');
            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    if (entry.journalId === journalId || entry.journalId.includes(journalId)) {
                        return entry;
                    }
                }
                catch {
                    continue;
                }
            }
        }
    }
    catch {
        return null;
    }
    return null;
}
export async function executeUndoFromJournal(args) {
    const { journalId, steps } = args;
    const entry = await findJournalEntry(journalId);
    if (!entry) {
        return {
            success: false,
            undoneOperations: [],
            summary: {
                totalAttempted: 0,
                successful: 0,
                failed: 1,
            },
        };
    }
    const undoneOperations = [];
    let successful = 0;
    let failed = 0;
    // 성공한 작업만 역순으로 실행 (이동 작업만 지원)
    const operationsToUndo = entry.operations
        .filter(op => op.status === 'success' && op.type === 'move' && op.from)
        .reverse();
    const limit = steps ? Math.min(steps, operationsToUndo.length) : operationsToUndo.length;
    for (let i = 0; i < limit; i++) {
        const op = operationsToUndo[i];
        try {
            // 원래 위치로 복원
            if (op.from && op.to) {
                // 대상 파일이 존재하는지 확인
                try {
                    await fs.access(op.to);
                    // 원래 위치의 디렉토리 생성
                    const originalDir = path.dirname(op.from);
                    await fs.mkdir(originalDir, { recursive: true });
                    // 파일 복원 (이동)
                    await fs.rename(op.to, op.from);
                    undoneOperations.push({
                        type: 'move',
                        originalFrom: op.from,
                        originalTo: op.to,
                        restoredPath: op.from,
                        status: 'success',
                    });
                    successful++;
                }
                catch (error) {
                    undoneOperations.push({
                        type: 'move',
                        originalFrom: op.from,
                        originalTo: op.to,
                        status: 'failed',
                        error: error instanceof Error ? error.message : '파일을 찾을 수 없음',
                    });
                    failed++;
                }
            }
        }
        catch (error) {
            undoneOperations.push({
                type: 'move',
                originalFrom: op.from,
                originalTo: op.to,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
            });
            failed++;
        }
    }
    return {
        success: failed === 0,
        undoneOperations,
        summary: {
            totalAttempted: limit,
            successful,
            failed,
        },
    };
}
//# sourceMappingURL=undo-from-journal.js.map