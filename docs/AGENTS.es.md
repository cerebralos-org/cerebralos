# Guía de Integración de Agentes CerebraLOS

CerebraLOS está diseñado para ser la "Capa del Subconsciente" para cualquier agente de IA. Funciona sin problemas con sus herramientas existentes actuando como un procesador de memoria en segundo plano.

Esta guía explica cómo conectar CerebraLOS a agentes de IA populares.

## 1. Claude Code (Anthropic)

Claude Code es un potente agente de IA basado en CLI. Al conectarlo a CerebraLOS, Claude Code adquiere la capacidad de "olvidar" el contexto irrelevante y "soñar" con ideas arquitectónicas durante la noche.

### Configuración

1. Inicialice CerebraLOS en su proyecto:
   ```bash
   npx cerebralos init
   ```

2. Configure Claude Code para leer los sueños de CerebraLOS:
   Cree o actualice su `.clauderc` o las instrucciones del proyecto para incluir:
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `.cerebralos/dreams/latest.md`
   When you finish a significant task, write a brief summary to `.cerebralos/peripheral/context.md`
   ```

3. Ejecute su trabajo de sueño diario (o configure un trabajo cron):
   ```bash
   npx cerebralos sleep
   ```

## 2. Cursor (Editor de Código AI)

Cursor es el IDE de IA más popular. CerebraLOS puede actuar como su memoria arquitectónica a largo plazo.

### Configuración

1. Inicialice CerebraLOS en la raíz de su proyecto.
2. Abra Configuración de Cursor > General > Reglas para IA (o el archivo `.cursorrules`).
3. Agregue la siguiente regla:
   ```markdown
   # CerebraLOS Integration
   - Always check `.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```
4. Cuando use `Cmd+K` o `Cmd+L`, Cursor incorporará naturalmente los "sueños" destilados de su proyecto sin ser abrumado por los registros brutos.

## 3. OpenClaw

OpenClaw es un potente marco de agente autónomo. Mientras que OpenClaw se centra en la acumulación de memoria perfecta (`MEMORY.md`), CerebraLOS proporciona el mecanismo de "olvido" necesario para evitar la sobrecarga de contexto.

### Configuración

1. En su configuración de OpenClaw, establezca la ruta de salida de la memoria para alimentar a CerebraLOS:
   ```json
   {
     "memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. CerebraLOS decaerá automáticamente estos registros basándose en la entropía.
3. Configure el prompt del sistema de OpenClaw para leer de `.cerebralos/dreams/latest.md` al despertar.

## 4. Manus (IA General Autónoma)

Manus puede usar CerebraLOS para mantener el contexto en proyectos de larga duración y de varios días.

### Configuración

Simplemente dígale a Manus:
> "Please initialize CerebraLOS in this project and use it to manage your long-term memory. Run a sleep job at the end of each session."

Manus manejará automáticamente los comandos `npx cerebralos init` y `sleep`, escribiendo sus hallazgos en la memoria periférica y leyendo de los sueños.

---

## El Flujo de Trabajo Central para Cualquier Agente

Independientemente del agente que utilice, el flujo de trabajo de CerebraLOS es siempre el mismo:

1. **El agente trabaja** → Escribe registros/contexto brutos en `.cerebralos/peripheral/`
2. **Usted duerme** → Ejecuta `npx cerebralos sleep` (o automatiza a través de cron)
3. **CerebraLOS sueña** → Destila la memoria periférica en `.cerebralos/dreams/` y archiva el resto
4. **El agente se despierta** → Lee `.cerebralos/dreams/latest.md` para captar instantáneamente la "onda" y la arquitectura central del proyecto.

Construido para olvidar. Diseñado para soñar.
