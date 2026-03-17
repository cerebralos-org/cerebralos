---
# Referencia de Comandos de CerebraLOS

> Referencia rápida de todos los comandos `cerebralos`.
> Para la documentación conceptual, consulta [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Situación → Comando

| Quiero... | Comando |
|-------------|---------|
| Empezar por primera vez | `cerebralos init` |
| Conectar Claude Code / Cursor | `cerebralos setup --auto` |
| Ejecutar la consolidación de memoria de esta noche | `cerebralos sleep` |
| Ver la percepción de esta mañana | `cerebralos wake` |
| Encontrar algo que recuerdo vagamente | `cerebralos recall "..."` |
| Explorar mi cerebro interactivamente | `cerebralos explore` |
| Importar conversaciones antiguas de ChatGPT | `cerebralos import --from conversations.json` |
| Importar un vault de Obsidian | `cerebralos import --from ~/ObsidianVault` |
| Mostrar la percepción automáticamente al abrir la terminal | `cerebralos hook` |
| Conectar vía MCP | `cerebralos mcp` |

---

## `cerebralos init`

Inicializa tu directorio cerebral.

```bash
cerebralos init           # ~/.cerebralos/ (por defecto)
cerebralos init --local   # ./.cerebralos/ en el directorio actual
```

**Crea:**
```
~/.cerebralos/
├── core/           Memorias a largo plazo (decisiones, identidad, directivas)
├── peripheral/     Memorias a corto plazo (contexto reciente, notas de sesión)
├── dreams/         Percepciones sintetizadas de los Trabajos de Sueño
└── archive/
    ├── compressed/ Memorias desvanecidas — solo la esencia, aún recordadas
    └── frozen/     Memorias dormidas — ya no recordadas
```

---

## `cerebralos sleep`

Ejecuta el Olvido Activo + Consolidación de Sueños.

```bash
cerebralos sleep
```

**Fase 1 — Olvido Activo:**

| Edad | Qué sucede |
|-----|-------------|
| 0–30 días | Permanece en `core/` o `peripheral/` — detalle completo |
| 30–90 días | Comprimido a `archive/compressed/` — LLM extrae la esencia |
| 90+ días | Movido a `archive/frozen/` — ya no se recuerda |

Los archivos etiquetados con `#pinned` están protegidos de todo olvido.

**Fase 2 — Consolidación de Sueños:**
- Lee memorias recientes
- Llama al LLM para encontrar conexiones no obvias
- Guarda el sueño en `dreams/YYYY-MM-DD.md`
- Actualiza `dreams/latest.md` con la Percepción Matutina (Morning Insight)

**Configuración de LLM** (`~/.cerebralos/.brain/config.json`):

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

**Proveedores soportados:** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

Muestra la Percepción Matutina (Morning Insight) del sueño de anoche.

```bash
cerebralos wake
```

**Salida:**
```
☀  Buenos días. Recordé algo mientras dormías.

  Los dos proyectos que has estado ejecutando en paralelo comparten el mismo
  problema subyacente — el contexto, no el cómputo, es el cuello de botella.

  (de 2026-03-17 — ejecuta `cerebralos sleep` para soñar de nuevo)
```

Retorna silenciosamente (Zero UI) si aún no existe ningún sueño.

---

## `cerebralos recall <query>`

Busca memorias usando TF-IDF para completar patrones.

```bash
cerebralos recall "authentication architecture"
cerebralos recall "why we switched to postgres"
cerebralos recall "Q1 goals"
```

**Salida:**
```
Recordando: "authentication architecture"...

  ✦ Algo ha emergido.

  1. core/auth-decisions.md
  ● Hace 3 días
     Elegimos JWT sobre sesiones porque...

  2. archive/compressed/old-auth-notes.md
  ◌ Hace 2 meses — desvanecido
     Discusión sobre la reescritura de autenticación. Decisión clave: tokens sin estado...
```

**Capas de memoria en los resultados:**
- `●` activo — fragmento completo (200 caracteres)
- `◌ faded` — fragmento comprimido (120 caracteres), el detalle ha decaído
- las memorias `frozen` nunca aparecen

---

## `cerebralos setup`

Conecta agentes de IA a tu cerebro.

```bash
cerebralos setup                      # Muestra reglas para copiar y pegar
cerebralos setup --auto               # Escribe automáticamente en todos los agentes detectados
cerebralos setup --agent claude-code  # Dirige a un agente
cerebralos setup --agent cursor --auto
```

**Detectados automáticamente:** Claude Code, Cursor, Windsurf

**Qué hace:**
- Genera reglas de integración que instruyen a los agentes para escribir resúmenes de sesión en `peripheral/`
- Con `--auto`: escribe directamente en los archivos de configuración del agente
  - Claude Code → `~/.claude/CLAUDE.md`
  - Cursor → `.cursorrules`
  - Windsurf → `.windsurfrules`
- Utiliza marcadores `<!-- cerebralos-integration -->` — seguro para volver a ejecutar (actualiza en el lugar, sin duplicados)

---

## `cerebralos import`

Importa memorias externas a `peripheral/imported/`.

```bash
cerebralos import --from ~/Downloads/conversations.json   # Exportación de ChatGPT
cerebralos import --from ~/notes/decisions.md             # Archivo Markdown único
cerebralos import --from ~/ObsidianVault                  # Vault completo
cerebralos import --from ./log.json --type chatgpt        # Forzar tipo
```

**Tipos auto-detectados:**

| Extensión / Ruta | Detectado como |
|-----------------|-------------|
| `.json` | `chatgpt` |
| `.md` | `markdown` |
| Directorio | `folder` (importa todos los `.md` recursivamente) |

Después de importar, ejecuta `cerebralos sleep` para integrar en tu cerebro.

---

## `cerebralos hook`

Instala el hook de shell Zero UI.

```bash
cerebralos hook
```

Añade `cerebralos wake` a `~/.zshrc` o `~/.bashrc`.
Cada nueva sesión de terminal mostrará automáticamente tu Percepción Matutina (Morning Insight).

---

## `cerebralos mcp`

Inicia el servidor MCP para la integración de agentes de IA.

```bash
cerebralos mcp   # Llamado por el host del agente, no directamente
```

**Configuración MCP:**
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

**Herramientas expuestas:**

| Herramienta | Descripción |
|------|-------------|
| `search_memory(query)` | Busca en la memoria central entidades o conceptos |
| `recall_context(query)` | Recupera el contexto completo de una entidad específica |
| `write_memory(content, filename?)` | Escribe una memoria en `peripheral/` |

`write_memory` es cómo los agentes conectados a MCP guardan los resúmenes de sus sesiones.
Si existe un archivo con el mismo nombre, el contenido se añade (no se sobrescribe).

---

## `cerebralos explore`

Navegador TUI interactivo.

```bash
cerebralos explore
```

Navega con `↑↓`, selecciona con `Enter`, sal con `q`.

---

## Formato de archivo de memoria

Escribe las memorias en Markdown. La estructura es flexible, pero este formato funciona bien:

```markdown
# Nombre del Proyecto o Tema
*2026-03-17*

## Qué pasó
- Se construyó el comando cerebralos setup
- Se verificó que el olvido de 2 fases funciona correctamente

## Decisiones tomadas
- Usar Gemini 2.5 Flash como proveedor de LLM por defecto

## Preguntas abiertas
- ¿Deberían las memorias frozen ser descongeladas manualmente alguna vez?
```

Guarda en:
- `~/.cerebralos/core/` — para conocimiento a largo plazo y estable
- `~/.cerebralos/peripheral/` — para contexto reciente, notas de sesión

Etiqueta con `#pinned` en cualquier parte del archivo para protegerlo del olvido.
