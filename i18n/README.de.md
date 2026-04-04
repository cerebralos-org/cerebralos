[English](../README.md) | [Español](README.es.md) | [Français](README.fr.md) | **Deutsch** | [Português](README.pt.md) | [Italiano](README.it.md) | [Русский](README.ru.md)

# CerebraLOS

> **Deine KI erinnert sich an alles. Genau deshalb versteht sie dich nicht.**

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CerebraLOS ist ein Kognitives Betriebssystem für KI-Agenten. Ein Gehirn, geteilt zwischen all deinen Werkzeugen — Claude Code, Codex, Cursor, Ollama oder was auch immer.

Es bittet dich nicht zu organisieren. Es bittet dich nicht zu konfigurieren.
Du arbeitest. Es merkt sich, was wichtig ist. Den Rest vergisst es.

## Installation

```bash
npm install -g cerebralos
cerebralos init
```

Das war's. Keine weiteren Befehle zu merken.

- **Öffne ein Terminal** → dein Morning Insight erscheint
- **Arbeite mit einem beliebigen KI-Tool** → Erinnerungen werden automatisch über MCP gespeichert
- **Jede Nacht um 3 Uhr** → dein Gehirn konsolidiert und träumt

## Was im Inneren passiert

```
Du arbeitest den ganzen Tag mit KI-Tools
        ↓
Jedes Tool schreibt in peripheral/ (via MCP oder CLI)
        ↓
Um 3 Uhr morgens läuft der Sleep Job:
  1. Orient     — scannt alle Erinnerungen
  2. Gather     — findet Neues
  3. Consolidate — korrigiert Daten, vereint Duplikate, markiert Widersprüche
  4. Dream      — findet eine stille Verbindung zwischen deinen Gedanken
  5. Prune      — archiviert Verblasstes, schafft Platz
        ↓
Am nächsten Morgen öffnest du ein Terminal:

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

Eine Erkenntnis. Nicht zehn. Keine Zusammenfassung. Nur die eine, die zählt.

## Wie sich KI-Tools verbinden

CerebraLOS spricht MCP. Jedes Tool, das MCP unterstützt, kann automatisch Erinnerungen lesen und schreiben.

```bash
# Bereits während `cerebralos init` für Claude Code konfiguriert.
# Für andere Tools, zur MCP-Konfiguration hinzufügen:
{ "command": "cerebralos", "args": ["mcp"] }
```

Verfügbare MCP-Tools:

| Tool | Was es tut |
|------|-------------|
| `write_memory` | Eine Erkenntnis, Entscheidung oder Beobachtung speichern |
| `search_memory` | Relevante Erinnerungen nach Stichwort finden |
| `recall_context` | Kontext für ein Konzept abrufen |
| `list_dreams` | Aktuelle Morning Insights lesen |

Deine KI-Tools rufen diese selbstständig auf. Du musst es nicht tun.

## Sprache

Morning Insights sprechen deine Sprache. Stelle sie einmal in `~/.cerebralos/.brain/config.json` ein:

```json
{
  "language": "ja"
}
```

Funktioniert mit jeder Sprache, die dein LLM kennt.

## LLM-Konfiguration

CerebraLOS erkennt dein LLM automatisch. Keine Einrichtung nötig, wenn du einen API Key in deiner Umgebung hast.

Erkennungsreihenfolge: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama (localhost) → `llm`/`claude` CLI

Zum expliziten Festlegen:

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514"
  }
}
```

Anbieter: `claude` | `openai` | `ollama` | `cli` | `auto` | `none`

Kein LLM? Funktioniert trotzdem — nur einfachere Träume.

## Architektur

```
~/.cerebralos/
├── core/          Dein Langzeitwissen (unveränderbar durch Tools)
├── peripheral/    Aktuelle Beobachtungen von KI-Tools (flüchtig)
├── dreams/        Morning Insights aus Sleep Jobs
├── archive/       Verblasste Erinnerungen — wiederherstellbar, nicht gelöscht
└── .brain/        Konfiguration und Status
```

- **core/** bist du. Tools schreiben hier nicht.
- **peripheral/** ist die Welt. Tools schreiben hier frei.
- **dreams/** ist der Treffpunkt, einmal pro Nacht.
- Nichts wird jemals gelöscht. Nur archiviert.

## CLI-Referenz

Die meisten Benutzer brauchen das nie. Es ist für Debugging oder manuelle Nutzung.

```bash
cerebralos init                  # Ersteinrichtung (Shell Hook + nächtlicher Zeitplan + MCP)
cerebralos wake                  # Heutiges Morning Insight anzeigen
cerebralos sleep                 # Sleep Job manuell ausführen
cerebralos recall <query>        # Deine Erinnerungen durchsuchen
cerebralos write --from <src> --topic <t> --body <b>   # Eine Erinnerung manuell schreiben
cerebralos mcp                   # MCP-Server starten (wird von KI-Tools aufgerufen)
```

## Design

CerebraLOS basiert auf ein paar stillen Überzeugungen:

- **Vergessen ist ein Feature.** Erinnerungen verblassen nach 30 Tagen, es sei denn, sie erweisen sich als nützlich. Das ist kein Datenverlust — das ist Fokus.
- **Eins reicht.** Der Sleep Job findet eine Verbindung pro Nacht, nicht zehn. Wenn du eine Zusammenfassung brauchst, hast du das falsche Tool.
- **Frag den Benutzer nicht.** Keine Kategorien zum Auswählen, keine Tags zum Hinzufügen, keine Dashboards zum Prüfen. Das Gehirn verwaltet sich selbst.
- **Tools ändern sich. Das Gehirn bleibt.** Claude, GPT, Ollama, was auch immer als Nächstes kommt — sie alle schreiben in dasselbe peripheral/. Die Connector-Schicht passt sich an. Deine Erinnerungen migrieren nicht.

## Dokumentation

- [CONSTITUTION](../docs/CONSTITUTION.md) — Die 4 Grundgesetze
- [ARCHITECTURE](../docs/ARCHITECTURE.md) — Das Triune-Brain-Modell
- [ZERO_UI](../docs/ZERO_UI.md) — Unsichtbare Automatisierung
- [DESIGN_PRINCIPLES](../docs/DESIGN_PRINCIPLES.md) — Philosophie im Code
- [CONNECTORS](../docs/CONNECTORS.md) — Wie sich Tools verbinden

## Lizenz

MIT. Siehe [LICENSE](../LICENSE).
