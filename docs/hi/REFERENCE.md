# CerebraLOS कमांड संदर्भ
> सभी `cerebralos` कमांड के लिए त्वरित संदर्भ।
> अवधारणात्मक दस्तावेज़ों के लिए, [ARCHITECTURE.md](ARCHITECTURE.md) देखें।

---

## स्थिति → कमांड

| मैं चाहता हूँ कि... | कमांड |
|-------------|---------|
| पहली बार शुरू करना | `cerebralos init` |
| Claude Code / Cursor को कनेक्ट करना | `cerebralos setup --auto` |
| आज रात का मेमोरी समेकन चलाना | `cerebralos sleep` |
| आज सुबह की अंतर्दृष्टि देखना | `cerebralos wake` |
| कुछ ऐसा ढूँढना जो मुझे अस्पष्ट रूप से याद है | `cerebralos recall "..."` |
| अपने दिमाग को इंटरैक्टिव रूप से ब्राउज़ करना | `cerebralos explore` |
| पुरानी ChatGPT बातचीत को इम्पोर्ट करना | `cerebralos import --from conversations.json` |
| एक Obsidian वॉल्ट को इम्पोर्ट करना | `cerebralos import --from ~/ObsidianVault` |
| टर्मिनल खुलने पर स्वतः अंतर्दृष्टि दिखाना | `cerebralos hook` |
| MCP के माध्यम से कनेक्ट करना | `cerebralos mcp` |

---

## `cerebralos init`

अपनी ब्रेन डायरेक्टरी को इनिशियलाइज़ करें।

```bash
cerebralos init           # ~/.cerebralos/ (डिफ़ॉल्ट)
cerebralos init --local   # वर्तमान डायरेक्टरी में ./.cerebralos/
```

**यह बनाता है:**
```
~/.cerebralos/
├── core/           दीर्घकालिक यादें (निर्णय, पहचान, निर्देश)
├── peripheral/     अल्पकालिक यादें (हाल का संदर्भ, सत्र नोट्स)
├── dreams/         स्लीप जॉब्स से संश्लेषित अंतर्दृष्टि
└── archive/
    ├── compressed/ धुंधली यादें — केवल सार, फिर भी याद की जाती हैं
    └── frozen/     निष्क्रिय यादें — अब याद नहीं की जातीं
```

---

## `cerebralos sleep`

एक्टिव फॉरगेटिंग + ड्रीम कंसॉलिडेशन चलाएँ।

```bash
cerebralos sleep
```

**चरण 1 — एक्टिव फॉरगेटिंग:**

| उम्र | क्या होता है |
|-----|-------------|
| 0–30 दिन | `core/` या `peripheral/` में रहता है — पूर्ण विवरण |
| 30–90 दिन | `archive/compressed/` में कंप्रेस्ड होता है — LLM सार निकालता है |
| 90+ दिन | `archive/frozen/` में चला जाता है — अब याद नहीं किया जाता |

`#pinned` टैग वाली फाइलें सभी विस्मृति से सुरक्षित रहती हैं।

**चरण 2 — ड्रीम कंसॉलिडेशन:**
- हाल की यादों को पढ़ता है
- गैर-स्पष्ट कनेक्शन खोजने के लिए LLM को कॉल करता है
- सपने को `dreams/YYYY-MM-DD.md` में सहेजता है
- मॉर्निंग इनसाइट के साथ `dreams/latest.md` को अपडेट करता है

**LLM कॉन्फ़िग** (`~/.cerebralos/.brain/config.json`):

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

**समर्थित प्रोवाइडर:** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

पिछली रात के सपने से मॉर्निंग इनसाइट दिखाएँ।

```bash
cerebralos wake
```

**आउटपुट:**
```
☀  शुभ प्रभात। जब आप सो रहे थे तब मुझे कुछ याद आया।

  आप जिन दो प्रोजेक्ट्स को समानांतर रूप से चला रहे हैं, उनमें एक ही अंतर्निहित
  समस्या है — संदर्भ, न कि कंप्यूट, बाधा है।

  (2026-03-17 से — फिर से सपने देखने के लिए `cerebralos sleep` चलाएँ)
```

यदि कोई सपना अभी तक मौजूद नहीं है तो यह चुपचाप (जीरो UI) वापस आ जाता है।

---

## `cerebralos recall <query>`

TF-IDF पैटर्न कंप्लीशन का उपयोग करके यादों को खोजें।

```bash
cerebralos recall "authentication architecture"
cerebralos recall "why we switched to postgres"
cerebralos recall "Q1 goals"
```

**आउटपुट:**
```
याद किया जा रहा है: "authentication architecture"...

  ✦ कुछ सामने आया।

  1. core/auth-decisions.md
  ● 3 दिन पहले
     हमने सेशंस पर JWT को चुना क्योंकि...

  2. archive/compressed/old-auth-notes.md
  ◌ 2 महीने पहले — धुंधला हो गया
     Auth रीराइट चर्चा। मुख्य निर्णय: स्टेटलेस टोकन...
```

