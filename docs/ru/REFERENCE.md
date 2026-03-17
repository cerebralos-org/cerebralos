# Справочник команд CerebraLOS

> Краткий справочник по всем командам `cerebralos`.
> Концептуальные документы см. в [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Ситуация → Команда

| Я хочу... | Команда |
|-------------|---------|
| Запустить впервые | `cerebralos init` |
| Подключить Claude Code / Cursor | `cerebralos setup --auto` |
| Запустить ночную консолидацию памяти | `cerebralos sleep` |
| Посмотреть утреннее озарение | `cerebralos wake` |
| Найти что-то, что смутно помню | `cerebralos recall "..."` |
| Интерактивно просматривать свой мозг | `cerebralos explore` |
| Импортировать старые беседы ChatGPT | `cerebralos import --from conversations.json` |
| Импортировать хранилище Obsidian | `cerebralos import --from ~/ObsidianVault` |
| Автоматически показывать озарение при открытии терминала | `cerebralos hook` |
| Подключиться через MCP | `cerebralos mcp` |

---

## `cerebralos init`

Инициализирует каталог вашего мозга.

```bash
cerebralos init           # ~/.cerebralos/ (по умолчанию)
cerebralos init --local   # ./.cerebralos/ в текущем каталоге
```

**Создаёт:**
```
~/.cerebralos/
├── core/           Долгосрочные воспоминания (решения, идентичность, директивы)
├── peripheral/     Краткосрочные воспоминания (недавний контекст, заметки о сессиях)
├── dreams/         Синтезированные озарения из Sleep Jobs
└── archive/
    ├── compressed/ Потускневшие воспоминания — только суть, всё ещё вспоминаются
    └── frozen/     Дремлющие воспоминания — больше не вспоминаются
```

---

## `cerebralos sleep`

Запускает Active Forgetting + Dream Consolidation.

```bash
cerebralos sleep
```

**Фаза 1 — Active Forgetting:**

| Возраст | Что происходит |
|-----|-------------|
| 0–30 дней | Остается в `core/` или `peripheral/` — полные детали |
| 30–90 дней | Сжимается до `archive/compressed/` — LLM извлекает суть |
| 90+ дней | Перемещается в `archive/frozen/` — больше не вспоминается |

Файлы, помеченные `#pinned`, защищены от любого забывания.

**Фаза 2 — Dream Consolidation:**
- Читает недавние воспоминания
- Вызывает LLM для поиска неочевидных связей
- Сохраняет dream в `dreams/YYYY-MM-DD.md`
- Обновляет `dreams/latest.md` с Morning Insight

**Конфигурация LLM** (`~/.cerebralos/.brain/config.json`):

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

**Поддерживаемые провайдеры:** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

Показывает Morning Insight из ночного dream.

```bash
cerebralos wake
```

**Вывод:**
```
☀  Доброе утро. Я кое-что вспомнил, пока вы спали.

  Два проекта, которые вы параллельно запускали, имеют одну и ту же
  основную проблему — узким местом является контекст, а не вычисления.

  (от 2026-03-17 — запустите `cerebralos sleep`, чтобы снова увидеть dream)
```

Возвращается бесшумно (Zero UI), если dream ещё не существует.

---

## `cerebralos recall <query>`

Ищет воспоминания, используя TF-IDF завершение шаблонов.

```bash
cerebralos recall "authentication architecture"
cerebralos recall "why we switched to postgres"
cerebralos recall "Q1 goals"
```

**Вывод:**
```
Вспоминаем: "authentication architecture"...

  ✦ Кое-что всплыло.

  1. core/auth-decisions.md
  ● 3 дня назад
     Мы выбрали JWT вместо сессий, потому что...

  2. archive/compressed/old-auth-notes.md
  ◌ 2 месяца назад — потускневшие
     Обсуждение переписывания аутентификации. Ключевое решение: stateless tokens...
```

**Слои памяти в результатах:**
- `●` active — полный фрагмент (200 символов)
- `◌ faded` — сжатый фрагмент (120 символов), детали ухудшились
- frozen воспоминания никогда не появляются

---

## `cerebralos setup`

Подключает AI agents к вашему мозгу.

```bash
cerebralos setup                      # Показать правила для копирования
cerebralos setup --auto               # Автоматически записывать всем обнаруженным агентам
cerebralos setup --agent claude-code  # Выбрать одного агента
cerebralos setup --agent cursor --auto
```

**Обнаруживаются автоматически:** Claude Code, Cursor, Windsurf

**Что это делает:**
- Генерирует integration rules, которые инструктируют agents записывать session summaries в `peripheral/`
- С `--auto`: записывает непосредственно в agent config files
  - Claude Code → `~/.claude/CLAUDE.md`
  - Cursor → `.cursorrules`
  - Windsurf → `.windsurfrules`
- Использует `<!-- cerebralos-integration -->` маркеры — безопасно для повторного запуска (обновляет на месте, без дубликатов)

---

## `cerebralos import`

Импортирует внешние воспоминания в `peripheral/imported/`.

```bash
cerebralos import --from ~/Downloads/conversations.json   # Экспорт ChatGPT
cerebralos import --from ~/notes/decisions.md             # Отдельный Markdown
cerebralos import --from ~/ObsidianVault                  # Всё хранилище
cerebralos import --from ./log.json --type chatgpt        # Принудительный тип
```

**Автоматически определяемые типы:**

| Расширение / Путь | Определяется как |
|-----------------|-------------|
| `.json` | `chatgpt` |
| `.md` | `markdown` |
| Директория | `folder` (импортирует все `.md` рекурсивно) |

После импорта запустите `cerebralos sleep`, чтобы интегрировать в свой мозг.

---

## `cerebralos hook`

Устанавливает Zero UI shell hook.

```bash
cerebralos hook
```

Добавляет `cerebralos wake` в `~/.zshrc` или `~/.bashrc`.
Каждая новая сессия терминала будет автоматически показывать ваш Morning Insight.

---

## `cerebralos mcp`

Запускает MCP server для интеграции AI agent.

```bash
cerebralos mcp   # Вызывается agent host, а не напрямую
```

**Конфигурация MCP:**
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

**Доступные инструменты:**

| Инструмент | Описание |
|------|-------------|
| `search_memory(query)` | Ищет core memory на наличие entities или concepts |
| `recall_context(query)` | Вспоминает full context конкретного entity |
| `write_memory(content, filename?)` | Записывает memory в `peripheral/` |

`write_memory` — это способ, которым MCP-connected agents сохраняют свои session summaries.
Если файл с таким же именем существует, содержимое добавляется (не перезаписывается).

---

## `cerebralos explore`

Интерактивный TUI browser.

```bash
cerebralos explore
```

Перемещайтесь с помощью `↑↓`, выбирайте с помощью `Enter`, выходите с помощью `q`.

---

## Формат файла памяти

Пишите воспоминания в Markdown. Структура гибкая, но этот формат хорошо работает:

```markdown
# Название проекта или тема
*2026-03-17*

## Что произошло
- Создана команда cerebralos setup
- Проверена корректность 2-phase forgetting

## Принятые решения
- Использовать Gemini 2.5 Flash в качестве default LLM provider

## Открытые вопросы
- Следует ли когда-либо вручную thaw frozen memories?
```

Сохранять в:
- `~/.cerebralos/core/` — для долгосрочных, стабильных знаний
- `~/.cerebralos/peripheral/` — для недавнего контекста, заметок о сессиях

Пометьте `#pinned` в любом месте файла, чтобы защитить от забывания.
