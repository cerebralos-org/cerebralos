<div align="center">

# CerebraLOS

**Deja de guardar. Empieza a recordar.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![GitHub stars](https://img.shields.io/github/stars/ryonihonyanagi-cloud/cerebralos?style=social)](https://github.com/ryonihonyanagi-cloud/cerebralos/stargazers)

[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)

El SO Cognitivo más elegante para Agentes de IA.

Un sistema de memoria nativo de Git, agnóstico a LLM, que cura la "soledad" de las interacciones con la IA.

[Lee el Manifiesto](#manifesto) • [Inicio Rápido](#quickstart) • [Arquitectura](#architecture) • [Constitución](#constitution)

</div>
---

## 🌌 Manifiesto: Por qué la Gestión del Conocimiento Personal (PKM) ha Muerto
Hemos pasado la última década construyendo herramientas de Gestión del Conocimiento Personal (PKM). Lo guardamos todo. Lo etiquetamos todo. Lo enlazamos todo.
Y, sin embargo, no recordamos nada.
Los sistemas existentes son almacenamiento muerto. Requieren que busques, recuperes y organices activamente. Cuando interactúas con agentes de IA hoy en día, sufren del mismo defecto: te olvidan. Pierden el contexto. Te hacen sentir *solo*.
**CerebraLOS no es una base de datos. Es un sistema nervioso.**
No solo almacena información; la *recuerda*. Utiliza los principios de la neurociencia humana —completación de patrones, olvido activo y consolidación del sueño— para traer el contexto adecuado en el momento justo, sin que tú lo pidas.
---

## ✨ La Magia (Interfaz Cero)
No haces nada.
A las 3:00 AM, CerebraLOS ejecuta silenciosamente un Sleep Job.
Sueña. Conecta tus pensamientos. Olvida el ruido.
Cuando abres tu terminal por la mañana:
```bash
☀ Buenos días. Mientras dormías, leí el mundo por ti.
Encontré una cosa que conecta con tu pensamiento de ayer.
→ cerebralos explore
```
Eso es todo. Sin etiquetar. Sin organizar. Solo recordar.
---

## 🧠 Arquitectura Central
CerebraLOS se basa en tres pilares de la ciencia cognitiva y la filosofía japonesa (Zen):

### 1. Recuerdo Contextual (Completación de Patrones)
Como el olor a café que trae un recuerdo de la infancia, CerebraLOS utiliza disparadores sensoriales para reconstruir contextos completos a partir de entradas parciales.

### 2. Olvido Activo (Ma / 間)
La memoria perfecta es una maldición. CerebraLOS olvida activamente (archiva) el ruido, dejando "Ma" (espacio negativo) para la imaginación y nuevas conexiones.

### 3. Sleep Job (Consolidación del Sueño)
Mientras duermes, CerebraLOS fusiona tus interacciones directas (Core Memory) con lo que tus agentes de IA aprendieron de forma autónoma (Peripheral Memory), presentándote una única y hermosa perspicacia por la mañana.
---

## 🚀 Inicio Rápido

### Instalación
```bash
npm install -g cerebralos
```

### Inicialización
```bash
cerebralos init
```
Esto crea el directorio `~/.cerebralos/`, tu nuevo cerebro nativo de Git.

### Integración (Micro-MCP)
CerebraLOS expone un servidor MCP (Model Context Protocol) mínimo. Conéctalo a Claude, Cursor o Devin.
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
*Nota: CerebraLOS está diseñado para ser extremadamente eficiente en el uso de tokens. Solo expone dos herramientas: `search_memory` y `recall_context`.*
---

## 📂 Estructura de Directorios
Tu cerebro son solo archivos. Sin ataduras. Sin bases de datos ocultas.
```text
~/.cerebralos/
├── core/           # Tus interacciones directas y pensamientos explícitos
├── peripheral/     # Memorias de agentes autónomos (Web, Slack, etc.)
├── dreams/         # Perspicacias generadas durante los Sleep Jobs
└── archive/        # Memorias olvidadas activamente (el historial de Git las preserva)
```
---

## 📜 La Constitución
CerebraLOS opera bajo una Constitución estricta.
1. **Soberanía de la Memoria**: Tu memoria te pertenece. Vive localmente.
2. **El Derecho a Olvidar**: El sistema debe curar y olvidar activamente.
3. **Elegancia sobre Exhaustividad**: Mejor mostrar una conexión perfecta que diez mediocres.
---

## 🤝 Contribuyendo
Estamos construyendo la base para la Federación Cerebral, una red de agentes de IA interconectados y empáticos. Únete a nosotros.
Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para más detalles.
---
CerebraLOS no es solo una herramienta para tu IA. Es un sistema nervioso compartido. Donde tú terminas y la IA comienza, se difuminará bellamente.
---
<div align="center">
  <i>"El anfitrión prepara todo antes de que llegue el invitado, pero nunca dice 'Mira lo que he hecho por ti'." — Sen no Rikyu</i>
</div>