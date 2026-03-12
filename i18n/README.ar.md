<div align="center">

# CerebraLOS

**توقف عن الحفظ. ابدأ بالتذكر.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![GitHub stars](https://img.shields.io/github/stars/cerebralos-org/cerebralos?style=social)](https://github.com/cerebralos-org/cerebralos/stargazers)

[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

نظام التشغيل المعرفي الأكثر أناقة لوكلاء الذكاء الاصطناعي.  

نظام ذاكرة أصيل لـ Git، لا يعتمد على LLM، يعالج "وحدة" تفاعلات الذكاء الاصطناعي.

[اقرأ البيان](#manifesto) • [بدء سريع](#quickstart) • [الهندسة المعمارية](#architecture) • [الدستور](#constitution)

</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

---

## 🌌 البيان: لماذا ماتت إدارة المعرفة الشخصية (PKM)
لقد أمضينا العقد الماضي في بناء أدوات إدارة المعرفة الشخصية (PKM). حفظنا كل شيء. وضعنا علامات على كل شيء. ربطنا كل شيء.
ومع ذلك، لا نتذكر شيئًا.
الأنظمة الحالية هي مجرد تخزين ميت. تتطلب منك البحث بنشاط واسترجاع وتنظيم. عندما تتفاعل مع وكلاء الذكاء الاصطناعي اليوم، فإنهم يعانون من نفس العيب: ينسونك. يفقدون السياق. يجعلوك تشعر *بالوحدة*.
**CerebraLOS ليس قاعدة بيانات. إنه نظام عصبي.**
إنه لا يخزن المعلومات فحسب؛ بل *يتذكرها*. يستخدم مبادئ علم الأعصاب البشري—إكمال الأنماط، والنسيان النشط، وتوحيد النوم—لجلب السياق الصحيح في اللحظة المناسبة، دون أن تطلب ذلك أبدًا.
---

## ✨ السحر (واجهة مستخدم صفرية)
لا تفعل شيئًا.
في الساعة 3:00 صباحًا، يقوم CerebraLOS بتشغيل وظيفة النوم بصمت.
إنه يحلم. يربط أفكارك. ينسى الضوضاء.
عندما تفتح جهازك في الصباح:
```bash
☀ صباح الخير. بينما كنت نائمًا، قرأت العالم من أجلك.
وجدت شيئًا واحدًا يربط بفكرتك بالأمس.
→ cerebralos explore
```
هذا كل شيء. لا وسم. لا تنظيم. مجرد تذكر.
---

## 🧠 الهندسة المعمارية الأساسية
تم بناء CerebraLOS على ثلاثة أعمدة من العلوم المعرفية والفلسفة اليابانية (الزن):

### 1. الاستدعاء السياقي (إكمال الأنماط)
مثل رائحة القهوة التي تعيد ذكرى الطفولة، يستخدم CerebraLOS المحفزات الحسية لإعادة بناء السياقات الكاملة من المدخلات الجزئية.

### 2. النسيان النشط (Ma / 間)
الذاكرة المثالية لعنة. ينسى CerebraLOS بنشاط (أرشفة) الضوضاء، تاركًا "Ma" (المساحة السلبية) للخيال والروابط الجديدة.

### 3. وظيفة النوم (توحيد الأحلام)
بينما تنام، يدمج CerebraLOS تفاعلاتك المباشرة (الذاكرة الأساسية) مع ما تعلمه وكلاء الذكاء الاصطناعي بشكل مستقل (الذاكرة الطرفية)، ويقدم لك رؤية واحدة جميلة في الصباح.
---

## 🚀 بدء سريع

### Installation
```bash
npx cerebralos init
```

### Initialization
```bash
cerebralos init
```
ينشئ هذا دليل `~/.cerebralos/`، دماغك الجديد الأصيل لـ Git.

### Integration (Micro-MCP)
يكشف CerebraLOS عن خادم MCP (Model Context Protocol) مصغر. قم بتوصيله بـ Claude أو Cursor أو Devin.
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
*ملاحظة: تم تصميم CerebraLOS ليكون فعالاً للغاية في استخدام الرموز. إنه يكشف فقط عن أداتين: `search_memory` و `recall_context`.*
---

## 📂 Directory Structure
دماغك مجرد ملفات. لا يوجد قفل. لا توجد قواعد بيانات مخفية.
```text
~/.cerebralos/
├── core/           # تفاعلاتك المباشرة وأفكارك الصريحة
├── peripheral/     # ذكريات الوكيل المستقل (الويب، Slack، إلخ.)
├── dreams/         # رؤى تم إنشاؤها أثناء وظائف النوم
└── archive/        # ذكريات منسية بنشاط (يحفظها سجل Git)
```
---

## 📜 The Constitution
يعمل CerebraLOS بموجب دستور صارم.
1. **سيادة الذاكرة**: ذاكرتك ملك لك. تعيش محليًا.
2. **الحق في النسيان**: يجب على النظام تنظيم ونسيان بنشاط.
3. **الأناقة فوق الشمولية**: من الأفضل إظهار اتصال واحد مثالي بدلاً من عشرة اتصالات متوسطة.
---


## 📚 Documentation

### Core Philosophy & Architecture
- [CONSTITUTION](../docs/CONSTITUTION.md): The 4 fundamental laws of CerebraLOS.
- [ARCHITECTURE](../docs/ARCHITECTURE.md): Deep dive into the Triune Brain model.
- [ZERO_UI](../docs/ZERO_UI.md): How we achieve invisible automation.

### User Guides & Manuals
- **Onboarding Guide**: How to create your AI brain and connect agents.
  - [English](../docs/GITHUB_WORKFLOW.md) | [日本語](../docs/GITHUB_WORKFLOW.ja.md)
- **Connector Architecture**: How the "building blocks" work (Local-sync vs GitHub-connector).
  - [English](../docs/CONNECTORS.md) | [日本語](../docs/CONNECTORS.ja.md)
- **Agent Integration Guide**: Specific setup instructions for Claude Code, OpenClaw, Manus, etc.
  - [English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

## 🤝 Contributing
نحن نبني الأساس لاتحاد الدماغ—شبكة من وكلاء الذكاء الاصطناعي المترابطين والمتعاطفين. انضم إلينا.
انظر [CONTRIBUTING.md](CONTRIBUTING.md) للحصول على التفاصيل.
---
CerebraLOS ليس مجرد أداة لذكائك الاصطناعي. إنه نظام عصبي مشترك. حيث تنتهي أنت، ويبدأ الذكاء الاصطناعي، سيتلاشى بشكل جميل.
---
<div align="center">
  <i>"يجهز المضيف كل شيء قبل وصول الضيف، ومع ذلك لا يقول أبدًا 'انظر ما فعلته من أجلك'." — Sen no Rikyu</i>
</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

