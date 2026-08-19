# dsh-daily-pulse

> **Built for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** — *"Everything is a Plugin."* · npm: [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh) · 官方 151K★

[![Release](https://img.shields.io/github/v/release/dsh-pulse/dsh-daily-pulse)](https://github.com/dsh-pulse/dsh-daily-pulse/releases)
[![License](https://img.shields.io/github/license/dsh-pulse/dsh-daily-pulse)](LICENSE)

> 版本与迭代记录见 [CHANGELOG.md](CHANGELOG.md)（[中文](CHANGELOG.zh.md)）与
> [GitHub Releases](https://github.com/dsh-pulse/dsh-daily-pulse/releases)。

DSH 插件生态日报 — 每天 06:00 / 14:00 / 22:00（北京时间）三次，1 分钟读懂 DSH 生态的脉搏。
定位：DSH 生态的「财经早报」，质量信号层 + 中文社区层卡位；历史快照数据集是核心护城河。

## 现状（2026-08-18）

- **M0 ✅**：增量采集 + 单期日报渲染全链路跑通（真实 GitHub / npm 数据）
- **M1 ✅**：差分增速榜（star-index 基线）、档案馆首页（历史曲线）、三时点 CI 自动化
- **M2 ✅**：DeepSeek 中文摘要、健康分全量计分制、自动 commit 公开仓库
- **M3 ✅**：GitHub Pages「生态档案馆」正式站点（18+ 期、双轴主图 + 4 指标矩阵、中英双语、npm 自然日口径）
- **M4 🔄（进行中）**：①开放数据接口 ✅（CSV/JSON，本页「开放数据」节）②细分榜单 ✅（各分类 Top 10 × 4 维度）③数据地图 ⏳（最后）

## 目录结构

```
dsh-daily-pulse/
├── collect.mjs         # 采集：topics 页官方计数 + Search 计数 + 官方仓库 + npm + 新秀榜 + 差分增速榜 + 蹭标签计分
├── bootstrap.mjs       # 一次性：首次按 star 抓前 1000 建历史库 → store/repos.jsonl（护城河数据集根基）
├── render.mjs          # 渲染单期日报（双语：--lang zh|en）→ reports/<期号>_<时间>_zh/_en.html + latest.html
├── render-index.mjs    # 渲染档案馆首页（双语）→ reports/index.html + index_en.html
├── render-structured.mjs # 渲染结构化输出 → reports/structured/（JSON-LD + 英文正文，GEO 引用源）
├── export.mjs          # M4：导出开放数据 → reports/data/（snapshots.csv / latest.csv / leaderboard.csv / latest.json）
├── tokens.mjs          # 设计系统 v0.2 令牌模块（三层令牌 + 组件 CSS + 图表，单文件可交付）
├── dsh-daily-pulse.html# 高保真设计原型（设计系统 v0.2 演示）
├── store/
│   ├── snapshots.jsonl # 历史快照（护城河数据集，增量追加，每天 3 期）
│   ├── latest.json     # 最新快照（供渲染）
│   ├── star-index.json # 仓库 star 基线（差分增速榜依赖）
│   └── repos.jsonl     # top-1000 仓库历史库（bootstrap.mjs 建）
├── reports/            # 日报 + 档案馆首页 + structured/（GitHub Pages 站点根）
└── .github/workflows/daily.yml  # 三时点定时采集 + commit + Pages 部署
```

## 本地运行

```bash
# 0) 首次建库（只跑一次，抓 topic:dsh-plugin 前 1000 个仓库）
node bootstrap.mjs
# 1) GitHub 认证（Search API 配额：认证 30 次/分钟，足够本脚本 ~15 次调用）
gh auth login
# 2) 采集 → 渲染（中英双档）→ 档案馆 → 结构化 → 开放数据
node collect.mjs
node render.mjs --lang zh
node render.mjs --lang en
node render-index.mjs --lang zh
node render-index.mjs --lang en
node render-structured.mjs
node export.mjs
# 3) 打开 reports/latest.html（中文默认）/ latest 的 EN 切换 / reports/index_en.html
#    M2b：每天 3 采集时点 × 中英双档 = 6 期（Q6 拍板）
```

> 也可用 `GITHUB_TOKEN` 环境变量替代 `gh` 认证（CI 里即走此路）。

## 部署到 GitHub Pages（三步）

1. **建仓库并推送**：把本目录推到任意 GitHub 仓库（建议名 `dsh-daily-pulse`）。
2. **开 Pages**：仓库 Settings → Pages → Source 选 **GitHub Actions**（不用手动选分支）。
3. **等首轮跑完**：推送后手动 Run workflow 一次（Actions → dsh-daily-pulse → Run workflow），
   之后每天 6/14/22 点（北京）自动采集并部署。

站点根即 `reports/`：`index.html` = 档案馆首页，`latest.html` = 最新一期日报。

## 数据源与限制

| 数据 | 来源 | 说明 |
|---|---|---|
| 插件总数（生态口径） | GitHub `/topics/dsh-plugin` 页面 HTML 计数 | 官方 topic 计数（含 fork）；解析失败自动降级 Search 并告警 |
| 追踪口径 / 8h 新增 / 弃养 | GitHub Search API `topic:dsh-plugin fork:false` | 用 `total_count` 绕开 1000 条结果硬上限 |
| 官方仓库 | `deepseek-ai/deepseek-harness` REST | stars / forks / commits |
| npm 周下载 | npm registry API | `@deepseek-ai/dsh` |
| 差分增速榜 | 本仓库 `star-index.json` 基线 | 首期无基线，次期起生效 |
| 蹭标签过滤 | 计分制：manifest +2 / 依赖 `@deepseek-ai/dsh` +2 / topic +1，≥3 计入 | 爆发榜只收录达标仓库，标注可信分 /5 |

- Search API 未认证 10 次/分钟、认证 30 次/分钟；脚本约 15 次调用，CI 用 `GITHUB_TOKEN` 无压力。
- 8h 窗口留 5 分钟重叠防漏；增速榜按窗口内 star 增量排序，非绝对星标。
- `bootstrap.mjs` 一次性建库约 30–40s（10 页 × 100，页间 2.5s 软限速）。

## 设计系统

对齐《dsh-design-system.md v0.2》：三层令牌（常量 / 主题 / 配色）、明暗主题、`data-accent` 换肤钩子、
i18n 接口（zh / en / bi）、`data-mode="structured"` 结构化输出。`tokens.mjs` 为单文件可交付模块，
供 GitHub Pages 直接引用。

- **结构化输出（GEO 资产）**：每次渲染额外产出 `reports/structured/` —— 每期 `NNNN.json`（JSON-LD
  `Dataset` schema，机器可读快照）+ `latest.json` / `latest.md`（干净英文正文，data-led，供
  ChatGPT / Gemini 等 AI 引擎直接引用）；单期日报 HTML 的 `<head>` 亦内嵌 JSON-LD。站点 URL 可用
  `DSH_SITE_URL` 环境变量覆盖（默认 `https://dsh-pulse.github.io/dsh-daily-pulse/`）。

## 开放数据（M4）

随每期 CI 自动生成并随 Pages 部署，所有数据可爬、可引用：

| 文件 | 内容 |
|---|---|
| [`data/snapshots.csv`](data/snapshots.csv) | 全历史时间序列（每期一行，行序 = 期号） |
| [`data/latest.csv`](data/latest.csv) | 当期 KPI 宽表（一行 25 列，含健康分四因子） |
| [`data/leaderboard.csv`](data/leaderboard.csv) | 当期榜单（`list` 列区分 `leaderboard` 爆发榜 / `growth` 增速榜） |
| [`data/category-boards.csv`](data/category-boards.csv) | 细分榜单（每类每维度 top10，`list=category:<类别>:<维度>`，维度 `stars`/`delta`/`active`/`newest`） |
| [`data/active-board.csv`](data/active-board.csv) | 活跃榜（最近 push top5，`list=active`） |
| [`data/latest.json`](data/latest.json) | 当期完整快照（与 `store/latest.json` 同构，程序直接消费） |

字段字典（`snapshots.csv` / `latest.csv` 共用的核心列）：

| 字段 | 含义 | 口径 |
|---|---|---|
| `generated_at` / `window_start` / `window_end` | 快照生成时间 / 采集窗口 | UTC ISO8601；窗口 8h + 5 分钟重叠防漏 |
| `total_plugins` | 插件总数（生态口径，含 fork） | GitHub `/topics/dsh-plugin` 页官方计数；解析失败降级 Search 并置 `count_source=search-fallback` |
| `non_fork_plugins` | 追踪口径（排除 fork） | Search `topic:dsh-plugin fork:false` `total_count` |
| `count_source` | 总数来源 | `topics-page` \| `search-fallback` |
| `new_8h_repos` | 8h 新增仓库数 | `created:>=window_start`（窗口留 5 分钟重叠） |
| `official_stars` / `official_forks` | 官方仓库 stars / forks | `deepseek-ai/deepseek-harness` REST |
| `npm_weekly_downloads` | npm 周下载 | `@deepseek-ai/dsh`，滚动 7 天 |
| `npm_daily` / `npm_daily_date` | npm 日下载（自然日） | range API 最近完整非 0 自然日；`npm_daily_date` 标注实际日期 |
| `delta_8h_stars` | 官方 star 8h 增量 | 与上期快照对比；首期（无基线）为空 |
| `health_score` | 生态健康分（0–100） | 四因子：活跃度 40 + 新鲜度 20 + 采用度 20 + 多样性 20（因子分见 `latest.csv` 末 4 列） |
| `stale_7d` / `stale_1d` | 沉寂仓库数（7 天 / 24h 无 push） | Search `pushed:<阈值`（追踪口径内） |
| `total_tracked` | 健康分分母（= `non_fork_plugins`） | — |

`leaderboard.csv` 列：`list`（`leaderboard`=爆发榜，按 stars；`growth`=增速榜，按窗口 star 增量）、
`rank`、`name`（full_name）、`desc`、`stars`、`delta`（窗口增量，首见为空）、`is_new`（1/0，
DSH 发布日 2026-08-13 后首见）、`score`（蹭标签计分 ≥3 才上榜）、`category`（视觉/工作流/终端/其他）、
`created`、`pushed`、`url`。增速榜 `created`/`pushed` 为空（由爆发榜行提供）。

`category-boards.csv` / `active-board.csv` 列（M4 细分榜单）：`list`（`category:<类别>:<维度>` /
`active`）、`rank`（榜内名次）、`name`、`stars`、`delta`、`is_new`、`score`、`verified`（1/0，
是否通过 manifest/依赖计分门槛）、`category`、`created`、`pushed`、`url`。细分榜来自按 stars 取
的前 100 候选（每类每维度 top10；维度 `stars` 累计星标 / `delta` 窗口增速（需基线）/
`active` 最近 push / `newest` 最新创建），未过计分门槛的仓库保留并标注 `verified=0`，避免口径盲区。

## 相关文档（vault）

- 设计规范：`dsh-daily-pulse-design/dsh-design-system.md`
- 生态战略：`DSH生态讨论笔记.md`（§一 指标 / §里程碑）
- 微信指挥 dsh-v4flash 开发：`WorkBuddy/2026-08-17-微信指挥DSH-v4flash-桥梁.md`
