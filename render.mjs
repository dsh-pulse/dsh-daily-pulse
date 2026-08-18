#!/usr/bin/env node
/**
 * dsh-daily-pulse 渲染脚本（M2b 双语版）
 *
 * 读取 store/latest.json，把真实数据填入日报 HTML（设计系统 v0.2 令牌 + 组件结构）。
 * 支持 en / zh 双档（Q6 拍板：完整双语日报，URL 切换单语）：
 *   node render.mjs --lang zh   → reports/<期号>_<时间戳>_zh.html
 *   node render.mjs --lang en   → reports/<期号>_<时间戳>_en.html
 *   node render.mjs             → 同 zh（latest.html 默认中文版，含语言切换器）
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CSS, head, topbar, scripts, historyChart, fmtNum, cst, CAT_LABEL } from './tokens.mjs';
import { buildDatasetJsonLd } from './render-structured.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE = join(__dirname, 'store');
const REPORTS = join(__dirname, 'reports');
mkdirSync(REPORTS, { recursive: true });

// —— 语言参数（en / zh；默认 zh = latest.html 入口）——
const langArg = process.argv.find((a) => a.startsWith('--lang=')) || process.argv[process.argv.indexOf('--lang') + 1];
const LANG = (langArg === 'en' || langArg === 'zh') ? langArg : 'zh';
const I18N = JSON.parse(readFileSync(join(__dirname, 'i18n.json'), 'utf8'));
const t = I18N[LANG];
// 分类标签英文映射（en 档用）
const CAT_EN = { 视觉: 'Vision', 工作流: 'Workflow', 终端: 'Terminal', 其他: 'Other' };
const catLabel = (c) => (LANG === 'en' ? CAT_EN[c] || c : CAT_LABEL[c] || c);
// 数字格式化
const nf = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

const snap = JSON.parse(readFileSync(join(STORE, 'latest.json'), 'utf8'));

// —— 期号 = 快照历史行数（第 N 期）——
const lines = readFileSync(join(STORE, 'snapshots.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
const issueNo = lines.length;

// —— 上期快照（KPI 环比用）——
let prevSnap = null;
try {
  if (lines.length > 1) prevSnap = JSON.parse(lines[lines.length - 2]);
} catch { prevSnap = null; }
const prevNew8h = prevSnap && prevSnap.kpis ? (prevSnap.kpis.new_8h_repos ?? null) : null;
const new8hDelta = prevNew8h != null && snap.kpis ? snap.kpis.new_8h_repos - prevNew8h : null;

// —— 历史快照（用于档案馆曲线：官方 stars + 插件总数）——
let historyRows = [];
try {
  historyRows = lines.map((l) => { try { const s = JSON.parse(l); return { date: s.generated_at, stars: (s.kpis && s.kpis.official_stars) || 0, total: (s.kpis && s.kpis.total_plugins) || 0 }; } catch { return null; } }).filter(Boolean);
} catch { historyRows = []; }

const stamp = cst(snap.generated_at);
const windowStart = cst(snap.window_start).split(' · ')[1];
const windowEnd = cst(snap.window_end).split(' · ')[1];

// —— KPI 磁贴（M2b：i18n 文案）——
const k = snap.kpis;
const kpi = [
  { label: t.kpiTotal, value: nf(k.total_plugins), delta: `▲ +${k.new_8h_repos}`, note: t.kpiTotalNote, tone: 'up' },
  { label: t.kpiNew8h, value: nf(k.new_8h_repos), delta: new8hDelta != null ? `${new8hDelta >= 0 ? '▲ +' : '▼ '}${Math.abs(new8hDelta)}` : t.kpiNew8hBase, note: new8hDelta != null ? t.kpiNew8hVs : t.kpiNew8hFirst, tone: new8hDelta != null && new8hDelta < 0 ? 'down' : 'warn' },
  { label: t.kpiOfficial, value: nf(k.official_stars), delta: `forks ${nf(k.official_forks)}`, note: '', tone: 'up' },
  { label: t.kpiNpm, value: fmtNum(k.npm_weekly_downloads), delta: '@deepseek-ai/dsh', note: t.kpiNpmNote, tone: 'up' },
].map((m) => `
    <div class="kpi"><div class="k">${m.label}</div><div class="v">${m.value}</div><div class="delta ${m.tone}">${m.delta}${m.note ? ` <span class="muted" style="font-weight:400">${m.note}</span>` : ''}</div></div>`).join('\n');

// —— 爆发榜（M1 差分增速优先；首期无基线时退化为新秀绝对 stars 榜）——
const growthMode = snap.growth && snap.growth.length > 0;
const boardData = growthMode ? snap.growth : snap.leaderboard;
const maxGain = Math.max(...boardData.map((r) => (r.delta != null ? r.delta : r.stars)), 1);
const board = boardData.map((r) => {
  const gain = r.delta != null ? r.delta : r.stars;
  const pct = Math.round((gain / maxGain) * 100);
  const top = r.rank <= 3 ? ' top' : '';
  const gainTxt = r.delta != null ? `+${nf(r.delta)}` : `+${nf(r.stars)}`;
  const scoreTxt = r.score != null ? ` · ${t.boardTrust.replace('{n}', r.score)}` : '';
  const sub = (r.delta != null
    ? t.boardGain.replace('{n}', nf(r.delta)).replace('{m}', nf(r.stars))
    : (r.desc || '')) + scoreTxt;
  return `
    <div class="row">
      <div class="rank${top}">${String(r.rank).padStart(2, '0')}</div>
      <div class="pname">${r.name} <small>${catLabel(r.category)}${sub ? ` · ${sub}` : ''}</small></div>
      <div class="gain">${gainTxt}</div>
    </div>
    <div class="bar" style="margin:-4px 18px 0; width:auto"><i style="width:${pct}%"></i></div>`;
}).join('\n');

// —— 官方动态 ——
const activity = snap.official_activity.map((c) => {
  const [d, t] = c.date.split('T');
  const mmdd = d.slice(5).replace('-', '-');
  const hhmm = (t || '').slice(0, 5);
  return `
    <div class="tl"><div class="t"><b>${mmdd}</b>${hhmm}</div><div class="c"><b>${c.msg}</b><p><span class="muted">${c.sha}</span></p></div></div>`;
}).join('\n');

// —— 健康分（M2b：i18n 文案）——
const h = snap.health;
const ringCls = h.score >= 80 ? '' : h.score >= 60 ? ' ring--brand' : ' ring--down';
const zoneIdx = h.score >= 80 ? 0 : h.score >= 60 ? 1 : 2;
const bandIdx = h.score >= 80 ? 0 : h.score >= 60 ? 1 : 2;
const zoneTxt = t.healthZone[zoneIdx];
const bandTxt = t.healthBand[bandIdx];
const healthFactorLabel = { 活跃度: 'Activity', 新鲜度: 'Freshness', 采用度: 'Adoption', 多样性: 'Diversity' };
const healthFactorNoteEn = {
  '7 天内有提交的仓库占比': 'repos with commits in 7d',
  '8h 新建仓库占比': 'new repos in 8h',
  'npm 周下载分级': 'npm weekly downloads tier',
  '爆发榜 top1 占比（越低越好）': 'top1 share of leaderboard (lower = better)',
};
const fLabel = (f) => (LANG === 'en' ? healthFactorLabel[f.label] || f.label : f.label);
const fNote = (f) => (LANG === 'en' ? (healthFactorNoteEn[f.note] || '') : f.note);

// —— 摘要（M2：DeepSeek AI 生成，summarize.mjs 写入 snap.summary；无则降级规则）——
const sm = snap.summary || {};
const top1 = snap.leaderboard[0]?.name || '—';
// 降级规则（summarize.mjs 未跑或旧快照时兜底）
const _ruleZh = `DSH 生态今日 8 小时新增 <b>${k.new_8h_repos}</b> 个插件仓库，官方 stars 达 <b>${k.official_stars.toLocaleString('en-US')}</b>；新秀榜首 <b>${top1}</b> 领跑。7 天弃养率 ${((h.stale_7d / h.total_tracked) * 100).toFixed(1)}%，生态整体健康。`;
const _ruleEn = `DSH ecosystem added ${k.new_8h_repos} plugin repos in 8h; official repo now at ${k.official_stars.toLocaleString('en-US')} stars. Rookie leader: ${top1}. 7-day abandonment ${((h.stale_7d / h.total_tracked) * 100).toFixed(1)}%.`;
const summaryZh = sm.zh || _ruleZh;
const summaryEn = sm.en || _ruleEn;
const summarySource = sm.source === 'deepseek' ? t.summaryAi : t.summaryRule;
const summaryModel = sm.model || '';
// 本档语言对应的摘要（en 档 → en 摘要；zh 档 → zh 摘要）
const summaryText = LANG === 'en' ? summaryEn : summaryZh;
const summaryTag = LANG === 'en' ? t.summaryEnTag : t.summaryZhTag;

// —— JSON-LD（GEO 结构化数据，对齐设计系统 §11 data-mode="structured"）——
const jsonLd = JSON.stringify(buildDatasetJsonLd(snap, issueNo)).replace(/</g, '\\u003c');

// 输出文件名 + 语言切换链接（zh 页 → 同期 en 文件；en 页 EN 按钮指向自身、中文按钮指 latest.html）
const fname = `${String(issueNo).padStart(4, '0')}_${stamp.replace(/\s*·\s*/g, '-').replace(/:/g, '')}_${LANG}.html`;
const altFile = LANG === 'zh' ? fname.replace('_zh.html', '_en.html') : fname;

const html = `<!doctype html>
<html lang="${LANG === 'en' ? 'en' : 'zh-CN'}">
${head(`${LANG === 'en' ? 'DSH Ecosystem Pulse' : 'DSH·daily-pulse'} · ${t.metaIssue.replace('{n}', issueNo)} · ${stamp}`, LANG === 'en' ? 'DSH plugin ecosystem daily digest - 3x a day, 1 min to read the pulse.' : 'DSH 插件生态日报 · 每天三次，1 分钟读懂 DSH 生态的脉搏')}
<script type="application/ld+json">${jsonLd}</script>
<style>${CSS()}</style>
</head>
<body>
<div class="wrap">

  ${topbar('daily', LANG, altFile)}

  <section class="hero">
    <div class="kicker">${t.kicker}</div>
    <h1>${t.title}</h1>
    <div class="sub">${t.sub}</div>
    <div class="meta">
      <span><span class="dot"></span><b>${stamp}</b> GMT+8</span>
      <span>${t.metaIssue.replace('{n}', `<b>${issueNo}</b>`)}</span>
      <span>${t.metaWindow} <b>${windowStart} – ${windowEnd}</b></span>
      <span>${t.metaSource} <b>GitHub API · npm</b></span>
    </div>
  </section>

  <h2>${t.h2Kpi}</h2>
  <div class="kpi-row">${kpi}
  </div>

  <h2>${growthMode ? t.h2Board.replace('{n}', snap.growth.length) : t.h2BoardRookie.replace('{n}', snap.leaderboard.length)}</h2>
  <div class="board">${board}
  </div>
  <div class="chips">
    ${t.boardCharts.map((c, i) => `<span class="cat ${['v', 'w', 't', 'n'][i]}">${c}</span>`).join('\n    ')}
  </div>

  <h2>${t.h2Activity}</h2>
  <div class="timeline">${activity}
  </div>

  <h2>${t.h2Health}</h2>
  <div class="two">
    <div class="card">
      <div class="ct">${t.healthRing}</div>
      <div class="health">
        <div class="ring${ringCls}" style="--p:${h.score}"><i>${h.score}</i></div>
        <div class="note">${t.healthNow.replace('{n}', `<b style="color:var(--brand)">${h.score} / 100</b>`)}，${zoneTxt}（${bandTxt}）。<br><span class="muted">${t.healthMethod}</span></div>
      </div>
      ${h.factors ? `
      <div class="factors">
        ${Object.values(h.factors).map((f) => {
          const pct = Math.round((f.score / f.max) * 100);
          const tone = pct >= 75 ? 'up' : pct >= 40 ? 'warn' : 'down';
          return `<div class="factor"><span class="fl">${fLabel(f)}<small>${fNote(f)}</small></span><span class="fv ${tone}">${f.score}/${f.max}</span><div class="fbar"><i style="width:${pct}%" class="${tone}"></i></div></div>`;
        }).join('')}
      </div>` : ''}
    </div>
    <div class="card">
      <div class="ct">${t.healthWarnTitle}</div>
      <div class="warnlist">
        <div class="wl"><span class="ic ${h.stale_7d > 0 ? 'warn' : 'down'}"></span><b>${nf(h.stale_7d)}</b><span>${t.healthStale7d.replace('{p}', ((h.stale_7d / h.total_tracked) * 100).toFixed(1))}</span></div>
        <div class="wl"><span class="ic warn"></span><b>${nf(h.stale_1d)}</b><span>${t.healthStale1d.replace('{p}', ((h.stale_1d / h.total_tracked) * 100).toFixed(0))}</span></div>
        <div class="wl"><span class="ic down"></span><b>${nf(h.total_tracked)}</b><span>${t.healthTracked}</span></div>
      </div>
    </div>
  </div>

  <h2>${t.h2Summary} <span class="src-tag">${summarySource}${summaryModel ? ` · ${summaryModel}` : ''}</span></h2>
  <div class="i18n">
    <div class="i18n-${LANG}">
      <span class="i18n-tag">${summaryTag}</span>
      <p>${summaryText}</p>
    </div>
  </div>

  <h2>${t.h2Archive}</h2>
  <div class="archive">
    <div class="head">
      <b>${t.archiveHead.replace('{n}', historyRows.length)}</b>
      <a href="index.html">${t.archiveLink}</a>
    </div>
    ${historyRows.length >= 1 ? historyChart(historyRows, 620, 170, LANG) : t.archiveFirst}
  </div>

  <footer>
    <span>${t.footer1.replace('{n}', issueNo)}</span>
    <span>${t.footer2.replace('{t}', stamp)}</span>
  </footer>

