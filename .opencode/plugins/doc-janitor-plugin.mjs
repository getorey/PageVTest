// src/tools/doc-scan.ts
import { promises as fs } from "fs";
import * as path from "path";
import { z } from "zod";
var docScanArgs = {
  root: z.string().describe("\uC2A4\uCE94\uD560 \uB8E8\uD2B8 \uB514\uB809\uD1A0\uB9AC \uACBD\uB85C"),
  excludePatterns: z.array(z.string()).optional().describe("\uC81C\uC678\uD560 \uD328\uD134 \uBAA9\uB85D (\uC608: ['.git', 'node_modules'])"),
  maxDepth: z.number().optional().describe("\uCD5C\uB300 \uD0D0\uC0C9 \uAE4A\uC774 (\uAE30\uBCF8\uAC12: 10)"),
  includeExtensions: z.array(z.string()).optional().describe("\uD3EC\uD568\uD560 \uD655\uC7A5\uC790 \uBAA9\uB85D (\uC608: ['.pdf', '.docx'])")
};
var DocScanArgsSchema = z.object(docScanArgs);
var DEFAULT_EXCLUDES = [".git", "node_modules", ".opencode", ".vscode", ".idea", "dist", "build"];
var SENSITIVE_PATHS = [".ssh", ".env", ".aws", ".docker", "Library/Keychains", ".gnupg", ".pki"];
async function scanDirectory(root, currentPath, depth, maxDepth, excludePatterns, includeExtensions, files) {
  if (depth > maxDepth) return;
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(root, fullPath);
    if (excludePatterns.some(
      (pattern) => entry.name.includes(pattern) || relativePath.includes(pattern)
    )) {
      continue;
    }
    if (SENSITIVE_PATHS.some((sp) => relativePath.includes(sp) || fullPath.includes(sp))) {
      continue;
    }
    if (entry.isDirectory()) {
      await scanDirectory(root, fullPath, depth + 1, maxDepth, excludePatterns, includeExtensions, files);
    } else {
      const extension = path.extname(entry.name).toLowerCase();
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
        isDirectory: false
      });
    }
  }
}
async function executeDocScan(args) {
  const {
    root,
    excludePatterns = [],
    maxDepth = 10,
    includeExtensions
  } = args;
  const resolvedRoot = path.resolve(root);
  const allExcludes = [...DEFAULT_EXCLUDES, ...excludePatterns];
  const files = [];
  await scanDirectory(resolvedRoot, resolvedRoot, 0, maxDepth, allExcludes, includeExtensions, files);
  const extensionStats = {};
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
    extensionStats
  };
}

