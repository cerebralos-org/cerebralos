# CerebraLOS 命令参考

> `cerebralos` 所有命令的快速参考。
> 有关概念性文档，请参阅 [ARCHITECTURE.md](ARCHITECTURE.md)。

---

## 场景 → 命令

| 我想... | Command |
|-------------|---------|
| 首次启动 | `cerebralos init` |
| 连接 Claude Code / Cursor | `cerebralos setup --auto` |
| 运行今晚的记忆巩固 | `cerebralos sleep` |
| 查看今早的洞察 | `cerebralos wake` |
| 查找我模糊记得的内容 | `cerebralos recall "..."` |
| 交互式浏览我的“大脑” | `cerebralos explore` |
| 导入旧的 ChatGPT 对话 | `cerebralos import --from conversations.json` |
| 导入 Obsidian 库 | `cerebralos import --from ~/ObsidianVault` |
| 在终端打开时自动显示洞察 | `cerebralos hook` |
| 通过 MCP 连接 | `cerebralos mcp` |

---

## `cerebralos init`

初始化你的“大脑”目录。

```bash
cerebralos init           # ~/.cerebralos/ (default)
cerebralos init --local   # ./.cerebralos/ in current directory
```

**创建：**
```
~/.cerebralos/
├── core/           长期记忆（决策、身份、指令）
├── peripheral/     短期记忆（近期上下文、会话笔记）
├── dreams/         从“睡眠任务”中合成的洞察
└── archive/
    ├── compressed/ 褪色记忆 — 仅保留要点，仍可回忆
    └── frozen/     休眠记忆 — 不再被回忆
```

---

## `cerebralos sleep`

运行主动遗忘 + 梦境巩固。

```bash
cerebralos sleep
```

**阶段 1 — 主动遗忘：**

| 记忆年龄 | 发生什么 |
|-----|-------------|
| 0–30 天 | 保留在 `core/` 或 `peripheral/` — 完整细节 |
| 30–90 天 | 压缩到 `archive/compressed/` — LLM 提取要点 |
| 90+ 天 | 移动到 `archive/frozen/` — 不再被回忆 |

带有 `#pinned` 标签的文件将免受所有遗忘。

**阶段 2 — 梦境巩固：**
- 读取近期记忆
- 调用 LLM 查找不明显的联系
- 将梦境保存到 `dreams/YYYY-MM-DD.md`
- 使用早晨洞察更新 `dreams/latest.md`

**LLM 配置** (`~/.cerebralos/.brain/config.json`)：

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

**支持的提供商：** `gemini` | `claude` | `openai` | `github-actions` | `none`

---

## `cerebralos wake`

显示昨晚梦境中的早晨洞察。

```bash
cerebralos wake
```

**输出：**
```
☀  早上好。你在睡眠时我记住了一些东西。

  你并行运行的两个项目有相同的根本问题 —— 上下文是瓶颈，而不是计算。

  （来自 2026-03-17 — 运行 `cerebralos sleep` 再次进行梦境）
```

如果尚无梦境，则静默返回（Zero UI）。

---

## `cerebralos recall <query>`

使用 TF-IDF 模式补全搜索记忆。

```bash
cerebralos recall "authentication architecture"
cerebralos recall "why we switched to postgres"
cerebralos recall "Q1 goals"
```

**输出：**
```
正在回忆：“authentication architecture”...

  ✦ 浮现了一些内容。

  1. core/auth-decisions.md
  ● 3 天前
     我们选择 JWT 而不是会话，因为...

  2. archive/compressed/old-auth-notes.md
  ◌ 2 个月前 — 褪色
     认证重写讨论。关键决策：无状态令牌...
```

**结果中的记忆层：**
- `●` 活跃 — 完整片段（200 字符）
- `◌ faded` — 压缩片段（120 字符），细节已衰减
- 休眠记忆永不出现

---

## `cerebralos setup`

将 AI 代理连接到你的“大脑”。

```bash
cerebralos setup                      # 显示要复制粘贴的规则
cerebralos setup --auto               # 自动写入所有检测到的代理
cerebralos setup --agent claude-code  # 指定一个代理
cerebralos setup --agent cursor --auto
```

**自动检测：** Claude Code, Cursor, Windsurf

**它的作用：**
- 生成集成规则，指示代理将会话摘要写入 `peripheral/`
- 结合 `--auto`：直接写入代理配置文件
  - Claude Code → `~/.claude/CLAUDE.md`
  - Cursor → `.cursorrules`
  - Windsurf → `.windsurfrules`
- 使用 `<!-- cerebralos-integration -->` 标记 — 可安全重复运行（原地更新，无重复）

---

## `cerebralos import`

将外部记忆导入 `peripheral/imported/`。

```bash
cerebralos import --from ~/Downloads/conversations.json   # ChatGPT 导出
cerebralos import --from ~/notes/decisions.md             # 单个 Markdown 文件
cerebralos import --from ~/ObsidianVault                  # 整个库
cerebralos import --from ./log.json --type chatgpt        # 强制类型
```

**自动检测的类型：**

| 扩展名 / 路径 | 检测为 |
|-----------------|-------------|
| `.json` | `chatgpt` |
| `.md` | `markdown` |
| 目录 | `folder` （递归导入所有 `.md` 文件） |

导入后，运行 `cerebralos sleep` 以整合到你的“大脑”中。

---

## `cerebralos hook`

安装 Zero UI shell 钩子。

```bash
cerebralos hook
```

将 `cerebralos wake` 附加到 `~/.zshrc` 或 `~/.bashrc`。
每个新的终端会话都将自动显示你的早晨洞察。

---

## `cerebralos mcp`

启动 MCP 服务器以进行 AI 代理集成。

```bash
cerebralos mcp   # 由代理主机调用，而非直接调用
```

**MCP 配置：**
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

**公开的工具：**

| 工具 | 描述 |
|------|-------------|
| `search_memory(query)` | 搜索核心记忆以查找实体或概念 |
| `recall_context(query)` | 回忆特定实体的完整上下文 |
| `write_memory(content, filename?)` | 将记忆写入 `peripheral/` |

`write_memory` 是 MCP 连接的代理保存其会话摘要的方式。
如果存在同名文件，内容将被追加（而非覆盖）。

---

## `cerebralos explore`

交互式 TUI 浏览器。

```bash
cerebralos explore
```

使用 `↑↓` 导航，使用 `Enter` 选择，使用 `q` 退出。

---

## 记忆文件格式

使用 Markdown 编写记忆。结构灵活，但以下格式效果良好：

```markdown
# 项目名称或主题
*2026-03-17*

## 发生了什么
- 构建了 `cerebralos setup` 命令
- 验证了两阶段遗忘功能正常

## 已做决策
- 使用 Gemini 2.5 Flash 作为默认 LLM 提供商

## 开放性问题
- 休眠记忆是否应该手动解冻？
```

保存到：
- `~/.cerebralos/core/` — 用于长期、稳定的知识
- `~/.cerebralos/peripheral/` — 用于近期上下文、会话笔记

在文件中的任何位置使用 `#pinned` 标签，以防止被遗忘。