</div>

${scripts(LANG)}
</body>
</html>
`;

writeFileSync(join(REPORTS, fname), html);
// latest.html = 默认中文版入口（含语言切换器）；en 档单独落盘
if (LANG === 'zh') writeFileSync(join(REPORTS, 'latest.html'), html);
console.log(`[render] 日报已生成 → reports/${fname} (lang=${LANG})`);
console.log(`  期号 ${issueNo} · ${stamp} GMT+8`);
console.log(`  KPIs: 插件 ${k.total_plugins} / 8h新增 ${k.new_8h_repos} / 官方 ${k.official_stars}★ / npm周下载 ${fmtNum(k.npm_weekly_downloads)}`);

// —— M0：bridge 微信通知（本地跑报时推微信；CI 无 DSH_BRIDGE_TOKEN env 自动跳过）——
// 设计：dsh-hermes-bridge 插件提供 POST /v1/notify（127.0.0.1:8643，Bearer 鉴权），
// 本地设置 DSH_BRIDGE_TOKEN 后，日报生成完自动推微信；GitHub Actions CI 不设即跳过。
if (process.env.DSH_BRIDGE_TOKEN) {
  const bridgeBase = process.env.DSH_BRIDGE_URL || 'http://127.0.0.1:8643';
  const summaryPlain = (sm.zh || _ruleZh || '').replace(/<[^>]+>/g, '');
  const notifyText = `[日报] ✅ 第 ${issueNo} 期已生成：插件 ${k.total_plugins} / 8h+${k.new_8h_repos} / 官方 ${k.official_stars.toLocaleString('en-US')}★${summaryPlain ? `\n${summaryPlain}` : ''}`;
  fetch(`${bridgeBase}/v1/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DSH_BRIDGE_TOKEN}` },
    body: JSON.stringify({ text: notifyText }),
  })
    .then((r) => console.log(`[render] bridge 微信通知: HTTP ${r.status}`))
    .catch((e) => console.warn(`[render] bridge 微信通知失败: ${e.message}`));
}
