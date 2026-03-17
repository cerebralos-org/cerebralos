---
# Riferimento ai Comandi di CerebraLOS

> Riferimento rapido per tutti i comandi `cerebralos`.
> Per la documentazione concettuale, consulta [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Situazione → Comando

| Voglio... | Comando |
|-------------|---------|
| Iniziare per la prima volta | `cerebralos init` |
| Connettere Claude Code / Cursor | `cerebralos setup --auto` |
| Eseguire il consolidamento della memoria di questa notte | `cerebralos sleep` |
| Vedere l'intuizione di questa mattina | `cerebralos wake` |
| Trovare qualcosa che ricordo vagamente | `cerebralos recall "..."` |
| Sfogliare il mio cervello in modo interattivo | `cerebralos explore` |
| Importare vecchie conversazioni ChatGPT | `cerebralos import --from conversations.json` |
| Importare un vault di Obsidian | `cerebralos import --from ~/ObsidianVault` |
| Mostrare automaticamente l'intuizione all'apertura del terminale | `cerebralos hook` |
| Connettermi tramite MCP | `cerebralos mcp` |

---

## `cerebralos init`

Inizializza la tua directory cerebrale.

```bash
cerebralos init           # ~/.cerebralos/ (default)
cerebralos init --local   # ./.cerebralos/ nella directory corrente
```

**Crea:**
```
~/.cerebralos/
├── core/           Memorie a lungo termine (decisioni, identità, direttive)
├── peripheral/     Memorie a breve termine (contesto recente, note di sessione)
├── dreams/         Intuizioni sintetizzate dai Lavori di Sonno
└── archive/
    ├── compressed/ Memorie sbiadite — solo l'essenza, ancora richiamate
    └── frozen/     Memorie dormienti — non più richiamate
```

---

## `cerebralos sleep`

Esegui l'Oblio Attivo + Consolidamento dei Sogni.

```bash
cerebralos sleep
```

**Fase 1 — Oblio Attivo:**

| Età | Cosa succede |
|-----|-------------|
| 0–30 giorni | Rimane in `core/` o `peripheral/` — dettaglio completo |
| 30–90 giorni | Compresso in `archive/compressed/` — la LLM estrae l'essenza |
| 90+ giorni | Spostato in `archive/frozen/` — non più richiamato |

I file taggati `#pinned` sono protetti da ogni oblio.

**Fase 2 — Consolidamento dei Sogni:**
- Legge le memorie recenti
- Chiama la LLM per trovare connessioni non ovvie
- Salva il sogno in `dreams/YYYY-MM-DD.md`
- Aggiorna `dreams/latest.md` con l'Intuizione del Mattino

**Configurazione LLM** (`~/.cerebralos/.brain/config.json`):

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

**Provider supportati:** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

Mostra l'Intuizione del Mattino dal sogno della scorsa notte.

```bash
cerebralos wake
```

**Output:**
```
☀  Buongiorno. Ho ricordato qualcosa mentre dormivi.

  I due progetti che hai condotto in parallelo condividono lo stesso
  problema di fondo — il collo di bottiglia è il contesto, non il calcolo.

  (dal 2026-03-17 — esegui `cerebralos sleep` per sognare di nuovo)
```

Ritorna silenziosamente (Zero UI) se non esiste ancora alcun sogno.

---

## `cerebralos recall <query>`

Cerca nelle memorie utilizzando il completamento di pattern TF-IDF.

```bash
cerebralos recall "authentication architecture"
cerebralos recall "why we switched to postgres"
cerebralos recall "Q1 goals"
```

**Output:**
```
Richiamo: "architettura di autenticazione"...

  ✦ Qualcosa è emerso.

  1. core/auth-decisions.md
  ● 3 giorni fa
     Abbiamo scelto JWT rispetto alle sessioni perché...

  2. archive/compressed/old-auth-notes.md
  ◌ 2 mesi fa — sbiadito
     Discussione sulla riscrittura dell'autenticazione. Decisione chiave: token stateless...
```

**Livelli di memoria nei risultati:**
- `●` attivo — snippet completo (200 caratteri)
- `◌ faded` — snippet compresso (120 caratteri), il dettaglio è decaduto
- le memorie "frozen" non compaiono mai

---

## `cerebralos setup`

Connetti agenti AI al tuo cervello.

```bash
cerebralos setup                      # Mostra le regole da copiare e incollare
cerebralos setup --auto               # Scrive automaticamente a tutti gli agenti rilevati
cerebralos setup --agent claude-code  # Target di un agente
cerebralos setup --agent cursor --auto
```

**Rilevati automaticamente:** Claude Code, Cursor, Windsurf

**Cosa fa:**
- Genera regole di integrazione che istruiscono gli agenti a scrivere riepiloghi di sessione in `peripheral/`
- Con `--auto`: scrive direttamente nei file di configurazione degli agenti
  - Claude Code → `~/.claude/CLAUDE.md`
  - Cursor → `.cursorrules`
  - Windsurf → `.windsurfrules`
- Utilizza i marcatori `<!-- cerebralos-integration -->` — sicuro da rieseguire (aggiorna in loco, senza duplicati)

---

## `cerebralos import`

Importa memorie esterne in `peripheral/imported/`.

```bash
cerebralos import --from ~/Downloads/conversations.json   # Esportazione ChatGPT
cerebralos import --from ~/notes/decisions.md             # Singolo Markdown
cerebralos import --from ~/ObsidianVault                  # Intero vault
cerebralos import --from ./log.json --type chatgpt        # Forza il tipo
```

**Tipi rilevati automaticamente:**

| Estensione / Percorso | Rilevato come |
|-----------------|-------------|
| `.json` | `chatgpt` |
| `.md` | `markdown` |
| Directory | `folder` (importa tutti i `.md` ricorsivamente) |

Dopo l'importazione, esegui `cerebralos sleep` per integrare nel tuo cervello.

---

## `cerebralos hook`

Installa lo hook di shell Zero UI.

```bash
cerebralos hook
```

Aggiunge `cerebralos wake` a `~/.zshrc` o `~/.bashrc`.
Ogni nuova sessione del terminale mostrerà automaticamente la tua Intuizione del Mattino.

---

## `cerebralos mcp`

Avvia il server MCP per l'integrazione degli agenti AI.

```bash
cerebralos mcp   # Chiamato dall'host dell'agente, non direttamente
```

**Configurazione MCP:**
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

**Strumenti esposti:**

| Strumento | Descrizione |
|------|-------------|
| `search_memory(query)` | Cerca nella memoria centrale entità o concetti |
| `recall_context(query)` | Richiama il contesto completo di un'entità specifica |
| `write_memory(content, filename?)` | Scrivi una memoria in `peripheral/` |

`write_memory` è il modo in cui gli agenti connessi a MCP salvano i riepiloghi delle loro sessioni.
Se esiste un file con lo stesso nome, il contenuto viene aggiunto (non sovrascritto).

---

## `cerebralos explore`

Browser TUI interattivo.

```bash
cerebralos explore
```

Naviga con `↑↓`, seleziona con `Enter`, esci con `q`.

---

## Formato del file di memoria

Scrivi le memorie in Markdown. La struttura è flessibile, ma questo formato funziona bene:

```markdown
# Nome Progetto o Argomento
*2026-03-17*

## Cosa è successo
- Costruito il comando di setup di cerebralos
- Verificato che l'oblio a 2 fasi funziona correttamente

## Decisioni prese
- Utilizzare Gemini 2.5 Flash come provider LLM predefinito

## Domande aperte
- Le memorie "frozen" dovrebbero mai essere scongelate manualmente?
```

Salva in:
- `~/.cerebralos/core/` — per conoscenza a lungo termine e stabile
- `~/.cerebralos/peripheral/` — per contesto recente, note di sessione

Tagga con `#pinned` ovunque nel file per proteggerlo dall'oblio.
