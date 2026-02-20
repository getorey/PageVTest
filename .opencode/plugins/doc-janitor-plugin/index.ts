import type { Plugin } from "@opencode-ai/plugin";
import { z } from "zod";

// 도구 임포트
import { docScanArgs, executeDocScan } from "./tools/doc-scan.js";
import { docClassifyArgs, executeDocClassify } from "./tools/doc-classify.js";
import { planBuildArgs, executePlanBuild } from "./tools/plan-build.js";
import { planDryRunArgs, executePlanDryRun } from "./tools/plan-dry-run.js";
import { planApplyArgs, executePlanApply } from "./tools/plan-apply.js";
import { undoFromJournalArgs, executeUndoFromJournal } from "./tools/undo-from-journal.js";

// 훅 임포트
import { beforeToolExecute, afterToolExecute } from "./hooks/safety-hooks.js";
import { handleChatMessage } from "./hooks/chat-router.js";

const plugin: Plugin = async () => {
  console.log("[doc-janitor-plugin] INIT - 문서 정리 플러그인 로드됨");

  return {
    // 6개 핵심 도구
    tool: {
      // 1. doc_scan: 파일 스캔
      doc_scan: {
        description: "디렉토리를 스캔하여 파일 목록과 메타데이터 수집",
        args: docScanArgs,
        async execute(args: any) {
          console.log("[doc-janitor][tool] doc_scan 실행");
          const result = await executeDocScan(args);
          return JSON.stringify(result, null, 2);
        },
      },

      // 2. doc_classify: 파일 분류
      doc_classify: {
        description: "스캔된 파일을 규칙에 따라 카테고리 분류",
        args: docClassifyArgs,
        async execute(args: any) {
          console.log("[doc-janitor][tool] doc_classify 실행");
          const result = await executeDocClassify(args);
          return JSON.stringify(result, null, 2);
        },
      },

      // 3. plan_build: 정리 계획 생성
      plan_build: {
        description: "분류된 파일을 기반으로 정리 계획 생성",
        args: planBuildArgs,
        async execute(args: any) {
          console.log("[doc-janitor][tool] plan_build 실행");
          const result = await executePlanBuild(args);
          return JSON.stringify(result, null, 2);
        },
      },

      // 4. plan_dry_run: 실행 예측
      plan_dry_run: {
        description: "정리 계획의 실행 결과 예측 및 안전성 검사",
        args: planDryRunArgs,
        async execute(args: any) {
          console.log("[doc-janitor][tool] plan_dry_run 실행");
          const result = await executePlanDryRun(args);
          return JSON.stringify(result, null, 2);
        },
      },

      // 5. plan_apply: 계획 실행 (승인 필요)
      plan_apply: {
        description: "정리 계획 실행 (삭제 없음, @advisor 승인 필요)",
        args: planApplyArgs,
        async execute(args: any) {
          console.log("[doc-janitor][tool] plan_apply 실행");
          const result = await executePlanApply(args);
          return JSON.stringify(result, null, 2);
        },
      },

      // 6. undo_from_journal: 실행 취소
      undo_from_journal: {
        description: "저널 기록을 기반으로 실행 취소",
        args: undoFromJournalArgs,
        async execute(args: any) {
          console.log("[doc-janitor][tool] undo_from_journal 실행");
          const result = await executeUndoFromJournal(args);
          return JSON.stringify(result, null, 2);
        },
      },
    },

    // 훅 (Hooks)
    "tool.execute.before": async (evt: any) => {
      const result = await beforeToolExecute({
        tool: evt.tool,
        args: evt.args,
        meta: evt.meta,
      });
      
      if (!result.allowed) {
        console.error(`[doc-janitor][hook] 실행 차단: ${result.reason}`);
        throw new Error(result.reason);
      }
    },

    "tool.execute.after": async (evt: any) => {
      await afterToolExecute({
        tool: evt.tool,
        args: evt.args,
        result: evt.result,
        meta: evt.meta,
      });
    },

    "chat.message": async (evt: any) => {
      const result = await handleChatMessage({
        message: evt.message,
        user: evt.user,
        session: evt.session,
      });

      if (result.handled && result.suggestion) {
        console.log(`[doc-janitor][chat] ${result.suggestion}`);
      }
    },
  };
};

export default plugin;
