"에이전트는 2종류만”으로 딱 나누고, **업무용 PC 문서 정리**를 안전하게 자동화할 수 있는 **opencode 플러그인(툴+훅) 설계**를 제안할게요.

전제: 문서 정리는 사고(삭제/유출)가 나기 쉬우니, **강력 실행형 1명 + 조언/감사형 1명**, 그리고 **툴은 “계획→검토→실행(드라이런 기본)”**으로 설계합니다.

---

## 1) 에이전트 2종류 정의

### A. `@janitor` (알아서 다 해주는 실행형)

- 역할: 스캔 → 분류 → 정리 계획 생성 → (승인 받으면) 이동/리네임/아카이브 실행
- 원칙:
    - **삭제는 절대 안 함**(기본 정책)
    - **실행은 항상 dry-run → 승인 → 실 실행** 2단계
    - 민감 폴더/파일(예: `.ssh`, `.env`, “계약/인사/급여”)는 기본 제외

### B. `@advisor` (옆에서 조언/감사만 하는 검토형)

- 역할: `@janitor`가 만든 계획을 검토해
    - 위험 요소(개인정보/기밀/경로 충돌/업무 영향) 지적
    - 더 좋은 분류/폴더 구조 제안
    - 실행 전 체크리스트 통과 여부 판단
- 원칙:
    - **툴로 파일 조작 금지**
    - 오직 리포트/코멘트만

---

## 2) 플러그인이 제공할 “툴” 설계 (문서 정리용 핵심 6개)

### 1) `doc_scan`

- 입력: `root`, `excludePatterns`, `maxDepth`, `includeExtensions`
- 출력: 파일 목록 + 메타(경로/크기/수정일/확장자) + 통계
- 용도: “현재 상태 파악”

### 2) `doc_classify`

- 입력: `inventory`(scan 결과), `ruleset`(분류 규칙)
- 출력: 각 파일에 대한 `category`, `targetPath`, `reason`
- 용도: “어디로 보낼지 제안(아직 실행 X)”

### 3) `plan_build`

- 입력: `classifiedItems`, `policy`
- 출력: **정리 계획 JSON**
    - `moves[]` (from→to)
    - `renames[]`
    - `archives[]` (zip/tar)
    - `conflicts[]` (중복/충돌)
- 용도: “실행 가능한 형태로 계획 정리”

### 4) `plan_dry_run`

- 입력: `plan`
- 출력: 실행 결과 예측(충돌/권한 문제/대상 파일 수/변경 요약)
- 용도: “승인 전에 안전 확인”

### 5) `plan_apply`

- 입력: `plan`, `approvedBy`, `mode: "apply"`
- 출력: 수행 결과 + **journal 기록 ID**
- 정책:
    - 삭제 기능 없음
    - 이동/리네임/아카이브만
    - 항상 journal 남김

### 6) `undo_from_journal`

- 입력: `journalId`, `steps`
- 출력: 되돌린 결과
- 용도: “실수 대비”

> 핵심: `@janitor`는 **doc_scan → doc_classify → plan_build → plan_dry_run**까지 “알아서” 가능하지만, **plan_apply는 @advisor 승인 후에만** 하도록 훅에서 강제합니다.

---

## 3) 훅(Hooks) 설계: “업무 PC”용 안전장치 (필수)

### Hook A) `tool.execute.before` — 정책 강제

- `plan_apply` 실행을 가로채서:
    - `approvedBy`가 없으면 거부
    - 승인자는 `@advisor`가 작성한 승인 토큰/문구가 있어야 함
- 민감 경로/확장자 차단:
    - 예: `~/Library`, `~/.ssh`, `*.pem`, `*.p12`, `*.key`
    - “인사/급여/평가” 폴더, “계약서 원본” 폴더 등은 기본 제외(사용자 allowlist로만 허용)

### Hook B) `tool.execute.after` — 감사 로그/저널링

- 모든 move/rename/archive 결과를
    - `.opencode/journals/doc-cleanup-YYYYMMDD.jsonl`
    - 또는 프로젝트 `cleanup_journal.jsonl`  
        에 기록
- 추후 `undo_from_journal`의 근거

### Hook C) `chat.message` — 라우팅/실행 단계 통제(선택)

- 사용자가 “정리해줘/삭제해줘/용량 줄여줘”라고 하면
    - 자동으로 `@janitor`가 계획 수립 모드로 시작
    - “실행(Apply)” 단계에 들어가면 `@advisor` 호출하도록 유도


---

## 4) 권장 폴더 구조(업무 문서 정리용)

대부분의 업무 PC 문서는 “프로젝트/연도/문서유형”이 가장 무난합니다.

예시 타겟 구조:

```
WorkDocs/
  2026/
    Project-A/
      01_기획/
      02_회의록/
      03_산출물/
      04_계약_증빙/   (민감: 기본은 이동 금지, 예외만)
  Inbox/             (분류 전 임시)
  Archive/           (종료 프로젝트 압축)
```

분류 규칙 예시:

- 파일명에 `회의록|minutes|meeting` → `02_회의록/`
- 확장자 `pptx|key` → `03_산출물/발표자료/`
- `견적|invoice|세금` → `04_계약_증빙/`(단, 기본 이동 금지 정책에 걸려 승인 필요)

---

## 5) 실제 opencode 구성 파일(설계 초안)

### `.opencode/agents/janitor.md` (실행형)

- `mode: subagent`
- 사용할 툴: 위 6개 + (필요 시) read 정도
- `plan_apply`는 허용하되, 훅이 승인 없으면 막음

### `.opencode/agents/advisor.md` (조언형)

- 툴 사용: 기본 off (read 정도만)
- 역할: 계획 JSON 검토 + 승인 문구/토큰 발급

---

## 6) 구현 스켈레톤(파일만 정해두면 바로 코딩 가능)

`.opencode/plugins/doc-janitor.ts` 안에서:

- `tool: { doc_scan, doc_classify, plan_build, plan_dry_run, plan_apply, undo_from_journal }`
    
- `"tool.execute.before"`에서 승인/민감경로 정책 검사
    
- `"tool.execute.after"`에서 journal 기록
    

각 툴은 Node의 `fs/promises`, `path`, `crypto`(해시) 정도로 구현 가능.

---

## 7) “업무 PC” 관점에서 꼭 넣을 정책 5가지

1. **삭제 금지**(휴지통 이동도 초기엔 금지 추천)
    
2. **승인 없으면 실행 금지**(plan_apply 게이트)
    
3. **민감 패턴 기본 차단**(키/인증서/인사/급여/계약 원본 등)
    
4. **Dry-run 기본** + 변경 요약 리포트 자동 생성
    
5. **저널 기반 Undo** 필수
    

---


