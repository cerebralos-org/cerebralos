# CerebraLOS 명령어 레퍼런스

> 모든 `cerebralos` 명령어에 대한 빠른 참조입니다.
> 개념적인 문서는 [ARCHITECTURE.md](ARCHITECTURE.md)를 참조하세요.

---

## 상황 → 명령어

| 내가 원하는 작업... | 명령어 |
|-------------|---------|
| 처음 시작 | `cerebralos init` |
| Claude Code / Cursor 연결 | `cerebralos setup --auto` |
| 오늘 밤의 기억 통합 실행 | `cerebralos sleep` |
| 오늘 아침의 통찰 보기 | `cerebralos wake` |
| 어렴풋이 기억나는 것을 찾기 | `cerebralos recall "..."` |
| 내 뇌를 대화형으로 탐색 | `cerebralos explore` |
| 오래된 ChatGPT 대화 가져오기 | `cerebralos import --from conversations.json` |
| Obsidian 볼트 가져오기 | `cerebralos import --from ~/ObsidianVault` |
| 터미널 열 때 통찰 자동 표시 | `cerebralos hook` |
| MCP를 통해 연결 | `cerebralos mcp` |

---

## `cerebralos init`

뇌 디렉토리를 초기화합니다.

```bash
cerebralos init           # ~/.cerebralos/ (기본값)
cerebralos init --local   # 현재 디렉토리의 ./.cerebralos/
```

**생성 내용:**
```
~/.cerebralos/
├── core/           장기 기억 (결정, 정체성, 지시)
├── peripheral/     단기 기억 (최근 맥락, 세션 노트)
├── dreams/         Sleep Jobs에서 종합된 통찰
└── archive/
    ├── compressed/ 희미해진 기억 — 요점만, 여전히 회상 가능
    └── frozen/     휴면 기억 — 더 이상 회상되지 않음
```

---

## `cerebralos sleep`

능동적 망각 + 꿈 통합을 실행합니다.

```bash
cerebralos sleep
```

**1단계 — 능동적 망각:**

| 기간 | 발생 내용 |
|-----|-------------|
| 0–30일 | `core/` 또는 `peripheral/`에 유지 — 전체 세부 정보 |
| 30–90일 | `archive/compressed/`로 압축 — LLM이 요점 추출 |
| 90+일 | `archive/frozen/`으로 이동 — 더 이상 회상되지 않음 |

`#pinned` 태그가 있는 파일은 모든 망각으로부터 보호됩니다.

**2단계 — 꿈 통합:**
- 최근 기억을 읽습니다.
- LLM을 호출하여 명확하지 않은 연결을 찾습니다.
- `dreams/YYYY-MM-DD.md`에 꿈을 저장합니다.
- `dreams/latest.md`를 Morning Insight로 업데이트합니다.

**LLM 설정** (`~/.cerebralos/.brain/config.json`):

```json
{
  "llm": {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "api_key_env": "GEMINI_API_KEY"
  },
  "active_forgetting": {
    "compress_threshold_days": 30,
    "freeze_threshold_days": 90,
    "protected_tags": ["pinned", "project"]
  }
}
```

**지원되는 제공자:** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

지난 밤 꿈에서 얻은 Morning Insight를 보여줍니다.

```bash
cerebralos wake
```

**출력:**
```
☀  좋은 아침입니다. 주무시는 동안 뭔가 기억났습니다.

  두 개의 병렬 프로젝트는 동일한
  근본적인 문제를 공유합니다 — 계산이 아닌, 컨텍스트가 병목 현상입니다.

  (2026-03-17일자 — 다시 꿈을 꾸려면 `cerebralos sleep`을 실행하세요)
```

아직 꿈이 존재하지 않으면 아무것도 출력하지 않습니다 (Zero UI).

---

## `cerebralos recall <query>`

TF-IDF 패턴 완성을 사용하여 기억을 검색합니다.

```bash
cerebralos recall "authentication architecture"
cerebralos recall "why we switched to postgres"
cerebralos recall "Q1 goals"
```

**출력:**
```
Recalling: "authentication architecture"...

  ✦ 무언가 떠올랐습니다.

  1. core/auth-decisions.md
  ● 3일 전
     우리는 세션 대신 JWT를 선택했습니다. 왜냐하면...

  2. archive/compressed/old-auth-notes.md
  ◌ 2개월 전 — 희미함
     인증 재작성 논의. 핵심 결정: 스테이트리스 토큰...
```

