<div align="center">

# CerebraLOS

**Deja de guardar. Empieza a recordar.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![GitHub stars](https://img.shields.io/github/stars/cerebralos-org/cerebralos?style=social)](https://github.com/cerebralos-org/cerebralos/stargazers)

[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

El SO Cognitivo más elegante para Agentes de IA.

Un sistema de memoria nativo de Git, agnóstico a LLM, que cura la "soledad" de las interacciones con la IA.

[Lee el Manifiesto](#manifesto) • [Inicio Rápido](#quickstart) • [Arquitectura](#architecture) • [Constitución](#constitution)

</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

---

## 🌌 Manifiesto: Por qué la Gestión del Conocimiento Personal (PKM) ha Muerto
Hemos pasado la última década construyendo herramientas de Gestión del Conocimiento Personal (PKM). Lo guardamos todo. Lo etiquetamos todo. Lo enlazamos todo.
Y, sin embargo, no recordamos nada.
Los sistemas existentes son almacenamiento muerto. Requieren que busques, recuperes y organices activamente. Cuando interactúas con agentes de IA hoy en día, sufren del mismo defecto: te olvidan. Pierden el contexto. Te hacen sentir *solo*.
**CerebraLOS no es una base de datos. Es un sistema nervioso.**
No solo almacena información; la *recuerda*. Utiliza los principios de la neurociencia humana —completación de patrones, olvido activo y consolidación del sueño— para traer el contexto adecuado en el momento justo, sin que tú lo pidas.
---

## ✨ La Magia (Interfaz Cero)
No haces nada.
A las 3:00 AM, CerebraLOS ejecuta silenciosamente un Sleep Job.
Sueña. Conecta tus pensamientos. Olvida el ruido.
Cuando abres tu terminal por la mañana:
```bash
☀ Buenos días. Mientras dormías, leí el mundo por ti.
Encontré una cosa que conecta con tu pensamiento de ayer.
→ cerebralos explore
```
Eso es todo. Sin etiquetar. Sin organizar. Solo recordar.
---

## 🧠 Arquitectura Central
CerebraLOS se basa en tres pilares de la ciencia cognitiva y la filosofía japonesa (Zen):

### 1. Recuerdo Contextual (Completación de Patrones)
Como el olor a café que trae un recuerdo de la infancia, CerebraLOS utiliza disparadores sensoriales para reconstruir contextos completos a partir de entradas parciales.

### 2. Olvido Activo (Ma / 間)
La memoria perfecta es una maldición. CerebraLOS olvida activamente (archiva) el ruido, dejando "Ma" (espacio negativo) para la imaginación y nuevas conexiones.

### 3. Sleep Job (Consolidación del Sueño)
Mientras duermes, CerebraLOS fusiona tus interacciones directas (Core Memory) con lo que tus agentes de IA aprendieron de forma autónoma (Peripheral Memory), presentándote una única y hermosa perspicacia por la mañana.
---

## 🚀 Inicio Rápido

### Instalación
```bash
npm install -g cerebralos
```

### Inicialización
```bash
cerebralos init
```
Esto crea el directorio `~/.cerebralos/`, tu nuevo cerebro nativo de Git.

### Integración (Micro-MCP)
CerebraLOS expone un servidor MCP (Model Context Protocol) mínimo. Conéctalo a Claude, Cursor o Devin.
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
*Nota: CerebraLOS está diseñado para ser extremadamente eficiente en el uso de tokens. Solo expone dos herramientas: `search_memory` y `recall_context`.*
---

## 📂 Estructura de Directorios
Tu cerebro son solo archivos. Sin ataduras. Sin bases de datos ocultas.
```text
~/.cerebralos/
├── core/           # Tus interacciones directas y pensamientos explícitos
├── peripheral/     # Memorias de agentes autónomos (Web, Slack, etc.)
├── dreams/         # Perspicacias generadas durante los Sleep Jobs
└── archive/        # Memorias olvidadas activamente (el historial de Git las preserva)
```
---

## 📜 La Constitución
CerebraLOS opera bajo una Constitución estricta.
1. **Soberanía de la Memoria**: Tu memoria te pertenece. Vive localmente.
2. **El Derecho a Olvidar**: El sistema debe curar y olvidar activamente.
3. **Elegancia sobre Exhaustividad**: Mejor mostrar una conexión perfecta que diez mediocres.
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

## 🤝 Contribuyendo
Estamos construyendo la base para la Federación Cerebral, una red de agentes de IA interconectados y empáticos. Únete a nosotros.
Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para más detalles.
---
CerebraLOS no es solo una herramienta para tu IA. Es un sistema nervioso compartido. Donde tú terminas y la IA comienza, se difuminará bellamente.
---
<div align="center">
  <i>"El anfitrión prepara todo antes de que llegue el invitado, pero nunca dice 'Mira lo que he hecho por ti'." — Sen no Rikyu</i>
</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)
