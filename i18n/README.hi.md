# CerebraLOS

> **आपका AI सब कुछ याद रखता है। इसीलिए वह आपको समझ नहीं पाता।**

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | **हिन्दी** | [العربية](README.ar.md)

---

CerebraLOS AI एजेंट्स के लिए एक Cognitive OS है। एक दिमाग, आपके हर टूल में साझा — Claude Code, Codex, Cursor, Ollama, या कोई भी अन्य।

यह आपसे व्यवस्थित करने को नहीं कहता। यह आपसे कॉन्फ़िगर करने को नहीं कहता।
आप काम करते हैं। यह जो ज़रूरी है वह याद रखता है। बाकी भूल जाता है।

## इंस्टॉल करें

```bash
npm install -g cerebralos
cerebralos init
```

बस। इसके बाद कोई कमांड याद रखने की ज़रूरत नहीं।

- **टर्मिनल खोलें** → आपका Morning Insight दिखाई देता है
- **किसी भी AI टूल के साथ काम करें** → MCP के ज़रिए यादें अपने आप सेव होती हैं
- **हर रात 3 बजे** → आपका दिमाग समेकित होता है और सपने देखता है

## अंदर क्या होता है

```
आप दिनभर AI टूल्स के साथ काम करते हैं
        ↓
हर टूल peripheral/ में लिखता है (MCP या CLI के ज़रिए)
        ↓
रात 3 बजे, Sleep Job चलता है:
  1. Orient     — सभी यादें स्कैन करें
  2. Gather     — नया क्या है, खोजें
  3. Consolidate — तारीखें ठीक करें, डुप्लीकेट मर्ज करें, विरोधाभास चिह्नित करें
  4. Dream      — आपके विचारों के बीच एक शांत कनेक्शन खोजें
  5. Prune      — फीकी यादें आर्काइव करें, जगह बनाएं
        ↓
अगली सुबह, आप टर्मिनल खोलते हैं:

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

एक अंतर्दृष्टि। दस नहीं। सारांश नहीं। बस वह एक जो मायने रखती है।

## AI टूल्स कैसे जुड़ते हैं

CerebraLOS MCP बोलता है। MCP सपोर्ट करने वाला कोई भी टूल अपने आप यादें पढ़ और लिख सकता है।

```bash
# `cerebralos init` के दौरान Claude Code के लिए पहले से कॉन्फ़िगर हो चुका है।
# अन्य टूल्स के लिए, उनकी MCP कॉन्फ़िग में जोड़ें:
{ "command": "cerebralos", "args": ["mcp"] }
```

उपलब्ध MCP टूल्स:

| टूल | क्या करता है |
|------|-------------|
| `write_memory` | एक अंतर्दृष्टि, निर्णय, या अवलोकन सेव करें |
| `search_memory` | कीवर्ड से प्रासंगिक यादें खोजें |
| `recall_context` | किसी अवधारणा का संदर्भ याद करें |
| `list_dreams` | हाल के Morning Insights पढ़ें |

आपके AI टूल्स इन्हें खुद कॉल करते हैं। आपको करने की ज़रूरत नहीं।

## भाषा

Morning Insights आपकी भाषा बोलते हैं। `~/.cerebralos/.brain/config.json` में एक बार सेट करें:

```json
{
  "language": "ja"
}
```

आपका LLM जो भी भाषा जानता है, उसके साथ काम करता है।

## LLM कॉन्फ़िगरेशन

CerebraLOS आपके LLM को अपने आप पहचान लेता है। अगर आपके एनवायरनमेंट में API key है तो कोई सेटअप ज़रूरी नहीं।

पहचान क्रम: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama (localhost) → `llm`/`claude` CLI

मैन्युअल सेटिंग:

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514"
  }
}
```

प्रोवाइडर: `claude` | `openai` | `ollama` | `cli` | `auto` | `none`

LLM नहीं है? फिर भी काम करता है — बस सपने सरल होंगे।

## आर्किटेक्चर

```
~/.cerebralos/
├── core/          आपका दीर्घकालिक ज्ञान (टूल्स द्वारा अपरिवर्तनीय)
├── peripheral/    AI टूल्स के हालिया अवलोकन (अस्थायी)
├── dreams/        Sleep Jobs से Morning Insights
├── archive/       फीकी पड़ी यादें — पुनर्प्राप्ति योग्य, हटाई नहीं गईं
└── .brain/        कॉन्फ़िग और स्थिति
```

- **core/** आप हैं। टूल्स यहाँ नहीं लिखते।
- **peripheral/** दुनिया है। टूल्स यहाँ स्वतंत्र रूप से लिखते हैं।
- **dreams/** वह जगह है जहाँ वे मिलते हैं, हर रात एक बार।
- कुछ भी कभी हटाया नहीं जाता। केवल आर्काइव किया जाता है।

## CLI रेफ़रेंस

अधिकतर उपयोगकर्ताओं को इनकी ज़रूरत नहीं पड़ती। ये डीबगिंग या मैन्युअल उपयोग के लिए हैं।

```bash
cerebralos init                  # पहली बार सेटअप (shell hook + नाइटली शेड्यूल + MCP)
cerebralos wake                  # आज का Morning Insight दिखाएं
cerebralos sleep                 # Sleep Job मैन्युअली चलाएं
cerebralos recall <query>        # अपनी यादें खोजें
cerebralos write --from <src> --topic <t> --body <b>   # मैन्युअली एक याद लिखें
cerebralos mcp                   # MCP सर्वर शुरू करें (AI टूल्स द्वारा कॉल किया जाता है)
```

## डिज़ाइन

CerebraLOS कुछ शांत विश्वासों पर बना है:

- **भूलना एक फ़ीचर है।** यादें 30 दिनों बाद फीकी पड़ जाती हैं, जब तक वे उपयोगी साबित न हों। यह डेटा लॉस नहीं — यह फ़ोकस है।
- **एक काफ़ी है।** Sleep Job हर रात एक कनेक्शन खोजता है, दस नहीं। अगर आपको सारांश चाहिए, तो आप गलत टूल इस्तेमाल कर रहे हैं।
- **उपयोगकर्ता से मत पूछो।** कोई कैटेगरी चुनने की ज़रूरत नहीं, कोई टैग जोड़ने की ज़रूरत नहीं, कोई डैशबोर्ड चेक करने की ज़रूरत नहीं। दिमाग खुद संभालता है।
- **टूल्स बदलते हैं। दिमाग रहता है।** Claude, GPT, Ollama, जो भी आगे आए — सब एक ही peripheral/ में लिखते हैं। Connector Layer ढल जाती है। आपकी यादें माइग्रेट नहीं होतीं।

## दस्तावेज़

- [CONSTITUTION](../docs/CONSTITUTION.md) — 4 मूलभूत नियम
- [ARCHITECTURE](../docs/ARCHITECTURE.md) — Triune Brain मॉडल
- [ZERO_UI](../docs/ZERO_UI.md) — अदृश्य ऑटोमेशन
- [DESIGN_PRINCIPLES](../docs/DESIGN_PRINCIPLES.md) — कोड में दर्शन
- [CONNECTORS](../docs/CONNECTORS.md) — टूल्स कैसे जुड़ते हैं

## लाइसेंस

MIT। देखें [LICENSE](../LICENSE)।
