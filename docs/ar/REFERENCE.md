# مرجع أوامر CerebraLOS

> مرجع سريع لجميع أوامر `cerebralos`.
> للوثائق المفاهيمية، انظر [ARCHITECTURE.md](ARCHITECTURE.md).

---

## الموقف ← الأمر

| أريد أن... | Command |
|-------------|---------|
| أبدأ لأول مرة | `cerebralos init` |
| أربط Claude Code / Cursor | `cerebralos setup --auto` |
| أُشغّل دمج الذاكرة الليلة | `cerebralos sleep` |
| أرى بصيرة هذا الصباح | `cerebralos wake` |
| أجد شيئًا أتذكره بشكل مبهم | `cerebralos recall "..."` |
| أستعرض دماغي بشكل تفاعلي | `cerebralos explore` |
| أستورد محادثات ChatGPT القديمة | `cerebralos import --from conversations.json` |
| أستورد مخزن Obsidian | `cerebralos import --from ~/ObsidianVault` |
| أُظهر البصيرة تلقائيًا عند فتح الطرفية | `cerebralos hook` |
| أربط عبر MCP | `cerebralos mcp` |

---

## `cerebralos init`

تهيئة دليل دماغك.

```bash
cerebralos init           # ~/.cerebralos/ (افتراضي)
cerebralos init --local   # ./.cerebralos/ في الدليل الحالي
```

**ينشئ:**
```
~/.cerebralos/
├── core/           الذكريات طويلة الأمد (القرارات، الهوية، التوجيهات)
├── peripheral/     الذكريات قصيرة الأمد (السياق الأخير، ملاحظات الجلسة)
├── dreams/         رؤى مدمجة من مهام النوم (Sleep Jobs)
└── archive/
    ├── compressed/ ذكريات باهتة — جوهر فقط، لا تزال قابلة للاسترجاع
    └── frozen/     ذكريات كامنة — لم تعد قابلة للاسترجاع
```

---

## `cerebralos sleep`

تشغيل النسيان النشط + دمج الأحلام.

```bash
cerebralos sleep
```

**المرحلة 1 — النسيان النشط:**

| العمر | ما يحدث |
|-----|-------------|
| 0–30 يومًا | يبقى في `core/` أو `peripheral/` — تفاصيل كاملة |
| 30–90 يومًا | يُضغط إلى `archive/compressed/` — يستخلص LLM الجوهر |
| أكثر من 90 يومًا | يُنقل إلى `archive/frozen/` — لم يعد قابلاً للاسترجاع |

الملفات الموسومة بـ `#pinned` محمية من كل أنواع النسيان.

**المرحلة 2 — دمج الأحلام:**
- يقرأ الذكريات الأخيرة
- يستدعي LLM لإيجاد روابط غير واضحة
- يحفظ الحلم في `dreams/YYYY-MM-DD.md`
- يُحدّث `dreams/latest.md` ببصيرة الصباح

**إعدادات LLM** (`~/.cerebralos/.brain/config.json`):

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

**المزودون المدعومون:** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

يُظهر بصيرة الصباح من حلم الليلة الماضية.

```bash
cerebralos wake
```

**الإخراج:**
```
☀  Good morning. I remembered something while you slept.

  The two projects you've been running in parallel share the same
  underlying problem — context, not compute, is the bottleneck.

  (from 2026-03-17 — run `cerebralos sleep` to dream again)
```

يعود بصمت (Zero UI) إذا لم يكن هناك حلم بعد.

---

## `cerebralos recall <query>`

يبحث في الذكريات باستخدام إكمال نمط TF-IDF.

```bash
cerebralos recall "authentication architecture"
cerebralos recall "why we switched to postgres"
cerebralos recall "Q1 goals"
```

**الإخراج:**
```
Recalling: "authentication architecture"...

  ✦ Something surfaced.

  1. core/auth-decisions.md
  ● 3 days ago
     We chose JWT over sessions because...

  2. archive/compressed/old-auth-notes.md
  ◌ 2 months ago — faded
     Auth rewrite discussion. Key decision: stateless tokens...
```

**طبقات الذاكرة في النتائج:**
- `●` نشطة — مقتطف كامل (200 حرف)
- `◌ faded` — مقتطف مضغوط (120 حرفًا)، التفاصيل تلاشت
- الذكريات المجمدة لا تظهر أبدًا

