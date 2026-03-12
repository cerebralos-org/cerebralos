# Guia de Integração de Agentes CerebraLOS

CerebraLOS foi projetado para ser a "Camada do Subconsciente" para qualquer agente de IA. Ele funciona perfeitamente com suas ferramentas existentes, atuando como um processador de memória em segundo plano.

Este guia explica como conectar o CerebraLOS a agentes de IA populares.

## 1. Claude Code (Anthropic)

Claude Code é um poderoso agente de IA baseado em CLI. Ao conectá-lo ao CerebraLOS, o Claude Code ganha a capacidade de "esquecer" o contexto irrelevante e "sonhar" com insights arquitetônicos durante a noite.

### Configuração

1. Inicialize o CerebraLOS em seu projeto:
   ```bash
   npx cerebralos init
   ```

2. Configure o Claude Code para ler os "dreams" do CerebraLOS:
   Crie ou atualize seu `.clauderc` ou instruções do projeto para incluir:
   ```markdown
   Before starting any task, ALWAYS read the latest dream insights from `.cerebralos/dreams/latest.md`
   When you finish a significant task, write a brief summary to `.cerebralos/peripheral/context.md`
   ```

3. Execute seu Sleep Job diário (ou configure um cron job):
   ```bash
   npx cerebralos sleep
   ```

## 2. Cursor (Editor de Código AI)

Cursor é o IDE AI-first mais popular. O CerebraLOS pode atuar como sua memória arquitetônica de longo prazo.

### Configuração

1. Inicialize o CerebraLOS na raiz do seu projeto.
2. Abra Cursor Settings > General > Rules for AI (ou arquivo `.cursorrules`).
3. Adicione a seguinte regra:
   ```markdown
   # CerebraLOS Integration
   - Always check `.cerebralos/dreams/` for architectural context before proposing large refactors.
   - Do not memorize everything. Rely on CerebraLOS to surface relevant context.
   ```
4. Ao usar `Cmd+K` ou `Cmd+L`, o Cursor agora incorporará naturalmente os "dreams" destilados do seu projeto sem ser sobrecarregado por logs brutos.

## 3. OpenClaw

OpenClaw é uma poderosa estrutura de agente autônomo. Enquanto o OpenClaw se concentra no acúmulo de memória perfeita (`MEMORY.md`), o CerebraLOS fornece o mecanismo de "esquecimento" necessário para evitar o inchaço do contexto.

### Configuração

1. Na sua configuração do OpenClaw, defina o caminho de saída da memória para alimentar o CerebraLOS:
   ```json
   {
     "memory_path": ".cerebralos/peripheral/openclaw_logs.md"
   }
   ```
2. O CerebraLOS decairá automaticamente esses logs com base na entropia.
3. Configure o prompt do sistema do OpenClaw para ler de `.cerebralos/dreams/latest.md` ao acordar.

## 4. Manus (IA Geral Autônoma)

Manus pode usar o CerebraLOS para manter o contexto em projetos de longa duração e de vários dias.

### Configuração

Basta dizer a Manus:
> "Please initialize CerebraLOS in this project and use it to manage your long-term memory. Run a sleep job at the end of each session."

Manus lidará automaticamente com os comandos `npx cerebralos init` e `sleep`, escrevendo suas descobertas na memória periférica e lendo os "dreams".

---

## O Fluxo de Trabalho Central para Qualquer Agente

Independentemente do agente que você usa, o fluxo de trabalho do CerebraLOS é sempre o mesmo:

1. **O Agente trabalha** → Escreve logs/contexto brutos em `.cerebralos/peripheral/`
2. **Você dorme** → Executa `npx cerebralos sleep` (ou automatiza via cron)
3. **CerebraLOS sonha** → Destila a memória periférica em `.cerebralos/dreams/` e arquiva o restante
4. **O Agente acorda** → Lê `.cerebralos/dreams/latest.md` para compreender instantaneamente a "vibração" e a arquitetura central do projeto.

Construído para esquecer. Projetado para sonhar.
