# Guide d'intégration des agents CerebraLOS

CerebraLOS est conçu pour être la "Couche de Subconscience" pour tout agent IA. Il fonctionne de manière transparente avec vos outils existants en agissant comme un processeur de mémoire en arrière-plan.

Ce guide explique comment connecter CerebraLOS aux agents IA populaires.

## 1. Claude Code (Anthropic)

Claude Code est un puissant agent IA basé sur CLI. En le connectant à CerebraLOS, Claude Code acquiert la capacité d'"oublier" le contexte non pertinent et de "rêver" d'insights architecturaux pendant la nuit.

### Configuration

1. Initialisez CerebraLOS dans votre projet :
   ```bash
   npx cerebralos init
   ```

2. Configurez Claude Code pour lire les rêves de CerebraLOS :
   Créez ou mettez à jour votre `.clauderc` ou les instructions de votre projet pour inclure :
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `.cerebralos/dreams/latest.md`
   When you finish a significant task, write a brief summary to `.cerebralos/peripheral/context.md`
   ```

3. Exécutez votre tâche de sommeil quotidienne (ou configurez une tâche cron) :
   ```bash
   npx cerebralos sleep
   ```

## 2. Cursor (Éditeur de code IA)

Cursor est l'IDE IA le plus populaire. CerebraLOS peut agir comme sa mémoire architecturale à long terme.

### Configuration

1. Initialisez CerebraLOS à la racine de votre projet.
2. Ouvrez les paramètres de Cursor > Général > Règles pour l'IA (ou le fichier `.cursorrules`).
3. Ajoutez la règle suivante :
   ```markdown
   # CerebraLOS Integration
   - Always check `.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```
4. Lorsque vous utilisez `Cmd+K` ou `Cmd+L`, Cursor incorporera désormais naturellement les "rêves" distillés de votre projet sans être submergé par les journaux bruts.

## 3. OpenClaw

OpenClaw est un puissant framework d'agents autonomes. Alors qu'OpenClaw se concentre sur l'accumulation parfaite de mémoire (`MEMORY.md`), CerebraLOS fournit le mécanisme d'"oubli" nécessaire pour éviter l'encombrement du contexte.

### Configuration

1. Dans votre configuration OpenClaw, définissez le chemin de sortie de la mémoire pour alimenter CerebraLOS :
   ```json
   {
     "memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. CerebraLOS décomposera automatiquement ces journaux en fonction de l'entropie.
3. Configurez l'invite système d'OpenClaw pour lire à partir de `.cerebralos/dreams/latest.md` au réveil.

## 4. Manus (IA Générale Autonome)

Manus peut utiliser CerebraLOS pour maintenir le contexte sur des projets de longue durée, s'étendant sur plusieurs jours.

### Configuration

Il suffit de dire à Manus :
> "Please initialize CerebraLOS in this project and use it to manage your long-term memory. Run a sleep job at the end of each session."

Manus gérera automatiquement les commandes `npx cerebralos init` et `sleep`, écrivant ses découvertes dans la mémoire périphérique et lisant les rêves.

---

## Le flux de travail essentiel pour tout agent

Quel que soit l'agent que vous utilisez, le flux de travail de CerebraLOS est toujours le même :

1. **L'agent travaille** → Écrit les journaux/contextes bruts dans `.cerebralos/peripheral/`
2. **Vous dormez** → Exécutez `npx cerebralos sleep` (ou automatisez via cron)
3. **CerebraLOS rêve** → Distille la mémoire périphérique dans `.cerebralos/dreams/` et archive le reste
4. **L'agent se réveille** → Lit `.cerebralos/dreams/latest.md` pour saisir instantanément l'"ambiance" et l'architecture principale du projet.

Conçu pour oublier. Conçu pour rêver.