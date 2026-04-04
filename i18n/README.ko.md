[English](../README.md) | **한국어**

# CerebraLOS

> **당신의 AI는 모든 것을 기억합니다. 그래서 당신을 이해하지 못합니다.**

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CerebraLOS는 AI 에이전트를 위한 Cognitive OS입니다. 하나의 두뇌를, 당신이 사용하는 모든 도구가 공유합니다 -- Claude Code, Codex, Cursor, Ollama, 그 외 무엇이든.

정리하라고 요구하지 않습니다. 설정하라고 요구하지 않습니다.
당신은 일합니다. 중요한 것을 기억합니다. 나머지는 잊습니다.

## 설치

```bash
npm install -g cerebralos
cerebralos init
```

이것으로 끝입니다. 이후에 기억해야 할 명령어는 없습니다.

- **터미널을 열면** → Morning Insight가 나타납니다
- **어떤 AI 도구로든 작업하면** → MCP를 통해 기억이 자동 저장됩니다
- **매일 새벽 3시** → 두뇌가 통합하고 꿈을 꿉니다

## 내부에서 일어나는 일

```
하루 종일 AI 도구로 작업합니다
        ↓
각 도구가 peripheral/에 기록합니다 (MCP 또는 CLI를 통해)
        ↓
새벽 3시, Sleep Job이 실행됩니다:
  1. Orient     — 모든 기억을 탐색합니다
  2. Gather     — 새로운 것을 찾습니다
  3. Consolidate — 날짜를 정리하고, 중복을 병합하고, 모순을 표시합니다
  4. Dream      — 당신의 생각 사이에서 하나의 조용한 연결을 찾습니다
  5. Prune      — 흐려진 것을 아카이브하고, 공간을 만듭니다
        ↓
다음 날 아침, 터미널을 열면:

────────────────────────────────────────────────
おはよう。昨日の仕事、あと少しのところで止まってる。

The Connection:
完成と公開の間にある、この小さなギャップが
一番見落としやすい。

A question to sit with:
「あと少し」を先に片付けるのと、
全体を先に書くの、どっちが今日の自分を軽くする？
────────────────────────────────────────────────
```

하나의 통찰. 열 개가 아닙니다. 요약이 아닙니다. 중요한 단 하나.

## AI 도구 연결 방법

CerebraLOS는 MCP를 사용합니다. MCP를 지원하는 모든 도구가 자동으로 기억을 읽고 쓸 수 있습니다.

```bash
# `cerebralos init` 중에 Claude Code용으로 이미 설정됩니다.
# 다른 도구의 경우, 해당 도구의 MCP 설정에 추가하세요:
{ "command": "cerebralos", "args": ["mcp"] }
```

사용 가능한 MCP 도구:

| 도구 | 기능 |
|------|------|
| `write_memory` | 통찰, 결정, 관찰을 저장합니다 |
| `search_memory` | 키워드로 관련 기억을 검색합니다 |
| `recall_context` | 개념에 대한 맥락을 회상합니다 |
| `list_dreams` | 최근 Morning Insight를 읽습니다 |

AI 도구들이 스스로 이것들을 호출합니다. 당신이 할 필요는 없습니다.

## 언어

Morning Insight는 당신의 언어로 말합니다. `~/.cerebralos/.brain/config.json`에서 한 번만 설정하세요:

```json
{
  "language": "ja"
}
```

LLM이 아는 모든 언어로 작동합니다.

## LLM 설정

CerebraLOS는 LLM을 자동 감지합니다. 환경에 API 키가 있으면 별도 설정이 필요 없습니다.

감지 순서: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama (localhost) → `llm`/`claude` CLI

명시적으로 설정하려면:

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514"
  }
}
```

제공자: `claude` | `openai` | `ollama` | `cli` | `auto` | `none`

LLM이 없어도 작동합니다 -- 다만 꿈이 단순해질 뿐입니다.

## 아키텍처

```
~/.cerebralos/
├── core/          장기 지식 (도구가 수정 불가)
├── peripheral/    AI 도구로부터의 최근 관찰 (휘발성)
├── dreams/        Sleep Job에서 생성된 Morning Insight
├── archive/       흐려진 기억 — 복구 가능, 삭제되지 않음
└── .brain/        설정 및 상태
```

- **core/** 는 당신입니다. 도구는 여기에 쓰지 않습니다.
- **peripheral/** 은 세계입니다. 도구가 자유롭게 기록합니다.
- **dreams/** 는 둘이 만나는 곳입니다, 하루에 한 번 밤에.
- 아무것도 삭제되지 않습니다. 아카이브될 뿐입니다.

## CLI 레퍼런스

대부분의 사용자는 이것들이 필요 없습니다. 디버깅이나 수동 사용을 위한 것입니다.

```bash
cerebralos init                  # 최초 설정 (셸 훅 + 야간 스케줄 + MCP)
cerebralos wake                  # 오늘의 Morning Insight 표시
cerebralos sleep                 # Sleep Job 수동 실행
cerebralos recall <query>        # 기억 검색
cerebralos write --from <src> --topic <t> --body <b>   # 기억 수동 작성
cerebralos mcp                   # MCP 서버 시작 (AI 도구가 호출)
```

## 설계 철학

CerebraLOS는 몇 가지 조용한 신념 위에 만들어졌습니다:

- **망각은 기능입니다.** 기억은 유용함이 증명되지 않으면 30일 후 소멸합니다. 이것은 데이터 손실이 아닙니다 -- 집중입니다.
- **하나면 충분합니다.** Sleep Job은 밤마다 열 개가 아닌 하나의 연결을 찾습니다. 요약이 필요하다면, 당신은 잘못된 도구를 쓰고 있는 것입니다.
- **사용자에게 묻지 않습니다.** 선택할 카테고리도, 추가할 태그도, 확인할 대시보드도 없습니다. 두뇌가 스스로 관리합니다.
- **도구는 바뀝니다. 두뇌는 남습니다.** Claude, GPT, Ollama, 다음에 무엇이 오든 -- 모두 같은 peripheral/에 기록합니다. Connector Layer가 적응합니다. 기억은 마이그레이션되지 않습니다.

## 문서

- [CONSTITUTION](docs/CONSTITUTION.md) — 4가지 근본 법칙
- [ARCHITECTURE](docs/ARCHITECTURE.md) — Triune Brain 모델
- [ZERO_UI](docs/ZERO_UI.md) — 보이지 않는 자동화
- [DESIGN_PRINCIPLES](docs/DESIGN_PRINCIPLES.md) — 코드 안의 철학
- [CONNECTORS](docs/CONNECTORS.md) — 도구 연결 방법

## 라이선스

MIT. [LICENSE](LICENSE)를 참조하세요.
