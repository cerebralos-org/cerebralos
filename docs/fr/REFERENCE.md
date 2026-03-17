---
# Référence des Commandes CerebraLOS

> Référence rapide pour toutes les commandes `cerebralos`.
> Pour les documents conceptuels, voir [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Situation → Commande

| Je veux... | Commande |
|-------------|---------|
| Démarrer pour la première fois | `cerebralos init` |
| Connecter Claude Code / Cursor | `cerebralos setup --auto` |
| Lancer la consolidation de mémoire de ce soir | `cerebralos sleep` |
| Voir l'aperçu de ce matin | `cerebralos wake` |
| Trouver quelque chose dont je me souviens vaguement | `cerebralos recall "..."` |
| Parcourir mon cerveau de manière interactive | `cerebralos explore` |
| Importer d'anciennes conversations ChatGPT | `cerebralos import --from conversations.json` |
| Importer un coffre-fort Obsidian | `cerebralos import --from ~/ObsidianVault` |
| Afficher automatiquement l'aperçu à l'ouverture du terminal | `cerebralos hook` |
| Me connecter via MCP | `cerebralos mcp` |

---

## `cerebralos init`

Initialise votre répertoire cérébral.

```bash
cerebralos init           # ~/.cerebralos/ (par défaut)
cerebralos init --local   # ./.cerebralos/ dans le répertoire actuel
```

**Crée:**
```
~/.cerebralos/
├── core/           Mémoires à long terme (décisions, identité, directives)
├── peripheral/     Mémoires à court terme (contexte récent, notes de session)
├── dreams/         Aperçus synthétisés des Tâches de Sommeil (Sleep Jobs)
└── archive/
    ├── compressed/ Mémoires estompées — l'essentiel seulement, toujours rappelées
    └── frozen/     Mémoires dormantes — plus rappelées
```

---

## `cerebralos sleep`

Exécute l'Oubli Actif + la Consolidation des Rêves.

```bash
cerebralos sleep
```

**Phase 1 — Oubli Actif:**

| Âge | Ce qui se passe |
|-----|-------------|
| 0–30 jours | Reste dans `core/` ou `peripheral/` — détails complets |
| 30–90 jours | Compressé vers `archive/compressed/` — le LLM extrait l'essentiel |
| 90+ jours | Déplacé vers `archive/frozen/` — n'est plus rappelé |

Les fichiers tagués `#pinned` sont protégés de tout oubli.

**Phase 2 — Consolidation des Rêves:**
- Lit les mémoires récentes
- Appelle le LLM pour trouver des connexions non évidentes
- Sauvegarde le rêve dans `dreams/YYYY-MM-DD.md`
- Met à jour `dreams/latest.md` avec l'Aperçu Matinal (Morning Insight)

**Configuration LLM** (`~/.cerebralos/.brain/config.json`):

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

**Fournisseurs supportés:** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

Affiche l'Aperçu Matinal du rêve de la nuit dernière.

```bash
cerebralos wake
```

**Sortie:**
```
☀  Bonjour. Je me suis souvenu de quelque chose pendant que vous dormiez.

  Les deux projets que vous avez menés en parallèle partagent le même
  problème sous-jacent — le contexte, et non la puissance de calcul, est le goulot d'étranglement.

  (du 2026-03-17 — exécutez `cerebralos sleep` pour rêver à nouveau)
```

Retourne silencieusement (Zero UI) si aucun rêve n'existe encore.

---

## `cerebralos recall <query>`

Recherche des mémoires en utilisant la complétion de motifs TF-IDF.

```bash
cerebralos recall "authentication architecture"
cerebralos recall "why we switched to postgres"
cerebralos recall "Q1 goals"
```

**Sortie:**
```
Rappel de: "authentication architecture"...

  ✦ Quelque chose a refait surface.

  1. core/auth-decisions.md
  ● Il y a 3 jours
     Nous avons choisi JWT plutôt que les sessions parce que...

  2. archive/compressed/old-auth-notes.md
  ◌ Il y a 2 mois — estompé
     Discussion sur la réécriture de l'authentification. Décision clé : les tokens sans état...
```

**Couches de mémoire dans les résultats:**
- `●` actif — extrait complet (200 caractères)
- `◌ faded` — extrait compressé (120 caractères), les détails se sont dégradés
- les mémoires `frozen` n'apparaissent jamais

---

## `cerebralos setup`

Connecte des agents AI à votre cerveau.

```bash
cerebralos setup                      # Affiche les règles à copier-coller
cerebralos setup --auto               # Écrit automatiquement dans tous les agents détectés
cerebralos setup --agent claude-code  # Cible un agent
cerebralos setup --agent cursor --auto
```

**Détecté automatiquement:** Claude Code, Cursor, Windsurf

**Ce que ça fait:**
- Génère des règles d'intégration qui instruisent les agents à écrire des résumés de session dans `peripheral/`
- Avec `--auto`: écrit directement dans les fichiers de configuration des agents
  - Claude Code → `~/.claude/CLAUDE.md`
  - Cursor → `.cursorrules`
  - Windsurf → `.windsurfrules`
- Utilise les marqueurs `<!-- cerebralos-integration -->` — peut être relancé en toute sécurité (met à jour sur place, pas de doublons)

---

## `cerebralos import`

Importe des mémoires externes dans `peripheral/imported/`.

```bash
cerebralos import --from ~/Downloads/conversations.json   # Export ChatGPT
cerebralos import --from ~/notes/decisions.md             # Un seul Markdown
cerebralos import --from ~/ObsidianVault                  # Un coffre-fort entier
cerebralos import --from ./log.json --type chatgpt        # Force le type
```

**Types auto-détectés:**

| Extension / Chemin | Détecté comme |
|--------------------|---------------|
| `.json`            | `chatgpt`     |
| `.md`              | `markdown`    |
| Répertoire         | `folder` (importe tous les `.md` récursivement) |

Après l'importation, exécutez `cerebralos sleep` pour intégrer ces éléments à votre cerveau.

---

## `cerebralos hook`

Installe le hook shell Zero UI.

```bash
cerebralos hook
```

Ajoute `cerebralos wake` à `~/.zshrc` ou `~/.bashrc`.
Chaque nouvelle session de terminal affichera automatiquement votre Aperçu Matinal.

---

## `cerebralos mcp`

Démarre le serveur MCP pour l'intégration des agents AI.

```bash
cerebralos mcp   # Appelé par l'hôte de l'agent, pas directement
```

**Configuration MCP:**
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

**Outils exposés:**

| Outil | Description |
|------|-------------|
| `search_memory(query)` | Recherche dans la mémoire `core` des entités ou des concepts |
| `recall_context(query)` | Rappelle le contexte complet d'une entité spécifique |
| `write_memory(content, filename?)` | Écrit une mémoire dans `peripheral/` |

`write_memory` est la manière dont les agents connectés au MCP sauvegardent leurs résumés de session.
Si un fichier portant le même nom existe, le contenu est ajouté (non écrasé).

---

## `cerebralos explore`

Navigateur TUI interactif.

```bash
cerebralos explore
```

Naviguez avec `↑↓`, sélectionnez avec `Enter`, quittez avec `q`.

---

## Format de fichier de mémoire

Écrivez vos mémoires en Markdown. La structure est flexible, mais ce format fonctionne bien :

```markdown
# Nom du projet ou Sujet
*2026-03-17*

## Ce qui s'est passé
- J'ai créé la commande cerebralos setup
- J'ai vérifié que l'oubli en 2 phases fonctionne correctement

## Décisions prises
- Utiliser Gemini 2.5 Flash comme fournisseur LLM par défaut

## Questions ouvertes
- Les mémoires frozen devraient-elles être décongelées manuellement ?
```

Sauvegardez dans :
- `~/.cerebralos/core/` — pour les connaissances stables à long terme
- `~/.cerebralos/peripheral/` — pour le contexte récent, les notes de session

Taguer avec `#pinned` n'importe où dans le fichier pour le protéger de l'oubli.