// src/tools/doc-classify.ts
import { z as z2 } from "zod";
var docClassifyArgs = {
  inventory: z2.array(z2.object({
    path: z2.string(),
    relativePath: z2.string(),
    size: z2.number(),
    modifiedAt: z2.union([z2.string(), z2.date()]),
    extension: z2.string(),
    isDirectory: z2.boolean()
  })).describe("\uC2A4\uCE94\uB41C \uD30C\uC77C \uBAA9\uB85D"),
  ruleset: z2.object({
    patterns: z2.record(z2.string(), z2.array(z2.string())).describe("\uCE74\uD14C\uACE0\uB9AC\uBCC4 \uD328\uD134 (\uC608: {'\uD68C\uC758\uB85D': ['\uD68C\uC758\uB85D', 'minutes', 'meeting']})"),
    extensionMapping: z2.record(z2.string(), z2.string()).optional().describe("\uD655\uC7A5\uC790\uBCC4 \uAE30\uBCF8 \uCE74\uD14C\uACE0\uB9AC \uB9E4\uD551"),
    sensitivePatterns: z2.array(z2.string()).optional().describe("\uBBFC\uAC10 \uD30C\uC77C \uD328\uD134 (\uAE30\uBCF8 \uC774\uB3D9 \uAE08\uC9C0)")
  }).describe("\uBD84\uB958 \uADDC\uCE59")
};
var DocClassifyArgsSchema = z2.object(docClassifyArgs);
var DEFAULT_EXTENSION_MAPPING = {
  ".pdf": "\uBB38\uC11C",
  ".doc": "\uBB38\uC11C",
  ".docx": "\uBB38\uC11C",
  ".ppt": "\uBC1C\uD45C\uC790\uB8CC",
  ".pptx": "\uBC1C\uD45C\uC790\uB8CC",
  ".xls": "\uB370\uC774\uD130",
  ".xlsx": "\uB370\uC774\uD130",
  ".csv": "\uB370\uC774\uD130",
  ".txt": "\uD14D\uC2A4\uD2B8",
  ".md": "\uB9C8\uD06C\uB2E4\uC6B4"
};
var DEFAULT_SENSITIVE_PATTERNS = [
  "\uACC4\uC57D",
  "\uC778\uC0AC",
  "\uAE09\uC5EC",
  "\uC131\uACFC\uD3C9\uAC00",
  "\uBA74\uC811",
  "\uC785\uC0AC",
  "\uD1F4\uC0AC",
  "password",
  "secret",
  "private",
  "credential",
  "auth",
  ".pem",
  ".p12",
  ".key",
  ".pfx",
  ".crt",
  ".cer"
];
async function executeDocClassify(args) {
  const { inventory, ruleset } = args;
  const {
    patterns,
    extensionMapping = DEFAULT_EXTENSION_MAPPING,
    sensitivePatterns = DEFAULT_SENSITIVE_PATTERNS
  } = ruleset;
  const classifiedItems = [];
  for (const file of inventory) {
    const fileName = file.relativePath.toLowerCase();
    let category = "\uAE30\uD0C0";
    let reason = "\uAE30\uBCF8 \uBD84\uB958";
    let isSensitive = false;
    for (const pattern of sensitivePatterns) {
      if (fileName.includes(pattern.toLowerCase()) || file.relativePath.toLowerCase().includes(pattern.toLowerCase())) {
        isSensitive = true;
        reason = `\uBBFC\uAC10 \uD328\uD134 \uAC10\uC9C0: ${pattern}`;
        category = "\uBBFC\uAC10_\uC2B9\uC778\uD544\uC694";
        break;
      }
    }
    if (!isSensitive) {
      for (const [cat, catPatterns] of Object.entries(patterns)) {
        const patternsArray = catPatterns;
        for (const pattern of patternsArray) {
          if (fileName.includes(pattern.toLowerCase())) {
            category = cat;
            reason = `\uD30C\uC77C\uBA85 \uD328\uD134 \uC77C\uCE58: ${pattern}`;
            break;
          }
        }
        if (reason !== "\uAE30\uBCF8 \uBD84\uB958") break;
      }
    }
    const extMapping = extensionMapping;
    if (category === "\uAE30\uD0C0" && extMapping[file.extension.toLowerCase()]) {
      category = extMapping[file.extension.toLowerCase()];
      reason = `\uD655\uC7A5\uC790 \uAE30\uBC18: ${file.extension}`;
    }
    const targetPath = isSensitive ? `[\uC2B9\uC778\uD544\uC694]/${category}/${file.relativePath}` : `WorkDocs/\uC815\uB9AC/${category}/${file.relativePath}`;
    classifiedItems.push({
      file,
      category,
      targetPath,
      reason,
      isSensitive
    });
  }
  return classifiedItems;
}

