# CerebraLOS Befehlsreferenz

> Kurzübersicht aller `cerebralos`-Befehle.
> Für konzeptionelle Dokumente siehe [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Situation → Befehl

| Ich möchte... | Command |
|-------------|---------|
| Zum ersten Mal starten | `cerebralos init` |
| Claude Code / Cursor verbinden | `cerebralos setup --auto` |
| Die Gedächtniskonsolidierung für heute Nacht ausführen | `cerebralos sleep` |
| Die Einsicht von heute Morgen sehen | `cerebralos wake` |
| Etwas finden, woran ich mich vage erinnere | `cerebralos recall "..."` |
| Mein Gehirn interaktiv durchsuchen | `cerebralos explore` |
| Alte ChatGPT-Konversationen importieren | `cerebralos import --from conversations.json` |
| Ein Obsidian-Vault importieren | `cerebralos import --from ~/ObsidianVault` |
| Einsicht beim Öffnen des Terminals automatisch anzeigen | `cerebralos hook` |
| Über MCP verbinden | `cerebralos mcp` |

---

## `cerebralos init`

Ihr Gehirn-Verzeichnis initialisieren.

```bash
cerebralos init           # ~/.cerebralos/ (default)
cerebralos init --local   # ./.cerebralos/ in current directory
```

**Erstellt:**
```
~/.cerebralos/
├── core/           Langzeitgedächtnis (Entscheidungen, Identität, Direktiven)
├── peripheral/     Kurzzeitgedächtnis (aktueller Kontext, Sitzungsnotizen)
├── dreams/         Synthetisierte Einsichten aus Sleep-Jobs
└── archive/
    ├── compressed/ Verblasste Erinnerungen – nur der Kern, noch abrufbar
    └── frozen/     Ruhende Erinnerungen – nicht mehr abrufbar
```

---

## `cerebralos sleep`

Aktives Vergessen + Traumkonsolidierung ausführen.

```bash
cerebralos sleep
```

**Phase 1 — Aktives Vergessen:**

| Alter | Was passiert |
|-----|-------------|
| 0–30 Tage | Bleibt in `core/` oder `peripheral/` – vollständige Details |
| 30–90 Tage | Wird zu `archive/compressed/` komprimiert – LLM extrahiert den Kern |
| 90+ Tage | Wird nach `archive/frozen/` verschoben – nicht mehr abrufbar |

Dateien mit dem Tag `#pinned` sind vor jeglichem Vergessen geschützt.

**Phase 2 — Traumkonsolidierung:**
- Liest aktuelle Erinnerungen
- Ruft LLM auf, um nicht-offensichtliche Verbindungen zu finden
- Speichert den Traum in `dreams/JJJJ-MM-TT.md`
- Aktualisiert `dreams/latest.md` mit der Morgeneinsicht

**LLM-Konfiguration** (`~/.cerebralos/.brain/config.json`):

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

**Unterstützte Anbieter:** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

Zeigt die Morgeneinsicht vom Traum der letzten Nacht an.

```bash
cerebralos wake
```

**Ausgabe:**
```
☀  Good morning. I remembered something while you slept.

  The two projects you've been running in parallel share the same
  underlying problem — context, not compute, is the bottleneck.

  (from 2026-03-17 — run `cerebralos sleep` to dream again)
```

Kehrt stillschweigend (Zero UI) zurück, wenn noch kein Traum existiert.

---

## `cerebralos recall <query>`

Erinnerungen mit TF-IDF-Musterergänzung durchsuchen.

```bash
cerebralos recall "authentication architecture"
cerebralos recall "why we switched to postgres"
cerebralos recall "Q1 goals"
```

**Ausgabe:**
```
Recalling: "authentication architecture"...

  ✦ Something surfaced.

  1. core/auth-decisions.md
  ● vor 3 Tagen
     We chose JWT over sessions because...

  2. archive/compressed/old-auth-notes.md
  ◌ vor 2 Monaten — verblasst
     Auth rewrite discussion. Key decision: stateless tokens...
```

**Gedächtnisschichten in den Ergebnissen:**
- `●` aktiv — vollständiger Schnipsel (200 Zeichen)
- `◌ verblasst` — komprimierter Schnipsel (120 Zeichen), Details sind verfallen
- eingefrorene Erinnerungen erscheinen nie

---

## `cerebralos setup`

KI-Agenten mit Ihrem Gehirn verbinden.

```bash
cerebralos setup                      # Show rules to copy-paste
cerebralos setup --auto               # Auto-write to all detected agents
cerebralos setup --agent claude-code  # Target one agent
cerebralos setup --agent cursor --auto
```

**Automatisch erkannt:** Claude Code, Cursor, Windsurf

**Was es tut:**
- Generiert Integrationsregeln, die Agenten anweisen, Sitzungszusammenfassungen in `peripheral/` zu schreiben
- Mit `--auto`: schreibt direkt in die Konfigurationsdateien des Agenten
  - Claude Code → `~/.claude/CLAUDE.md`
  - Cursor → `.cursorrules`
  - Windsurf → `.windsurfrules`
- Verwendet `<!-- cerebralos-integration -->`-Marker — sicher zum erneuten Ausführen (aktualisiert an Ort und Stelle, keine Duplikate)

---

## `cerebralos import`

Externe Erinnerungen in `peripheral/imported/` importieren.

```bash
cerebralos import --from ~/Downloads/conversations.json   # ChatGPT-Export
cerebralos import --from ~/notes/decisions.md             # Einzelnes Markdown
cerebralos import --from ~/ObsidianVault                  # Gesamter Vault
cerebralos import --from ./log.json --type chatgpt        # Typ erzwingen
```

**Automatisch erkannte Typen:**

| Extension / Pfad | Erkannt als |
|-----------------|-------------|
| `.json` | `chatgpt` |
| `.md` | `markdown` |
| Verzeichnis | `folder` (importiert alle `.md`-Dateien rekursiv) |

Nach dem Import führen Sie `cerebralos sleep` aus, um die Daten in Ihr Gehirn zu integrieren.

---

## `cerebralos hook`

Zero UI Shell-Hook installieren.

```bash
cerebralos hook
```

Fügt `cerebralos wake` an `~/.zshrc` oder `~/.bashrc` an.
Jede neue Terminalsitzung zeigt Ihre Morgeneinsicht automatisch an.

---

## `cerebralos mcp`

Startet den MCP-Server für die KI-Agenten-Integration.

```bash
cerebralos mcp   # Called by agent host, not directly
```

**MCP-Konfiguration:**
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

**Verfügbare Tools:**

| Tool | Beschreibung |
|------|-------------|
| `search_memory(query)` | Kernspeicher nach Entitäten oder Konzepten durchsuchen |
| `recall_context(query)` | Vollständigen Kontext einer bestimmten Entität abrufen |
| `write_memory(content, filename?)` | Eine Erinnerung in `peripheral/` schreiben |

`write_memory` ist die Methode, mit der MCP-verbundene Agenten ihre Sitzungszusammenfassungen speichern.
Wenn eine Datei mit demselben Namen existiert, wird der Inhalt angehängt (nicht überschrieben).

---

## `cerebralos explore`

Interaktiver TUI-Browser.

```bash
cerebralos explore
```

Navigieren Sie mit `↑↓`, wählen Sie mit `Enter` aus, beenden Sie mit `q`.

---

## Memory file format

Erinnerungen in Markdown schreiben. Die Struktur ist flexibel, aber dieses Format funktioniert gut:

```markdown
# Projektname oder Thema
*2026-03-17*

## Was geschah
- Den cerebralos setup-Befehl erstellt
- Überprüft, ob das 2-Phasen-Vergessen korrekt funktioniert

## Getroffene Entscheidungen
- Gemini 2.5 Flash als Standard-LLM-Anbieter verwenden

## Offene Fragen
- Sollten eingefrorene Erinnerungen jemals manuell aufgetaut werden?
```

Speichern unter:
- `~/.cerebralos/core/` — für langfristiges, stabiles Wissen
- `~/.cerebralos/peripheral/` — für aktuellen Kontext, Sitzungsnotizen

Taggen Sie die Datei mit `#pinned` an beliebiger Stelle, um sie vor dem Vergessen zu schützen.
