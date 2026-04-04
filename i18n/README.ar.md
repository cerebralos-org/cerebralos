<div dir="rtl">

# CerebraLOS

> **ذكاؤك الاصطناعي يتذكر كل شيء. لهذا السبب لا يفهمك.**

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | **العربية**

---

CerebraLOS هو نظام تشغيل معرفي لوكلاء الذكاء الاصطناعي. دماغ واحد، مشترك عبر كل أداة تستخدمها — Claude Code أو Codex أو Cursor أو Ollama أو أي شيء آخر.

لا يطلب منك التنظيم. لا يطلب منك الإعداد.
أنت تعمل. وهو يتذكر ما يهم. والباقي ينساه.

## التثبيت

```bash
npm install -g cerebralos
cerebralos init
```

هذا كل شيء. لا أوامر تحتاج تذكّرها بعد ذلك.

- **افتح الطرفية** ← يظهر Morning Insight الخاص بك
- **اعمل مع أي أداة AI** ← تُحفظ الذكريات تلقائيًا عبر MCP
- **كل ليلة الساعة 3 صباحًا** ← دماغك يتوحّد ويحلم

## ماذا يحدث بالداخل

```
تعمل مع أدوات AI طوال اليوم
        ↓
كل أداة تكتب في peripheral/ (عبر MCP أو CLI)
        ↓
في الساعة 3 صباحًا، يعمل Sleep Job:
  1. Orient     — مسح جميع الذكريات
  2. Gather     — إيجاد ما هو جديد
  3. Consolidate — تصحيح التواريخ، دمج المكررات، تمييز التناقضات
  4. Dream      — إيجاد رابط هادئ واحد بين أفكارك
  5. Prune      — أرشفة ما تلاشى، وإفساح المجال
        ↓
في الصباح التالي، تفتح الطرفية:

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

رؤية واحدة. ليست عشرة. ليست ملخصًا. فقط تلك التي تهم.

## كيف تتصل أدوات AI

يتحدث CerebraLOS بروتوكول MCP. أي أداة تدعم MCP يمكنها قراءة وكتابة الذكريات تلقائيًا.

<div dir="ltr">

```bash
# Already configured during `cerebralos init` for Claude Code.
# For other tools, add to their MCP config:
{ "command": "cerebralos", "args": ["mcp"] }
```

</div>

أدوات MCP المتاحة:

| الأداة | ماذا تفعل |
|--------|-----------|
| `write_memory` | حفظ رؤية أو قرار أو ملاحظة |
| `search_memory` | البحث عن ذكريات ذات صلة بكلمة مفتاحية |
| `recall_context` | استرجاع السياق لمفهوم معين |
| `list_dreams` | قراءة Morning Insights الأخيرة |

أدوات AI الخاصة بك تستدعي هذه تلقائيًا. لست بحاجة لفعل ذلك.

## اللغة

Morning Insights يتحدث بلغتك. اضبطها مرة واحدة في `~/.cerebralos/.brain/config.json`:

<div dir="ltr">

```json
{
  "language": "ja"
}
```

</div>

يعمل مع أي لغة يعرفها LLM الخاص بك.

## إعداد LLM

يكتشف CerebraLOS نموذج LLM الخاص بك تلقائيًا. لا حاجة لإعداد إذا كان لديك API key في بيئتك.

ترتيب الاكتشاف: `ANTHROPIC_API_KEY` ← `OPENAI_API_KEY` ← Ollama (localhost) ← `llm`/`claude` CLI

للتعيين يدويًا:

<div dir="ltr">

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514"
  }
}
```

</div>

المزودون: `claude` | `openai` | `ollama` | `cli` | `auto` | `none`

لا يوجد LLM؟ لا يزال يعمل — فقط أحلام أبسط.

## البنية المعمارية

<div dir="ltr">

```
~/.cerebralos/
├── core/          معرفتك طويلة الأمد (لا يمكن للأدوات تعديلها)
├── peripheral/    ملاحظات حديثة من أدوات AI (متقلبة)
├── dreams/        Morning Insights من Sleep Jobs
├── archive/       ذكريات تلاشت — قابلة للاسترداد، لم تُحذف
└── .brain/        الإعدادات والحالة
```

</div>

- **core/** هو أنت. الأدوات لا تكتب هنا.
- **peripheral/** هو العالم. الأدوات تكتب هنا بحرية.
- **dreams/** هو حيث يلتقيان، مرة كل ليلة.
- لا شيء يُحذف أبدًا. يُؤرشف فقط.

## مرجع CLI

معظم المستخدمين لا يحتاجون هذه الأوامر. إنها للتصحيح أو الاستخدام اليدوي.

<div dir="ltr">

```bash
cerebralos init                  # الإعداد الأول (shell hook + جدول ليلي + MCP)
cerebralos wake                  # عرض Morning Insight اليوم
cerebralos sleep                 # تشغيل Sleep Job يدويًا
cerebralos recall <query>        # البحث في ذكرياتك
cerebralos write --from <src> --topic <t> --body <b>   # كتابة ذاكرة يدويًا
cerebralos mcp                   # تشغيل خادم MCP (تستدعيه أدوات AI)
```

</div>

## التصميم

بُني CerebraLOS على بضعة قناعات هادئة:

- **النسيان ميزة.** الذكريات تتلاشى بعد 30 يومًا ما لم تثبت فائدتها. هذا ليس فقدان بيانات — إنه تركيز.
- **واحدة تكفي.** يجد Sleep Job رابطًا واحدًا كل ليلة، ليس عشرة. إذا كنت بحاجة لملخص، فأنت تستخدم الأداة الخطأ.
- **لا تسأل المستخدم.** لا فئات للاختيار، لا وسوم لإضافتها، لا لوحات تحكم للمراجعة. الدماغ يدير نفسه.
- **الأدوات تتغير. الدماغ يبقى.** Claude أو GPT أو Ollama أو أيًا كان ما سيأتي — الكل يكتب في نفس peripheral/. طبقة الموصّلات تتكيف. ذكرياتك لا تحتاج ترحيلًا.

## التوثيق

- [CONSTITUTION](../docs/CONSTITUTION.md) — القوانين الأساسية الأربعة
- [ARCHITECTURE](../docs/ARCHITECTURE.md) — نموذج الدماغ الثلاثي
- [ZERO_UI](../docs/ZERO_UI.md) — الأتمتة غير المرئية
- [DESIGN_PRINCIPLES](../docs/DESIGN_PRINCIPLES.md) — الفلسفة في الكود
- [CONNECTORS](../docs/CONNECTORS.md) — كيف تتصل الأدوات

## الرخصة

MIT. انظر [LICENSE](../LICENSE).

</div>
