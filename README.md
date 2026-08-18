# dsh-daily-pulse

> **Built for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** — *"Everything is a Plugin."* · npm: [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh) · 官方 151K★

DSH 插件生态日报 — 每天 06:00 / 14:00 / 22:00（北京时间）三次，1 分钟读懂 DSH 生态的脉搏。
定位：DSH 生态的「财经早报」，质量信号层 + 中文社区层卡位；历史快照数据集是核心护城河。

## 现状（2026-08-17）

- **M0 ✅**：增量采集 + 单期日报渲染全链路跑通（真实 GitHub / npm 数据）
- **M1 ✅（本仓库当前）**：差分增速榜（star-index 基线）、档案馆首页（历史曲线）、三时点 CI 自动化
- **M2 ⏳**：DeepSeek 中文摘要（现为规则生成）、健康分全量计分制、自动 commit 公开仓库
- **M3 ⏳**：GitHub Pages「生态档案馆」正式站点（当前已具备雏形）

## 目录结构

```
dsh-daily-pulse/
├── collect.mjs         # 采集：topics 页官方计数 + Search 计数 + 官方仓库 + npm + 新秀榜 + 差分增速榜 + 蹭标签计分
├── bootstrap.mjs       # 一次性：首次按 star 抓前 1000 建历史库 → store/repos.jsonl（护城河数据集根基）
├── render.mjs          # 渲染单期日报 → reports/<期号>_<时间>.html + latest.html
├── render-index.mjs    # 渲染档案馆首页 → reports/index.html（历史曲线 + 全量期号）
├── render-structured.mjs # 渲染结构化输出 → reports/structured/（JSON-LD + 英文正文，GEO 引用源）
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
# 2) 采集 → 渲染 → 档案馆 → 结构化
node collect.mjs
node render.mjs
node render-index.mjs
node render-structured.mjs
# 3) 打开 reports/latest.html / reports/index.html
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

## 相关文档（vault）

- 设计规范：`dsh-daily-pulse-design/dsh-design-system.md`
- 生态战略：`DSH生态讨论笔记.md`（§一 指标 / §里程碑）
- 微信指挥 dsh-v4flash 开发：`WorkBuddy/2026-08-17-微信指挥DSH-v4flash-桥梁.md`