// src/tools/plan-build.ts
import { z as z3 } from "zod";
var planBuildArgs = {
  classifiedItems: z3.array(z3.object({
    file: z3.object({
      path: z3.string(),
      relativePath: z3.string(),
      size: z3.number(),
      modifiedAt: z3.any(),
      extension: z3.string(),
      isDirectory: z3.boolean()
    }),
    category: z3.string(),
    targetPath: z3.string(),
    reason: z3.string(),
    isSensitive: z3.boolean()
  })).describe("\uBD84\uB958\uB41C \uD30C\uC77C \uBAA9\uB85D"),
  policy: z3.object({
    archiveOldFiles: z3.boolean().optional().describe("\uC624\uB798\uB41C \uD30C\uC77C \uC544\uCE74\uC774\uBE0C \uC5EC\uBD80"),
    archiveThresholdDays: z3.number().optional().describe("\uC544\uCE74\uC774\uBE0C \uAE30\uC900 \uC77C\uC218 (\uAE30\uBCF8: 365)"),
    archiveDestination: z3.string().optional().describe("\uC544\uCE74\uC774\uBE0C \uB300\uC0C1 \uD3F4\uB354"),
    createYearFolders: z3.boolean().optional().describe("\uC5F0\uB3C4\uBCC4 \uD3F4\uB354 \uC0DD\uC131 \uC5EC\uBD80")
  }).optional().describe("\uC815\uCC45 \uC124\uC815")
};
var PlanBuildArgsSchema = z3.object(planBuildArgs);
async function executePlanBuild(args) {
  const { classifiedItems, policy = {} } = args;
  const {
    archiveOldFiles = false,
    archiveThresholdDays = 365,
    archiveDestination = "Archive",
    createYearFolders = true
  } = policy;
  const moves = [];
  const renames = [];
  const archives = [];
  const conflicts = [];
  const now = /* @__PURE__ */ new Date();
  const archiveThreshold = new Date(now.getTime() - archiveThresholdDays * 24 * 60 * 60 * 1e3);
  const targetPaths = /* @__PURE__ */ new Set();
  for (const item of classifiedItems) {
    if (item.isSensitive) {
      conflicts.push({
        type: "conflict",
        path: item.file.path,
        reason: `\uBBFC\uAC10 \uD30C\uC77C - \uC2B9\uC778 \uD544\uC694: ${item.reason}`,
        alternatives: [`[\uC2B9\uC778\uC2DC] ${item.targetPath}`, "[\uAC74\uB108\uB6F0\uAE30]"]
      });
      continue;
    }
    const modifiedDate = item.file.modifiedAt instanceof Date ? item.file.modifiedAt : new Date(item.file.modifiedAt);
    if (archiveOldFiles && modifiedDate < archiveThreshold) {
      const year = modifiedDate.getFullYear().toString();
      const archivePath = `${archiveDestination}/${year}/${item.category}.zip`;
      const existingArchive = archives.find((a) => a.archivePath === archivePath);
      if (existingArchive) {
        existingArchive.sourcePaths.push(item.file.path);
      } else {
        archives.push({
          type: "archive",
          sourcePaths: [item.file.path],
          archivePath,
          reason: `${archiveThresholdDays}\uC77C \uC774\uC0C1 \uACBD\uACFC (${modifiedDate.toISOString().split("T")[0]})`
        });
      }
      continue;
    }
    let finalTargetPath = item.targetPath;
    if (targetPaths.has(finalTargetPath)) {
      const basePath = finalTargetPath.replace(/\.[^/.]+$/, "");
      const extension = finalTargetPath.match(/\.[^/.]+$/)?.[0] || "";
      let counter = 1;
      while (targetPaths.has(finalTargetPath)) {
        finalTargetPath = `${basePath}_${counter}${extension}`;
        counter++;
      }
      renames.push({
        type: "rename",
        from: item.targetPath,
        to: finalTargetPath,
        reason: "\uB300\uC0C1 \uACBD\uB85C \uC911\uBCF5 \uBC29\uC9C0"
      });
    }
    targetPaths.add(finalTargetPath);
    moves.push({
      type: "move",
      from: item.file.path,
      to: finalTargetPath,
      file: item
    });
  }
  const sensitiveFiles = classifiedItems.filter((i) => i.isSensitive).length;
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
      estimatedSpaceChange: 0
      // 이동은 공간 변화 없음
    }
  };
}

