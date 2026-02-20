import { z } from 'zod';
import type { ClassifiedItem } from './doc-classify.js';

export const planBuildArgs = {
  classifiedItems: z.array(z.object({
    file: z.object({
      path: z.string(),
      relativePath: z.string(),
      size: z.number(),
      modifiedAt: z.any(),
      extension: z.string(),
      isDirectory: z.boolean(),
    }),
    category: z.string(),
    targetPath: z.string(),
    reason: z.string(),
    isSensitive: z.boolean(),
  })).describe("분류된 파일 목록"),
  policy: z.object({
    archiveOldFiles: z.boolean().optional().describe("오래된 파일 아카이브 여부"),
    archiveThresholdDays: z.number().optional().describe("아카이브 기준 일수 (기본: 365)"),
    archiveDestination: z.string().optional().describe("아카이브 대상 폴더"),
    createYearFolders: z.boolean().optional().describe("연도별 폴더 생성 여부"),
  }).optional().describe("정책 설정"),
};

const PlanBuildArgsSchema = z.object(planBuildArgs);
export type PlanBuildArgs = z.infer<typeof PlanBuildArgsSchema>;

export interface MoveOperation {
  type: 'move';
  from: string;
  to: string;
  file: ClassifiedItem;
}

export interface RenameOperation {
  type: 'rename';
  from: string;
  to: string;
  reason: string;
}

export interface ArchiveOperation {
  type: 'archive';
  sourcePaths: string[];
  archivePath: string;
  reason: string;
}

export interface ConflictInfo {
  type: 'conflict';
  path: string;
  reason: string;
  alternatives: string[];
}

export interface CleanupPlan {
  moves: MoveOperation[];
  renames: RenameOperation[];
  archives: ArchiveOperation[];
  conflicts: ConflictInfo[];
  summary: {
    totalFiles: number;
    filesToMove: number;
    filesToArchive: number;
    sensitiveFiles: number;
    estimatedSpaceChange: number;
  };
}

export async function executePlanBuild(args: PlanBuildArgs): Promise<CleanupPlan> {
  const { classifiedItems, policy = {} } = args;
  const {
    archiveOldFiles = false,
    archiveThresholdDays = 365,
    archiveDestination = 'Archive',
    createYearFolders = true,
  } = policy;

  const moves: MoveOperation[] = [];
  const renames: RenameOperation[] = [];
  const archives: ArchiveOperation[] = [];
  const conflicts: ConflictInfo[] = [];

  const now = new Date();
  const archiveThreshold = new Date(now.getTime() - archiveThresholdDays * 24 * 60 * 60 * 1000);

  // 경로 중복 확인용
  const targetPaths = new Set<string>();

  for (const item of classifiedItems) {
    // 민감 파일은 충돌로 표시 (승인 필요)
    if (item.isSensitive) {
      conflicts.push({
        type: 'conflict',
        path: item.file.path,
        reason: `민감 파일 - 승인 필요: ${item.reason}`,
        alternatives: [`[승인시] ${item.targetPath}`, '[건너뛰기]'],
      });
      continue;
    }

    // 아카이브 대상 확인
    const modifiedDate = item.file.modifiedAt instanceof Date 
      ? item.file.modifiedAt 
      : new Date(item.file.modifiedAt);
    
    if (archiveOldFiles && modifiedDate < archiveThreshold) {
      const year = modifiedDate.getFullYear().toString();
      const archivePath = `${archiveDestination}/${year}/${item.category}.zip`;
      
      const existingArchive = archives.find(a => a.archivePath === archivePath);
      if (existingArchive) {
        existingArchive.sourcePaths.push(item.file.path);
      } else {
        archives.push({
          type: 'archive',
          sourcePaths: [item.file.path],
          archivePath,
          reason: `${archiveThresholdDays}일 이상 경과 (${modifiedDate.toISOString().split('T')[0]})`,
        });
      }
      continue;
    }

    // 경로 중복 확인
    let finalTargetPath = item.targetPath;
    if (targetPaths.has(finalTargetPath)) {
      const basePath = finalTargetPath.replace(/\.[^/.]+$/, '');
      const extension = finalTargetPath.match(/\.[^/.]+$/)?.[0] || '';
      let counter = 1;
      while (targetPaths.has(finalTargetPath)) {
        finalTargetPath = `${basePath}_${counter}${extension}`;
        counter++;
      }
      
      renames.push({
        type: 'rename',
        from: item.targetPath,
        to: finalTargetPath,
        reason: '대상 경로 중복 방지',
      });
    }
    targetPaths.add(finalTargetPath);

    moves.push({
      type: 'move',
      from: item.file.path,
      to: finalTargetPath,
      file: item as ClassifiedItem,
    });
  }

  // 요약 정보 계산
  const sensitiveFiles = classifiedItems.filter(i => i.isSensitive).length;
  const filesToMove = moves.length;
  const filesToArchive = archives.reduce((sum, a) => sum + a.sourcePaths.length, 0);
  const totalSpace = classifiedItems.reduce((sum, i) => sum + i.file.size, 0);

  return {
    moves,
    renames,
    archives,
    conflicts,
    summary: {
      totalFiles: classifiedItems.length,
      filesToMove,
      filesToArchive,
      sensitiveFiles,
      estimatedSpaceChange: 0, // 이동은 공간 변화 없음
    },
  };
}
