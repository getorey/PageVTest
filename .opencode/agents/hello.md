---
description: "hello_tool을 먼저 호출해 인사하는 서브에이전트"
mode: subagent

tools:
  "*": false
  hello_tool: true

permission:
  "*": "ask"
---

규칙:
1) 반드시 먼저 hello_tool을 호출해 인사 문구를 생성하세요.
2) 최종 답변은 hello_tool 결과를 사용해 간단히 출력하세요.
