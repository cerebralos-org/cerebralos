# CerebraLOS 에이전트 통합 가이드

CerebraLOS는 모든 AI 에이전트의 "잠재의식 계층"으로 설계되었습니다. 백그라운드 메모리 프로세서 역할을 하여 기존 도구와 원활하게 작동합니다.

이 가이드는 CerebraLOS를 인기 있는 AI 에이전트에 연결하는 방법을 설명합니다.

## 1. Claude Code (Anthropic)

Claude Code는 강력한 CLI 기반 AI 에이전트입니다. CerebraLOS에 연결하면 Claude Code는 관련 없는 컨텍스트를 "잊고" 밤새도록 아키텍처 통찰력을 "꿈꿀" 수 있습니다.

### 설정

1. 프로젝트에서 CerebraLOS를 초기화합니다:
   ```bash
   npx cerebralos init
   ```

2. CerebraLOS 꿈을 읽도록 Claude Code를 구성합니다:
   `.clauderc` 또는 프로젝트 지침을 생성하거나 업데이트하여 다음을 포함합니다:
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `.cerebralos/dreams/latest.md`
   When you finish a significant task, write a brief summary to `.cerebralos/peripheral/context.md`
   ```

3. 매일 수면 작업을 실행합니다 (또는 cron 작업을 설정합니다):
   ```bash
   npx cerebralos sleep
   ```

## 2. Cursor (AI Code Editor)

Cursor는 가장 인기 있는 AI 우선 IDE입니다. CerebraLOS는 장기적인 아키텍처 메모리 역할을 할 수 있습니다.

### 설정

1. 프로젝트 루트에서 CerebraLOS를 초기화합니다.
2. Cursor 설정 > General > Rules for AI (또는 `.cursorrules` 파일)를 엽니다.
3. 다음 규칙을 추가합니다:
   ```markdown
   # CerebraLOS Integration
   - Always check `.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```
4. `Cmd+K` 또는 `Cmd+L`을 사용하면 Cursor는 이제 원시 로그에 압도되지 않고 프로젝트의 정제된 "꿈"을 자연스럽게 통합합니다.

## 3. OpenClaw

OpenClaw는 강력한 자율 에이전트 프레임워크입니다. OpenClaw가 완벽한 메모리 축적 (`MEMORY.md`)에 중점을 두는 반면, CerebraLOS는 컨텍스트 블로트를 방지하는 데 필요한 "망각" 메커니즘을 제공합니다.

### 설정

1. OpenClaw 구성에서 메모리 출력 경로를 CerebraLOS로 공급하도록 설정합니다:
   ```json
   {
     "memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. CerebraLOS는 엔트로피를 기반으로 이러한 로그를 자동으로 감쇠시킵니다.
3. OpenClaw의 시스템 프롬프트를 구성하여 깨어날 때 `.cerebralos/dreams/latest.md`에서 읽도록 합니다.

## 4. Manus (Autonomous General AI)

Manus는 CerebraLOS를 사용하여 장기 실행, 여러 날 프로젝트에서 컨텍스트를 유지할 수 있습니다.

### 설정

Manus에게 간단히 말하세요:
> "Please initialize CerebraLOS in this project and use it to manage your long-term memory. Run a sleep job at the end of each session."

Manus는 `npx cerebralos init` 및 `sleep` 명령을 자동으로 처리하여 주변 메모리에 결과를 쓰고 꿈에서 읽습니다.

---

## 모든 에이전트를 위한 핵심 워크플로

어떤 에이전트를 사용하든 CerebraLOS 워크플로는 항상 동일합니다:

1. **Agent works** → 원시 로그/컨텍스트를 `.cerebralos/peripheral/`에 기록
2. **You sleep** → `npx cerebralos sleep` 실행 (또는 cron을 통해 자동화)
3. **CerebraLOS dreams** → 주변 메모리를 `.cerebralos/dreams/`로 증류하고 나머지는 보관
4. **Agent wakes up** → `.cerebralos/dreams/latest.md`를 읽어 프로젝트의 "분위기"와 핵심 아키텍처를 즉시 파악

Built to forget. Designed to dream.