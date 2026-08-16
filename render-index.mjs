#!/usr/bin/env node
/**
 * render-index.mjs — 档案馆首页（M1）
 *
 * 读取 store/snapshots.jsonl（全部历史快照），生成 reports/index.html：
 *   - 生态概要：期数 / 天数 / 最新 KPI
 *   - 官方 stars + 插件总数 历史曲线（SVG）
 *   - 全量期号列表（链接到各期日报 reports/0001_*.html）
 *
 * 依赖 tokens.mjs（共享设计系统）。
 * 运行：node render-index.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CSS, head, topbar, scripts, historyChart, fmtNum, cst, isoDate } from './tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE = join(__dirname, 'store');
const REPORTS = join(__dirname, 'reports');
mkdirSync(REPORTS, { recursive: true });

// —— 读取全部快照 ——
const lines = readFileSync(join(STORE, 'snapshots.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
const snaps = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  .sort((a, b) => new Date(a.generated_at) - new Date(b.generated_at));

const total = snaps.length;
const first = snaps[0];
const last = snaps[total - 1];
const latestK = last ? last.kpis : null;

// —— 历史曲线数据 ——
const rows = snaps.map((s) => ({
  date: s.generated_at,
  stars: (s.kpis && s.kpis.official_stars) || 0,
  total: (s.kpis && s.kpis.total_plugins) || 0,
}));

// —— 期号列表 ——
// 从已有日报文件名反推：按日志期号单调递增，文件名 0001_日期-时间.html
// 若无对应文件则用 期号_日期-时间 构造（尚未渲染时的占位，仍可点 latest）
const issues = snaps.map((s, i) => {
  const no = i + 1;
  const st = cst(s.generated_at);
  const base = `${String(no).padStart(4, '0')}_${st.replace(/\s*·\s*/g, '-').replace(/:/g, '')}`;
  const path = no === total ? `${base}.html` : `${base}.html`; // 存在性由 render.mjs 保证（latest.html 恒在）
  const delta = i > 0 && snaps[i - 1].kpis
    ? lastDelta(snaps[i - 1].kpis.official_stars, s.kpis.official_stars) : null;
  return { no, stamp: st, date: isoDate(s.generated_at), stars: (s.kpis && s.kpis.official_stars) || 0,
    total8h: (s.kpis && s.kpis.new_8h_repos) || 0, delta, href: no === total ? 'latest.html' : path };
});

function lastDelta(prev, cur) {
  if (prev == null || cur == null) return null;
  const d = cur - prev;
  if (d === 0) return null;
  return (d > 0 ? '+' : '') + d.toLocaleString('en-US');
}

// —— 跨度天数 ——
function spanDays(a, b) {
  if (!a || !b) return 1;
  const ms = Math.max(0, new Date(b) - new Date(a));
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

const days = spanDays(first && first.generated_at, last && last.generated_at);

// —— 期号列表 HTML ——
const issueList = issues.slice().reverse().map((i) => `
    <a class="issue" href="${i.href}" style="text-decoration:none;color:inherit">
      <div class="no">#${String(i.no).padStart(3, '0')}</div>
      <div class="t"><b>${i.stamp} GMT+8</b><span>${i.date} · 官方 stars ${fmtNum(i.stars)} · 8h 新增 ${fmtNum(i.total8h)}</span></div>
      <div class="go">${i.no === total ? '最新 ↗' : '查看 →'}</div>
    </a>`).join('\n');

if (!last) {
  console.error('store/snapshots.jsonl 为空，无法生成档案馆首页');
  process.exit(1);
}

const html = `<!doctype html>
<html lang="zh-CN">
${head(`DSH·daily-pulse · 档案馆 · ${total} 期`)}
<style>${CSS()}</style>
</head>
<body>
<div class="wrap">

  ${topbar('index')}

  <section class="hero">
    <div class="kicker">Archive</div>
    <h1>DSH 生态档案馆</h1>
    <div class="sub">每一次采集都是一条快照 — ${total} 期 × 约 8h，累积成生态的完整时间轴。</div>
    <div class="meta">
      <span><span class="dot"></span><b>${total}</b> 期快照</span>
      <span>覆盖 <b>${days}</b> 天</span>
      <span>最新 <b>${latestK ? fmtNum(latestK.official_stars) : '—'}</b> ★ · <b>${latestK ? fmtNum(latestK.total_plugins) : '—'}</b> 插件</span>
      <span>数据源 <b>GitHub API · npm</b></span>
    </div>
  </section>

  <h2>生态概要</h2>
  <div class="kpi-row">
    <div class="kpi"><div class="k">快照期数</div><div class="v">${total}</div><div class="delta up">${days} 天跨度</div></div>
    <div class="kpi"><div class="k">官方 stars · 最新</div><div class="v">${fmtNum(latestK ? latestK.official_stars : 0)}</div><div class="delta up">fans</div></div>
    <div class="kpi"><div class="k">插件总数 · 最新</div><div class="v">${fmtNum(latestK ? latestK.total_plugins : 0)}</div><div class="delta up">tracked</div></div>
    <div class="kpi"><div class="k">最新 8h 新增</div><div class="v">${fmtNum(latestK ? latestK.new_8h_repos : 0)}</div><div class="delta up">仓库</div></div>
  </div>

  <h2>历史曲线</h2>
  <div class="archive">
    <div class="head">
      <b>官方 stars（实线） & 插件总数（虚线）</b>
      <a href="latest.html">最新一期 →</a>
    </div>
    ${historyChart(rows)}
  </div>

  <h2>全部期号</h2>
  <div class="archive">
    <div class="issues">
      ${issueList}
    </div>
  </div>

  <footer>
    <span>DSH·daily-pulse · 档案馆 · ${total} 期快照</span>
    <span>数据源 GitHub Search API + npm registry · 生成于 ${cst(new Date().toISOString())}</span>
  </footer>

</div>

${scripts()}
</body>
</html>
`;

writeFileSync(join(REPORTS, 'index.html'), html);
console.log(`[render-index] 档案馆首页已生成 → reports/index.html（${total} 期）`);