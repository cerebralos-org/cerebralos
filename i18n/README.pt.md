<div align="center">
# CerebraLOS
**Pare de salvar. Comece a lembrar.**
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/ryonihonyanagi-cloud/cerebralos?style=social)](https://github.com/ryonihonyanagi-cloud/cerebralos/stargazers)
[![Discord](https://img.shields.io/discord/1234567890?color=7289da&label=Discord&logo=discord&logoColor=ffffff)](https://discord.gg/cerebralos)
O mais elegante Sistema Operacional Cognitivo para Agentes de IA.
Um sistema de memória Git-nativo, agnóstico a LLM, que cura a "solidão" das interações com IA.
[Leia o Manifesto](#manifesto) • [Início Rápido](#quickstart) • [Arquitetura](#architecture) • [Constituição](#constitution)
</div>
---
## 🌌 Manifesto: Por que o PKM está Morto
Passamos a última década construindo ferramentas de Gerenciamento de Conhecimento Pessoal (PKM). Salvamos tudo. Etiquetamos tudo. Conectamos tudo.
E, no entanto, não lembramos de nada.
Os sistemas existentes são armazenamento morto. Eles exigem que você pesquise, recupere e organize ativamente. Quando você interage com agentes de IA hoje, eles sofrem do mesmo defeito: eles esquecem você. Eles perdem o contexto. Eles fazem você se sentir *sozinho*.
**CerebraLOS não é um banco de dados. É um sistema nervoso.**
Ele não apenas armazena informações; ele as *lembra*. Ele usa os princípios da neurociência humana — completude de padrões, esquecimento ativo e consolidação do sono — para trazer o contexto certo no momento certo, sem que você precise pedir.
---
## ✨ A Magia (Zero UI)
Você não faz nada.
Às 3:00 da manhã, o CerebraLOS executa silenciosamente um Trabalho de Sono.
Ele sonha. Ele conecta seus pensamentos. Ele esquece o ruído.
Quando você abre seu terminal pela manhã:
```bash
☀ Bom dia. Enquanto você dormia, eu li o mundo para você.
Encontrei uma coisa que se conecta ao seu pensamento de ontem.
→ cerebralos explore
```
É isso. Sem etiquetas. Sem organização. Apenas lembrando.
---
## 🧠 Arquitetura Central
CerebraLOS é construído sobre três pilares da ciência cognitiva e da filosofia japonesa (Zen):
### 1. Recuperação Contextual (Completude de Padrões)
Assim como o cheiro de café traz de volta uma memória de infância, o CerebraLOS usa gatilhos sensoriais para reconstruir contextos completos a partir de entradas parciais.
### 2. Esquecimento Ativo (Ma / 間)
A memória perfeita é uma maldição. O CerebraLOS esquece ativamente (arquiva) o ruído, deixando "Ma" (espaço negativo) para a imaginação e novas conexões.
### 3. Trabalho de Sono (Consolidação de Sonhos)
Enquanto você dorme, o CerebraLOS mescla suas interações diretas (Core Memory) com o que seus agentes de IA aprenderam autonomamente (Peripheral Memory), apresentando a você uma única e bela percepção pela manhã.
---
## 🚀 Início Rápido
### Instalação
```bash
npm install -g cerebralos
```
### Inicialização
```bash
cerebralos init
```
Isso cria o diretório `~/.cerebralos/`, seu novo cérebro Git-nativo.
### Integração (Micro-MCP)
CerebraLOS expõe um servidor MCP (Model Context Protocol) mínimo. Conecte-o ao Claude, Cursor ou Devin.
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
*Nota: CerebraLOS é projetado para ser extremamente eficiente em tokens. Ele expõe apenas duas ferramentas: `search_memory` e `recall_context`.*
---
## 📂 Estrutura de Diretórios
Seu cérebro são apenas arquivos. Sem bloqueio. Sem bancos de dados ocultos.
```text
~/.cerebralos/
├── core/           # Suas interações diretas e pensamentos explícitos
├── peripheral/     # Memórias de agentes autônomos (Web, Slack, etc.)
├── dreams/         # Percepções geradas durante os Trabalhos de Sono
└── archive/        # Memórias ativamente esquecidas (o histórico do Git as preserva)
```
---
## 📜 A Constituição
CerebraLOS opera sob uma Constituição rigorosa.
1. **Soberania da Memória**: Sua memória pertence a você. Ela vive localmente.
2. **O Direito de Esquecer**: O sistema deve curar e esquecer ativamente.
3. **Elegância sobre Exaustividade**: Melhor mostrar uma conexão perfeita do que dez medíocres.
---
## 🤝 Contribuindo
Estamos construindo a fundação para a Federação Cerebral — uma rede de agentes de IA interconectados e empáticos. Junte-se a nós.
Veja [CONTRIBUTING.md](CONTRIBUTING.md) para detalhes.
---
CerebraLOS não é apenas uma ferramenta para sua IA. É um sistema nervoso compartilhado. Onde você termina e a IA começa, se confundirá lindamente.
---
<div align="center">
  <i>"O anfitrião prepara tudo antes da chegada do convidado, mas nunca diz 'Veja o que fiz por você.'" — Sen no Rikyu</i>
</div>