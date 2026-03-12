# Руководство по интеграции агентов CerebraLOS

CerebraLOS разработан как «Уровень подсознания» для любого ИИ-агента. Он беспрепятственно работает с вашими существующими инструментами, выступая в качестве фонового процессора памяти.

В этом руководстве объясняется, как подключить CerebraLOS к популярным ИИ-агентам.

## 1. Claude Code (Anthropic)

Claude Code — это мощный ИИ-агент на основе CLI. Подключив его к CerebraLOS, Claude Code получает возможность «забывать» нерелевантный контекст и «мечтать» об архитектурных идеях за ночь.

### Настройка

1. Инициализируйте CerebraLOS в вашем проекте:
   ```bash
   npx cerebralos init
   ```

2. Настройте Claude Code для чтения из «снов» CerebraLOS:
   Создайте или обновите ваш `.clauderc` или инструкции проекта, чтобы включить:
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `.cerebralos/dreams/latest.md`
   When you finish a significant task, write a brief summary to `.cerebralos/peripheral/context.md`
   ```

3. Запускайте ежедневную «работу по сну» (или настройте cron job):
   ```bash
   npx cerebralos sleep
   ```

## 2. Cursor (AI Code Editor)

Cursor — это самая популярная IDE, ориентированная на ИИ. CerebraLOS может выступать в качестве его долгосрочной архитектурной памяти.

### Настройка

1. Инициализируйте CerebraLOS в корне вашего проекта.
2. Откройте Cursor Settings > General > Rules for AI (или файл `.cursorrules`).
3. Добавьте следующее правило:
   ```markdown
   # CerebraLOS Integration
   - Always check `.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```
4. Когда вы используете `Cmd+K` или `Cmd+L`, Cursor теперь будет естественным образом включать дистиллированные «сны» вашего проекта, не будучи перегруженным необработанными логами.

## 3. OpenClaw

OpenClaw — это мощная автономная агентская платформа. В то время как OpenClaw фокусируется на идеальном накоплении памяти (`MEMORY.md`), CerebraLOS обеспечивает необходимый механизм «забывания» для предотвращения раздувания контекста.

### Настройка

1. В вашей конфигурации OpenClaw установите путь вывода памяти для подачи в CerebraLOS:
   ```json
   {
     "memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. CerebraLOS будет автоматически уменьшать эти логи на основе энтропии.
3. Настройте системный промпт OpenClaw для чтения из `.cerebralos/dreams/latest.md` при пробуждении.

## 4. Manus (Autonomous General AI)

Manus может использовать CerebraLOS для поддержания контекста в долгосрочных, многодневных проектах.

### Настройка

Просто скажите Manus:
> "Please initialize CerebraLOS in this project and use it to manage your long-term memory. Run a sleep job at the end of each session."

Manus автоматически обработает команды `npx cerebralos init` и `sleep`, записывая свои находки в периферийную память и читая из «снов».

---

## Основной рабочий процесс для любого агента

Независимо от того, какого агента вы используете, рабочий процесс CerebraLOS всегда одинаков:

1. **Агент работает** → Записывает необработанные логи/контекст в `.cerebralos/peripheral/`
2. **Вы спите** → Запустите `npx cerebralos sleep` (или автоматизируйте через cron)
3. **CerebraLOS мечтает** → Дистиллирует периферийную память в `.cerebralos/dreams/` и архивирует остальное
4. **Агент просыпается** → Читает `.cerebralos/dreams/latest.md`, чтобы мгновенно уловить «атмосферу» и основную архитектуру проекта.

Built to forget. Designed to dream.