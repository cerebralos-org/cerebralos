[English](../README.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | **Português** | [Italiano](README.it.md) | [Русский](README.ru.md)

# CerebraLOS

> **Sua IA lembra de tudo. É por isso que ela não te entende.**

[![npm version](https://badge.fury.io/js/cerebralos.svg)](https://badge.fury.io/js/cerebralos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CerebraLOS é um Sistema Operacional Cognitivo para agentes de IA. Um cérebro, compartilhado entre todas as ferramentas que você usa — Claude Code, Codex, Cursor, Ollama, ou qualquer outra.

Não pede para você organizar. Não pede para você configurar.
Você trabalha. Ele lembra o que importa. Esquece o resto.

## Instalação

```bash
npm install -g cerebralos
cerebralos init
```

É isso. Nenhum comando para lembrar depois disso.

- **Abra um terminal** → seu Morning Insight aparece
- **Trabalhe com qualquer ferramenta de IA** → memórias são salvas automaticamente via MCP
- **Toda noite às 3h** → seu cérebro consolida e sonha

## O que acontece por dentro

```
Você trabalha com ferramentas de IA durante o dia
        ↓
Cada ferramenta escreve em peripheral/ (via MCP ou CLI)
        ↓
Às 3h da manhã, o Sleep Job é executado:
  1. Orient     — escaneia todas as memórias
  2. Gather     — encontra o que é novo
  3. Consolidate — corrige datas, mescla duplicatas, sinaliza contradições
  4. Dream      — encontra uma conexão silenciosa entre seus pensamentos
  5. Prune      — arquiva o que desvaneceu, abre espaço
        ↓
Na manhã seguinte, você abre um terminal:

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

Um insight. Não dez. Não um resumo. Apenas o que importa.

## Como as ferramentas de IA se conectam

CerebraLOS fala MCP. Qualquer ferramenta que suporte MCP pode ler e escrever memórias automaticamente.

```bash
# Já configurado durante `cerebralos init` para Claude Code.
# Para outras ferramentas, adicione à configuração MCP delas:
{ "command": "cerebralos", "args": ["mcp"] }
```

Ferramentas MCP disponíveis:

| Ferramenta | O que faz |
|------|-------------|
| `write_memory` | Salvar um insight, decisão ou observação |
| `search_memory` | Encontrar memórias relevantes por palavra-chave |
| `recall_context` | Recuperar contexto para um conceito |
| `list_dreams` | Ler Morning Insights recentes |

Suas ferramentas de IA chamam estas por conta própria. Você não precisa.

## Idioma

Os Morning Insights falam seu idioma. Configure uma vez em `~/.cerebralos/.brain/config.json`:

```json
{
  "language": "ja"
}
```

Funciona com qualquer idioma que seu LLM conheça.

## Configuração do LLM

CerebraLOS detecta automaticamente seu LLM. Nenhuma configuração necessária se você tiver uma API key no seu ambiente.

Ordem de detecção: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → Ollama (localhost) → `llm`/`claude` CLI

Para configurar explicitamente:

```json
{
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514"
  }
}
```

Provedores: `claude` | `openai` | `ollama` | `cli` | `auto` | `none`

Sem LLM? Ainda funciona — apenas sonhos mais simples.

## Arquitetura

```
~/.cerebralos/
├── core/          Seu conhecimento de longo prazo (imutável por ferramentas)
├── peripheral/    Observações recentes de ferramentas de IA (volátil)
├── dreams/        Morning Insights dos Sleep Jobs
├── archive/       Memórias desvanecidas — recuperáveis, não deletadas
└── .brain/        Configuração e estado
```

- **core/** é você. Ferramentas não escrevem aqui.
- **peripheral/** é o mundo. Ferramentas escrevem aqui livremente.
- **dreams/** é onde eles se encontram, uma vez por noite.
- Nada é deletado. Apenas arquivado.

## Referência CLI

A maioria dos usuários nunca precisa disto. São para depuração ou uso manual.

```bash
cerebralos init                  # Configuração inicial (shell hook + agendamento noturno + MCP)
cerebralos wake                  # Mostrar o Morning Insight de hoje
cerebralos sleep                 # Executar o Sleep Job manualmente
cerebralos recall <query>        # Pesquisar suas memórias
cerebralos write --from <src> --topic <t> --body <b>   # Escrever uma memória manualmente
cerebralos mcp                   # Iniciar o servidor MCP (chamado por ferramentas de IA)
```

## Design

CerebraLOS é construído sobre algumas crenças silenciosas:

- **Esquecer é uma funcionalidade.** Memórias desvanecem após 30 dias a menos que se provem úteis. Isso não é perda de dados — é foco.
- **Um é suficiente.** O Sleep Job encontra uma conexão por noite, não dez. Se você precisa de um resumo, você tem a ferramenta errada.
- **Não pergunte ao usuário.** Sem categorias para escolher, sem tags para adicionar, sem painéis para verificar. O cérebro se gerencia sozinho.
- **Ferramentas mudam. O cérebro permanece.** Claude, GPT, Ollama, o que vier depois — todos escrevem no mesmo peripheral/. A camada de conectores se adapta. Suas memórias não migram.

## Documentação

- [CONSTITUTION](../docs/CONSTITUTION.md) — As 4 leis fundamentais
- [ARCHITECTURE](../docs/ARCHITECTURE.md) — O modelo do cérebro triuno
- [ZERO_UI](../docs/ZERO_UI.md) — Automação invisível
- [DESIGN_PRINCIPLES](../docs/DESIGN_PRINCIPLES.md) — Filosofia em código
- [CONNECTORS](../docs/CONNECTORS.md) — Como as ferramentas se conectam

## Licença

MIT. Veja [LICENSE](../LICENSE).
