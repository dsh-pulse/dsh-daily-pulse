#!/usr/bin/env node
/**
 * dsh-daily-pulse 开放数据导出（M4 工作包①）
 *
 * 把采集快照转成可下载的结构化数据，兑现公众号文章 §七「开放数据接口下载」：
 *   reports/data/snapshots.csv   全历史时间序列（每期一行，期号=行序）
 *   reports/data/latest.csv      当期 KPI 宽表（一行）
 *   reports/data/leaderboard.csv 当期榜单（爆发榜 ∪ 增速榜，list 列区分）
 *   reports/data/category-boards.csv 细分榜单（每类 top4，list=category:<类别>）
 *   reports/data/active-board.csv    活跃榜（最近 push top5）
 *   reports/data/latest.json     当期完整快照（结构化 JSON，与 store/latest.json 同构）
 *
 * 数据字典（口径）见 README「开放数据」章节；字段名与 store/latest.json 键一一对应，
 * 保证 CSV / JSON 两份产物可互相对照。
 *
 * 运行：node export.mjs   （只读 store/，写入 reports/data/，无网络依赖）
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE = join(__dirname, 'store');
const DATA = join(__dirname, 'reports', 'data');
mkdirSync(DATA, { recursive: true });

/** RFC 4180 CSV 转义：含逗号/引号/换行才加引号，内部引号翻倍 */
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

// —— 1. 历史时间序列 snapshots.csv ——
const SNAP_HEADERS = [
  'generated_at', 'window_start', 'window_end',
  'total_plugins', 'non_fork_plugins', 'count_source', 'new_8h_repos',
  'official_stars', 'official_forks',
  'npm_weekly_downloads', 'npm_daily', 'npm_daily_date', 'delta_8h_stars',
  'health_score', 'stale_7d', 'stale_1d', 'total_tracked',
];
function kpiRow(snap) {
  const k = snap.kpis || {};
  const h = snap.health || {};
  return [
    snap.generated_at, snap.window_start, snap.window_end,
    k.total_plugins, k.non_fork_plugins, k.count_source, k.new_8h_repos,
    k.official_stars, k.official_forks,
    k.npm_weekly_downloads, k.npm_daily, k.npm_daily_date, k.delta_8h_stars,
    h.score, h.stale_7d, h.stale_1d, h.total_tracked,
  ];
}

// —— 2. 当期宽表 latest.csv（KPI + 官方 + 健康 一行） ——
const LATEST_HEADERS = [
  ...SNAP_HEADERS,
  'official_full_name', 'official_pushed_at', 'official_created_at', 'official_open_issues',
  'health_activity', 'health_freshness', 'health_adoption', 'health_diversity',
];

// —— 3. 榜单 leaderboard.csv（爆发榜 ∪ 增速榜） ——
const BOARD_HEADERS = [
  'list', 'rank', 'name', 'desc', 'stars', 'delta', 'is_new', 'score', 'category', 'created', 'pushed', 'url',
];
function boardRow(list, r) {
  return [
    list, r.rank, r.name, r.desc, r.stars, r.delta ?? null,
    r.is_new === true ? 1 : (r.is_new === false ? 0 : r.is_new),
    r.score, r.category, r.created, r.pushed, r.url,
  ];
}

// —— 3b. M4 细分榜单 category-boards.csv（list=category:<类别>）+ active-board.csv ——
const CAT_HEADERS = [
  'list', 'rank', 'name', 'stars', 'delta', 'is_new', 'score', 'verified', 'category', 'created', 'pushed', 'url',
];
function catRow(list, r) {
  return [
    list, r.rank, r.name, r.stars, r.delta ?? null,
    r.is_new === true ? 1 : (r.is_new === false ? 0 : r.is_new),
    r.score, r.verified === true ? 1 : 0, r.category, r.created, r.pushed, r.url,
  ];
}

function loadSnapshots() {
  const p = join(STORE, 'snapshots.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function main() {
  const snaps = loadSnapshots();
  if (snaps.length === 0) {
    console.error('[export] store/snapshots.jsonl 为空，跳过导出');
    process.exit(1);
  }
  const latest = snaps[snaps.length - 1];

  // snapshots.csv
  const snapLines = [csvRow(SNAP_HEADERS), ...snaps.map((s) => csvRow(kpiRow(s)))];
  writeFileSync(join(DATA, 'snapshots.csv'), snapLines.join('\n') + '\n');

  // latest.csv
  const h = latest.health || {};
  const latestRow = [
    ...kpiRow(latest),
    latest.official?.full_name, latest.official?.pushed_at, latest.official?.created_at, latest.official?.open_issues,
    h.factors?.activity?.score, h.factors?.freshness?.score, h.factors?.adoption?.score, h.factors?.diversity?.score,
  ];
  writeFileSync(join(DATA, 'latest.csv'), csvRow(LATEST_HEADERS) + '\n' + csvRow(latestRow) + '\n');

  // leaderboard.csv（爆发榜 ∪ 增速榜）
  const boardLines = [csvRow(BOARD_HEADERS)];
  for (const r of latest.leaderboard || []) boardLines.push(csvRow(boardRow('leaderboard', r)));
  for (const r of latest.growth || []) boardLines.push(csvRow(boardRow('growth', r)));
  writeFileSync(join(DATA, 'leaderboard.csv'), boardLines.join('\n') + '\n');

  // category-boards.csv（M4 细分榜单：每类 top4，list=category:<类别>）
  const catLines = [csvRow(CAT_HEADERS)];
  for (const [cat, rows] of Object.entries(latest.category_boards || {})) {
    for (const r of rows || []) catLines.push(csvRow(catRow(`category:${cat}`, r)));
  }
  writeFileSync(join(DATA, 'category-boards.csv'), catLines.join('\n') + '\n');

  // active-board.csv（M4 活跃榜：最近 push top5）
  const actLines = [csvRow(CAT_HEADERS)];
  for (const r of latest.active_board || []) actLines.push(csvRow(catRow('active', r)));
  writeFileSync(join(DATA, 'active-board.csv'), actLines.join('\n') + '\n');

  // latest.json（结构化，供程序直接消费）
  writeFileSync(join(DATA, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');

  console.log(`[export] 开放数据已生成 → reports/data/（${snaps.length} 期）`);
  console.log(`  snapshots.csv  ${snaps.length} 行历史序列`);
  console.log(`  latest.csv     当期 KPI 宽表（${LATEST_HEADERS.length} 列）`);
  console.log(`  leaderboard.csv ${(latest.leaderboard?.length || 0) + (latest.growth?.length || 0)} 行榜单`);
  console.log(`  category-boards.csv ${catLines.length - 1} 行细分榜`);
  console.log(`  active-board.csv ${actLines.length - 1} 行活跃榜`);
  console.log(`  latest.json    当期结构化快照（generated_at=${latest.generated_at}）`);
}

main();
