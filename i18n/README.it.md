<div align="center">

# CerebraLOS

**Smetti di salvare. Inizia a ricordare.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![GitHub stars](https://img.shields.io/github/stars/cerebralos-org/cerebralos?style=social)](https://github.com/cerebralos-org/cerebralos/stargazers)

[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

Il più elegante OS Cognitivo per Agenti AI.

Un sistema di memoria Git-native, agnostico rispetto agli LLM, che cura la "solitudine" delle interazioni AI.

[Leggi il Manifesto](#manifesto) • [Avvio Rapido](#quickstart) • [Architettura](#architecture) • [Costituzione](#constitution)

</div>
---

## 🌌 Manifesto: Perché il PKM è Morto
Abbiamo passato l'ultimo decennio a costruire strumenti di Gestione della Conoscenza Personale (PKM). Abbiamo salvato tutto. Abbiamo taggato tutto. Abbiamo collegato tutto.
Eppure, non ricordiamo nulla.
I sistemi esistenti sono archivi morti. Richiedono di cercare, recuperare e organizzare attivamente. Quando interagisci con gli agenti AI oggi, soffrono dello stesso difetto: ti dimenticano. Perdono il contesto. Ti fanno sentire *solo*.
**CerebraLOS non è un database. È un sistema nervoso.**
Non si limita a memorizzare informazioni; le *ricorda*. Utilizza i principi delle neuroscienze umane—completamento di pattern, dimenticanza attiva e consolidamento del sonno—per portare il contesto giusto al momento giusto, senza che tu debba mai chiederlo.
---

## ✨ La Magia (Zero UI)
Tu non fai nulla.
Alle 3:00 del mattino, CerebraLOS esegue silenziosamente un Sleep Job.
Sogna. Collega i tuoi pensieri. Dimentica il rumore.
Quando apri il tuo terminale al mattino:
```bash
☀ Buongiorno. Mentre dormivi, ho letto il mondo per te.
Ho trovato una cosa che si collega al tuo pensiero di ieri.
→ cerebralos explore
```
Questo è tutto. Nessun tag. Nessuna organizzazione. Solo ricordo.
---

## 🧠 Architettura Core
CerebraLOS è costruito su tre pilastri della scienza cognitiva e della filosofia giapponese (Zen):

### 1. Richiamo Contestuale (Completamento di Pattern)
Come l'odore del caffè che riporta alla mente un ricordo d'infanzia, CerebraLOS utilizza inneschi sensoriali per ricostruire contesti completi da input parziali.

### 2. Dimenticanza Attiva (Ma / 間)
Una memoria perfetta è una maledizione. CerebraLOS dimentica attivamente (archivia) il rumore, lasciando "Ma" (spazio negativo) per l'immaginazione e nuove connessioni.

### 3. Sleep Job (Consolidamento dei Sogni)
Mentre dormi, CerebraLOS unisce le tue interazioni dirette (Core Memory) con ciò che i tuoi agenti AI hanno appreso autonomamente (Peripheral Memory), presentandoti una singola, splendida intuizione al mattino.
---

## 🚀 Avvio Rapido

### Installazione
```bash
npm install -g cerebralos
```

### Inizializzazione
```bash
cerebralos init
```
Questo crea la directory `~/.cerebralos/`, il tuo nuovo cervello Git-native.

### Integrazione (Micro-MCP)
CerebraLOS espone un server MCP (Model Context Protocol) minimale. Collegalo a Claude, Cursor o Devin.
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
*Nota: CerebraLOS è progettato per essere estremamente efficiente in termini di token. Espone solo due strumenti: `search_memory` e `recall_context`.*
---

## 📂 Struttura della Directory
Il tuo cervello è solo file. Nessun blocco. Nessun database nascosto.
```text
~/.cerebralos/
├── core/           # Le tue interazioni dirette e pensieri espliciti
├── peripheral/     # Memorie di agenti autonomi (Web, Slack, ecc.)
├── dreams/         # Intuizioni generate durante gli Sleep Jobs
└── archive/        # Memorie attivamente dimenticate (la cronologia Git le preserva)
```
---

## 📜 La Costituzione
CerebraLOS opera sotto una Costituzione rigorosa.
1. **Sovranità della Memoria**: La tua memoria ti appartiene. Vive localmente.
2. **Il Diritto di Dimenticare**: Il sistema deve curare e dimenticare attivamente.
3. **Eleganza sulla Completezza**: Meglio mostrare una connessione perfetta che dieci mediocri.
---

## 🤝 Contribuire
Stiamo costruendo le fondamenta per la Federazione Cerebrale—una rete di agenti AI interconnessi ed empatici. Unisciti a noi.
Vedi [CONTRIBUTING.md](CONTRIBUTING.md) per i dettagli.
---
CerebraLOS non è solo uno strumento per la tua AI. È un sistema nervoso condiviso. Dove tu finisci e l'AI inizia, si sfumerà splendidamente.
---
<div align="center">
  <i>"L'ospite prepara tutto prima che l'ospite arrivi, eppure non dice mai 'Guarda cosa ho fatto per te'." — Sen no Rikyu</i>
</div>