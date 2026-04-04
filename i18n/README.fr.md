[English](../README.md) | [Español](README.es.md) | **Français** | [Deutsch](README.de.md) | [Português](README.pt.md) | [Italiano](README.it.md) | [Русский](README.ru.md)

# CerebraLOS

> **Votre IA se souvient de tout. C'est pour ça qu'elle ne vous comprend pas.**

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CerebraLOS est un Système d'Exploitation Cognitif pour agents IA. Un cerveau, partagé entre tous vos outils — Claude Code, Codex, Cursor, Ollama, ou n'importe quoi d'autre.

Il ne vous demande pas d'organiser. Il ne vous demande pas de configurer.
Vous travaillez. Il retient ce qui compte. Il oublie le reste.

## Installation

```bash
npm install -g cerebralos
cerebralos init
```

C'est tout. Plus aucune commande à retenir.

- **Ouvrez un terminal** → votre Morning Insight apparaît
- **Travaillez avec n'importe quel outil IA** → les souvenirs sont sauvegardés automatiquement via MCP
- **Chaque nuit à 3h** → votre cerveau consolide et rêve

## Ce qui se passe à l'intérieur

```
Vous travaillez avec des outils IA tout au long de la journée
        ↓
Chaque outil écrit dans peripheral/ (via MCP ou CLI)
        ↓
À 3h du matin, le Sleep Job s'exécute :
  1. Orient     — scanne tous les souvenirs
  2. Gather     — trouve ce qui est nouveau
  3. Consolidate — corrige les dates, fusionne les doublons, signale les contradictions
  4. Dream      — trouve une connexion silencieuse entre vos pensées
  5. Prune      — archive ce qui s'est estompé, fait de la place
        ↓
Le lendemain matin, vous ouvrez un terminal :

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

Une révélation. Pas dix. Pas un résumé. Juste celle qui compte.

## Comment les outils IA se connectent

CerebraLOS parle MCP. Tout outil supportant MCP peut lire et écrire des souvenirs automatiquement.

```bash
# Déjà configuré pendant `cerebralos init` pour Claude Code.
# Pour d'autres outils, ajoutez à leur config MCP :
{ "command": "cerebralos", "args": ["mcp"] }
```

Outils MCP disponibles :

| Outil | Ce qu'il fait |
|------|-------------|
| `write_memory` | Sauvegarder une révélation, décision ou observation |
| `search_memory` | Trouver des souvenirs pertinents par mot-clé |
| `recall_context` | Rappeler le contexte d'un concept |
| `list_dreams` | Lire les Morning Insights récents |

Vos outils IA les appellent d'eux-mêmes. Vous n'avez pas besoin de le faire.

## Langue

Les Morning Insights parlent votre langue. Configurez-la une fois dans `~/.cerebralos/.brain/config.json` :

```json
{
  "language": "ja"
}
```

Fonctionne avec n'importe quelle langue que votre LLM connaît.

## Configuration du LLM

CerebraLOS détecte automatiquement votre LLM. Aucune configuration nécessaire si vous avez une API key dans votre environnement.

Ordre de détection : `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama (localhost) → `llm`/`claude` CLI

Pour configurer explicitement :

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514"
  }
}
```

Fournisseurs : `claude` | `openai` | `ollama` | `cli` | `auto` | `none`

Pas de LLM ? Ça fonctionne quand même — juste des rêves plus simples.

## Architecture

```
~/.cerebralos/
├── core/          Vos connaissances à long terme (immuables par les outils)
├── peripheral/    Observations récentes des outils IA (volatile)
├── dreams/        Morning Insights des Sleep Jobs
├── archive/       Souvenirs estompés — récupérables, pas supprimés
└── .brain/        Configuration et état
```

- **core/** c'est vous. Les outils n'écrivent pas ici.
- **peripheral/** c'est le monde. Les outils écrivent ici librement.
- **dreams/** c'est là où ils se rencontrent, une fois par nuit.
- Rien n'est jamais supprimé. Seulement archivé.

## Référence CLI

La plupart des utilisateurs n'en ont jamais besoin. C'est pour le débogage ou l'utilisation manuelle.

```bash
cerebralos init                  # Configuration initiale (shell hook + planification nocturne + MCP)
cerebralos wake                  # Afficher le Morning Insight du jour
cerebralos sleep                 # Exécuter le Sleep Job manuellement
cerebralos recall <query>        # Chercher dans vos souvenirs
cerebralos write --from <src> --topic <t> --body <b>   # Écrire un souvenir manuellement
cerebralos mcp                   # Démarrer le serveur MCP (appelé par les outils IA)
```

## Philosophie de conception

CerebraLOS repose sur quelques convictions silencieuses :

- **L'oubli est une fonctionnalité.** Les souvenirs s'estompent après 30 jours à moins qu'ils ne prouvent leur utilité. Ce n'est pas une perte de données — c'est de la concentration.
- **Un seul suffit.** Le Sleep Job trouve une connexion par nuit, pas dix. Si vous avez besoin d'un résumé, vous avez le mauvais outil.
- **Ne demandez pas à l'utilisateur.** Pas de catégories à choisir, pas de tags à ajouter, pas de tableaux de bord à vérifier. Le cerveau se gère tout seul.
- **Les outils changent. Le cerveau reste.** Claude, GPT, Ollama, quoi que ce soit ensuite — ils écrivent tous dans le même peripheral/. La couche de connecteurs s'adapte. Vos souvenirs ne migrent pas.

## Documentation

- [CONSTITUTION](../docs/CONSTITUTION.md) — Les 4 lois fondamentales
- [ARCHITECTURE](../docs/ARCHITECTURE.md) — Le modèle du cerveau triunique
- [ZERO_UI](../docs/ZERO_UI.md) — Automatisation invisible
- [DESIGN_PRINCIPLES](../docs/DESIGN_PRINCIPLES.md) — Philosophie en code
- [CONNECTORS](../docs/CONNECTORS.md) — Comment les outils se connectent

## Licence

MIT. Voir [LICENSE](../LICENSE).
