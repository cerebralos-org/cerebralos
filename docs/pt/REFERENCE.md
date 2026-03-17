# Referência de Comandos CerebraLOS

> Referência rápida para todos os comandos `cerebralos`.
> Para documentação conceitual, consulte [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Situação → Comando

| Eu quero... | Comando |
|-------------|---------|
| Começar pela primeira vez | `cerebralos init` |
| Conectar Claude Code / Cursor | `cerebralos setup --auto` |
| Executar a consolidação de memória desta noite | `cerebralos sleep` |
| Ver a percepção desta manhã | `cerebralos wake` |
| Encontrar algo que lembro vagamente | `cerebralos recall "..."` |
| Navegar interativamente pelo meu cérebro | `cerebralos explore` |
| Importar conversas antigas do ChatGPT | `cerebralos import --from conversations.json` |
| Importar um cofre Obsidian | `cerebralos import --from ~/ObsidianVault` |
| Mostrar percepção automaticamente ao abrir o terminal | `cerebralos hook` |
| Conectar via MCP | `cerebralos mcp` |

---

## `cerebralos init`

Inicializa o seu diretório cerebral.

```bash
cerebralos init           # ~/.cerebralos/ (padrão)
cerebralos init --local   # ./.cerebralos/ no diretório atual
```

**Cria:**
```
~/.cerebralos/
├── core/           Memórias de longo prazo (decisões, identidade, diretrizes)
├── peripheral/     Memórias de curto prazo (contexto recente, notas de sessão)
├── dreams/         Percepções sintetizadas de Jobs de Sono
└── archive/
    ├── compressed/ Memórias desbotadas — apenas o essencial, ainda recordadas
    └── frozen/     Memórias dormentes — não mais recordadas
```

---

## `cerebralos sleep`

Executa o Esquecimento Ativo + Consolidação de Sonhos.

```bash
cerebralos sleep
```

**Fase 1 — Esquecimento Ativo:**

| Idade | O que acontece |
|-----|-------------|
| 0–30 dias | Permanece em `core/` ou `peripheral/` — detalhes completos |
| 30–90 dias | Comprimido para `archive/compressed/` — LLM extrai o essencial |
| 90+ dias | Movido para `archive/frozen/` — não mais recordado |

Arquivos com a tag `#pinned` são protegidos de todo esquecimento.

**Fase 2 — Consolidação de Sonhos:**
- Lê memórias recentes
- Chama a LLM para encontrar conexões não óbvias
- Salva o sonho em `dreams/YYYY-MM-DD.md`
- Atualiza `dreams/latest.md` com a Percepção da Manhã

**Configuração LLM** (`~/.cerebralos/.brain/config.json`):

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

**Provedores suportados:** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

Mostra a Percepção da Manhã do sonho da noite passada.

```bash
cerebralos wake
```

**Saída:**
```
☀  Bom dia. Lembrei-me de algo enquanto você dormia.

  Os dois projetos que você tem executado em paralelo compartilham o mesmo
  problema subjacente — o contexto, e não o processamento, é o gargalo.

  (de 2026-03-17 — execute `cerebralos sleep` para sonhar novamente)
```

Retorna silenciosamente (Zero UI) se nenhum sonho existir ainda.

---

## `cerebralos recall <query>`

Pesquisa memórias usando preenchimento de padrões TF-IDF.

```bash
cerebralos recall "authentication architecture"
cerebralos recall "why we switched to postgres"
cerebralos recall "Q1 goals"
```

**Saída:**
```
Lembrando: "arquitetura de autenticação"...

  ✦ Algo veio à tona.

  1. core/auth-decisions.md
  ● 3 dias atrás
     Escolhemos JWT em vez de sessões porque...

  2. archive/compressed/old-auth-notes.md
  ◌ 2 meses atrás — desbotado
     Discussão de reescrita de autenticação. Decisão chave: tokens sem estado...
```

**Camadas de memória nos resultados:**
- `●` ativo — trecho completo (200 caracteres)
- `◌ faded` — trecho comprimido (120 caracteres), o detalhe decaiu
- memórias congeladas nunca aparecem

---

## `cerebralos setup`

Conecta agentes de IA ao seu cérebro.

```bash
cerebralos setup                      # Mostra regras para copiar e colar
cerebralos setup --auto               # Escreve automaticamente para todos os agentes detectados
cerebralos setup --agent claude-code  # Alveja um agente
cerebralos setup --agent cursor --auto
```

**Detectados automaticamente:** Claude Code, Cursor, Windsurf

**O que ele faz:**
- Gera regras de integração que instruem os agentes a escreverem resumos de sessão em `peripheral/`
- Com `--auto`: escreve diretamente nos arquivos de configuração do agente
  - Claude Code → `~/.claude/CLAUDE.md`
  - Cursor → `.cursorrules`
  - Windsurf → `.windsurfrules`
- Usa marcadores `<!-- cerebralos-integration -->` — seguro para reexecutar (atualiza no local, sem duplicatas)

---

## `cerebralos import`

Importa memórias externas para `peripheral/imported/`.

```bash
cerebralos import --from ~/Downloads/conversations.json   # Exportação ChatGPT
cerebralos import --from ~/notes/decisions.md             # Single Markdown
cerebralos import --from ~/ObsidianVault                  # Cofre inteiro
cerebralos import --from ./log.json --type chatgpt        # Força o tipo
```

**Tipos detectados automaticamente:**

| Extensão / Caminho | Detectado como |
|-----------------|-------------|
| `.json` | `chatgpt` |
| `.md` | `markdown` |
| Diretório | `folder` (importa todos os `.md` recursivamente) |

Após importar, execute `cerebralos sleep` para integrar ao seu cérebro.

---

## `cerebralos hook`

Instala o hook de shell Zero UI.

```bash
cerebralos hook
```

Adiciona `cerebralos wake` a `~/.zshrc` ou `~/.bashrc`.
Cada nova sessão de terminal mostrará sua Percepção da Manhã automaticamente.

---

## `cerebralos mcp`

Inicia o servidor MCP para integração de agentes de IA.

```bash
cerebralos mcp   # Chamado pelo host do agente, não diretamente
```

**Configuração MCP:**
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

**Ferramentas expostas:**

| Ferramenta | Descrição |
|------|-------------|
| `search_memory(query)` | Pesquisa a memória central por entidades ou conceitos |
| `recall_context(query)` | Recorda o contexto completo de uma entidade específica |
| `write_memory(content, filename?)` | Escreve uma memória em `peripheral/` |

`write_memory` é como os agentes conectados ao MCP salvam seus resumos de sessão.
Se um arquivo com o mesmo nome existir, o conteúdo é anexado (não sobrescrito).

---

## `cerebralos explore`

Navegador TUI interativo.

```bash
cerebralos explore
```

Navegue com `↑↓`, selecione com `Enter`, saia com `q`.

---

## Formato de arquivo de memória

Escreva memórias em Markdown. A estrutura é flexível, mas este formato funciona bem:

```markdown
# Nome ou Tópico do Projeto
*2026-03-17*

## O que aconteceu
- Construído o comando cerebralos setup
- Verificado que o esquecimento em 2 fases funciona corretamente

## Decisões tomadas
- Usar Gemini 2.5 Flash como provedor LLM padrão

## Perguntas em aberto
- As memórias congeladas devem ser descongeladas manualmente alguma vez?
```

Salve em:
- `~/.cerebralos/core/` — para conhecimento de longo prazo e estável
- `~/.cerebralos/peripheral/` — para contexto recente, notas de sessão

Marque com `#pinned` em qualquer lugar do arquivo para proteger do esquecimento.