// src/tools/plan-dry-run.ts
import { z as z4 } from "zod";
import { promises as fs2 } from "fs";
import * as path2 from "path";
var planDryRunArgs = {
  plan: z4.object({
    moves: z4.array(z4.object({
      type: z4.literal("move"),
      from: z4.string(),
      to: z4.string(),
      file: z4.any()
    })),
    renames: z4.array(z4.object({
      type: z4.literal("rename"),
      from: z4.string(),
      to: z4.string(),
      reason: z4.string()
    })),
    archives: z4.array(z4.object({
      type: z4.literal("archive"),
      sourcePaths: z4.array(z4.string()),
      archivePath: z4.string(),
      reason: z4.string()
    })),
    conflicts: z4.array(z4.object({
      type: z4.literal("conflict"),
      path: z4.string(),
      reason: z4.string(),
      alternatives: z4.array(z4.string())
    })),
    summary: z4.object({
      totalFiles: z4.number(),
      filesToMove: z4.number(),
      filesToArchive: z4.number(),
      sensitiveFiles: z4.number(),
      estimatedSpaceChange: z4.number()
    })
  }).describe("\uC2E4\uD589\uD560 \uC815\uB9AC \uACC4\uD68D")
};
var PlanDryRunArgsSchema = z4.object(planDryRunArgs);
async function executePlanDryRun(args) {
  const { plan } = args;
  const issues = [];
  const warnings = [];
  const preview = {
    moves: [],
    renames: [],
    archives: []
  };
  let successful = 0;
  let failed = 0;
  for (const move of plan.moves) {
    try {
      await fs2.access(move.from);
      const targetDir = path2.dirname(move.to);
      try {
        await fs2.access(targetDir);
      } catch {
        warnings.push(`\uB514\uB809\uD1A0\uB9AC \uC0DD\uC131 \uD544\uC694: ${targetDir}`);
      }
      try {
        await fs2.access(move.to);
        issues.push(`\uB300\uC0C1 \uD30C\uC77C \uC774\uBBF8 \uC874\uC7AC: ${move.to}`);
        preview.moves.push({ from: move.from, to: move.to, status: "error" });
        failed++;
      } catch {
        preview.moves.push({ from: move.from, to: move.to, status: "ok" });
        successful++;
      }
    } catch (error) {
      issues.push(`\uC6D0\uBCF8 \uD30C\uC77C \uC811\uADFC \uBD88\uAC00: ${move.from}`);
      preview.moves.push({ from: move.from, to: move.to, status: "error" });
      failed++;
    }
  }
  for (const rename of plan.renames) {
    preview.renames.push({ from: rename.from, to: rename.to, status: "ok" });
    successful++;
  }
  for (const archive of plan.archives) {
    const archiveDir = path2.dirname(archive.archivePath);
    try {
      await fs2.access(archiveDir);
      preview.archives.push({
        path: archive.archivePath,
        fileCount: archive.sourcePaths.length,
        status: "ok"
      });
      successful++;
    } catch {
      warnings.push(`\uC544\uCE74\uC774\uBE0C \uB514\uB809\uD1A0\uB9AC \uC0DD\uC131 \uD544\uC694: ${archiveDir}`);
      preview.archives.push({
        path: archive.archivePath,
        fileCount: archive.sourcePaths.length,
        status: "ok"
        // 생성 가능
      });
      successful++;
    }
  }
  for (const conflict of plan.conflicts) {
    issues.push(`[\uCDA9\uB3CC] ${conflict.path}: ${conflict.reason}`);
    failed++;
  }
  if (plan.summary.sensitiveFiles > 0) {
    warnings.push(`\uBBFC\uAC10 \uD30C\uC77C ${plan.summary.sensitiveFiles}\uAC1C\uAC00 \uAC10\uC9C0\uB428. \uC2B9\uC778 \uD544\uC694.`);
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
      warnings: warnings.length
    }
  };
}

