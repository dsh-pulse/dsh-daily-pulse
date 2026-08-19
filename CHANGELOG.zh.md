# 更新日志

dsh-daily-pulse 的所有重要变更记录于此。格式遵循
[Keep a Changelog](https://keepachangelog.com/) 与语义化版本。

## 0.1.0 - 2026-08-19

首个正式版本——M0→M4 全链路，自 2026-08-17 起在
https://dsh-pulse.github.io/dsh-daily-pulse 线上运行（每天 3 期快照）。

### 新功能

- **M0 — 采集管线**：GitHub + npm 真实数据增量快照；插件总数抓
  `/topics/dsh-plugin` 页官方计数（绕开 Search API 1000 条硬上限，解析失败自动降级并告警）；
  蹭标签计分制（manifest +2 / 依赖 `@deepseek-ai/dsh` +2 / topic +1，≥3 才上榜）；
  `bootstrap.mjs` 一次性 top-1000 仓库历史库。
- **M1 — 增速榜 + 档案馆 + CI**：差分增速榜（star-index 基线）、档案馆首页历史曲线、
  三时点定时 CI（北京 06:00 / 14:00 / 22:00）自动 commit + GitHub Pages、设计系统令牌 v0.2.1。
- **M2 — AI 摘要 + 健康分**：DeepSeek 生成中英双语每日摘要（无 key 自动降级规则）；
  健康分四因子计分（活跃度 40 + 新鲜度 20 + 采用度 20 + 多样性 20）；CI summarize 步骤。
- **M2b — 完全双语日报**：中英双档独立文件 + 语言切换（`--lang zh|en`，`latest.html` 为中文入口）。
- **M3 — 档案馆可视化 + GEO 结构化输出**：双轴主图（官方 stars + 插件总数）、2×2 指标迷你图矩阵
  + hover、npm 自然日下载口径（range API 动态兜底）；结构化输出（`render-structured.mjs`：
  JSON-LD `Dataset` + 干净英文正文）供 AI 引擎引用。
- **M4 — 开放数据 + 细分榜单 + 内容化**：`export.mjs` → `reports/data/`
  （snapshots.csv / latest.csv / leaderboard.csv / latest.json，后增 category-boards.csv /
  active-board.csv）并附完整数据字典；细分榜单（各分类 Top 10 × 4 维度：星标/增速/活跃/最新，
  候选池 100）；内容化区块「新面孔（8h 新增）」与「沉寂预警 · 停更名单」；摘要上移到榜单之前（结论先行）。
- **bridge 微信通知**：本地跑报可经 dsh-hermes-bridge 推日报摘要到微信（CI 无 env 自动跳过）。

### 修复

- collect：raw 抓取容错——单个 manifest 读取失败不中断采集。
- M2b：双语残留清理（品牌区 / 主题切换 / 图注 / head 描述 / 健康分因子注 / `index_en.html` 标题）。
- M3 图表：SVG 拉伸（移除 `preserveAspectRatio="none"`）、双轴图补基线 + 双系列圆点 + 日期刻度、
  迷你图网格 + max/min 刻度、`--lang=en` 参数解析。
- M3 npm 线：周滚动平直 → 日下载指标 + range API 历史兜底，最终定为自然日口径
  （每日稳定值；产物交 CI 重新生成，杜绝 rebase 冲突）。
