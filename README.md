# dsh-daily-pulse

> DSH 插件生态日报 — 每天 06:00 / 14:00 / 22:00（北京时间）三次，1 分钟读懂 DSH 生态的脉搏。
> 定位：DSH 生态的「财经早报」，质量信号层 + 中文社区层卡位；历史快照数据集是核心护城河。

## 现状（2026-08-17）

- **M0 ✅**：增量采集 + 单期日报渲染全链路跑通（真实 GitHub / npm 数据）
- **M1 ✅（本仓库当前）**：差分增速榜（star-index 基线）、档案馆首页（历史曲线）、三时点 CI 自动化
- **M2 ⏳**：DeepSeek 中文摘要（现为规则生成）、健康分全量计分制、自动 commit 公开仓库
- **M3 ⏳**：GitHub Pages「生态档案馆」正式站点（当前已具备雏形）

## 目录结构

```
dsh-daily-pulse/
├── collect.mjs         # 采集：GitHub Search 计数 + 官方仓库 + npm + 新秀榜 + 差分增速榜
├── render.mjs          # 渲染单期日报 → reports/<期号>_<时间>.html + latest.html
├── render-index.mjs    # 渲染档案馆首页 → reports/index.html（历史曲线 + 全量期号）
├── tokens.mjs          # 设计系统 v0.2 令牌模块（三层令牌 + 组件 CSS + 图表，单文件可交付）
├── dsh-daily-pulse.html# 高保真设计原型（设计系统 v0.2 演示）
├── store/
│   ├── snapshots.jsonl # 历史快照（护城河数据集，增量追加，每天 3 期）
│   ├── latest.json     # 最新快照（供渲染）
│   └── star-index.json # 仓库 star 基线（差分增速榜依赖）
├── reports/            # 日报 + 档案馆首页（GitHub Pages 站点根）
└── .github/workflows/daily.yml  # 三时点定时采集 + commit + Pages 部署
```

## 本地运行

```bash
# 1) GitHub 认证（Search API 配额：认证 30 次/分钟，足够本脚本 ~12 次调用）
gh auth login
# 2) 采集 → 渲染 → 档案馆
node collect.mjs
node render.mjs
node render-index.mjs
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
| 插件总数 / 8h 新增 | GitHub Search API `topic:dsh-plugin` | 用 `total_count` 绕开 1000 条结果硬上限 |
| 官方仓库 | `deepseek-ai/deepseek-harness` REST | stars / forks / commits |
| npm 周下载 | npm registry API | `@deepseek-ai/dsh` |
| 差分增速榜 | 本仓库 `star-index.json` 基线 | 首期无基线，次期起生效 |

- Search API 未认证 10 次/分钟、认证 30 次/分钟；脚本约 12 次调用，CI 用 `GITHUB_TOKEN` 无压力。
- 8h 窗口留 5 分钟重叠防漏；增速榜按窗口内 star 增量排序，非绝对星标。

## 设计系统

对齐《dsh-design-system.md v0.2》：三层令牌（常量 / 主题 / 配色）、明暗主题、`data-accent` 换肤钩子、
i18n 接口（zh / en / bi）。`tokens.mjs` 为单文件可交付模块，供 GitHub Pages 直接引用。

## 相关文档（vault）

- 设计规范：`dsh-daily-pulse-design/dsh-design-system.md`
- 生态战略：`DSH生态讨论笔记.md`（§一 指标 / §里程碑）
- 微信指挥 dsh-v4flash 开发：`WorkBuddy/2026-08-17-微信指挥DSH-v4flash-桥梁.md`