// src/tools/plan-apply.ts
import { z as z5 } from "zod";
import { promises as fs3 } from "fs";
import * as path3 from "path";
var planApplyArgs = {
  plan: z5.object({
    moves: z5.array(z5.object({
      type: z5.literal("move"),
      from: z5.string(),
      to: z5.string(),
      file: z5.any()
    })),
    renames: z5.array(z5.any()),
    archives: z5.array(z5.any()),
    conflicts: z5.array(z5.any()),
    summary: z5.object({
      totalFiles: z5.number(),
      filesToMove: z5.number(),
      filesToArchive: z5.number(),
      sensitiveFiles: z5.number(),
      estimatedSpaceChange: z5.number()
    })
  }).describe("\uC2E4\uD589\uD560 \uC815\uB9AC \uACC4\uD68D"),
  approvedBy: z5.string().optional().describe("\uC2B9\uC778\uC790 (@advisor \uD1A0\uD070)"),
  mode: z5.enum(["apply", "dry-run"]).default("apply").describe("\uC2E4\uD589 \uBAA8\uB4DC")
};
var PlanApplyArgsSchema = z5.object(planApplyArgs);
async function saveJournal(journalId, operations) {
  const journalDir = path3.join(process.cwd(), ".opencode", "journals");
  const journalFile = path3.join(journalDir, `doc-cleanup-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.jsonl`);
  try {
    await fs3.mkdir(journalDir, { recursive: true });
  } catch {
  }
  const journalEntry = {
    journalId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    operations
  };
  await fs3.appendFile(journalFile, JSON.stringify(journalEntry) + "\n", "utf-8");
}
async function executePlanApply(args) {
  const { plan, approvedBy, mode } = args;
  if (!approvedBy && plan.summary.sensitiveFiles > 0) {
    return {
      success: false,
      journalId: "",
      operations: [],
      summary: {
        totalAttempted: 0,
        successful: 0,
        failed: 0
      }
    };
  }
  const journalId = `cleanup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const operations = [];
  let successful = 0;
  let failed = 0;
  for (const move of plan.moves) {
    try {
      if (mode === "apply") {
        const targetDir = path3.dirname(move.to);
        await fs3.mkdir(targetDir, { recursive: true });
        await fs3.rename(move.from, move.to);
      }
      operations.push({
        type: "move",
        from: move.from,
        to: move.to,
        status: "success",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      successful++;
    } catch (error) {
      operations.push({
        type: "move",
        from: move.from,
        to: move.to,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      failed++;
    }
  }
  for (const archive of plan.archives) {
    try {
      if (mode === "apply") {
        const archiveDir = path3.dirname(archive.archivePath);
        await fs3.mkdir(archiveDir, { recursive: true });
        const archiveListPath = `${archive.archivePath}.files.txt`;
        await fs3.writeFile(archiveListPath, archive.sourcePaths.join("\n"), "utf-8");
      }
      operations.push({
        type: "archive",
        to: archive.archivePath,
        status: "success",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      successful++;
    } catch (error) {
      operations.push({
        type: "archive",
        to: archive.archivePath,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      failed++;
    }
  }
  if (mode === "apply") {
    await saveJournal(journalId, operations);
  }
  return {
    success: failed === 0,
    journalId: mode === "apply" ? journalId : `[dry-run] ${journalId}`,
    operations,
    summary: {
      totalAttempted: plan.moves.length + plan.archives.length,
      successful,
      failed
    }
  };
}

// src/tools/undo-from-journal.ts
import { z as z6 } from "zod";
import { promises as fs4 } from "fs";
import * as path4 from "path";
var undoFromJournalArgs = {
  journalId: z6.string().describe("\uC2E4\uD589 \uCDE8\uC18C\uD560 \uC800\uB110 ID"),
  steps: z6.number().optional().describe("\uCDE8\uC18C\uD560 \uB2E8\uACC4 \uC218 (\uAE30\uBCF8: \uC804\uCCB4)")
};
var UndoFromJournalArgsSchema = z6.object(undoFromJournalArgs);
async function findJournalEntry(journalId) {
  const journalDir = path4.join(process.cwd(), ".opencode", "journals");
  try {
    const files = await fs4.readdir(journalDir);
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const content = await fs4.readFile(path4.join(journalDir, file), "utf-8");
      const lines = content.trim().split("\n");
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.journalId === journalId || entry.journalId.includes(journalId)) {
            return entry;
          }
        } catch {
          continue;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}
async function executeUndoFromJournal(args) {
  const { journalId, steps } = args;
  const entry = await findJournalEntry(journalId);
  if (!entry) {
    return {
      success: false,
      undoneOperations: [],
      summary: {
        totalAttempted: 0,
        successful: 0,
        failed: 1
      }
    };
  }
  const undoneOperations = [];
  let successful = 0;
  let failed = 0;
  const operationsToUndo = entry.operations.filter((op) => op.status === "success" && op.type === "move" && op.from).reverse();
  const limit = steps ? Math.min(steps, operationsToUndo.length) : operationsToUndo.length;
  for (let i = 0; i < limit; i++) {
    const op = operationsToUndo[i];
    try {
      if (op.from && op.to) {
        try {
          await fs4.access(op.to);
          const originalDir = path4.dirname(op.from);
          await fs4.mkdir(originalDir, { recursive: true });
          await fs4.rename(op.to, op.from);
          undoneOperations.push({
            type: "move",
            originalFrom: op.from,
            originalTo: op.to,
            restoredPath: op.from,
            status: "success"
          });
          successful++;
        } catch (error) {
          undoneOperations.push({
            type: "move",
            originalFrom: op.from,
            originalTo: op.to,
            status: "failed",
            error: error instanceof Error ? error.message : "\uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC74C"
          });
          failed++;
        }
      }
    } catch (error) {
      undoneOperations.push({
        type: "move",
        originalFrom: op.from,
        originalTo: op.to,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
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
      failed
    }
  };
}

// src/hooks/safety-hooks.ts
import { promises as fs5 } from "fs";
import * as path5 from "path";
var SENSITIVE_PATTERNS = [
  ".ssh",
  ".env",
  ".aws",
  ".docker",
  "Library/Keychains",
  ".gnupg",
  ".pki",
  ".npmrc",
  ".pypirc",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  ".pem",
  ".p12",
  ".pfx",
  ".key",
  ".crt",
  ".cer",
  ".der",
  "\uACC4\uC57D",
  "\uC778\uC0AC",
  "\uAE09\uC5EC",
  "\uC131\uACFC\uD3C9\uAC00",
  "\uBA74\uC811",
  "\uC785\uC0AC",
  "\uD1F4\uC0AC",
  "password",
  "secret",
  "private",
  "credential",
  "token",
  "apikey",
  "api_key"
];
var REQUIRES_APPROVAL = ["plan_apply"];
function containsSensitivePath(args) {
  const pathsToCheck = [];
  if (args.root) pathsToCheck.push(String(args.root));
  if (args.path) pathsToCheck.push(String(args.path));
  if (args.from) pathsToCheck.push(String(args.from));
  if (args.to) pathsToCheck.push(String(args.to));
  if (args.plan) {
    const plan = args.plan;
    if (plan.moves) {
      for (const move of plan.moves) {
        if (move.from) pathsToCheck.push(String(move.from));
        if (move.to) pathsToCheck.push(String(move.to));
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
function hasValidApproval(args) {
  if (args.approvedBy && typeof args.approvedBy === "string" && args.approvedBy.trim().length > 0) {
    if (args.approvedBy.includes("@advisor") || args.approvedBy.includes("\uC2B9\uC778")) {
      return true;
    }
  }
  return false;
}
async function beforeToolExecute(context) {
  const { tool, args } = context;
  console.log(`[doc-janitor][before] \uD234 \uC2E4\uD589 \uAC80\uC0AC: ${tool}`);
  const sensitiveCheck = containsSensitivePath(args);
  if (sensitiveCheck.isSensitive) {
    console.warn(`[doc-janitor][before] \uBBFC\uAC10 \uACBD\uB85C \uAC10\uC9C0: ${sensitiveCheck.matchedPattern}`);
    return {
      allowed: false,
      reason: `\uBBFC\uAC10 \uACBD\uB85C/\uD30C\uC77C\uC774 \uAC10\uC9C0\uB418\uC5C8\uC2B5\uB2C8\uB2E4: ${sensitiveCheck.matchedPattern}. @advisor \uC2B9\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.`
    };
  }
  if (REQUIRES_APPROVAL.includes(tool)) {
    if (!hasValidApproval(args)) {
      console.warn(`[doc-janitor][before] \uC2B9\uC778 \uC5C6\uC74C: ${tool}`);
      return {
        allowed: false,
        reason: `${tool} \uC2E4\uD589\uC5D0\uB294 @advisor\uC758 \uC2B9\uC778(approvedBy)\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.`
      };
    }
    console.log(`[doc-janitor][before] \uC2B9\uC778 \uD655\uC778\uB428: ${args.approvedBy}`);
  }
  return { allowed: true };
}
async function saveAuditLog(tool, args, result) {
  const auditDir = path5.join(process.cwd(), ".opencode", "audit");
  const auditFile = path5.join(auditDir, `audit-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.jsonl`);
  try {
    await fs5.mkdir(auditDir, { recursive: true });
  } catch {
  }
  const auditEntry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    tool,
    args: { ...args, approvedBy: args.approvedBy ? "[REDACTED]" : void 0 },
    result: {
      success: result?.success ?? false,
      journalId: result?.journalId
    }
  };
  try {
    await fs5.appendFile(auditFile, JSON.stringify(auditEntry) + "\n", "utf-8");
  } catch (error) {
    console.error("[doc-janitor][audit] \uB85C\uADF8 \uC800\uC7A5 \uC2E4\uD328:", error);
  }
}
async function afterToolExecute(context) {
  const { tool, args, result } = context;
  console.log(`[doc-janitor][after] \uD234 \uC2E4\uD589 \uC644\uB8CC: ${tool}`);
  await saveAuditLog(tool, args, result);
  if (result?.journalId) {
    console.log(`[doc-janitor][after] Journal ID: ${result.journalId}`);
  }
}

// src/hooks/chat-router.ts
var CLEANUP_KEYWORDS = [
  "\uC815\uB9AC",
  "\uC815\uB9AC\uD574",
  "\uC815\uB9AC\uD574\uC918",
  "\uC815\uB9AC\uD574 \uC8FC\uC138\uC694",
  "\uC815\uB9AC\uC880",
  "\uC815\uB9AC \uBD80\uD0C1",
  "\uC815\uB9AC \uD574\uC918",
  "clean",
  "cleanup",
  "organize",
  "tidy",
  "\uD30C\uC77C \uC815\uB9AC",
  "\uBB38\uC11C \uC815\uB9AC",
  "\uD3F4\uB2E4 \uC815\uB9AC"
];
var EXECUTE_KEYWORDS = [
  "\uC2E4\uD589",
  "\uC2E4\uD589\uD574",
  "\uC801\uC6A9",
  "\uC801\uC6A9\uD574",
  "apply",
  "\uC2DC\uC791",
  "\uC2DC\uC791\uD574",
  "go",
  "do it",
  "\uC2E4\uD589\uD574\uC918"
];
var JANITOR_KEYWORDS = [
  "@janitor",
  "janitor",
  "\uC54C\uC544\uC11C",
  "\uC54C\uC544\uC11C \uD574",
  "\uC54C\uC544\uC11C \uC815\uB9AC",
  "\uC54C\uC544\uC11C \uB2E4 \uD574"
];
var ADVISOR_KEYWORDS = [
  "@advisor",
  "advisor",
  "\uAC80\uD1A0",
  "\uAC80\uD1A0\uD574",
  "\uD655\uC778\uD574",
  "\uC2B9\uC778",
  "\uC2B9\uC778\uD574"
];
function detectKeywords(content, keywords) {
  const lowerContent = content.toLowerCase();
  return keywords.some((keyword) => lowerContent.includes(keyword.toLowerCase()));
}
async function handleChatMessage(context) {
  const { message } = context;
  const content = message.content || "";
  console.log("[doc-janitor][chat] \uBA54\uC2DC\uC9C0 \uAC10\uC9C0");
  const isCleanupRequest = detectKeywords(content, CLEANUP_KEYWORDS);
  const isExecuteRequest = detectKeywords(content, EXECUTE_KEYWORDS);
  const isJanitorRequest = detectKeywords(content, JANITOR_KEYWORDS);
  const isAdvisorRequest = detectKeywords(content, ADVISOR_KEYWORDS);
  if (isJanitorRequest || isCleanupRequest && !isExecuteRequest) {
    return {
      handled: true,
      routeTo: "@janitor",
      suggestion: `@janitor\uB97C \uD638\uCD9C\uD558\uC5EC \uBB38\uC11C \uC815\uB9AC \uACC4\uD68D\uC744 \uC218\uB9BD\uD569\uB2C8\uB2E4. \uC2E4\uD589 \uB2E8\uACC4\uC5D0\uC11C\uB294 @advisor\uC758 \uC2B9\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.`
    };
  }
  if (isAdvisorRequest) {
    return {
      handled: true,
      routeTo: "@advisor",
      suggestion: `@advisor\uB97C \uD638\uCD9C\uD558\uC5EC \uACC4\uD68D\uC744 \uAC80\uD1A0\uD558\uACE0 \uC2B9\uC778\uD569\uB2C8\uB2E4.`
    };
  }
  if (isExecuteRequest && isCleanupRequest) {
    return {
      handled: true,
      suggestion: `\u26A0\uFE0F \uBB38\uC11C \uC815\uB9AC \uC2E4\uD589\uC5D0\uB294 @advisor\uC758 \uC2B9\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uBA3C\uC800 \uACC4\uD68D\uC744 \uAC80\uD1A0\uD558\uC138\uC694.`
    };
  }
  return { handled: false };
}

// src/index.ts
var plugin = async () => {
  console.log("[doc-janitor-plugin] INIT - \uBB38\uC11C \uC815\uB9AC \uD50C\uB7EC\uADF8\uC778 \uB85C\uB4DC\uB428");
  return {
    // 6개 핵심 도구
    tool: {
      // 1. doc_scan: 파일 스캔
      doc_scan: {
        description: "\uB514\uB809\uD1A0\uB9AC\uB97C \uC2A4\uCE94\uD558\uC5EC \uD30C\uC77C \uBAA9\uB85D\uACFC \uBA54\uD0C0\uB370\uC774\uD130 \uC218\uC9D1",
        args: docScanArgs,
        async execute(args) {
          console.log("[doc-janitor][tool] doc_scan \uC2E4\uD589");
          const result = await executeDocScan(args);
          return JSON.stringify(result, null, 2);
        }
      },
      // 2. doc_classify: 파일 분류
      doc_classify: {
        description: "\uC2A4\uCE94\uB41C \uD30C\uC77C\uC744 \uADDC\uCE59\uC5D0 \uB530\uB77C \uCE74\uD14C\uACE0\uB9AC \uBD84\uB958",
        args: docClassifyArgs,
        async execute(args) {
          console.log("[doc-janitor][tool] doc_classify \uC2E4\uD589");
          const result = await executeDocClassify(args);
          return JSON.stringify(result, null, 2);
        }
      },
      // 3. plan_build: 정리 계획 생성
      plan_build: {
        description: "\uBD84\uB958\uB41C \uD30C\uC77C\uC744 \uAE30\uBC18\uC73C\uB85C \uC815\uB9AC \uACC4\uD68D \uC0DD\uC131",
        args: planBuildArgs,
        async execute(args) {
          console.log("[doc-janitor][tool] plan_build \uC2E4\uD589");
          const result = await executePlanBuild(args);
          return JSON.stringify(result, null, 2);
        }
      },
      // 4. plan_dry_run: 실행 예측
      plan_dry_run: {
        description: "\uC815\uB9AC \uACC4\uD68D\uC758 \uC2E4\uD589 \uACB0\uACFC \uC608\uCE21 \uBC0F \uC548\uC804\uC131 \uAC80\uC0AC",
        args: planDryRunArgs,
        async execute(args) {
          console.log("[doc-janitor][tool] plan_dry_run \uC2E4\uD589");
          const result = await executePlanDryRun(args);
          return JSON.stringify(result, null, 2);
        }
      },
      // 5. plan_apply: 계획 실행 (승인 필요)
      plan_apply: {
        description: "\uC815\uB9AC \uACC4\uD68D \uC2E4\uD589 (\uC0AD\uC81C \uC5C6\uC74C, @advisor \uC2B9\uC778 \uD544\uC694)",
        args: planApplyArgs,
        async execute(args) {
          console.log("[doc-janitor][tool] plan_apply \uC2E4\uD589");
          const result = await executePlanApply(args);
          return JSON.stringify(result, null, 2);
        }
      },
      // 6. undo_from_journal: 실행 취소
      undo_from_journal: {
        description: "\uC800\uB110 \uAE30\uB85D\uC744 \uAE30\uBC18\uC73C\uB85C \uC2E4\uD589 \uCDE8\uC18C",
        args: undoFromJournalArgs,
        async execute(args) {
          console.log("[doc-janitor][tool] undo_from_journal \uC2E4\uD589");
          const result = await executeUndoFromJournal(args);
          return JSON.stringify(result, null, 2);
        }
      }
    },
    // 훅 (Hooks)
    "tool.execute.before": async (evt) => {
      const result = await beforeToolExecute({
        tool: evt.tool,
        args: evt.args,
        meta: evt.meta
      });
      if (!result.allowed) {
        console.error(`[doc-janitor][hook] \uC2E4\uD589 \uCC28\uB2E8: ${result.reason}`);
        throw new Error(result.reason);
      }
    },
    "tool.execute.after": async (evt) => {
      await afterToolExecute({
        tool: evt.tool,
        args: evt.args,
        result: evt.result,
        meta: evt.meta
      });
    },
    "chat.message": async (evt) => {
      const result = await handleChatMessage({
        message: evt.message,
        user: evt.user,
        session: evt.session
      });
      if (result.handled && result.suggestion) {
        console.log(`[doc-janitor][chat] ${result.suggestion}`);
      }
    }
  };
};
var index_default = plugin;
export {
  index_default as default
};
