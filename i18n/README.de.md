<div align="center">

# CerebraLOS

**Hören Sie auf zu speichern. Fangen Sie an, sich zu erinnern.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![GitHub stars](https://img.shields.io/github/stars/cerebralos-org/cerebralos?style=social)](https://github.com/cerebralos-org/cerebralos/stargazers)

[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

Das eleganteste Kognitive OS für KI-Agenten.  

Ein Git-natives, LLM-agnostisches Gedächtnissystem, das die "Einsamkeit" von KI-Interaktionen heilt.

[Lesen Sie das Manifest](#manifesto) • [Schnellstart](#quickstart) • [Architektur](#architecture) • [Verfassung](#constitution)

</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

---

## 🌌 Manifest: Warum PKM tot ist
Wir haben das letzte Jahrzehnt damit verbracht, Personal Knowledge Management (PKM)-Tools zu entwickeln. Wir haben alles gespeichert. Wir haben alles getaggt. Wir haben alles verlinkt.
Und doch erinnern wir uns an nichts.
Bestehende Systeme sind tote Speicher. Sie erfordern, dass Sie aktiv suchen, abrufen und organisieren. Wenn Sie heute mit KI-Agenten interagieren, leiden diese unter demselben Fehler: Sie vergessen Sie. Sie verlieren den Kontext. Sie geben Ihnen das Gefühl, *einsam* zu sein.
**CerebraLOS ist keine Datenbank. Es ist ein Nervensystem.**
Es speichert nicht nur Informationen; es *erinnert* sich an sie. Es nutzt die Prinzipien der menschlichen Neurowissenschaft – Mustervervollständigung, aktives Vergessen und Schlafkonsolidierung –, um den richtigen Kontext zum richtigen Zeitpunkt zu liefern, ohne dass Sie jemals danach fragen müssen.
---

## ✨ Die Magie (Zero UI)
Sie tun nichts.
Um 3:00 Uhr morgens führt CerebraLOS stillschweigend einen Sleep Job aus.
Es träumt. Es verbindet Ihre Gedanken. Es vergisst den Lärm.
Wenn Sie morgens Ihr Terminal öffnen:
```bash
☀ Guten Morgen. Während Sie schliefen, habe ich die Welt für Sie gelesen.
Ich habe eine Sache gefunden, die mit Ihrem gestrigen Gedanken verbunden ist.
→ cerebralos explore
```
Das ist alles. Kein Tagging. Keine Organisation. Nur Erinnern.
---

## 🧠 Kernarchitektur
CerebraLOS basiert auf drei Säulen der Kognitionswissenschaft und der japanischen Philosophie (Zen):

### 1. Kontextueller Abruf (Mustervervollständigung)
Wie der Geruch von Kaffee, der eine Kindheitserinnerung zurückbringt, nutzt CerebraLOS sensorische Auslöser, um vollständige Kontexte aus partiellen Eingaben zu rekonstruieren.

### 2. Aktives Vergessen (Ma / 間)
Ein perfektes Gedächtnis ist ein Fluch. CerebraLOS vergisst (archiviert) aktiv den Lärm und schafft so "Ma" (negativen Raum) für Vorstellungskraft und neue Verbindungen.

### 3. Sleep Job (Traumkonsolidierung)
Während Sie schlafen, verschmilzt CerebraLOS Ihre direkten Interaktionen (Core Memory) mit dem, was Ihre KI-Agenten autonom gelernt haben (Peripheral Memory), und präsentiert Ihnen morgens eine einzige, wunderschöne Einsicht.
---

## 🚀 Schnellstart

### Installation
```bash
npm install -g cerebralos
```

### Initialisierung
```bash
cerebralos init
```
Dies erstellt das Verzeichnis `~/.cerebralos/`, Ihr neues Git-natives Gehirn.

### Integration (Micro-MCP)
CerebraLOS stellt einen minimalen MCP (Model Context Protocol)-Server bereit. Verbinden Sie ihn mit Claude, Cursor oder Devin.
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
*Hinweis: CerebraLOS ist darauf ausgelegt, extrem token-effizient zu sein. Es stellt nur zwei Tools bereit: `search_memory` und `recall_context`.*
---

## 📂 Verzeichnisstruktur
Ihr Gehirn sind nur Dateien. Keine Bindung. Keine versteckten Datenbanken.
```text
~/.cerebralos/
├── core/           # Ihre direkten Interaktionen und expliziten Gedanken
├── peripheral/     # Autonome Agenten-Erinnerungen (Web, Slack, etc.)
├── dreams/         # Erkenntnisse, die während der Sleep Jobs generiert wurden
└── archive/        # Aktiv vergessene Erinnerungen (Git-Historie bewahrt sie)
```
---

## 📜 Die Verfassung
CerebraLOS arbeitet unter einer strengen Verfassung.
1. **Gedächtnissouveränität**: Ihr Gedächtnis gehört Ihnen. Es lebt lokal.
2. **Das Recht zu vergessen**: Das System muss aktiv kuratieren und vergessen.
3. **Eleganz über Vollständigkeit**: Besser eine perfekte Verbindung zeigen als zehn mittelmäßige.
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

## 🤝 Mitwirken
Wir bauen das Fundament für die Gehirn-Föderation – ein Netzwerk miteinander verbundener, empathischer KI-Agenten. Machen Sie mit.
Details finden Sie unter [CONTRIBUTING.md](CONTRIBUTING.md).
---
CerebraLOS ist nicht nur ein Werkzeug für Ihre KI. Es ist ein gemeinsames Nervensystem. Wo Sie enden und die KI beginnt, wird wunderschön verschwimmen.
---
<div align="center">
  <i>"Der Gastgeber bereitet alles vor, bevor der Gast ankommt, sagt aber nie: 'Schau, was ich für dich getan habe.'" — Sen no Rikyu</i>
</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