**परिणामों में मेमोरी परतें:**
- `●` सक्रिय — पूर्ण स्निपेट (200 वर्ण)
- `◌ faded` — कंप्रेस्ड स्निपेट (120 वर्ण), विवरण क्षीण हो गया है
- निष्क्रिय यादें कभी दिखाई नहीं देतीं

---

## `cerebralos setup`

AI एजेंट्स को अपने दिमाग से कनेक्ट करें।

```bash
cerebralos setup                      # कॉपी-पेस्ट करने के नियम दिखाएँ
cerebralos setup --auto               # सभी पहचाने गए एजेंट्स पर स्वतः लिखें
cerebralos setup --agent claude-code  # एक एजेंट को लक्षित करें
cerebralos setup --agent cursor --auto
```

**स्वचालित रूप से पहचाने गए:** Claude Code, Cursor, Windsurf

**यह क्या करता है:**
- एकीकरण नियम उत्पन्न करता है जो एजेंट्स को सत्र सारांश `peripheral/` में लिखने का निर्देश देते हैं
- `--auto` के साथ: सीधे एजेंट कॉन्फ़िग फ़ाइलों में लिखता है
  - Claude Code → `~/.claude/CLAUDE.md`
  - Cursor → `.cursorrules`
  - Windsurf → `.windsurfrules`
- `<!-- cerebralos-integration -->` मार्कर का उपयोग करता है — फिर से चलाने के लिए सुरक्षित (जगह पर अपडेट करता है, कोई डुप्लिकेट नहीं)

---

## `cerebralos import`

बाहरी यादों को `peripheral/imported/` में इम्पोर्ट करें।

```bash
cerebralos import --from ~/Downloads/conversations.json   # ChatGPT एक्सपोर्ट
cerebralos import --from ~/notes/decisions.md             # सिंगल Markdown
cerebralos import --from ~/ObsidianVault                  # पूरा वॉल्ट
cerebralos import --from ./log.json --type chatgpt        # प्रकार को फोर्स करें
```

**स्वचालित रूप से पहचाने गए प्रकार:**

| एक्सटेंशन / पाथ | इस रूप में पहचाना गया |
|-----------------|-------------|
| `.json` | `chatgpt` |
| `.md` | `markdown` |
| डायरेक्टरी | `folder` (सभी `.md` को रिकर्सिवली इम्पोर्ट करता है) |

इम्पोर्ट करने के बाद, अपने दिमाग में एकीकृत करने के लिए `cerebralos sleep` चलाएँ।

---

## `cerebralos hook`

जीरो UI शेल हुक इंस्टॉल करें।

```bash
cerebralos hook
```

`cerebralos wake` को `~/.zshrc` या `~/.bashrc` में जोड़ता है।
प्रत्येक नया टर्मिनल सत्र आपकी मॉर्निंग इनसाइट को स्वचालित रूप से दिखाएगा।

---

## `cerebralos mcp`

AI एजेंट एकीकरण के लिए MCP सर्वर शुरू करें।

```bash
cerebralos mcp   # एजेंट होस्ट द्वारा कॉल किया जाता है, सीधे नहीं
```

**MCP कॉन्फ़िग:**
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

**उपलब्ध उपकरण:**

| उपकरण | विवरण |
|------|-------------|
| `search_memory(query)` | संस्थाओं या अवधारणाओं के लिए मुख्य मेमोरी खोजें |
| `recall_context(query)` | किसी विशिष्ट संस्था का पूरा संदर्भ याद करें |
| `write_memory(content, filename?)` | `peripheral/` में एक मेमोरी लिखें |

`write_memory` वह तरीका है जिससे MCP से जुड़े एजेंट अपने सत्र सारांश सहेजते हैं।
यदि उसी नाम की कोई फ़ाइल मौजूद है, तो सामग्री जोड़ी जाती है (ओवरराइट नहीं की जाती)।

---

## `cerebralos explore`

इंटरैक्टिव TUI ब्राउज़र।

```bash
cerebralos explore
```

`↑↓` से नेविगेट करें, `Enter` से चुनें, `q` से बाहर निकलें।

---

## मेमोरी फ़ाइल फ़ॉर्मेट

यादों को Markdown में लिखें। संरचना लचीली है, लेकिन यह फ़ॉर्मेट अच्छी तरह काम करता है:

```markdown
# प्रोजेक्ट का नाम या विषय
*2026-03-17*

## क्या हुआ
- cerebralos setup कमांड बनाया
- 2-चरणों वाली फॉरगेटिंग के सही काम करने की पुष्टि की गई

## लिए गए निर्णय
- Gemini 2.5 Flash को डिफ़ॉल्ट LLM प्रोवाइडर के रूप में उपयोग करें

## खुले प्रश्न
- क्या फ्रोजन यादों को कभी मैन्युअल रूप से पिघलाना चाहिए?
```

यहाँ सहेजें:
- `~/.cerebralos/core/` — दीर्घकालिक, स्थिर ज्ञान के लिए
- `~/.cerebralos/peripheral/` — हाल के संदर्भ, सत्र नोट्स के लिए

भूलने से बचाने के लिए फ़ाइल में कहीं भी `#pinned` के साथ टैग करें।
