import { z } from 'zod';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { CleanupPlan } from './plan-build.js';

export const planApplyArgs = {
  plan: z.object({
    moves: z.array(z.object({
      type: z.literal('move'),
      from: z.string(),
      to: z.string(),
      file: z.any(),
    })),
    renames: z.array(z.any()),
    archives: z.array(z.any()),
    conflicts: z.array(z.any()),
    summary: z.object({
      totalFiles: z.number(),
      filesToMove: z.number(),
      filesToArchive: z.number(),
      sensitiveFiles: z.number(),
      estimatedSpaceChange: z.number(),
    }),
  }).describe("실행할 정리 계획"),
  approvedBy: z.string().optional().describe("승인자 (@advisor 토큰)"),
  mode: z.enum(['apply', 'dry-run']).default('apply').describe("실행 모드"),
};

const PlanApplyArgsSchema = z.object(planApplyArgs);
export type PlanApplyArgs = z.infer<typeof PlanApplyArgsSchema>;

export interface AppliedOperation {
  type: 'move' | 'archive';
  from?: string;
  to: string;
  status: 'success' | 'failed';
  error?: string;
  timestamp: string;
}

export interface PlanApplyResult {
  success: boolean;
  journalId: string;
  operations: AppliedOperation[];
  summary: {
    totalAttempted: number;
    successful: number;
    failed: number;
  };
}

// 저널 저장 함수
async function saveJournal(journalId: string, operations: AppliedOperation[]): Promise<void> {
  const journalDir = path.join(process.cwd(), '.opencode', 'journals');
  const journalFile = path.join(journalDir, `doc-cleanup-${new Date().toISOString().split('T')[0]}.jsonl`);
  
  try {
    await fs.mkdir(journalDir, { recursive: true });
  } catch {
    // 이미 존재
  }

  const journalEntry = {
    journalId,
    timestamp: new Date().toISOString(),
    operations,
  };

  await fs.appendFile(journalFile, JSON.stringify(journalEntry) + '\n', 'utf-8');
}

export async function executePlanApply(args: PlanApplyArgs): Promise<PlanApplyResult> {
  const { plan, approvedBy, mode } = args;

  // 승인 확인
  if (!approvedBy && plan.summary.sensitiveFiles > 0) {
    return {
      success: false,
      journalId: '',
      operations: [],
      summary: {
        totalAttempted: 0,
        successful: 0,
        failed: 0,
      },
    };
  }

  const journalId = `cleanup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const operations: AppliedOperation[] = [];

  let successful = 0;
  let failed = 0;

  // 실제 실행 또는 dry-run
  for (const move of plan.moves) {
    try {
      if (mode === 'apply') {
        // 대상 디렉토리 생성
        const targetDir = path.dirname(move.to);
        await fs.mkdir(targetDir, { recursive: true });
        
        // 파일 이동
        await fs.rename(move.from, move.to);
      }

      operations.push({
        type: 'move',
        from: move.from,
        to: move.to,
        status: 'success',
        timestamp: new Date().toISOString(),
      });
      successful++;
    } catch (error) {
      operations.push({
        type: 'move',
        from: move.from,
        to: move.to,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      failed++;
    }
  }

  // 아카이브 작업 (간단한 zip 생성 대신 파일 목록만 기록 - 실제 구현은 라이브러리 필요)
  for (const archive of plan.archives) {
    try {
      if (mode === 'apply') {
        const archiveDir = path.dirname(archive.archivePath);
        await fs.mkdir(archiveDir, { recursive: true });
        // 실제 아카이브 생성은 archiver 라이브러리 필요
        // 여기서는 목록만 저장
        const archiveListPath = `${archive.archivePath}.files.txt`;
        await fs.writeFile(archiveListPath, archive.sourcePaths.join('\n'), 'utf-8');
      }

      operations.push({
        type: 'archive',
        to: archive.archivePath,
        status: 'success',
        timestamp: new Date().toISOString(),
      });
      successful++;
    } catch (error) {
      operations.push({
        type: 'archive',
        to: archive.archivePath,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      failed++;
    }
  }

  // 저널 저장
  if (mode === 'apply') {
    await saveJournal(journalId, operations);
  }

  return {
    success: failed === 0,
    journalId: mode === 'apply' ? journalId : `[dry-run] ${journalId}`,
    operations,
    summary: {
      totalAttempted: plan.moves.length + plan.archives.length,
      successful,
      failed,
    },
  };
}
