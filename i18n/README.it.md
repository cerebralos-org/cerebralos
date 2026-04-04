[English](../README.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | **Italiano** | [Русский](README.ru.md)

# CerebraLOS

> **La tua IA ricorda tutto. Ecco perché non ti capisce.**

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CerebraLOS è un Sistema Operativo Cognitivo per agenti IA. Un cervello, condiviso tra tutti gli strumenti che usi — Claude Code, Codex, Cursor, Ollama, o qualsiasi altro.

Non ti chiede di organizzare. Non ti chiede di configurare.
Tu lavori. Lui ricorda ciò che conta. Dimentica il resto.

## Installazione

```bash
npm install -g cerebralos
cerebralos init
```

Tutto qui. Nessun comando da ricordare dopo questo.

- **Apri un terminale** → il tuo Morning Insight appare
- **Lavora con qualsiasi strumento IA** → i ricordi vengono salvati automaticamente via MCP
- **Ogni notte alle 3** → il tuo cervello consolida e sogna

## Cosa succede all'interno

```
Lavori con strumenti IA durante il giorno
        ↓
Ogni strumento scrive in peripheral/ (via MCP o CLI)
        ↓
Alle 3 di notte, il Sleep Job si avvia:
  1. Orient     — scansiona tutti i ricordi
  2. Gather     — trova le novità
  3. Consolidate — corregge le date, unisce i duplicati, segnala le contraddizioni
  4. Dream      — trova una connessione silenziosa tra i tuoi pensieri
  5. Prune      — archivia ciò che è sbiadito, fa spazio
        ↓
La mattina dopo, apri un terminale:

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

Un'intuizione. Non dieci. Non un riassunto. Solo quella che conta.

## Come si collegano gli strumenti IA

CerebraLOS parla MCP. Qualsiasi strumento che supporta MCP può leggere e scrivere ricordi automaticamente.

```bash
# Già configurato durante `cerebralos init` per Claude Code.
# Per altri strumenti, aggiungi alla loro configurazione MCP:
{ "command": "cerebralos", "args": ["mcp"] }
```

Strumenti MCP disponibili:

| Strumento | Cosa fa |
|------|-------------|
| `write_memory` | Salvare un'intuizione, decisione o osservazione |
| `search_memory` | Trovare ricordi rilevanti per parola chiave |
| `recall_context` | Richiamare il contesto per un concetto |
| `list_dreams` | Leggere i Morning Insights recenti |

I tuoi strumenti IA li chiamano da soli. Tu non devi farlo.

## Lingua

I Morning Insights parlano la tua lingua. Configurala una volta in `~/.cerebralos/.brain/config.json`:

```json
{
  "language": "ja"
}
```

Funziona con qualsiasi lingua che il tuo LLM conosce.

## Configurazione LLM

CerebraLOS rileva automaticamente il tuo LLM. Nessuna configurazione necessaria se hai una API key nel tuo ambiente.

Ordine di rilevamento: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama (localhost) → `llm`/`claude` CLI

Per configurare esplicitamente:

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514"
  }
}
```

Provider: `claude` | `openai` | `ollama` | `cli` | `auto` | `none`

Nessun LLM? Funziona comunque — solo sogni più semplici.

## Architettura

```
~/.cerebralos/
├── core/          La tua conoscenza a lungo termine (immutabile dagli strumenti)
├── peripheral/    Osservazioni recenti dagli strumenti IA (volatile)
├── dreams/        Morning Insights dai Sleep Jobs
├── archive/       Ricordi sbiaditi — recuperabili, non cancellati
└── .brain/        Configurazione e stato
```

- **core/** sei tu. Gli strumenti non scrivono qui.
- **peripheral/** è il mondo. Gli strumenti scrivono qui liberamente.
- **dreams/** è dove si incontrano, una volta a notte.
- Nulla viene mai cancellato. Solo archiviato.

## Riferimento CLI

La maggior parte degli utenti non ne ha mai bisogno. Sono per il debugging o l'uso manuale.

```bash
cerebralos init                  # Configurazione iniziale (shell hook + programmazione notturna + MCP)
cerebralos wake                  # Mostrare il Morning Insight di oggi
cerebralos sleep                 # Eseguire il Sleep Job manualmente
cerebralos recall <query>        # Cercare nei tuoi ricordi
cerebralos write --from <src> --topic <t> --body <b>   # Scrivere un ricordo manualmente
cerebralos mcp                   # Avviare il server MCP (chiamato dagli strumenti IA)
```

## Design

CerebraLOS è costruito su poche convinzioni silenziose:

- **Dimenticare è una funzionalità.** I ricordi sbiadiscono dopo 30 giorni a meno che non si dimostrino utili. Non è perdita di dati — è concentrazione.
- **Uno è sufficiente.** Il Sleep Job trova una connessione per notte, non dieci. Se hai bisogno di un riassunto, hai lo strumento sbagliato.
- **Non chiedere all'utente.** Nessuna categoria da scegliere, nessun tag da aggiungere, nessuna dashboard da controllare. Il cervello si gestisce da solo.
- **Gli strumenti cambiano. Il cervello resta.** Claude, GPT, Ollama, qualunque cosa venga dopo — tutti scrivono nello stesso peripheral/. Il livello dei connettori si adatta. I tuoi ricordi non migrano.

## Documentazione

- [CONSTITUTION](../docs/CONSTITUTION.md) — Le 4 leggi fondamentali
- [ARCHITECTURE](../docs/ARCHITECTURE.md) — Il modello del cervello trino
- [ZERO_UI](../docs/ZERO_UI.md) — Automazione invisibile
- [DESIGN_PRINCIPLES](../docs/DESIGN_PRINCIPLES.md) — Filosofia nel codice
- [CONNECTORS](../docs/CONNECTORS.md) — Come si collegano gli strumenti

## Licenza

MIT. Vedi [LICENSE](../LICENSE).
