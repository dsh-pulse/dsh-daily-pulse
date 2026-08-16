#!/usr/bin/env node
/**
 * bootstrap.mjs — 首次按 star 排序抓前 1000 建历史库（M0 §1.1）
 *
 * 设计文档（DSH生态讨论笔记.md §关键工程设计-1.1）：
 *   "首次按 star 排序抓前 1000 建历史库" —— 这是护城河数据集的根基：
 *   全量仓库清单 + 星标基线，供未来差分增速 / 全量健康分计分 / M2 增强数据使用。
 *
 * 用法:
 *   node bootstrap.mjs            # 建库（已存在则跳过，除非 --force）
 *   node bootstrap.mjs --force    # 强制重建
 *
 * 输出:
 *   store/repos.jsonl             每行一个仓库 {full_name, stars, topics, desc,
 *                                   pushed_at, created_at, html_url, fetched_at}
 *
 * 说明:
 *   - Search API 1000 条硬上限 → 10 页 × 100，页间 sleep 2.5s（软限速，30/min 配额内）
 *   - 只抓 fork:false（追踪口径）
 *   - 失败页重试 1 次；中途 403/限速即中止并提示
 */
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE = join(__dirname, 'store');
mkdirSync(STORE, { recursive: true });

const OUT = join(STORE, 'repos.jsonl');
const FORCE = process.argv.includes('--force');
function countLines(p) {
  return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).length;
}
if (!FORCE && existsSync(OUT)) {
  console.log(`store/repos.jsonl 已存在（${countLines(OUT)} 行）。如需重建加 --force。`);
  process.exit(0);
}

const TOKEN = process.env.GITHUB_TOKEN || execSync('gh auth token', { encoding: 'utf8' }).trim();
const API = 'https://api.github.com';
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'dsh-daily-pulse-bootstrap',
  'X-GitHub-Api-Version': '2022-11-28',
};
const PER_PAGE = 100;
const PAGES = 10; // 1000 条硬上限
const SLEEP_MS = 2500;

async function ghPage(page) {
  const r = await fetch(`${API}/search/repositories?q=topic%3Adsh-plugin+fork%3Afalse&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`, { headers: H });
  if (r.status === 403 || r.status === 429) {
    const reset = r.headers.get('x-ratelimit-reset');
    throw new Error(`GitHub ${r.status}（限速）: ${r.headers.get('x-ratelimit-remaining')} remaining, reset ${reset}`);
  }
  if (!r.ok) throw new Error(`GitHub ${r.status} ${r.statusText} (page ${page})`);
  return r.json();
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function main() {
  console.log('[bootstrap] 建库：topic:dsh-plugin fork:false，按 stars 前 1000');
  writeFileSync(OUT, ''); // 清空重建
  let total = 0;
  for (let page = 1; page <= PAGES; page++) {
    let data;
    try {
      data = await ghPage(page);
    } catch (e) {
      console.error(`⚠️  第 ${page} 页失败（${e.message}），3s 后重试一次`);
      await sleep(3000);
      try { data = await ghPage(page); } catch (e2) { console.error(`❌ 第 ${page} 页重试仍失败，中止。已写入 ${total} 行。`); process.exit(1); }
    }
    const items = (data.items || []).filter((i) => i.full_name !== 'deepseek-ai/deepseek-harness');
    if (items.length === 0) { console.log('[bootstrap] 无更多结果，提前结束'); break; }
    const now = new Date().toISOString();
    for (const it of items) {
      appendFileSync(OUT, JSON.stringify({
        full_name: it.full_name,
        stars: it.stargazers_count,
        topics: it.topics || [],
        desc: (it.description || '').slice(0, 120),
        pushed_at: it.pushed_at,
        created_at: it.created_at,
        html_url: it.html_url,
        fetched_at: now,
      }) + '\n');
      total++;
    }
    console.log(`  page ${page}/${PAGES}: +${items.length} 行（累计 ${total}）`);
    if (page < PAGES) await sleep(SLEEP_MS); // 软限速
  }
  console.log(`\n[bootstrap] 完成 ✔ 共 ${total} 个仓库 → store/repos.jsonl`);
  console.log(`  建议：跑一次 node collect.mjs 建立首期快照，再做首次 commit。`);
}

main().catch((e) => { console.error('[bootstrap] 失败:', e.message); process.exit(1); });
