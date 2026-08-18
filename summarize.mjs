#!/usr/bin/env node
/**
 * dsh-daily-pulse · M2 AI 摘要生成
 *
 * 读取 store/latest.json，调 DeepSeek chat API 生成中英双语摘要，写回 latest.json
 * 的 summary 字段：{ zh, en, source, model }。
 *
 *   - source = 'deepseek'  AI 生成成功
 *   - source = 'rule'      无可用 key / API 失败，降级规则模板（保证日报不中断）
 *
 * Key 解析顺序：process.env.DEEPSEEK_API_KEY → ~/.dsh/.credentials.yaml 的 DEEPSEEK_API_KEY
 * → 仍无则降级规则生成。CI 在 secret DEEPSEEK_API_KEY 注入即走 AI；本地复用 dsh 凭据。
 *
 * 设计要点（对齐 dsh-design-system.md §8 语气）：
 *   - 中文：像朋友一句话讲清"今天发生了什么"，可带轻判断，不卖焦虑
 *   - 英文：concise、data-led，便于被 ChatGPT/Gemini 引用（GEO 资产）
 *   - 禁词：革命 / 颠覆 / 最强 / 必看
 *
 * 运行：node summarize.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE = join(__dirname, 'store');
const LATEST = join(STORE, 'latest.json');

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1/chat/completions';

// —— 解析 API key ——
function resolveKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  const cred = join(homedir(), '.dsh', '.credentials.yaml');
  if (existsSync(cred)) {
    const m = readFileSync(cred, 'utf8').match(/^DEEPSEEK_API_KEY:\s*(\S+)/m);
    if (m) return m[1];
  }
  return null;
}

// —— 规则降级摘要（无 key / API 失败时兜底，日报不中断）——
function ruleSummary(snap) {
  const k = snap.kpis || {};
  const h = snap.health || {};
  const top1 = (snap.leaderboard || [])[0];
  const top1Name = top1 ? top1.name : '—';
  const abandon = h.total_tracked ? ((h.stale_7d / h.total_tracked) * 100).toFixed(1) : '0.0';
  const stars = (k.official_stars ?? 0).toLocaleString('en-US');
  const zh = `DSH 生态今日 8 小时新增 <b>${k.new_8h_repos ?? 0}</b> 个插件仓库，官方 stars 达 <b>${stars}</b>；新秀榜首 <b>${top1Name}</b> 领跑。7 天弃养率 ${abandon}%，生态整体健康。`;
  const en = `DSH ecosystem added ${k.new_8h_repos ?? 0} plugin repos in 8h; official repo now at ${stars} stars. Rookie leader: ${top1Name}. 7-day abandonment ${abandon}%.`;
  return { zh, en };
}

// —— 把快照压缩成喂给模型的数据摘要 ——
function digest(snap) {
  const k = snap.kpis || {};
  const lb = (snap.leaderboard || []).slice(0, 3).map((r) => ({
    name: r.name, stars: r.stars, delta: r.delta, cat: r.category, desc: (r.desc || '').slice(0, 60),
  }));
  const gr = (snap.growth || []).slice(0, 3).map((r) => ({ name: r.name, delta: r.delta, stars: r.stars }));
  const act = (snap.official_activity || []).slice(0, 3).map((c) => ({ sha: c.sha, msg: c.msg }));
  const h = snap.health || {};
  return {
    window: `${snap.window_start} → ${snap.window_end}`,
    kpis: {
      total_plugins: k.total_plugins,
      non_fork: k.non_fork_plugins,
      new_8h: k.new_8h_repos,
      official_stars: k.official_stars,
      official_forks: k.official_forks,
      npm_weekly: k.npm_weekly_downloads,
      delta_8h_stars: k.delta_8h_stars,
    },
    leaderboard_top3: lb,
    growth_top3: gr,
    official_activity: act,
    health: { score: h.score, stale_7d: h.stale_7d, stale_1d: h.stale_1d, total_tracked: h.total_tracked },
  };
}

async function aiSummarize(snap, key) {
  const data = digest(snap);
  const sys = `你是 DSH（DeepSeek Harness）插件生态日报的编辑。根据给定的生态快照数据，生成中英双语"今日摘要"。
要求：
- 中文（zh）：1-2 句，像朋友讲清"今天发生了什么"，必须含关键数字，可带轻判断（如"建议持续观察"），不卖焦虑。
- 英文（en）：1-2 句，concise、data-led，便于被 AI 引擎引用（GEO 资产）。
- 禁词：革命、颠覆、最强、必看。
- 输出严格 JSON：{"zh": "...", "en": "..."}，不要 markdown 代码块、不要解释。中文里数字用 <b>标签</b> 高亮关键值。`;
  const user = `生态快照（JSON）：\n${JSON.stringify(data, null, 2)}`;

  const r = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
      temperature: 0.4,
      stream: false,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`DeepSeek ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content || '';
  let parsed;
  try { parsed = JSON.parse(content); } catch {
    // 模型偶尔包代码块，兜底提取
    const m = content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
    else throw new Error('无法解析模型输出为 JSON');
  }
  if (!parsed.zh || !parsed.en) throw new Error('模型输出缺 zh/en 字段');
  return { zh: parsed.zh, en: parsed.en, model: j.model || MODEL };
}

// —— 把 summary 回填到 snapshots.jsonl 最后一行（快照历史自包含；generated_at 匹配才写，防错位）——
function backfillSnapshotSummary(summary) {
  const p = join(STORE, 'snapshots.jsonl');
  if (!existsSync(p)) return;
  try {
    const lines = readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length === 0) return;
    const last = JSON.parse(lines[lines.length - 1]);
    const latest = JSON.parse(readFileSync(LATEST, 'utf8'));
    if (!last.generated_at || last.generated_at !== latest.generated_at) return;
    last.summary = summary;
    lines[lines.length - 1] = JSON.stringify(last);
    writeFileSync(p, lines.join('\n') + '\n');
  } catch {}
}

async function main() {
  if (!existsSync(LATEST)) {
    console.error('[summarize] store/latest.json 不存在，请先跑 collect.mjs');
    process.exit(1);
  }
  const snap = JSON.parse(readFileSync(LATEST, 'utf8'));

  const key = resolveKey();
  if (!key) {
    console.log('[summarize] 未找到 DEEPSEEK_API_KEY，降级规则生成');
    const s = ruleSummary(snap);
    snap.summary = { ...s, source: 'rule', model: null };
  } else {
    try {
      const t0 = Date.now();
      const s = await aiSummarize(snap, key);
      snap.summary = { ...s, source: 'deepseek' };
      console.log(`[summarize] AI 摘要生成 ✔ (${s.model}, ${Date.now() - t0}ms)`);
    } catch (e) {
      console.error(`[summarize] AI 生成失败，降级规则：${e.message}`);
      const s = ruleSummary(snap);
      snap.summary = { ...s, source: 'rule', model: null };
    }
  }

  writeFileSync(LATEST, JSON.stringify(snap, null, 2));
  backfillSnapshotSummary(snap.summary);
  console.log(`[summarize] 摘要已写入 store/latest.json + 回填 snapshots.jsonl (source=${snap.summary.source})`);
  console.log(`  zh: ${snap.summary.zh.replace(/<[^>]+>/g, '').slice(0, 80)}`);
}

main().catch((e) => {
  console.error('摘要生成失败:', e);
  process.exit(1);
});