---

## `cerebralos setup`

ربط وكلاء الذكاء الاصطناعي بدماغك.

```bash
cerebralos setup                      # يُظهر قواعد لنسخها ولصقها
cerebralos setup --auto               # يكتب تلقائيًا لجميع الوكلاء المكتشفين
cerebralos setup --agent claude-code  # يستهدف وكيلًا واحدًا
cerebralos setup --agent cursor --auto
```

**تم الكشف تلقائيًا:** Claude Code, Cursor, Windsurf

**ماذا يفعل:**
- يولد قواعد دمج توجه الوكلاء لكتابة ملخصات الجلسة إلى `peripheral/`
- مع `--auto`: يكتب مباشرة إلى ملفات إعدادات الوكيل
  - Claude Code ← `~/.claude/CLAUDE.md`
  - Cursor ← `.cursorrules`
  - Windsurf ← `.windsurfrules`
- يستخدم علامات `<!-- cerebralos-integration -->` — آمن لإعادة التشغيل (يُحدّث في مكانه، لا توجد تكرارات)

---

## `cerebralos import`

استيراد ذكريات خارجية إلى `peripheral/imported/`.

```bash
cerebralos import --from ~/Downloads/conversations.json   # تصدير ChatGPT
cerebralos import --from ~/notes/decisions.md             # ملف Markdown واحد
cerebralos import --from ~/ObsidianVault                  # المخزن بالكامل
cerebralos import --from ./log.json --type chatgpt        # فرض النوع
```

**الأنواع المكتشفة تلقائيًا:**

| الامتداد / المسار | يُكتشف كـ |
|-----------------|-------------|
| `.json` | `chatgpt` |
| `.md` | `markdown` |
| دليل | `folder` (يستورد جميع ملفات `.md` بشكل متكرر) |

بعد الاستيراد، قم بتشغيل `cerebralos sleep` لدمجها في دماغك.

---

## `cerebralos hook`

تثبيت خطاف شل Zero UI.

```bash
cerebralos hook
```

يُلحق `cerebralos wake` بـ `~/.zshrc` أو `~/.bashrc`.
كل جلسة طرفية جديدة ستعرض بصيرة الصباح الخاصة بك تلقائيًا.

---

## `cerebralos mcp`

بدء خادم MCP لدمج وكلاء الذكاء الاصطناعي.

```bash
cerebralos mcp   # يُستدعى بواسطة مضيف الوكيل، وليس مباشرة
```

**إعدادات MCP:**
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

**الأدوات المكشوفة:**

| الأداة | الوصف |
|------|-------------|
| `search_memory(query)` | البحث في الذاكرة الأساسية عن الكيانات أو المفاهيم |
| `recall_context(query)` | استرجاع السياق الكامل لكيان معين |
| `write_memory(content, filename?)` | كتابة ذاكرة إلى `peripheral/` |

`write_memory` هي الطريقة التي يحفظ بها الوكلاء المتصلون بـ MCP ملخصات جلساتهم.
إذا كان ملف يحمل نفس الاسم موجودًا، يتم إلحاق المحتوى (وليس الكتابة فوقه).

---

## `cerebralos explore`

متصفح TUI تفاعلي.

```bash
cerebralos explore
```

تصفح باستخدام `↑↓`، اختر باستخدام `Enter`، اخرج باستخدام `q`.

---

## تنسيق ملف الذاكرة

اكتب الذكريات بتنسيق Markdown. الهيكل مرن، ولكن هذا التنسيق يعمل بشكل جيد:

```markdown
# اسم المشروع أو الموضوع
*2026-03-17*

## ما حدث
- بناء أمر cerebralos setup
- التحقق من عمل النسيان ذي المرحلتين بشكل صحيح

## القرارات المتخذة
- استخدام Gemini 2.5 Flash كمزود LLM الافتراضي

## أسئلة مفتوحة
- هل ينبغي تجميد الذكريات المجمدة يدويًا في أي وقت؟
```

احفظ إلى:
- `~/.cerebralos/core/` — للمعرفة طويلة الأمد والمستقرة
- `~/.cerebralos/peripheral/` — للسياق الأخير وملاحظات الجلسة

وسم بـ `#pinned` في أي مكان في الملف لحمايته من النسيان.
