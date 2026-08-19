#!/usr/bin/env node
/**
 * dsh-daily-pulse 趋势浏览器（行情版 · §7.25/§7.26）
 *
 * 读取 store/snapshots.jsonl，把每期 tracked_repos 的轨迹数据汇总成
 * 全量插件数据表（reports/plugins.html）：
 *   - 当前 stars / 8h 增速 / 历史点数（轨迹长度）
 *   - 迷你 sparkline（star 历史轨迹 —— 6 家市场都没有的时间线）
 *   - 分类 / 计分事实（score/verified，证据非评价）/ 最近 push / 链接
 *   - 表头点击排序（纯 JS）
 *
 * 定位：数据媒体的「行情版」——给事实和轨迹，不给评价/推荐/收录标准。
 *
 * 运行：node render-plugins.mjs [--lang zh|en]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CSS, head, topbar, scripts, fmtNum, cst, CAT_LABEL, CAT_CLS } from './tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE = join(__dirname, 'store');
const REPORTS = join(__dirname, 'reports');
mkdirSync(REPORTS, { recursive: true });

const langArg = process.argv.find((a) => a.startsWith('--lang=')) || process.argv[process.argv.indexOf('--lang') + 1];
const LANG = (langArg === 'en' || langArg === 'zh') ? langArg : 'zh';
const I18N = JSON.parse(readFileSync(join(__dirname, 'i18n.json'), 'utf8'));
const t = I18N[LANG];
const CAT_EN = { 视觉: 'Vision', 工作流: 'Workflow', 终端: 'Terminal', 其他: 'Other' };
const catLabel = (c) => (LANG === 'en' ? CAT_EN[c] || c : CAT_LABEL[c] || c);

// —— 读取全部快照，聚合 tracked_repos 轨迹 ——
const snaps = readFileSync(join(STORE, 'snapshots.jsonl'), 'utf8')
  .split('\n').map((l) => l.trim()).filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

if (snaps.length === 0) {
  console.error('[render-plugins] store/snapshots.jsonl 为空');
  process.exit(1);
}

// repo name → { points: [{date, stars, delta}], latest: {...}, first_seen, last_pushed }
const repoMap = new Map();
for (const snap of snaps) {
  const date = snap.generated_at;
  for (const r of (snap.tracked_repos || [])) {
    let e = repoMap.get(r.name);
    if (!e) {
      e = { name: r.name, desc: r.desc, url: r.url, category: r.category, score: null, verified: false, points: [] };
      repoMap.set(r.name, e);
    }
    e.points.push({ date, stars: r.stars, delta: r.delta ?? null });
    e.score = e.score ?? r.score;
    e.verified = e.verified || r.verified === true;
    if (r.pushed && (!e.last_pushed || r.pushed > e.last_pushed)) e.last_pushed = r.pushed;
  }
}

const repos = [...repoMap.values()].map((e) => {
  const last = e.points[e.points.length - 1] || {};
  const prev = e.points.length > 1 ? e.points[e.points.length - 2] : null;
  const cur = last.stars ?? 0;
  const delta = prev ? cur - prev.stars : (last.delta ?? null);
  const first = e.points[0] || {};
  return {
    ...e,
    stars: cur,
    delta,
    first_seen: first.date,
    first_stars: first.stars ?? cur,
    total_gain: cur - (first.stars ?? cur),
    points_len: e.points.length,
    stale_days: e.last_pushed ? Math.max(Math.floor((Date.now() - new Date(e.last_pushed).getTime()) / 86400000), 0) : null,
  };
});

// —— sparkline：star 历史迷你折线（含首尾锚点，轨迹即差异） ——
function sparkline(e, w = 90, h = 26) {
  if (e.points.length < 2) return `<span class="muted">—</span>`;
  const vals = e.points.map((p) => p.stars);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 1;
  const xs = (i) => (i / (vals.length - 1)) * (w - 4) + 2;
  const ys = (v) => h - 3 - ((v - min) / span) * (h - 6);
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
  const tone = e.total_gain > 0 ? 'var(--up)' : e.total_gain < 0 ? 'var(--down)' : 'var(--text-3)';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${tone}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const nf = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const rowsHtml = repos
  .sort((a, b) => b.stars - a.stars)
  .map((e) => {
    const trust = e.verified
      ? (e.score != null ? ` · ${t.pTrust.replace('{n}', e.score)}` : '')
      : ` · <span class="muted">${t.pUnverified}</span>`;
    const stale = e.stale_days != null && e.stale_days >= 7 ? ` <span class="stale">${t.pStale.replace('{n}', e.stale_days)}</span>` : '';
    const delta = e.delta != null ? `${e.delta >= 0 ? '+' : ''}${e.delta}` : '—';
    return `<tr data-name="${e.name}">
      <td class="pname"><a href="${e.url}" target="_blank" rel="noopener">${e.name}</a><small>${e.desc || ''}${trust}${stale}</small></td>
      <td data-sort="${e.stars}">${nf(e.stars)}</td>
      <td data-sort="${e.delta ?? -1e9}" class="${e.delta != null && e.delta < 0 ? 'down' : 'up'}">${delta}</td>
      <td data-sort="${e.points_len}">${e.points_len}</td>
      <td data-sort="${e.total_gain}">${sparkline(e)}</td>
      <td data-sort="${e.last_pushed || ''}">${e.last_pushed ? e.last_pushed.slice(0, 10) : '—'}</td>
      <td data-sort="${e.category}"><span class="cat ${CAT_CLS[e.category] || 'n'}">${catLabel(e.category)}</span></td>
      <td data-sort="${e.url}"><a href="${e.url}" target="_blank" rel="noopener">↗</a></td>
    </tr>`;
  }).join('\n');

const html = `<!doctype html>
<html lang="${LANG === 'en' ? 'en' : 'zh-CN'}">
${head(`${LANG === 'en' ? 'Plugin Trends' : '插件行情'} · ${t.pTitle}`, LANG === 'en' ? 'DSH plugin ecosystem market data: star trajectories, growth, activity - the only timeline-based plugin index.' : 'DSH 插件生态行情：star 轨迹、增速、活跃度 —— 唯一带时间线的插件数据索引。')}
<style>${CSS()}
  .ptable{width:100%; border-collapse:collapse; background:var(--bg-surface); border:1px solid var(--border); border-radius:14px; overflow:hidden; font-size:13px; margin-top:16px}
  .ptable th{text-align:left; padding:10px 14px; font-size:12px; color:var(--text-3); border-bottom:1px solid var(--border); cursor:pointer; user-select:none; white-space:nowrap}
  .ptable th:hover{color:var(--brand)}
  .ptable th .arrow{opacity:.5}
  .ptable td{padding:9px 14px; border-bottom:1px solid var(--border); vertical-align:middle; white-space:nowrap}
  .ptable tr:last-child td{border-bottom:0}
  .ptable .pname{font-weight:600}
  .ptable .pname small{display:block; color:var(--text-3); font-weight:400; font-size:11px; max-width:340px; overflow:hidden; text-overflow:ellipsis}
  .ptable td.up{color:var(--up)} .ptable td.down{color:var(--down)}
  .stale{color:var(--warn); font-weight:700}
  .plugins-note{margin-top:12px; color:var(--text-3); font-size:12px}
</style>
</head>
<body>
<div class="wrap">
  ${topbar('plugins', LANG, 'plugins.html')}

  <section class="hero">
    <div class="kicker">${t.pKicker}</div>
    <h1>${t.pTitle}</h1>
    <div class="sub">${t.pSub}</div>
    <div class="meta">
      <span><span class="dot"></span><b>${repos.length}</b> ${LANG === 'zh' ? '个追踪仓库' : 'tracked repos'}</span>
      <span><b>${snaps.length}</b> ${LANG === 'zh' ? '期快照' : 'snapshots'}</span>
      <span>${LANG === 'zh' ? '更新' : 'Updated'} <b>${cst(snaps[snaps.length - 1].generated_at).split(' · ')[0]}</b></span>
    </div>
  </section>

  <h2>${t.pTableTitle}</h2>
  <table class="ptable" id="pt">
    <thead><tr>
      <th data-k="name">${t.pColRepo}</th>
      <th data-k="stars" class="num">${t.pColStars}</th>
      <th data-k="delta" class="num">${t.pColDelta}</th>
      <th data-k="len" class="num">${t.pColLen}</th>
      <th data-k="gain">${t.pColTraj}</th>
      <th data-k="pushed">${t.pColPushed}</th>
      <th data-k="cat">${t.pColCat}</th>
      <th></th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="plugins-note">${t.pNote}</div>

  <footer>
    <span>DSH·daily-pulse · ${LANG === 'zh' ? `插件行情 · ${repos.length} 仓库` : `Plugin trends · ${repos.length} repos`}</span>
    <span>${LANG === 'zh' ? '轨迹 = 历史快照聚合；计分为事实证据（manifest/依赖/topic），非评价' : 'Trajectory = aggregated from snapshots; score = factual evidence (manifest/deps/topic), not a verdict'}</span>
  </footer>
</div>

<script>
(function () {
  const tb = document.querySelector('#pt tbody');
  const ths = document.querySelectorAll('#pt th[data-k]');
  let dir = {};
  ths.forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.k; dir[k] = !dir[k];
    const rows = [...tb.rows];
    const get = (r) => {
      const cell = r.children[[...ths].indexOf(th)];
      const v = cell.dataset.sort;
      const n = Number(v);
      return v === '' || Number.isNaN(n) ? v : n;
    };
    rows.sort((a, b) => {
      const va = get(a), vb = get(b);
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return dir[k] ? -c : c;
    });
    rows.forEach((r) => tb.appendChild(r));
  }));
})();
</script>
${scripts(LANG)}
</body>
</html>
`;

const fname = LANG === 'en' ? 'plugins_en.html' : 'plugins.html';
writeFileSync(join(REPORTS, fname), html);
console.log(`[render-plugins] 行情页已生成 → reports/${fname}（${repos.length} 仓库, lang=${LANG}）`);
