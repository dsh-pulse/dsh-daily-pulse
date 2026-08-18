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

// —— 语言参数（en / zh；默认 zh）——
const langArg = process.argv.find((a) => a.startsWith('--lang=')) || process.argv[process.argv.indexOf('--lang') + 1];
const LANG = (langArg === 'en' || langArg === 'zh') ? langArg : 'zh';
const I18N = JSON.parse(readFileSync(join(__dirname, 'i18n.json'), 'utf8'));
const t = I18N[LANG];
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
  const path = no === total ? 'latest.html' : `${base}_${LANG}.html`;
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
      <div class="t"><b>${i.stamp} GMT+8</b><span>${i.date} · ${LANG === 'zh' ? '官方 stars' : 'official stars'} ${fmtNum(i.stars)} · ${LANG === 'zh' ? '8h 新增' : '8h new'} ${fmtNum(i.total8h)}</span></div>
      <div class="go">${i.no === total ? (LANG === 'zh' ? '最新 ↗' : 'Latest ↗') : (LANG === 'zh' ? '查看 →' : 'View →')}</div>
    </a>`).join('\n');

if (!last) {
  console.error('store/snapshots.jsonl 为空，无法生成档案馆首页');
  process.exit(1);
}

const html = `<!doctype html>
<html lang="${LANG === 'en' ? 'en' : 'zh-CN'}">
${head(`${LANG === 'en' ? 'DSH·daily-pulse · Archive' : 'DSH·daily-pulse · 档案馆'} · ${total} 期`, LANG === 'en' ? 'DSH plugin ecosystem archive - full historical timeline.' : 'DSH 插件生态档案馆 · 全量历史快照时间轴')}
<style>${CSS()}</style>
</head>
<body>
<div class="wrap">

  ${topbar('index', LANG, 'index_en.html')}

  <section class="hero">
    <div class="kicker">Archive</div>
    <h1>${LANG === 'en' ? 'DSH Ecosystem Archive' : 'DSH 生态档案馆'}</h1>
    <div class="sub">${LANG === 'en' ? `Every collection is a snapshot — ${total} issues × ~8h, a full timeline of the ecosystem.` : `每一次采集都是一条快照 — ${total} 期 × 约 8h，累积成生态的完整时间轴。`}</div>
    <div class="meta">
      <span><span class="dot"></span><b>${total}</b> ${LANG === 'zh' ? '期快照' : 'snapshots'}</span>
      <span>${LANG === 'zh' ? '覆盖' : 'Coverage'} <b>${days}</b> ${LANG === 'zh' ? '天' : 'days'}</span>
      <span>${LANG === 'zh' ? '最新' : 'Latest'} <b>${latestK ? fmtNum(latestK.official_stars) : '—'}</b> ★ · <b>${latestK ? fmtNum(latestK.total_plugins) : '—'}</b> ${LANG === 'zh' ? '插件' : 'plugins'}</span>
      <span>${LANG === 'zh' ? '数据源' : 'Sources'} <b>GitHub API · npm</b></span>
    </div>
  </section>

  <h2>${LANG === 'zh' ? '生态概要' : 'Overview'}</h2>
  <div class="kpi-row">
    <div class="kpi"><div class="k">${LANG === 'zh' ? '快照期数' : 'Snapshots'}</div><div class="v">${total}</div><div class="delta up">${days} ${LANG === 'zh' ? '天跨度' : 'days'}</div></div>
    <div class="kpi"><div class="k">${LANG === 'zh' ? '官方 stars · 最新' : 'Official stars · latest'}</div><div class="v">${fmtNum(latestK ? latestK.official_stars : 0)}</div><div class="delta up">fans</div></div>
    <div class="kpi"><div class="k">${LANG === 'zh' ? '插件总数 · 最新' : 'Plugins · latest'}</div><div class="v">${fmtNum(latestK ? latestK.total_plugins : 0)}</div><div class="delta up">tracked</div></div>
    <div class="kpi"><div class="k">${LANG === 'zh' ? '最新 8h 新增' : 'New repos (8h)'}</div><div class="v">${fmtNum(latestK ? latestK.new_8h_repos : 0)}</div><div class="delta up">${LANG === 'zh' ? '仓库' : 'repos'}</div></div>
  </div>

  <h2>${LANG === 'zh' ? '历史曲线' : 'History'}</h2>
  <div class="archive">
    <div class="head">
      <b>${LANG === 'zh' ? '官方 stars（实线） & 插件总数（虚线）' : 'Official stars (solid) & plugin totals (dashed)'}</b>
      <a href="latest.html">${LANG === 'zh' ? '最新一期 →' : 'Latest issue →'}</a>
    </div>
    ${historyChart(rows, 620, 170, LANG)}
  </div>

  <h2>${LANG === 'zh' ? '全部期号' : 'All Issues'}</h2>
  <div class="archive">
    <div class="issues">
      ${issueList}
    </div>
  </div>

  <footer>
    <span>DSH·daily-pulse · ${LANG === 'zh' ? `档案馆 · ${total} 期快照` : `Archive · ${total} snapshots`}</span>
    <span>${LANG === 'zh' ? '数据源' : 'Sources'} GitHub Search API + npm registry · ${cst(new Date().toISOString())}</span>
  </footer>

</div>

${scripts(LANG)}
</body>
</html>
`;

const idxName = LANG === 'zh' ? 'index.html' : 'index_en.html';
writeFileSync(join(REPORTS, idxName), html);
console.log(`[render-index] 档案馆首页已生成 → reports/${idxName}（${total} 期, lang=${LANG}）`);