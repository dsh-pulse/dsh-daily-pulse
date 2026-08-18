#!/usr/bin/env node
/**
 * dsh-daily-pulse 采集脚本（M0 基础版）
 *
 * 真实抓取 DSH 插件生态数据，输出：
 *   store/snapshots.jsonl  历史快照（增量追加，护城河数据集）
 *   store/latest.json      最新快照（供 render.mjs 渲染）
 *
 * 设计要点（对齐《DSH生态讨论笔记.md》§一）：
 *   - GitHub Search API 有 1000 条结果硬上限 → 总量用 total_count 计数（不翻页全量抓）
 *   - 8h 新增用 `created:>=窗口` 计数（窗口留 5 分钟重叠防漏）
 *   - 新秀爆发榜：只统计 DSH 发布日（2026-08-13）之后新建的仓库，天然排除老项目蹭 tag
 *   - 健康分：7 天活跃率近似；沉寂预警用 7 天/24h 无 push 的真实计数
 *   - 次期起对比历史快照算 star 增速（首期无基线）
 *
 * 依赖：仅 Node 内置 fetch + gh CLI 认证（GitHub Actions 里用 GITHUB_TOKEN）
 * 运行：node collect.mjs
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE = join(__dirname, 'store');
mkdirSync(STORE, { recursive: true });

const DSH_LAUNCH = '2026-08-13'; // DSH 公开发布日，新秀榜时间分界
const TOKEN = process.env.GITHUB_TOKEN || execSync('gh auth token', { encoding: 'utf8' }).trim();
const API = 'https://api.github.com';
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'dsh-daily-pulse',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function gh(path) {
  const r = await fetch(`${API}${path}`, { headers: H });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status} ${r.statusText}: ${path}`);
  if (r.headers.get('x-ratelimit-remaining') === '0') {
    console.error('⚠️  GitHub API 速率耗尽，退出');
    process.exit(2);
  }
  return r.json();
}

async function npmDownloads(pkg) {
  // 周下载（滚动 7 天；爆发期变化极小，仅作分级信号）
  const r = await fetch(`https://api.npmjs.org/downloads/point/last-week/${pkg}`);
  const weekly = r.ok ? await r.json() : null;
  // 日下载（自然日口径）：range API 近 4 天，取最后一个非 0 值——
  // 当天（UTC）数据可能未统计完返回 0，取最近完整自然日保证每天一个稳定值
  let daily = null;
  let dailyDate = null;
  try {
    const today = new Date();
    const from = new Date(today.getTime() - 4 * 86400000).toISOString().slice(0, 10);
    const to = today.toISOString().slice(0, 10);
    const rr = await fetch(`https://api.npmjs.org/downloads/range/${from}:${to}/${pkg}`);
    if (rr.ok) {
      const j = await rr.json();
      const days = (j.downloads || []).filter((d) => d.downloads > 0);
      const last = days[days.length - 1];
      if (last) { daily = last.downloads; dailyDate = last.day; }
    }
  } catch { /* 网络失败则 daily 为 null（图表 fallback） */ }
  return { weekly: weekly ? weekly.downloads : null, daily, dailyDate };
}

