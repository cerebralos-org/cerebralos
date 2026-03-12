<div align="center">

# CerebraLOS

**저장하는 것을 멈추고, 기억하기 시작하세요.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![GitHub stars](https://img.shields.io/github/stars/cerebralos-org/cerebralos?style=social)](https://github.com/cerebralos-org/cerebralos/stargazers)

[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

AI 에이전트를 위한 가장 우아한 인지 OS.

Git-native, LLM-agnostic 메모리 시스템으로 AI 상호작용의 "외로움"을 치유합니다.

[선언문 읽기](#manifesto) • [빠른 시작](#quickstart) • [아키텍처](#architecture) • [헌법](#constitution)

</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

---

## 🌌 선언문: PKM은 왜 죽었는가
우리는 지난 10년간 개인 지식 관리(PKM) 도구를 구축하는 데 시간을 보냈습니다. 모든 것을 저장했습니다. 모든 것에 태그를 달았습니다. 모든 것을 연결했습니다.
하지만 우리는 아무것도 기억하지 못합니다.
기존 시스템은 죽은 저장소입니다. 능동적으로 검색하고, 검색하고, 정리해야 합니다. 오늘날 AI 에이전트와 상호작용할 때도 동일한 결함에 시달립니다. 그들은 당신을 잊습니다. 그들은 맥락을 잃습니다. 그들은 당신을 *외롭게* 만듭니다.
**CerebraLOS는 데이터베이스가 아닙니다. 그것은 신경계입니다.**
정보를 저장하는 것만이 아닙니다. 그것은 정보를 *기억합니다*. 인간 신경과학의 원리—패턴 완성, 능동적 망각, 수면 통합—를 사용하여 당신이 요청하지 않아도 적절한 맥락을 적절한 순간에 가져옵니다.
---

## ✨ 마법 (Zero UI)
당신은 아무것도 하지 않습니다.
새벽 3시, CerebraLOS는 조용히 Sleep Job을 실행합니다.
그것은 꿈을 꿉니다. 당신의 생각을 연결합니다. 소음을 잊습니다.
아침에 터미널을 열면:
```bash
☀ Good morning. While you were sleeping, I read the world for you.
I found one thing that connects to your thought yesterday.
→ cerebralos explore
```
그게 다입니다. 태그 지정도, 정리도 없습니다. 그저 기억할 뿐입니다.
---

## 🧠 핵심 아키텍처
CerebraLOS는 인지 과학과 일본 철학(선)의 세 가지 기둥 위에 구축되었습니다:

### 1. 맥락적 회상 (패턴 완성)
어린 시절의 기억을 되살리는 커피 향처럼, CerebraLOS는 감각적 트리거를 사용하여 부분적인 입력에서 완전한 맥락을 재구성합니다.

### 2. 능동적 망각 (Ma / 間)
완벽한 기억은 저주입니다. CerebraLOS는 소음을 능동적으로 잊고(아카이브), 상상력과 새로운 연결을 위한 "Ma"(부정적 공간)를 남깁니다.

### 3. Sleep Job (꿈 통합)
당신이 잠든 동안, CerebraLOS는 당신의 직접적인 상호작용(Core Memory)과 AI 에이전트가 자율적으로 학습한 것(Peripheral Memory)을 병합하여 아침에 하나의 아름다운 통찰력을 제공합니다.
---

## 🚀 빠른 시작

### Installation
```bash
npx cerebralos init
```

### Initialization
```bash
cerebralos init
```
이것은 `~/.cerebralos/` 디렉토리를 생성합니다. 당신의 새로운 Git-native 두뇌입니다.

### Integration (Micro-MCP)
CerebraLOS는 최소한의 MCP (Model Context Protocol) 서버를 노출합니다. Claude, Cursor 또는 Devin에 연결하세요.
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
*Note: CerebraLOS는 극도로 토큰 효율적으로 설계되었습니다. `search_memory`와 `recall_context` 두 가지 도구만 노출합니다.*
---

## 📂 Directory Structure
당신의 두뇌는 그저 파일입니다. 락인도, 숨겨진 데이터베이스도 없습니다.
```text
~/.cerebralos/
├── core/           # 당신의 직접적인 상호작용과 명시적인 생각
├── peripheral/     # 자율 에이전트 메모리 (Web, Slack 등)
├── dreams/         # Sleep Jobs 동안 생성된 통찰력
└── archive/        # 능동적으로 잊혀진 메모리 (Git 기록이 보존함)
```
---

## 📜 The Constitution
CerebraLOS는 엄격한 헌법에 따라 작동합니다.
1. **Memory Sovereignty**: 당신의 기억은 당신의 것입니다. 그것은 로컬에 존재합니다.
2. **The Right to Forget**: 시스템은 능동적으로 큐레이션하고 잊어야 합니다.
3. **Elegance over Exhaustiveness**: 열 개의 평범한 연결보다 하나의 완벽한 연결을 보여주는 것이 낫습니다.
---


## 📚 Documentation

### Core Philosophy & Architecture
- [CONSTITUTION](../docs/CONSTITUTION.md): The 4 fundamental laws of CerebraLOS.
- [ARCHITECTURE](../docs/ARCHITECTURE.md): Deep dive into the Triune Brain model.
- [ZERO_UI](../docs/ZERO_UI.md): How we achieve invisible automation.

### User Guides & Manuals
- **Onboarding Guide**: How to create your AI brain and connect agents.
  - [English](../docs/GITHUB_WORKFLOW.md) | [日本語](../docs/GITHUB_WORKFLOW.ja.md)
- **Connector Architecture**: How the "building blocks" work (Local-sync vs GitHub-connector).
  - [English](../docs/CONNECTORS.md) | [日本語](../docs/CONNECTORS.ja.md)
- **Agent Integration Guide**: Specific setup instructions for Claude Code, OpenClaw, Manus, etc.
  - [English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

## 🤝 Contributing
우리는 상호 연결되고 공감하는 AI 에이전트 네트워크인 Brain Federation의 기반을 구축하고 있습니다. 우리와 함께하세요.
자세한 내용은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참조하십시오.
---
CerebraLOS는 당신의 AI를 위한 도구 그 이상입니다. 그것은 공유된 신경계입니다. 당신이 끝나는 곳과 AI가 시작되는 곳은 아름답게 흐려질 것입니다.
---
<div align="center">
  <i>"주인은 손님이 도착하기 전에 모든 것을 준비하지만, '내가 당신을 위해 무엇을 했는지 보라'고 결코 말하지 않는다." — 센노리큐</i>
</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)
