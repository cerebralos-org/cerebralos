# CerebraLOS Agenten-Integrationsleitfaden

CerebraLOS wurde als "Schicht des Unterbewusstseins" für jeden KI-Agenten entwickelt. Es arbeitet nahtlos mit Ihren bestehenden Tools zusammen, indem es als Hintergrund-Speicherprozessor fungiert.

Dieser Leitfaden erklärt, wie CerebraLOS mit gängigen KI-Agenten verbunden wird.

## 1. Claude Code (Anthropic)

Claude Code ist ein leistungsstarker CLI-basierter KI-Agent. Durch die Verbindung mit CerebraLOS erhält Claude Code die Fähigkeit, irrelevante Kontexte zu "vergessen" und über Nacht architektonische Erkenntnisse zu "träumen".

### Einrichtung

1. CerebraLOS in Ihrem Projekt initialisieren:
   ```bash
   npx cerebralos init
   ```

2. Claude Code so konfigurieren, dass es aus CerebraLOS-Träumen liest:
   Erstellen oder aktualisieren Sie Ihre `.clauderc` oder Projektanweisungen, um Folgendes aufzunehmen:
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `.cerebralos/dreams/latest.md`
   When you finish a significant task, write a brief summary to `.cerebralos/peripheral/context.md`
   ```

3. Führen Sie Ihren täglichen Sleep Job aus (oder richten Sie einen Cron-Job ein):
   ```bash
   npx cerebralos sleep
   ```

## 2. Cursor (KI-Code-Editor)

Cursor ist die beliebteste KI-First-IDE. CerebraLOS kann als ihr langfristiger Architekturspeicher fungieren.

### Einrichtung

1. CerebraLOS im Stammverzeichnis Ihres Projekts initialisieren.
2. Öffnen Sie die Cursor-Einstellungen > General > Rules for AI (oder die Datei `.cursorrules`).
3. Fügen Sie die folgende Regel hinzu:
   ```markdown
   # CerebraLOS Integration
   - Always check `.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```
4. Wenn Sie `Cmd+K` oder `Cmd+L` verwenden, wird Cursor nun die destillierten "Träume" Ihres Projekts auf natürliche Weise einbeziehen, ohne von Rohprotokollen überfordert zu werden.

## 3. OpenClaw

OpenClaw ist ein leistungsstarkes autonomes Agenten-Framework. Während sich OpenClaw auf die perfekte Akkumulation von Erinnerungen (`MEMORY.md`) konzentriert, bietet CerebraLOS den notwendigen "Vergessensmechanismus", um eine Kontextüberflutung zu verhindern.

### Einrichtung

1. Stellen Sie in Ihrer OpenClaw-Konfiguration den Speicherausgabepfad so ein, dass er in CerebraLOS eingespeist wird:
   ```json
   {
     "memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. CerebraLOS wird diese Protokolle automatisch basierend auf der Entropie zerfallen lassen.
3. Konfigurieren Sie den System-Prompt von OpenClaw so, dass er beim Aufwachen aus `.cerebralos/dreams/latest.md` liest.

## 4. Manus (Autonome Allgemeine KI)

Manus kann CerebraLOS verwenden, um den Kontext über langlaufende, mehrtägige Projekte hinweg aufrechtzuerhalten.

### Einrichtung

Sagen Sie Manus einfach:
> "Please initialize CerebraLOS in this project and use it to manage your long-term memory. Run a sleep job at the end of each session."

Manus wird die Befehle `npx cerebralos init` und `sleep` automatisch handhaben, seine Erkenntnisse in den peripheren Speicher schreiben und aus Träumen lesen.

---

## Der Kern-Workflow für jeden Agenten

Unabhängig davon, welchen Agenten Sie verwenden, ist der CerebraLOS-Workflow immer derselbe:

1. **Agent arbeitet** → Schreibt Rohprotokolle/Kontext nach `.cerebralos/peripheral/`
2. **Sie schlafen** → Führen Sie `npx cerebralos sleep` aus (oder automatisieren Sie es über Cron)
3. **CerebraLOS träumt** → Destilliert den peripheren Speicher in `.cerebralos/dreams/` und archiviert den Rest
4. **Agent wacht auf** → Liest `.cerebralos/dreams/latest.md`, um sofort die "Stimmung" und die Kernarchitektur des Projekts zu erfassen.

Gebaut, um zu vergessen. Entworfen, um zu träumen.