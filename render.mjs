#!/usr/bin/env node
/**
 * dsh-daily-pulse 渲染脚本（M0 基础版）
 *
 * 读取 store/latest.json，把真实数据填入日报 HTML（复用原型 dsh-daily-pulse.html 的
 * 设计系统 v0.2 令牌 + 组件结构，仅替换示意值为真实数据）。
 *
 * 输出：reports/<期号>_<北京时间>.html（单文件自包含）
 * 运行：node render.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CSS, head, topbar, scripts, historyChart, fmtNum, cst, CAT_LABEL } from './tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE = join(__dirname, 'store');
const REPORTS = join(__dirname, 'reports');
mkdirSync(REPORTS, { recursive: true });

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

// —— KPI 磁贴 ——
const k = snap.kpis;
const kpi = [
  { label: '插件总数', value: k.total_plugins.toLocaleString('en-US'), delta: `▲ +${k.new_8h_repos}`, note: '/ 8h 新增', tone: 'up' },
  { label: '8h 新增仓库', value: k.new_8h_repos.toLocaleString('en-US'), delta: new8hDelta != null ? `${new8hDelta >= 0 ? '▲ +' : '▼ '}${Math.abs(new8hDelta)}` : '基线建立', note: new8hDelta != null ? 'vs 上期' : '首期快照', tone: new8hDelta != null && new8hDelta < 0 ? 'down' : 'warn' },
  { label: '官方仓库 stars', value: k.official_stars.toLocaleString('en-US'), delta: `forks ${k.official_forks.toLocaleString('en-US')}`, note: '', tone: 'up' },
  { label: 'npm 周下载', value: fmtNum(k.npm_weekly_downloads), delta: '@deepseek-ai/dsh', note: '过去 7 天', tone: 'up' },
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
  const gainTxt = r.delta != null ? `+${r.delta.toLocaleString('en-US')}` : `+${r.stars.toLocaleString('en-US')}`;
  const sub = r.delta != null
    ? `窗口增速 +${r.delta.toLocaleString('en-US')} · 累计 ${r.stars.toLocaleString('en-US')}★`
    : (r.desc || '');
  return `
    <div class="row">
      <div class="rank${top}">${String(r.rank).padStart(2, '0')}</div>
      <div class="pname">${r.name} <small>${CAT_LABEL[r.category] || r.category}${sub ? ` · ${sub}` : ''}</small></div>
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

// —— 健康分 ——
const h = snap.health;
const ringCls = h.score >= 80 ? '' : h.score >= 60 ? ' ring--brand' : ' ring--down';
const bandTxt = h.score >= 80 ? '≥80 绿' : h.score >= 60 ? '60–79 蓝' : '<60 红';
const staleNote = h.stale_7d > 0
  ? `${h.stale_7d} 个仓库 7 天无提交，建议关注维护活跃度`
  : '暂无 7 天无提交仓库';

// —— 摘要（规则生成，M2 换 DeepSeek AI）——
const top1 = snap.leaderboard[0]?.name || '—';
const summaryZh = `DSH 生态今日 8 小时新增 <b>${k.new_8h_repos}</b> 个插件仓库，官方 stars 达 <b>${k.official_stars.toLocaleString('en-US')}</b>；新秀榜首 <b>${top1}</b> 领跑。7 天弃养率 ${((h.stale_7d / h.total_tracked) * 100).toFixed(1)}%，生态整体健康。`;
const summaryEn = `DSH ecosystem added ${k.new_8h_repos} plugin repos in 8h; official repo now at ${k.official_stars.toLocaleString('en-US')} stars. Rookie leader: ${top1}. 7-day abandonment ${((h.stale_7d / h.total_tracked) * 100).toFixed(1)}%.`;

const html = `<!doctype html>
<html lang="zh-CN">
${head(`DSH·daily-pulse · 第 ${issueNo} 期 · ${stamp}`)}
<style>${CSS()}</style>
</head>
<body>
<div class="wrap">

  ${topbar('daily')}

  <section class="hero">
    <div class="kicker">Daily Pulse</div>
    <h1>DSH 生态日报</h1>
    <div class="sub">每天三次，1 分钟读懂 DSH 生态的脉搏。</div>
    <div class="meta">
      <span><span class="dot"></span><b>${stamp}</b> GMT+8</span>
      <span>第 <b>${issueNo}</b> 期</span>
      <span>采集窗口 <b>${windowStart} – ${windowEnd}</b></span>
      <span>数据源 <b>GitHub API · npm</b></span>
    </div>
  </section>

  <h2>生态快照</h2>
  <div class="kpi-row">${kpi}
  </div>

  <h2>${growthMode ? `star 增速爆发榜 · Top ${snap.growth.length}` : `新秀爆发榜 · Top ${snap.leaderboard.length}`}</h2>
  <div class="board">${board}
  </div>
  <div class="chips">
    <span class="cat v">蓝 = 视觉类 (Vision / Web UI)</span>
    <span class="cat w">紫 = 工作流 (Workflow / Skills)</span>
    <span class="cat t">绿 = 终端类 (Terminal / Memory / Browser)</span>
    <span class="cat n">灰 = 中性（无明确分类）</span>
  </div>

  <h2>官方动态</h2>
  <div class="timeline">${activity}
  </div>

  <h2>健康分 & 沉寂预警</h2>
  <div class="two">
    <div class="card">
      <div class="ct">生态健康分</div>
      <div class="health">
        <div class="ring${ringCls}" style="--p:${h.score}"><i>${h.score}</i></div>
        <div class="note">当前 <b style="color:var(--brand)">${h.score} / 100</b>，${h.score >= 80 ? '「健康扩张」区间' : h.score >= 60 ? '「稳定扩张」区间' : '「需关注」区间'}（${bandTxt}）。<br><span class="muted">基于 7 天活跃率近似，M2 升级为全量计分制。</span></div>
      </div>
    </div>
    <div class="card">
      <div class="ct">沉寂预警</div>
      <div class="warnlist">
        <div class="wl"><span class="ic ${h.stale_7d > 0 ? 'warn' : 'down'}"></span><b>${h.stale_7d}</b><span>个仓库 7 天无提交（${((h.stale_7d / h.total_tracked) * 100).toFixed(1)}% 弃养率）</span></div>
        <div class="wl"><span class="ic warn"></span><b>${h.stale_1d.toLocaleString('en-US')}</b><span>个仓库近 24h 无更新（占 ${((h.stale_1d / h.total_tracked) * 100).toFixed(0)}%）</span></div>
        <div class="wl"><span class="ic down"></span><b>${h.total_tracked.toLocaleString('en-US')}</b><span>个仓库纳入追踪（topic:dsh-plugin, 排除 fork）</span></div>
      </div>
    </div>
  </div>

  <h2>今日摘要</h2>
  <div class="i18n">
    <div class="i18n-zh">
      <span class="i18n-tag">中文</span>
      <p>${summaryZh}</p>
    </div>
    <div class="i18n-en">
      <span class="i18n-tag">EN · GEO</span>
      <p>${summaryEn}</p>
    </div>
  </div>

  <h2>生态档案馆</h2>
  <div class="archive">
    <div class="head">
      <b>官方 stars & 插件总数 · 历史曲线（${historyRows.length} 期）</b>
      <a href="index.html">查看完整历史 →</a>
    </div>
    ${historyRows.length >= 1 ? historyChart(historyRows) : '首期快照 · 历史曲线自第 2 期起累积'}
  </div>

  <footer>
    <span>DSH·daily-pulse · 第 ${issueNo} 期 · 真实采集数据</span>
    <span>数据源 GitHub Search API + npm registry · 生成于 ${stamp}</span>
  </footer>

</div>

${scripts()}
</body>
</html>
`;

const fname = `${String(issueNo).padStart(4, '0')}_${stamp.replace(/\s*·\s*/g, '-').replace(/:/g, '')}.html`;
writeFileSync(join(REPORTS, fname), html);
writeFileSync(join(REPORTS, 'latest.html'), html); // 稳定入口，供首页「最新一期」引用
console.log(`[render] 日报已生成 → reports/${fname}`);
console.log(`  期号 ${issueNo} · ${stamp} GMT+8`);
console.log(`  KPIs: 插件 ${k.total_plugins} / 8h新增 ${k.new_8h_repos} / 官方 ${k.official_stars}★ / npm周下载 ${fmtNum(k.npm_weekly_downloads)}`);
