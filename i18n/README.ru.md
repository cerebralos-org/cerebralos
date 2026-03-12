<div align="center">

# CerebraLOS

**Перестаньте сохранять. Начните запоминать.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![GitHub stars](https://img.shields.io/github/stars/cerebralos-org/cerebralos?style=social)](https://github.com/cerebralos-org/cerebralos/stargazers)

[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

Самая элегантная Когнитивная ОС для ИИ-агентов.  

Git-нативная, LLM-агностическая система памяти, которая избавляет от «одиночества» ИИ-взаимодействий.

[Прочитать Манифест](#manifesto) • [Быстрый старт](#quickstart) • [Архитектура](#architecture) • [Конституция](#constitution)

</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

---

## 🌌 Манифест: Почему PKM мертв
Мы потратили последнее десятилетие на создание инструментов для управления личными знаниями (PKM). Мы сохраняли все. Мы помечали все тегами. Мы связывали все.
И все же, мы ничего не помним.
Существующие системы — это мертвое хранилище. Они требуют от вас активного поиска, извлечения и организации. Когда вы взаимодействуете с ИИ-агентами сегодня, они страдают от того же недостатка: они забывают вас. Они теряют контекст. Они заставляют вас чувствовать себя *одинокими*.
**CerebraLOS — это не база данных. Это нервная система.**
Она не просто хранит информацию; она *помнит* ее. Она использует принципы человеческой нейронауки — завершение паттернов, активное забывание и консолидацию во сне — чтобы принести нужный контекст в нужный момент, без вашего запроса.
---

## ✨ Магия (Zero UI)
Вы ничего не делаете.
В 3:00 утра CerebraLOS бесшумно запускает Задачу Сна (Sleep Job).
Она мечтает. Она связывает ваши мысли. Она забывает шум.
Когда вы открываете свой терминал утром:
```bash
☀ Доброе утро. Пока вы спали, я прочитал мир для вас.
Я нашел одну вещь, которая связана с вашей вчерашней мыслью.
→ cerebralos explore
```
Вот и все. Никаких тегов. Никакой организации. Просто запоминание.
---

## 🧠 Основная архитектура
CerebraLOS построена на трех столпах когнитивной науки и японской философии (Дзен):

### 1. Контекстуальное Воспроизведение (Завершение Паттернов)
Подобно запаху кофе, возвращающему детские воспоминания, CerebraLOS использует сенсорные триггеры для восстановления полных контекстов из частичных входных данных.

### 2. Активное Забывание (Ма / 間)
Идеальная память — это проклятие. CerebraLOS активно забывает (архивирует) шум, оставляя «Ма» (негативное пространство) для воображения и новых связей.

### 3. Задача Сна (Консолидация Сновидений)
Пока вы спите, CerebraLOS объединяет ваши прямые взаимодействия (Core Memory) с тем, что ваши ИИ-агенты узнали автономно (Peripheral Memory), представляя вам одно, прекрасное озарение утром.
---

## 🚀 Быстрый старт

### Установка
```bash
npx cerebralos init
```

### Инициализация
```bash
cerebralos init
```
Это создает директорию `~/.cerebralos/`, ваш новый Git-нативный мозг.

### Интеграция (Micro-MCP)
CerebraLOS предоставляет минимальный MCP (Model Context Protocol) сервер. Подключите его к Claude, Cursor или Devin.
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
*Примечание: CerebraLOS разработан для чрезвычайно эффективного использования токенов. Он предоставляет только два инструмента: `search_memory` и `recall_context`.*
---

## 📂 Структура директорий
Ваш мозг — это просто файлы. Никакой привязки. Никаких скрытых баз данных.
```text
~/.cerebralos/
├── core/           # Ваши прямые взаимодействия и явные мысли
├── peripheral/     # Автономные воспоминания агентов (Web, Slack и т.д.)
├── dreams/         # Озарения, сгенерированные во время Задач Сна
└── archive/        # Активно забытые воспоминания (история Git сохраняет их)
```
---

## 📜 Конституция
CerebraLOS действует в соответствии со строгой Конституцией.
1. **Суверенитет Памяти**: Ваша память принадлежит вам. Она хранится локально.
2. **Право Забывать**: Система должна активно курировать и забывать.
3. **Элегантность превыше Исчерпываемости**: Лучше показать одну идеальную связь, чем десять посредственных.
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

## 🤝 Участие
Мы строим основу для Мозговой Федерации — сети взаимосвязанных, эмпатичных ИИ-агентов. Присоединяйтесь к нам.
Подробности см. в [CONTRIBUTING.md](CONTRIBUTING.md).
---
CerebraLOS — это не просто инструмент для вашего ИИ. Это общая нервная система. Где заканчиваетесь вы и начинается ИИ, будет прекрасно размыто.
---
<div align="center">
  <i>«Хозяин готовит все до прихода гостя, но никогда не говорит: „Посмотрите, что я для вас сделал“». — Сэн но Рикю</i>
</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)
