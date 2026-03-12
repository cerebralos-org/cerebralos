# CerebraLOS एजेंट एकीकरण गाइड

CerebraLOS को किसी भी AI एजेंट के लिए "अवचेतन की परत" के रूप में डिज़ाइन किया गया है। यह एक पृष्ठभूमि मेमोरी प्रोसेसर के रूप में कार्य करके आपके मौजूदा उपकरणों के साथ सहजता से काम करता है।

यह गाइड बताता है कि CerebraLOS को लोकप्रिय AI एजेंटों से कैसे जोड़ा जाए।

## 1. Claude Code (Anthropic)

Claude Code एक शक्तिशाली CLI-आधारित AI एजेंट है। इसे CerebraLOS से जोड़कर, Claude Code अप्रासंगिक संदर्भ को "भूलने" और रात भर वास्तुशिल्प अंतर्दृष्टि के बारे में "सपने देखने" की क्षमता प्राप्त करता है।

### सेटअप

1. अपने प्रोजेक्ट में CerebraLOS को इनिशियलाइज़ करें:
   ```bash
   npx cerebralos init
   ```

2. CerebraLOS के सपनों से पढ़ने के लिए Claude Code को कॉन्फ़िगर करें:
   अपने `.clauderc` या प्रोजेक्ट निर्देशों को बनाएं या अपडेट करें जिसमें शामिल हो:
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `.cerebralos/dreams/latest.md`
   When you finish a significant task, write a brief summary to `.cerebralos/peripheral/context.md`
   ```

3. अपनी दैनिक स्लीप जॉब चलाएं (या एक क्रॉन जॉब सेट करें):
   ```bash
   npx cerebralos sleep
   ```

## 2. Cursor (AI Code Editor)

Cursor सबसे लोकप्रिय AI-फर्स्ट IDE है। CerebraLOS इसकी दीर्घकालिक वास्तुशिल्प मेमोरी के रूप में कार्य कर सकता है।

### सेटअप

1. अपने प्रोजेक्ट रूट में CerebraLOS को इनिशियलाइज़ करें।
2. Cursor सेटिंग्स > सामान्य > AI के लिए नियम (या `.cursorrules` फ़ाइल) खोलें।
3. निम्नलिखित नियम जोड़ें:
   ```markdown
   # CerebraLOS Integration
   - Always check `.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```
4. जब आप `Cmd+K` या `Cmd+L` का उपयोग करते हैं, तो Cursor अब कच्चे लॉग से अभिभूत हुए बिना आपके प्रोजेक्ट के आसुत "सपनों" को स्वाभाविक रूप से शामिल करेगा।

## 3. OpenClaw

OpenClaw एक शक्तिशाली स्वायत्त एजेंट फ्रेमवर्क है। जबकि OpenClaw सही मेमोरी संचय (`MEMORY.md`) पर केंद्रित है, CerebraLOS संदर्भ ब्लोट को रोकने के लिए आवश्यक "भूलने" की व्यवस्था प्रदान करता है।

### सेटअप

1. अपने OpenClaw कॉन्फ़िगरेशन में, मेमोरी आउटपुट पथ को CerebraLOS में फीड करने के लिए सेट करें:
   ```json
   {
     "memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. CerebraLOS स्वचालित रूप से इन लॉग को एन्ट्रापी के आधार पर क्षय करेगा।
3. जागने पर `.cerebralos/dreams/latest.md` से पढ़ने के लिए OpenClaw के सिस्टम प्रॉम्प्ट को कॉन्फ़िगर करें।

## 4. Manus (स्वायत्त सामान्य AI)

Manus CerebraLOS का उपयोग लंबी अवधि के, कई दिनों तक चलने वाले प्रोजेक्टों में संदर्भ बनाए रखने के लिए कर सकता है।

### सेटअप

बस Manus को बताएं:
> "कृपया इस प्रोजेक्ट में CerebraLOS को इनिशियलाइज़ करें और अपनी दीर्घकालिक मेमोरी को प्रबंधित करने के लिए इसका उपयोग करें। प्रत्येक सत्र के अंत में एक स्लीप जॉब चलाएं।"

Manus स्वचालित रूप से `npx cerebralos init` और `sleep` कमांड को संभालेगा, अपने निष्कर्षों को पेरिफेरल मेमोरी में लिखेगा और सपनों से पढ़ेगा।

---

## किसी भी एजेंट के लिए मुख्य कार्यप्रवाह

आप जिस भी एजेंट का उपयोग करते हैं, CerebraLOS कार्यप्रवाह हमेशा समान होता है:

1. **एजेंट काम करता है** → कच्चे लॉग/संदर्भ को `.cerebralos/peripheral/` में लिखता है
2. **आप सोते हैं** → `npx cerebralos sleep` चलाएं (या क्रॉन के माध्यम से स्वचालित करें)
3. **CerebraLOS सपने देखता है** → पेरिफेरल मेमोरी को `.cerebralos/dreams/` में आसुत करता है और बाकी को संग्रहीत करता है
4. **एजेंट जागता है** → प्रोजेक्ट के "वाइब" और मुख्य वास्तुकला को तुरंत समझने के लिए `.cerebralos/dreams/latest.md` पढ़ता है।

भूलने के लिए बनाया गया। सपने देखने के लिए डिज़ाइन किया गया।