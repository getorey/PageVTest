import { promises as fs } from 'fs';
import * as path from 'path';
import { z } from 'zod';

export const docScanArgs = {
  root: z.string().describe("스캔할 루트 디렉토리 경로"),
  excludePatterns: z.array(z.string()).optional().describe("제외할 패턴 목록 (예: ['.git', 'node_modules'])"),
  maxDepth: z.number().optional().describe("최대 탐색 깊이 (기본값: 10)"),
  includeExtensions: z.array(z.string()).optional().describe("포함할 확장자 목록 (예: ['.pdf', '.docx'])"),
};

const DocScanArgsSchema = z.object(docScanArgs);
export type DocScanArgs = z.infer<typeof DocScanArgsSchema>;

export interface FileInfo {
  path: string;
  relativePath: string;
  size: number;
  modifiedAt: Date;
  extension: string;
  isDirectory: boolean;
}

export interface DocScanResult {
  files: FileInfo[];
  totalCount: number;
  totalSize: number;
  extensionStats: Record<string, { count: number; size: number }>;
}

const DEFAULT_EXCLUDES = ['.git', 'node_modules', '.opencode', '.vscode', '.idea', 'dist', 'build'];
const SENSITIVE_PATHS = ['.ssh', '.env', '.aws', '.docker', 'Library/Keychains', '.gnupg', '.pki'];

async function scanDirectory(
  root: string,
  currentPath: string,
  depth: number,
  maxDepth: number,
  excludePatterns: string[],
  includeExtensions: string[] | undefined,
  files: FileInfo[]
): Promise<void> {
  if (depth > maxDepth) return;

  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(root, fullPath);

    // 제외 패턴 확인
    if (excludePatterns.some(pattern => 
      entry.name.includes(pattern) || relativePath.includes(pattern)
    )) {
      continue;
    }

    // 민감 경로 확인
    if (SENSITIVE_PATHS.some(sp => relativePath.includes(sp) || fullPath.includes(sp))) {
      continue;
    }

    if (entry.isDirectory()) {
      await scanDirectory(root, fullPath, depth + 1, maxDepth, excludePatterns, includeExtensions, files);
    } else {
      const extension = path.extname(entry.name).toLowerCase();
      
      // 확장자 필터 확인
      if (includeExtensions && includeExtensions.length > 0) {
        if (!includeExtensions.includes(extension)) {
          continue;
        }
      }

      const stats = await fs.stat(fullPath);
      files.push({
        path: fullPath,
        relativePath,
        size: stats.size,
        modifiedAt: stats.mtime,
        extension,
        isDirectory: false,
      });
    }
  }
}

export async function executeDocScan(args: DocScanArgs): Promise<DocScanResult> {
  const {
    root,
    excludePatterns = [],
    maxDepth = 10,
    includeExtensions,
  } = args;

  const resolvedRoot = path.resolve(root);
  const allExcludes = [...DEFAULT_EXCLUDES, ...excludePatterns];
  const files: FileInfo[] = [];

  await scanDirectory(resolvedRoot, resolvedRoot, 0, maxDepth, allExcludes, includeExtensions, files);

  const extensionStats: Record<string, { count: number; size: number }> = {};
  let totalSize = 0;

  for (const file of files) {
    totalSize += file.size;
    if (!extensionStats[file.extension]) {
      extensionStats[file.extension] = { count: 0, size: 0 };
    }
    extensionStats[file.extension].count++;
    extensionStats[file.extension].size += file.size;
  }

  return {
    files,
    totalCount: files.length,
    totalSize,
    extensionStats,
  };
}
