# Agent 会话管理器

一个本地只读的 Agent session 可视化管理器，在顶部一键切换 **Codex** 与 **Claude Code** 两套会话管理，功能完全一致。用来浏览 Codex Desktop、Codex CLI、`codex exec`、Claude Code CLI / SDK / 客户端、Obsidian / Claudian、Bridge 场景以及归档会话记录。

- Codex 模式读取本机 `~/.codex` 下的 session、日志和 rollout JSONL 文件。
- Claude Code 模式读取本机 `~/.claude/projects` 下当前可索引的会话 JSONL。

帮助你快速找到历史会话、复制恢复命令、查看对话过程、分析 Token 消耗和 Skill 使用频率。

## 最近更新

- 修复长会话历史记录不完整：Codex 与 Claude Code 详情页现在扫描完整 JSONL，不再只读取前 1200 行或前 80 条消息；处理过程按每轮对话归属，技术索引会标明历史记录是否完整。
- 筛选顺序重新整理：将“所属项目”和“时间”放在前面，入口来源与场景标签放在后面，优先满足按项目和日期查找会话的使用习惯。
- 日期筛选更加明确：最近时间按更新时间判断；指定某一天或日期范围时，同时匹配创建时间和更新时间，并在会话卡片上标明命中的时间类型。
- 支持 Codex 自定义会话名称：用户修改名称后，可以通过完整名称直接精确找到对应会话。
- 支持完整对话关键词搜索：除标题、ID、项目和路径外，还能检索 Codex 与 Claude Code 的 JSONL 对话内容。
- Token 数量改为中文自适应单位：根据数值自动显示原数、万、千万或亿，例如 `313,989,385` 显示为 `3.14 亿`。
- 新增单会话 Token 排序：支持从高到低或从低到高排列；排序时直接在会话卡片上显示 Token 消耗量，缺少 Token 数据的记录在升序时放到最后。

## 功能

- 双工具切换：顶部切换 Codex / Claude Code，作为大的模式切换，两边功能一模一样。
- 会话列表：按更新时间浏览本机会话。
- 会话排序：支持按最近更新时间、单个会话 Token 从高到低或从低到高排列；Token 排序时会在会话卡片上显示对应消耗量。
- 精准搜索：会话名称完全一致时优先精确匹配，同时支持检索 ID、项目、路径、模型以及完整对话里的关键词。
- 多维筛选：支持按入口来源、场景标签、Codex 项目、模型服务商、时间、重要性、归档状态筛选。
- 入口来源识别：
  - Codex：Codex 客户端、Terminal / Codex CLI、Terminal / codex exec、Obsidian / Claudian、Bridge / Lark、Bridge / Coze、子代理等。
  - Claude Code：SDK / CLI、SDK / TypeScript、Claude CLI、Claude IDE、Claude 客户端、交互式终端等。
- 场景标签识别：标记飞书 / Lark、Obsidian 笔记、Coze / Bridge、Skill 工作流、SDK 接入、终端项目、Codex 项目等场景。
- 精确日期：可以用系统日历筛选某一天，也可以按开始和结束日期筛选一个范围；创建时间或更新时间命中都会显示，并在列表中标明匹配时间类型。
- 项目识别：优先读取新版 Codex 的项目 ID，旧会话按工作目录与项目根目录匹配，嵌套项目以最具体的目录为准。
- 会话恢复：一键复制恢复命令（Codex：`codex resume <id> --all`；Claude Code：`claude --resume <id>`）。
- 对话复现：按一轮一轮的用户提问、处理过程、最终回复展示历史会话。
- 处理过程折叠：每轮回复里的工具调用、Skill、执行结果可以展开或收起。
- Markdown 渲染：支持标题、列表、代码块、表格、引用、行内公式和块级公式。
- 技术索引：查看 rollout / JSONL 文件、Token、日志数量、行数、推理强度等信息；Token 数量按原数、万、千万、亿自动选择合适单位。
- 会话重要性判断：用本地启发式规则标记“非常重要 / 重要 / 有用 / 不重要”。
- 用量统计弹窗：从原始事件汇总累计 Token、单会话峰值、每日 Token 活动、最长任务和 Skill 使用频率。

## 安装要求

- macOS 或其他可访问 Codex / Claude Code 本地数据目录的系统
- Node.js 18 或更高版本
- `sqlite3` 命令行工具（Codex 模式需要）
- `rg`（ripgrep，完整对话关键词检索需要）
- 本机已有 Codex 或 Claude Code 使用记录，默认读取 `~/.codex` 与 `~/.claude`

检查依赖：

```bash
node --version
sqlite3 --version
rg --version
```

## 安装和运行

克隆仓库：

```bash
git clone git@github.com:metafeng/agent-session-manager.git
cd agent-session-manager
```

启动本地服务：

```bash
npm start
```

打开浏览器：

```text
http://127.0.0.1:8787/
```

默认端口是 `8787`。如果需要换端口：

```bash
PORT=8899 npm start
```

## 数据来源

Codex 模式默认读取：

```text
~/.codex/state_5.sqlite
~/.codex/logs_2.sqlite
~/.codex/sessions/**/*.jsonl
~/.codex/archived_sessions/*.jsonl
```

Claude Code 模式默认读取：

```text
~/.claude/projects/**/*.jsonl
```

入口来源和场景标签来自本地字段与 rollout 内容的组合判断，包括 `source`、`originator`、`entrypoint`、`cwd`、标题和预览文本。没有稳定来源字段的第三方桥接环境会用路径和关键词启发式识别。

如果你使用自定义数据目录，可以设置环境变量：

```bash
CODEX_HOME=/path/to/.codex npm start
CLAUDE_HOME=/path/to/.claude npm start
```

## 安全边界

这个项目只读取本机 Codex / Claude Code 数据，不会修改、归档、删除任何 session。

不会上传你的会话内容到远端。GitHub 仓库只包含管理器代码，不包含 `~/.codex` 或 `~/.claude` 数据。

## 项目结构

```text
.
├── package.json
├── server.js
├── content-search.js
├── content-search.test.js
├── number-format.test.js
├── project-mapping.js
├── project-mapping.test.js
├── skill-usage.js
├── skill-usage.test.js
├── usage-metrics.js
├── usage-metrics.test.js
├── docs
│   └── agent-session-manager-creation-case.md
├── public
│   ├── index.html
│   ├── app.js
│   ├── number-format.js
│   ├── styles.css
│   └── assets
│       ├── codex-icon.png
│       └── claude-icon.png
└── README.md
```

## 常用命令

```bash
npm start
node --check server.js
node --check public/app.js
```

## 说明

这是一个轻量本地工具，没有数据库迁移、构建流程和前端框架。所有界面逻辑在 `public/app.js`，服务端 API 在 `server.js`（Codex 路由 `/api/*`，Claude Code 路由 `/api/cc/*`）。

当前统计功能会在打开“用量统计”弹窗时扫描本地会话文件。Codex 的每日 Token 按 `token_count` 增量归档，Claude Code 的 Token 和任务耗时直接来自当前可索引 JSONL，不依赖可能过期的统计缓存。会话很多时，第一次统计可能需要等待片刻。
