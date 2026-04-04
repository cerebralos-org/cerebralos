[English](../README.md) | **Español** | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Italiano](README.it.md) | [Русский](README.ru.md)

# CerebraLOS

> **Tu IA lo recuerda todo. Por eso no te entiende.**

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CerebraLOS es un Sistema Operativo Cognitivo para agentes de IA. Un cerebro, compartido entre todas las herramientas que usas — Claude Code, Codex, Cursor, Ollama, o cualquier otra.

No te pide que organices. No te pide que configures.
Tú trabajas. Él recuerda lo que importa. Olvida el resto.

## Instalación

```bash
npm install -g cerebralos
cerebralos init
```

Eso es todo. No hay más comandos que recordar.

- **Abre una terminal** → tu Morning Insight aparece
- **Trabaja con cualquier herramienta de IA** → los recuerdos se guardan automáticamente vía MCP
- **Cada noche a las 3am** → tu cerebro consolida y sueña

## Qué sucede por dentro

```
Trabajas con herramientas de IA durante el día
        ↓
Cada herramienta escribe en peripheral/ (vía MCP o CLI)
        ↓
A las 3am, el Sleep Job se ejecuta:
  1. Orient     — escanea todos los recuerdos
  2. Gather     — encuentra lo nuevo
  3. Consolidate — corrige fechas, fusiona duplicados, marca contradicciones
  4. Dream      — encuentra una conexión silenciosa entre tus pensamientos
  5. Prune      — archiva lo desvanecido, hace espacio
        ↓
A la mañana siguiente, abres una terminal:

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

Una revelación. No diez. No un resumen. Solo la que importa.

## Cómo se conectan las herramientas de IA

CerebraLOS habla MCP. Cualquier herramienta que soporte MCP puede leer y escribir recuerdos automáticamente.

```bash
# Ya configurado durante `cerebralos init` para Claude Code.
# Para otras herramientas, añade a su configuración MCP:
{ "command": "cerebralos", "args": ["mcp"] }
```

Herramientas MCP disponibles:

| Herramienta | Qué hace |
|------|-------------|
| `write_memory` | Guardar una revelación, decisión u observación |
| `search_memory` | Buscar recuerdos relevantes por palabra clave |
| `recall_context` | Recuperar contexto para un concepto |
| `list_dreams` | Leer Morning Insights recientes |

Tus herramientas de IA las llaman por sí solas. Tú no necesitas hacerlo.

## Idioma

Los Morning Insights hablan tu idioma. Configúralo una vez en `~/.cerebralos/.brain/config.json`:

```json
{
  "language": "ja"
}
```

Funciona con cualquier idioma que tu LLM conozca.

## Configuración del LLM

CerebraLOS detecta automáticamente tu LLM. No necesitas configuración si tienes una API key en tu entorno.

Orden de detección: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama (localhost) → `llm`/`claude` CLI

Para configurar explícitamente:

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514"
  }
}
```

Proveedores: `claude` | `openai` | `ollama` | `cli` | `auto` | `none`

¿Sin LLM? Sigue funcionando — solo sueños más simples.

## Arquitectura

```
~/.cerebralos/
├── core/          Tu conocimiento a largo plazo (inmutable por herramientas)
├── peripheral/    Observaciones recientes de herramientas de IA (volátil)
├── dreams/        Morning Insights de los Sleep Jobs
├── archive/       Recuerdos desvanecidos — recuperables, no eliminados
└── .brain/        Configuración y estado
```

- **core/** eres tú. Las herramientas no escriben aquí.
- **peripheral/** es el mundo. Las herramientas escriben aquí libremente.
- **dreams/** es donde se encuentran, una vez por noche.
- Nada se elimina jamás. Solo se archiva.

## Referencia CLI

La mayoría de los usuarios nunca necesitan esto. Son para depuración o uso manual.

```bash
cerebralos init                  # Configuración inicial (shell hook + horario nocturno + MCP)
cerebralos wake                  # Mostrar el Morning Insight de hoy
cerebralos sleep                 # Ejecutar el Sleep Job manualmente
cerebralos recall <query>        # Buscar en tus recuerdos
cerebralos write --from <src> --topic <t> --body <b>   # Escribir un recuerdo manualmente
cerebralos mcp                   # Iniciar el servidor MCP (llamado por herramientas de IA)
```

## Diseño

CerebraLOS está construido sobre unas pocas creencias silenciosas:

- **Olvidar es una característica.** Los recuerdos se desvanecen después de 30 días a menos que demuestren ser útiles. Esto no es pérdida de datos — es enfoque.
- **Uno es suficiente.** El Sleep Job encuentra una conexión por noche, no diez. Si necesitas un resumen, tienes la herramienta equivocada.
- **No le preguntes al usuario.** Sin categorías que elegir, sin etiquetas que añadir, sin paneles que revisar. El cerebro se maneja solo.
- **Las herramientas cambian. El cerebro permanece.** Claude, GPT, Ollama, lo que venga después — todos escriben en el mismo peripheral/. La capa de conectores se adapta. Tus recuerdos no migran.

## Documentación

- [CONSTITUTION](../docs/CONSTITUTION.md) — Las 4 leyes fundamentales
- [ARCHITECTURE](../docs/ARCHITECTURE.md) — El modelo del cerebro triuno
- [ZERO_UI](../docs/ZERO_UI.md) — Automatización invisible
- [DESIGN_PRINCIPLES](../docs/DESIGN_PRINCIPLES.md) — Filosofía en código
- [CONNECTORS](../docs/CONNECTORS.md) — Cómo se conectan las herramientas

## Licencia

MIT. Ver [LICENSE](../LICENSE).
