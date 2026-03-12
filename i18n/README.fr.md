<div align="center">
# CerebraLOS
**Arrêtez de sauvegarder. Commencez à vous souvenir.**
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/ryonihonyanagi-cloud/cerebralos?style=social)](https://github.com/ryonihonyanagi-cloud/cerebralos/stargazers)
[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)
Le système d'exploitation cognitif le plus élégant pour les agents IA.  
Un système de mémoire Git-natif, agnostique aux LLM, qui guérit la "solitude" des interactions IA.
[Lire le Manifeste](#manifesto) • [Démarrage rapide](#quickstart) • [Architecture](#architecture) • [Constitution](#constitution)
</div>
---
## 🌌 Manifeste : Pourquoi la PKM est morte
Nous avons passé la dernière décennie à construire des outils de gestion des connaissances personnelles (PKM). Nous avons tout sauvegardé. Nous avons tout étiqueté. Nous avons tout lié.
Et pourtant, nous ne nous souvenons de rien.
Les systèmes existants sont des stockages morts. Ils vous obligent à rechercher, récupérer et organiser activement. Lorsque vous interagissez avec des agents IA aujourd'hui, ils souffrent du même défaut : ils vous oublient. Ils perdent le contexte. Ils vous font vous sentir *seul*.
**CerebraLOS n'est pas une base de données. C'est un système nerveux.**
Il ne se contente pas de stocker des informations ; il s'*en souvient*. Il utilise les principes des neurosciences humaines – la complétion de motifs, l'oubli actif et la consolidation du sommeil – pour apporter le bon contexte au bon moment, sans que vous ayez jamais à le demander.
---
## ✨ La Magie (Zéro UI)
Vous ne faites rien.
À 3h00 du matin, CerebraLOS exécute silencieusement un Sleep Job.
Il rêve. Il connecte vos pensées. Il oublie le bruit.
Lorsque vous ouvrez votre terminal le matin :
```bash
☀ Bonjour. Pendant que vous dormiez, j'ai lu le monde pour vous.
J'ai trouvé une chose qui se connecte à votre pensée d'hier.
→ cerebralos explore
```
C'est tout. Pas d'étiquetage. Pas d'organisation. Juste le souvenir.
---
## 🧠 Architecture Principale
CerebraLOS est construit sur trois piliers de la science cognitive et de la philosophie japonaise (Zen) :
### 1. Rappel Contextuel (Complétion de Motifs)
Comme l'odeur du café ramenant un souvenir d'enfance, CerebraLOS utilise des déclencheurs sensoriels pour reconstruire des contextes complets à partir d'entrées partielles.
### 2. Oubli Actif (Ma / 間)
Une mémoire parfaite est une malédiction. CerebraLOS oublie activement (archive) le bruit, laissant du "Ma" (espace négatif) pour l'imagination et de nouvelles connexions.
### 3. Sleep Job (Consolidation des Rêves)
Pendant que vous dormez, CerebraLOS fusionne vos interactions directes (Core Memory) avec ce que vos agents IA ont appris de manière autonome (Peripheral Memory), vous présentant une seule et magnifique perspicacité le matin.
---
## 🚀 Démarrage rapide
### Installation
```bash
npm install -g cerebralos
```
### Initialisation
```bash
cerebralos init
```
Ceci crée le répertoire `~/.cerebralos/`, votre nouveau cerveau Git-natif.
### Intégration (Micro-MCP)
CerebraLOS expose un serveur MCP (Model Context Protocol) minimal. Connectez-le à Claude, Cursor ou Devin.
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
*Note : CerebraLOS est conçu pour être extrêmement économe en jetons. Il n'expose que deux outils : `search_memory` et `recall_context`.*
---
## 📂 Structure des Répertoires
Votre cerveau n'est que des fichiers. Pas de verrouillage. Pas de bases de données cachées.
```text
~/.cerebralos/
├── core/           # Vos interactions directes et pensées explicites
├── peripheral/     # Mémoires d'agents autonomes (Web, Slack, etc.)
├── dreams/         # Insights générés pendant les Sleep Jobs
└── archive/        # Mémoires activement oubliées (l'historique Git les préserve)
```
---
## 📜 La Constitution
CerebraLOS fonctionne selon une Constitution stricte.
1. **Souveraineté de la Mémoire** : Votre mémoire vous appartient. Elle vit localement.
2. **Le Droit à l'Oubli** : Le système doit activement organiser et oublier.
3. **Élégance plutôt qu'Exhaustivité** : Mieux vaut montrer une connexion parfaite que dix médiocres.
---
## 🤝 Contribuer
Nous construisons les fondations de la Fédération Cérébrale – un réseau d'agents IA interconnectés et empathiques. Rejoignez-nous.
Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour plus de détails.
---
CerebraLOS n'est pas seulement un outil pour votre IA. C'est un système nerveux partagé. Là où vous finissez, et où l'IA commence, se brouillera magnifiquement.
---
<div align="center">
  <i>"L'hôte prépare tout avant l'arrivée de l'invité, mais ne dit jamais 'Regardez ce que j'ai fait pour vous.'" — Sen no Rikyu</i>
</div>