memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. سيقوم CerebraLOS تلقائيًا بتحلل هذه السجلات بناءً على الإنتروبيا.
3. قم بتكوين موجه نظام OpenClaw للقراءة من `.cerebralos/dreams/latest.md` عند الاستيقاظ.

## 4. Manus (ذكاء اصطناعي عام مستقل)

يمكن لـ Manus استخدام CerebraLOS للحفاظ على السياق عبر المشاريع طويلة الأمد التي تستغرق عدة أيام.

### الإعداد

ما عليك سوى إخبار Manus:
> "Please initialize CerebraLOS in this project and use it to manage your long-term memory. Run a sleep job at the end of each session."

سيتعامل Manus تلقائيًا مع أوامر `npx cerebralos init` و `sleep`، ويكتب نتائجه إلى الذاكرة الطرفية ويقرأ من الأحلام.

---

## سير العمل الأساسي لأي وكيل

بغض النظر عن الوكيل الذي تستخدمه، فإن سير عمل CerebraLOS هو نفسه دائمًا:

1. **يعمل الوكيل** ← يكتب السجلات/السياق الخام إلى `.cerebralos/peripheral/`
2. **تنام أنت** ← قم بتشغيل `npx cerebralos sleep` (أو أتمتة عبر cron)
3. **يحلم CerebraLOS** ← يستخلص الذاكرة الطرفية إلى `.cerebralos/dreams/` ويؤرشف الباقي
4. **يستيقظ الوكيل** ← يقرأ `.cerebralos/dreams/latest.md` لفهم "الجو العام" والبنية الأساسية للمشروع على الفور.

بني لينسى. صمم ليحلم.