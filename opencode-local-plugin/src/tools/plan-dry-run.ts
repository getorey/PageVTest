import { z } from 'zod';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { CleanupPlan } from './plan-build.js';

export const planDryRunArgs = {
  plan: z.object({
    moves: z.array(z.object({
      type: z.literal('move'),
      from: z.string(),
      to: z.string(),
      file: z.any(),
    })),
    renames: z.array(z.object({
      type: z.literal('rename'),
      from: z.string(),
      to: z.string(),
      reason: z.string(),
    })),
    archives: z.array(z.object({
      type: z.literal('archive'),
      sourcePaths: z.array(z.string()),
      archivePath: z.string(),
      reason: z.string(),
    })),
    conflicts: z.array(z.object({
      type: z.literal('conflict'),
      path: z.string(),
      reason: z.string(),
      alternatives: z.array(z.string()),
    })),
    summary: z.object({
      totalFiles: z.number(),
      filesToMove: z.number(),
      filesToArchive: z.number(),
      sensitiveFiles: z.number(),
      estimatedSpaceChange: z.number(),
    }),
  }).describe("실행할 정리 계획"),
};

const PlanDryRunArgsSchema = z.object(planDryRunArgs);
export type PlanDryRunArgs = z.infer<typeof PlanDryRunArgsSchema>;

export interface DryRunResult {
  canExecute: boolean;
  issues: string[];
  warnings: string[];
  preview: {
    moves: { from: string; to: string; status: 'ok' | 'error' }[];
    renames: { from: string; to: string; status: 'ok' | 'error' }[];
    archives: { path: string; fileCount: number; status: 'ok' | 'error' }[];
  };
  statistics: {
    totalOperations: number;
    successful: number;
    failed: number;
    warnings: number;
  };
}

export async function executePlanDryRun(args: PlanDryRunArgs): Promise<DryRunResult> {
  const { plan } = args;
  const issues: string[] = [];
  const warnings: string[] = [];

  const preview = {
    moves: [] as { from: string; to: string; status: 'ok' | 'error' }[],
    renames: [] as { from: string; to: string; status: 'ok' | 'error' }[],
    archives: [] as { path: string; fileCount: number; status: 'ok' | 'error' }[],
  };

  let successful = 0;
  let failed = 0;

  // 이동 작업 검증
  for (const move of plan.moves) {
    try {
      // 원본 파일 존재 확인
      await fs.access(move.from);
      
      // 대상 경로 확인
      const targetDir = path.dirname(move.to);
      try {
        await fs.access(targetDir);
      } catch {
        // 디렉토리가 없으면 생성 필요 (경고)
        warnings.push(`디렉토리 생성 필요: ${targetDir}`);
      }

      // 대상 파일 이미 존재하는지 확인
      try {
        await fs.access(move.to);
        issues.push(`대상 파일 이미 존재: ${move.to}`);
        preview.moves.push({ from: move.from, to: move.to, status: 'error' });
        failed++;
      } catch {
        preview.moves.push({ from: move.from, to: move.to, status: 'ok' });
        successful++;
      }
    } catch (error) {
      issues.push(`원본 파일 접근 불가: ${move.from}`);
      preview.moves.push({ from: move.from, to: move.to, status: 'error' });
      failed++;
    }
  }

  // 이름 변경 검증
  for (const rename of plan.renames) {
    preview.renames.push({ from: rename.from, to: rename.to, status: 'ok' });
    successful++;
  }

  // 아카이브 작업 검증
  for (const archive of plan.archives) {
    const archiveDir = path.dirname(archive.archivePath);
    try {
      await fs.access(archiveDir);
      preview.archives.push({ 
        path: archive.archivePath, 
        fileCount: archive.sourcePaths.length,
        status: 'ok' 
      });
      successful++;
    } catch {
      warnings.push(`아카이브 디렉토리 생성 필요: ${archiveDir}`);
      preview.archives.push({ 
        path: archive.archivePath, 
        fileCount: archive.sourcePaths.length,
        status: 'ok' // 생성 가능
      });
      successful++;
    }
  }

  // 충돌 검사
  for (const conflict of plan.conflicts) {
    issues.push(`[충돌] ${conflict.path}: ${conflict.reason}`);
    failed++;
  }

  // 민감 파일 경고
  if (plan.summary.sensitiveFiles > 0) {
    warnings.push(`민감 파일 ${plan.summary.sensitiveFiles}개가 감지됨. 승인 필요.`);
  }

  const totalOperations = plan.moves.length + plan.renames.length + plan.archives.length;

  return {
    canExecute: issues.length === 0,
    issues,
    warnings,
    preview,
    statistics: {
      totalOperations,
      successful,
      failed,
      warnings: warnings.length,
    },
  };
}
