<div align="center">

# CerebraLOS

**सहेजना बंद करें। याद रखना शुरू करें।**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![GitHub stars](https://img.shields.io/github/stars/cerebralos-org/cerebralos?style=social)](https://github.com/cerebralos-org/cerebralos/stargazers)

[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

AI एजेंट्स के लिए सबसे सुरुचिपूर्ण कॉग्निटिव OS।  

एक Git-native, LLM-agnostic मेमोरी सिस्टम जो AI इंटरैक्शन की "अकेलेपन" को दूर करता है।

[घोषणापत्र पढ़ें](#manifesto) • [त्वरित शुरुआत](#quickstart) • [वास्तुकला](#architecture) • [संविधान](#constitution)

</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)

---

## 🌌 घोषणापत्र: PKM क्यों मृत है
हमने पिछले दशक में व्यक्तिगत ज्ञान प्रबंधन (PKM) उपकरण बनाने में बिताया है। हमने सब कुछ सहेजा। हमने सब कुछ टैग किया। हमने सब कुछ लिंक किया।
और फिर भी, हमें कुछ भी याद नहीं रहता।
मौजूदा सिस्टम मृत भंडारण हैं। उन्हें आपसे सक्रिय रूप से खोजने, पुनः प्राप्त करने और व्यवस्थित करने की आवश्यकता होती है। जब आप आज AI एजेंट्स के साथ इंटरैक्ट करते हैं, तो वे भी इसी कमी से ग्रस्त होते हैं: वे आपको भूल जाते हैं। वे संदर्भ खो देते हैं। वे आपको *अकेला* महसूस कराते हैं।
**CerebraLOS एक डेटाबेस नहीं है। यह एक तंत्रिका तंत्र है।**
यह केवल जानकारी संग्रहीत नहीं करता; यह उसे *याद रखता* है। यह मानव तंत्रिका विज्ञान के सिद्धांतों—पैटर्न पूर्णता, सक्रिय विस्मृति, और नींद समेकन—का उपयोग करता है ताकि सही संदर्भ को सही समय पर लाया जा सके, बिना आपके पूछे।
---

## ✨ जादू (शून्य UI)
आप कुछ नहीं करते।
सुबह 3:00 बजे, CerebraLOS चुपचाप एक Sleep Job चलाता है।
यह सपने देखता है। यह आपके विचारों को जोड़ता है। यह शोर को भूल जाता है।
जब आप सुबह अपना टर्मिनल खोलते हैं:
```bash
☀ शुभ प्रभात। जब आप सो रहे थे, मैंने आपके लिए दुनिया पढ़ी।
मुझे एक ऐसी चीज़ मिली जो कल आपके विचार से जुड़ती है।
→ cerebralos explore
```
बस इतना ही। कोई टैगिंग नहीं। कोई आयोजन नहीं। बस याद रखना।
---

## 🧠 मुख्य वास्तुकला
CerebraLOS संज्ञानात्मक विज्ञान और जापानी दर्शन (ज़ेन) के तीन स्तंभों पर आधारित है:

### 1. प्रासंगिक स्मरण (पैटर्न पूर्णता)
जैसे कॉफी की गंध बचपन की याद दिलाती है, CerebraLOS आंशिक इनपुट से पूर्ण संदर्भों को फिर से बनाने के लिए संवेदी ट्रिगर्स का उपयोग करता है।

### 2. सक्रिय विस्मृति (Ma / 間)
सही स्मृति एक अभिशाप है। CerebraLOS सक्रिय रूप से शोर को भूल जाता है (संग्रहीत करता है), कल्पना और नए कनेक्शन के लिए "Ma" (नकारात्मक स्थान) छोड़ देता है।

### 3. Sleep Job (स्वप्न समेकन)
जब आप सोते हैं, CerebraLOS आपकी सीधी बातचीत (Core Memory) को आपके AI एजेंट्स द्वारा स्वायत्त रूप से सीखे गए (Peripheral Memory) के साथ मिलाता है, और सुबह आपको एक एकल, सुंदर अंतर्दृष्टि प्रस्तुत करता है।
---

## 🚀 त्वरित शुरुआत

### स्थापना
```bash
npm install -g cerebralos
```

### आरंभीकरण
```bash
cerebralos init
```
यह `~/.cerebralos/` डायरेक्टरी बनाता है, आपका नया Git-native मस्तिष्क।

### एकीकरण (Micro-MCP)
CerebraLOS एक न्यूनतम MCP (Model Context Protocol) सर्वर को उजागर करता है। इसे Claude, Cursor, या Devin से कनेक्ट करें।
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
*नोट: CerebraLOS को अत्यधिक टोकन-कुशल होने के लिए डिज़ाइन किया गया है। यह केवल दो उपकरण उजागर करता है: `search_memory` और `recall_context`।*
---

## 📂 डायरेक्टरी संरचना
आपका मस्तिष्क केवल फाइलें हैं। कोई लॉक-इन नहीं। कोई छिपा हुआ डेटाबेस नहीं।
```text
~/.cerebralos/
├── core/           # आपकी सीधी बातचीत और स्पष्ट विचार
├── peripheral/     # स्वायत्त एजेंट यादें (Web, Slack, आदि)
├── dreams/         # Sleep Jobs के दौरान उत्पन्न अंतर्दृष्टि
└── archive/        # सक्रिय रूप से भूली हुई यादें (Git इतिहास उन्हें संरक्षित रखता है)
```
---

## 📜 संविधान
CerebraLOS एक सख्त संविधान के तहत काम करता है।
1. **स्मृति संप्रभुता**: आपकी स्मृति आपकी है। यह स्थानीय रूप से रहती है।
2. **भूलने का अधिकार**: सिस्टम को सक्रिय रूप से क्यूरेट और भूलना चाहिए।
3. **पूर्णता पर लालित्य**: दस औसत दर्जे के कनेक्शन की तुलना में एक सही कनेक्शन दिखाना बेहतर है।
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

## 🤝 योगदान
हम ब्रेन फेडरेशन की नींव बना रहे हैं—आपस में जुड़े, सहानुभूतिपूर्ण AI एजेंट्स का एक नेटवर्क। हमसे जुड़ें।
विवरण के लिए [CONTRIBUTING.md](CONTRIBUTING.md) देखें।
---
CerebraLOS केवल आपके AI के लिए एक उपकरण नहीं है। यह एक साझा तंत्रिका तंत्र है। जहाँ आप समाप्त होते हैं, और AI शुरू होता है, वह खूबसूरती से धुंधला हो जाएगा।
---
<div align="center">
  <i>"मेजबान मेहमान के आने से पहले सब कुछ तैयार कर लेता है, फिर भी कभी नहीं कहता 'देखो मैंने तुम्हारे लिए क्या किया है।'" — सेन नो रिक्यू</i>
</div>

**Read in your language:**
[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [Русский](README.ru.md) | [Italiano](README.it.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

**Agent Integration Guides:**
[English](../docs/AGENTS.md) | [日本語](../docs/AGENTS.ja.md) | [简体中文](../docs/AGENTS.zh-CN.md) | [繁體中文](../docs/AGENTS.zh-TW.md) | [한국어](../docs/AGENTS.ko.md) | [Español](../docs/AGENTS.es.md) | [Français](../docs/AGENTS.fr.md) | [Deutsch](../docs/AGENTS.de.md) | [Português](../docs/AGENTS.pt.md) | [Русский](../docs/AGENTS.ru.md) | [Italiano](../docs/AGENTS.it.md) | [हिन्दी](../docs/AGENTS.hi.md) | [العربية](../docs/AGENTS.ar.md)