**결과 내 기억 계층:**
- `●` active — 전체 스니펫 (200자)
- `◌ faded` — 압축된 스니펫 (120자), 세부 정보는 소실됨
- frozen memories는 절대로 나타나지 않습니다.

---

## `cerebralos setup`

AI 에이전트를 당신의 뇌에 연결합니다.

```bash
cerebralos setup                      # 복사-붙여넣기 규칙을 보여줍니다
cerebralos setup --auto               # 감지된 모든 에이전트에 자동으로 기록
cerebralos setup --agent claude-code  # 특정 에이전트 지정
cerebralos setup --agent cursor --auto
```

**자동 감지 대상:** Claude Code, Cursor, Windsurf

**작업 내용:**
- 에이전트에게 세션 요약을 `peripheral/`에 작성하도록 지시하는 통합 규칙을 생성합니다.
- `--auto` 옵션 사용 시: 에이전트 설정 파일에 직접 작성합니다.
  - Claude Code → `~/.claude/CLAUDE.md`
  - Cursor → `.cursorrules`
  - Windsurf → `.windsurfrules`
- `<!-- cerebralos-integration -->` 마커를 사용합니다 — 다시 실행해도 안전합니다 (제자리에서 업데이트, 중복 없음).

---

## `cerebralos import`

외부 기억을 `peripheral/imported/`로 가져옵니다.

```bash
cerebralos import --from ~/Downloads/conversations.json   # ChatGPT 내보내기
cerebralos import --from ~/notes/decisions.md             # 단일 Markdown
cerebralos import --from ~/ObsidianVault                  # 전체 볼트
cerebralos import --from ./log.json --type chatgpt        # 강제로 타입 지정
```

**자동 감지되는 타입:**

| 확장자 / 경로 | 감지된 타입 |
|-----------------|-------------|
| `.json` | `chatgpt` |
| `.md` | `markdown` |
| 디렉토리 | `folder` (모든 `.md` 파일을 재귀적으로 가져옴) |

가져온 후, `cerebralos sleep`을 실행하여 뇌에 통합하세요.

---

## `cerebralos hook`

Zero UI 셸 훅을 설치합니다.

```bash
cerebralos hook
```

`cerebralos wake`를 `~/.zshrc` 또는 `~/.bashrc`에 추가합니다.
모든 새 터미널 세션은 자동으로 Morning Insight를 보여줄 것입니다.

---

## `cerebralos mcp`

AI 에이전트 통합을 위한 MCP 서버를 시작합니다.

```bash
cerebralos mcp   # 에이전트 호스트에 의해 호출되며, 직접 호출되지 않음
```

**MCP 설정:**
```json
{
  "mcpServers": {
    "cerebralos": {
      "command": "cerebralos",
      "args": ["mcp"]
    }
  }
}
```

**노출된 도구:**

| 도구 | 설명 |
|------|-------------|
| `search_memory(query)` | 핵심 기억에서 개체 또는 개념을 검색 |
| `recall_context(query)` | 특정 개체의 전체 컨텍스트를 회상 |
| `write_memory(content, filename?)` | `peripheral/`에 기억을 작성 |

`write_memory`는 MCP에 연결된 에이전트가 세션 요약을 저장하는 방식입니다.
같은 이름의 파일이 존재하면 내용이 추가됩니다 (덮어쓰지 않음).

---

## `cerebralos explore`

대화형 TUI 브라우저입니다.

```bash
cerebralos explore
```

`↑↓`로 탐색하고, `Enter`로 선택하고, `q`로 종료합니다.

---

## 기억 파일 형식

기억은 Markdown으로 작성합니다. 구조는 유연하지만 다음 형식이 잘 작동합니다.

```markdown
# 프로젝트 이름 또는 주제
*2026-03-17*

## 발생한 일
- cerebralos setup 명령어 구축
- 2단계 망각이 올바르게 작동하는지 확인

## 내린 결정
- Gemini 2.5 Flash를 기본 LLM 제공자로 사용하기로 결정

## 미해결 질문
- 냉동된 기억을 수동으로 해동해야 하는가?
```

저장 위치:
- `~/.cerebralos/core/` — 장기적이고 안정적인 지식용
- `~/.cerebralos/peripheral/` — 최근 컨텍스트, 세션 노트용

파일 내 어디든 `#pinned` 태그를 지정하여 망각으로부터 보호하세요.