// —— M0 §1.3：总量抓 /topics/dsh-plugin 页面 HTML 计数（绕开 Search 上限 + 解析失败告警）——
async function topicPageCount() {
  try {
    const r = await fetch('https://github.com/topics/dsh-plugin', {
      headers: { 'User-Agent': 'dsh-daily-pulse', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) {
      const html = await r.text();
      const m = html.match(/([\d,]+)\s+public repositories/);
      if (m) {
        const count = parseInt(m[1].replace(/,/g, ''), 10);
        if (count > 0) return { count, source: 'topics-page' };
      }
    }
  } catch {}
  // 降级：Search total_count（不排除 fork，口径近似）+ 告警
  const sc = (await gh('/search/repositories?q=topic%3Adsh-plugin&per_page=1')).total_count;
  console.error('⚠️  /topics/dsh-plugin 页面计数解析失败，降级 Search total_count');
  return { count: sc, source: 'search-fallback' };
}

// —— M0 §1.2：蹭标签计分制（manifest +2 / 依赖 @deepseek-ai/dsh +2 / topic +1，≥3 计入）——
const SCORE_MANIFEST = 2;
const SCORE_DEPS = 2;
const SCORE_TOPIC = 1;
const SCORE_MIN = 3;
const DSH_PKG = '@deepseek-ai/dsh';

// —— M0 §1.2 计分辅助：读仓库文件内容。
//    优先走 GitHub API contents 端点（api.github.com，带 token、享 5000/h 额度，稳定）；
//    raw.githubusercontent.com 直连在本机间歇性 429/超时且不认 token，故不作为主路径。
//    任一失败（404/超时/网络）返回 null，绝不中断主采集。
async function fetchRaw(fullName, branch, path) {
  // 路径 1：API contents（base64 解码）
  try {
    const r = await fetch(`${API}/repos/${fullName}/contents/${path}?ref=${branch}`, {
      headers: H,
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const j = await r.json();
      if (j.content) return Buffer.from(j.content, 'base64').toString('utf8');
    }
    if (r.status !== 404) {
      // 非 404（如 403 限流），降级 raw 再试一次
    }
  } catch {}
  // 路径 2：raw 降级（API 不可达时的兜底）
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${fullName}/${branch}/${path}`, {
      headers: { 'User-Agent': 'dsh-daily-pulse' },
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) return r.text();
  } catch {}
  return null;
}

async function pluginScore(item) {
  // item: GitHub search result（含 topics[] + default_branch）
  const topics = (item.topics || []).map((t) => t.toLowerCase());
  let score = topics.includes('dsh-plugin') ? SCORE_TOPIC : 0;
  const branch = item.default_branch || 'main';
  const manifestNames = ['package.json', 'dsh.json', 'dsh.config.json', 'plugin.json'];
  for (const name of manifestNames) {
    const text = await fetchRaw(item.full_name, branch, name);
    if (!text) continue;
    score += SCORE_MANIFEST; // manifest 存在
    try {
      const json = JSON.parse(text);
      const deps = { ...(json.dependencies || {}), ...(json.devDependencies || {}), ...(json.peerDependencies || {}) };
      if (deps[DSH_PKG]) score += SCORE_DEPS; // 依赖 @deepseek-ai/dsh
    } catch {}
    break; // 命中任一 manifest 即停
  }
  return { score, verified: score >= SCORE_MIN };
}

function iso(d) { return d.toISOString().replace(/\.\d+Z$/, 'Z'); }

// 分类（关键词匹配，对齐设计系统 §7.5 三色编码：蓝视觉 / 紫工作流 / 绿终端）
function category(item) {
  const t = (item.topics || []).join(' ').toLowerCase() + ' ' + (item.description || '').toLowerCase();
  if (/(vision|web ui|\bui\b|skin|design|figma|theme|wallpaper|可视化|界面|皮肤|视觉|桌面|desktop|tui|鲸鱼|鲸鱼娘)/.test(t)) return '视觉';
  if (/(workflow|skill|orchestrat|memory|检索|编排|工作流|自动化|记忆|agent)/.test(t)) return '工作流';
  if (/(terminal|shell|browser|cli|文件|终端|浏览器|命令|market|市场|index|目录|curated)/.test(t)) return '终端';
  return '其他';
}

async function main() {
  const now = new Date();
  const nowISO = iso(now);
  const winStart = new Date(now.getTime() - 8 * 3600 * 1000 - 5 * 60 * 1000); // 留 5 分钟重叠
  const winStartISO = iso(winStart);

  console.log(`[collect] 采集窗口 ${winStartISO} → ${nowISO}`);

  // 1. KPIs（M0 §1.3：总数用 topics 页官方计数；追踪口径用 fork:false）
  const topic = await topicPageCount();
  const nonFork = (await gh('/search/repositories?q=topic%3Adsh-plugin+fork%3Afalse&per_page=1')).total_count;
  const new8h = (await gh(`/search/repositories?q=topic%3Adsh-plugin+fork%3Afalse+created%3A%3E%3D${encodeURIComponent(winStartISO)}&per_page=1`)).total_count;
  const official = await gh('/repos/deepseek-ai/deepseek-harness');
  const npm = await npmDownloads('@deepseek-ai/dsh');

  // 2. 新秀爆发榜 + 差分增速榜（M1）：star-index 维护每仓库星标基线，算窗口内增速；
  //    M0 §1.2 蹭标签计分制：manifest +2 / 依赖 @deepseek-ai/dsh +2 / topic +1，≥3 才计入榜
  //    M4 细分榜单：候选池扩到 60（按 stars 取），计分前 30，按类别/活跃度拆细分榜
  const rookie = await gh(`/search/repositories?q=topic%3Adsh-plugin+fork%3Afalse+created%3A%3E%3D${DSH_LAUNCH}&sort=stars&order=desc&per_page=60`);
  const starIndex = loadStarIndex();
  const boardCandidates = rookie.items
    .filter((i) => i.full_name !== 'deepseek-ai/deepseek-harness')
    .slice(0, 30);

  // 计分（串行，避免突发请求）
  const scoredCandidates = [];
  for (const item of boardCandidates) {
    const { score, verified } = await pluginScore(item);
    scoredCandidates.push({ item, score, verified });
  }
  const verifiedItems = scoredCandidates.filter((s) => s.verified).map((s) => s.item).slice(0, 6);

  const leaderboard = verifiedItems.map((item, i) => {
    const prev = starIndex[item.full_name];
    const s = scoredCandidates.find((x) => x.item.full_name === item.full_name);
    return {
      rank: i + 1,
      name: item.full_name,
      desc: (item.description || '').slice(0, 80),
      stars: item.stargazers_count,
      delta: prev ? item.stargazers_count - prev.stars : null, // 首见为 null（基线建立中）
      is_new: !prev,
      score: s ? s.score : 0,
      created: item.created_at,
      pushed: item.pushed_at,
      category: category(item),
      url: item.html_url,
    };
  });

  // 差分增速榜：按窗口内 star 增量排序（首期无基线 → 退化为按绝对 stars 排）
  const growth = leaderboard
    .filter((r) => r.delta != null)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 6)
    .map((r) => ({ rank: r.rank, name: r.name, desc: r.desc, delta: r.delta, stars: r.stars, is_new: r.is_new, score: r.score, category: r.category, url: r.url }))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  // —— M4 细分榜单：从全量候选（含未过计分门槛者，标注 verified）按类别 / 活跃度拆榜 ——
  //    类别用 topic+description 关键词（零额外请求）；活跃榜按最近 push 时间
  const allScored = scoredCandidates.map(({ item, score, verified }) => {
    const prev = starIndex[item.full_name];
    return {
      name: item.full_name,
      desc: (item.description || '').slice(0, 80),
      stars: item.stargazers_count,
      delta: prev ? item.stargazers_count - prev.stars : null,
      is_new: !prev,
      score,
      verified,
      category: category(item),
      created: item.created_at,
      pushed: item.pushed_at,
      url: item.html_url,
    };
  });

  // 类别榜：每类按 stars 取 top 4（候选池按 stars 取的前 30，覆盖主要类别）
  const categoryBoards = {};
  const CATEGORIES = ['视觉', '工作流', '终端', '其他'];
  for (const c of CATEGORIES) {
    categoryBoards[c] = allScored
      .filter((r) => r.category === c)
      .sort((a, b) => b.stars - a.stars)
      .slice(0, 4)
      .map((r, i) => ({ rank: i + 1, ...r }));
  }

  // 活跃榜：按最近 push 时间 top 5
  const activeBoard = allScored
    .filter((r) => r.pushed)
    .sort((a, b) => (b.pushed || '').localeCompare(a.pushed || ''))
    .slice(0, 5)
    .map((r, i) => ({ rank: i + 1, ...r }));

  // 更新 star-index（下一期才有差分基线；追踪全部候选，不只榜上）
  for (const item of boardCandidates) {
    const prev = starIndex[item.full_name];
    starIndex[item.full_name] = {
      stars: item.stargazers_count,
      first_seen: (prev && prev.first_seen) || nowISO,
      last_seen: nowISO,
    };
  }
  saveStarIndex(starIndex);

  // 3. 官方动态（最近 3 条 commit）
  const commits = await gh('/repos/deepseek-ai/deepseek-harness/commits?per_page=3');
  const officialActivity = commits.map((c) => ({
    sha: c.sha.slice(0, 7),
    date: c.commit.author.date,
    msg: c.commit.message.split('\n')[0].slice(0, 90),
  }));

  // 4. 健康分（M2 全量计分制）+ 沉寂预警（真实计数）
  //    四因子 0–100：活跃度 40 + 新鲜度 20 + 采用度 20 + 多样性 20
  //    替换 M0 的单因子 7 天活跃率近似，给出更诚实的生态健康画像
  const d7ago = iso(new Date(now.getTime() - 7 * 86400000));
  const d1ago = iso(new Date(now.getTime() - 1 * 86400000));
  const stale7d = (await gh(`/search/repositories?q=topic%3Adsh-plugin+fork%3Afalse+pushed%3A%3C${encodeURIComponent(d7ago)}&per_page=1`)).total_count;
  const stale1d = (await gh(`/search/repositories?q=topic%3Adsh-plugin+fork%3Afalse+pushed%3A%3C${encodeURIComponent(d1ago)}&per_page=1`)).total_count;

  // 因子 1 · 活跃度（40pt）：7 天内有 push 的仓库占比
  const fActivity = (1 - stale7d / Math.max(nonFork, 1)) * 40;

  // 因子 2 · 新鲜度（20pt）：8h 新建仓库占比，≥3.3% 即满分（早期爆发期满分，成熟后自然回落）
  const fFreshness = Math.min((new8h / Math.max(nonFork, 1)) * 600, 20);

  // 因子 3 · 采用度（20pt）：npm 周下载分级——真实使用信号，超越 stars 自嗨
  const npmW = npm ? npm.weekly ?? 0 : 0;
  const fAdoption = npmW >= 500000 ? 20 : npmW >= 100000 ? 16 : npmW >= 10000 ? 12 : npmW >= 1000 ? 8 : npmW > 0 ? 4 : 0;

  // 因子 4 · 多样性（20pt）：爆发榜 top1 占 top6 stars 比例越低越健康（避免单点垄断）
  const topStars = leaderboard.slice(0, 6).map((r) => r.stars || 0);
  const sumTop = topStars.reduce((a, b) => a + b, 0);
  const top1Ratio = sumTop > 0 ? Math.min((topStars[0] || 0) / sumTop, 1) : 1;
  const fDiversity = (1 - top1Ratio) * 20;

  const healthScore = Math.round(fActivity + fFreshness + fAdoption + fDiversity);
  const healthFactors = {
    activity: { score: Math.round(fActivity), max: 40, label: '活跃度', note: '7 天内有提交的仓库占比' },
    freshness: { score: Math.round(fFreshness), max: 20, label: '新鲜度', note: '8h 新建仓库占比' },
    adoption: { score: fAdoption, max: 20, label: '采用度', note: 'npm 周下载分级' },
    diversity: { score: Math.round(fDiversity), max: 20, label: '多样性', note: '爆发榜 top1 占比（越低越好）' },
  };

  // 5. 上期快照（用于增速对比；首期无基线）
  const prev = readPrevSnapshot();
  const prevOfficialStars = prev && prev.kpis ? (prev.kpis.official_stars ?? null) : null;
  const delta8hStars = prev && prevOfficialStars != null ? official.stargazers_count - prevOfficialStars : null;

  const snapshot = {
    generated_at: nowISO,
    window_start: winStartISO,
    window_end: nowISO,
    has_baseline: !!prev,
    kpis: {
      total_plugins: topic.count,   // M0 §1.3：/topics/dsh-plugin 官方计数（含 fork）
      non_fork_plugins: nonFork,    // 追踪口径（排除 fork）
      count_source: topic.source,   // 'topics-page' | 'search-fallback'
      new_8h_repos: new8h,
      official_stars: official.stargazers_count,
      official_forks: official.forks_count,
      npm_weekly_downloads: npm ? npm.weekly : null,
      npm_daily: npm ? npm.daily : null,
      npm_daily_date: npm ? npm.dailyDate : null,
      delta_8h_stars: delta8hStars, // 首期为 null（无基线）
    },
    official: {
      full_name: official.full_name,
      pushed_at: official.pushed_at,
      created_at: official.created_at,
      open_issues: official.open_issues_count,
    },
    leaderboard,
    growth,
    category_boards: categoryBoards, // M4 细分榜单：{类别: [top4]}
    active_board: activeBoard,      // M4 活跃榜：最近 push top5
    official_activity: officialActivity,
    health: {
      score: healthScore,
      factors: healthFactors,
      stale_7d: stale7d,
      stale_1d: stale1d,
      total_tracked: nonFork,
    },
  };

  writeFileSync(join(STORE, 'latest.json'), JSON.stringify(snapshot, null, 2));
  appendFileSync(join(STORE, 'snapshots.jsonl'), JSON.stringify(snapshot) + '\n');

  console.log('\n[collect] 完成 ✔');
  console.log(`  插件总数: ${topic.count} (${topic.source}) / 非 fork ${nonFork}`);
  console.log(`  8h 新增: ${new8h}`);
  console.log(`  官方 stars: ${official.stargazers_count} (forks ${official.forks_count})`);
  console.log(`  npm 周下载: ${npm ? (npm.weekly ?? 'N/A') : 'N/A'}`);
  console.log(`  健康分: ${healthScore}/100 (活跃${healthFactors.activity.score}/40 · 新鲜${healthFactors.freshness.score}/20 · 采用${healthFactors.adoption.score}/20 · 多样${healthFactors.diversity.score}/20 · 7天弃养 ${stale7d} 个)`);
  console.log(`  蹭标签剔除: ${boardCandidates.length - verifiedItems.length} 个候选未达计分门槛(≥${SCORE_MIN})`);
  console.log(`  新秀榜 top: ${leaderboard.map((p) => p.name).join(', ')}`);
  console.log(`  增速榜 top: ${growth.length ? growth.map((p) => `${p.name}+${p.delta}`).join(', ') : '(首期无基线，次期起生效)'}`);
  console.log(`  快照已写 store/latest.json + store/snapshots.jsonl`);
}

function readPrevSnapshot() {
  const p = join(STORE, 'snapshots.jsonl');
  if (!existsSync(p)) return null;
  const lines = readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  try { return JSON.parse(lines[lines.length - 1]); } catch { return null; }
}

// —— M1 star-index：仓库 → {stars, first_seen, last_seen}，用于差分增速榜 ——
const STAR_INDEX = join(STORE, 'star-index.json');

function loadStarIndex() {
  try { return JSON.parse(readFileSync(STAR_INDEX, 'utf8')); } catch { return {}; }
}
function saveStarIndex(idx) {
  writeFileSync(STAR_INDEX, JSON.stringify(idx, null, 2));
}

main().catch((e) => {
  console.error('采集失败:', e);
  process.exit(1);
});
