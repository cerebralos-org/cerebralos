# Guida all'integrazione degli agenti CerebraLOS

CerebraLOS è progettato per essere il "Livello del Subconscio" per qualsiasi agente AI. Funziona senza soluzione di continuità con i tuoi strumenti esistenti agendo come un processore di memoria in background.

Questa guida spiega come connettere CerebraLOS ai più diffusi agenti AI.

## 1. Claude Code (Anthropic)

Claude Code è un potente agente AI basato su CLI. Connettendolo a CerebraLOS, Claude Code acquisisce la capacità di "dimenticare" il contesto irrilevante e di "sognare" intuizioni architettoniche durante la notte.

### Configurazione

1. Inizializza CerebraLOS nel tuo progetto:
   ```bash
   npx cerebralos init
   ```

2. Configura Claude Code per leggere dai sogni di CerebraLOS:
   Crea o aggiorna il tuo `.clauderc` o le istruzioni del progetto per includere:
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `.cerebralos/dreams/latest.md`
   When you finish a significant task, write a brief summary to `.cerebralos/peripheral/context.md`
   ```

3. Esegui il tuo Sleep Job giornaliero (o imposta un cron job):
   ```bash
   npx cerebralos sleep
   ```

## 2. Cursor (AI Code Editor)

Cursor è l'IDE AI-first più popolare. CerebraLOS può agire come la sua memoria architettonica a lungo termine.

### Configurazione

1. Inizializza CerebraLOS nella root del tuo progetto.
2. Apri le impostazioni di Cursor > Generale > Regole per l'AI (o il file `.cursorrules`).
3. Aggiungi la seguente regola:
   ```markdown
   # CerebraLOS Integration
   - Always check `.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```
4. Quando usi `Cmd+K` o `Cmd+L`, Cursor incorporerà naturalmente i "sogni" distillati del tuo progetto senza essere sopraffatto dai log grezzi.

## 3. OpenClaw

OpenClaw è un potente framework di agenti autonomi. Mentre OpenClaw si concentra sull'accumulo di memoria perfetta (`MEMORY.md`), CerebraLOS fornisce il meccanismo di "dimenticanza" necessario per prevenire il bloat del contesto.

### Configurazione

1. Nella tua configurazione OpenClaw, imposta il percorso di output della memoria per alimentare CerebraLOS:
   ```json
   {
     "memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. CerebraLOS decadrà automaticamente questi log in base all'entropia.
3. Configura il prompt di sistema di OpenClaw per leggere da `.cerebralos/dreams/latest.md` al risveglio.

## 4. Manus (AI Generale Autonoma)

Manus può usare CerebraLOS per mantenere il contesto in progetti a lungo termine e di più giorni.

### Configurazione

Basta dire a Manus:
> "Please initialize CerebraLOS in this project and use it to manage your long-term memory. Run a sleep job at the end of each session."

Manus gestirà automaticamente i comandi `npx cerebralos init` e `sleep`, scrivendo i suoi risultati nella memoria periferica e leggendo dai sogni.

---

## Il flusso di lavoro principale per qualsiasi agente

Indipendentemente dall'agente che usi, il flusso di lavoro di CerebraLOS è sempre lo stesso:

1. **L'agente lavora** → Scrive log/contesto grezzi in `.cerebralos/peripheral/`
2. **Tu dormi** → Esegui `npx cerebralos sleep` (o automatizza tramite cron)
3. **CerebraLOS sogna** → Distilla la memoria periferica in `.cerebralos/dreams/` e archivia il resto
4. **L'agente si sveglia** → Legge `.cerebralos/dreams/latest.md` per cogliere istantaneamente la "vibrazione" e l'architettura centrale del progetto.

Costruito per dimenticare. Progettato per sognare.