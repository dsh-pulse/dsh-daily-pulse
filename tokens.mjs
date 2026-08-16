#!/usr/bin/env node
/**
 * tokens.mjs — dsh-daily-pulse 共享设计系统令牌与工具（对齐 dsh-design-system.md v0.2）
 *
 * 供 render.mjs（单期日报）与 render-index.mjs（档案馆首页）复用：
 *   CSS()              完整设计系统 style（三层令牌 + 全部组件样式）
 *   head()             <head> 片段（含防闪烁主题脚本、meta）
 *   topbar()           顶部品牌条 + 导航 + 控制段（语言 / 配色 / 明暗切换）
 *   scripts()          交互脚本（主题 / 语言 / 配色切换）
 *   historyChart()     历史曲线 SVG（官方 stars 实线 + 插件总数 虚线）
 *   fmtNum()           数字缩写（1.34K / 1.29M）
 *   cst()              UTC → 北京时间（GMT+8）字符串
 *   isoDate()          UTC ISO → "YYYY-MM-DD"
 *   CAT_LABEL / CAT_CLS  分类三色编码
 *
 * v0.2.1（2026-08-17）：补齐健康分 / 沉寂预警 / 摘要 i18n / 分类图例组件样式
 * （初版漏了这些组件，导致日报对应区块无样式）。
 */
export const CAT_CLS = { 视觉: 'v', 工作流: 'w', 终端: 't', 其他: 'n' };
export const CAT_LABEL = { 视觉: '视觉类', 工作流: '工作流', 终端: '终端类', 其他: '其他' };

export function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// UTC ISO → 北京时间 "YYYY-MM-DD · HH:MM"
export function cst(isoStr) {
  if (!isoStr) return '—';
  const c = new Date(new Date(isoStr).getTime() + 8 * 3600 * 1000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(c.getUTCFullYear())}-${p(c.getUTCMonth() + 1)}-${p(c.getUTCDate())} · ${p(c.getUTCHours())}:${p(c.getUTCMinutes())}`;
}

export function isoDate(isoStr) {
  if (!isoStr) return '';
  return (isoStr || '').slice(0, 10);
}

// —— 顶部品牌条 + 导航；nav=当前页（'daily' | 'index'），index 高亮「档案馆」——
export function topbar(nav = 'daily') {
  const item = (href, label, cur) =>
    `<a class="navi ${cur ? ' on' : ''}" href="${href}">${label}</a>`;
  return `
  <div class="topbar">
    <div class="brand">
      <div class="logo">D</div>
      <div><b>DSH·daily-pulse</b><br><span>DSH 生态日报 · 真实数据</span></div>
    </div>
    <div class="controls">
      <nav class="nav" style="display:flex;gap:6px;background:var(--bg-surface);border:1px solid var(--border);border-radius:999px;padding:4px 6px">
        ${item('index.html', '档案馆', nav === 'index')}
        ${item('latest.html', '最新一期', nav === 'daily')}
      </nav>
      <div class="seg">
        <span class="seg-lbl">语言</span>
        <button class="seg-btn" data-lang="zh" aria-pressed="false">中文</button>
        <button class="seg-btn" data-lang="en" aria-pressed="false">EN</button>
        <button class="seg-btn" data-lang="bi" aria-pressed="true">双语</button>
      </div>
      <div class="seg">
        <span class="seg-lbl">配色</span>
        <button class="seg-btn" data-accent="blue" aria-pressed="true">Blue</button>
        <button class="seg-btn" data-accent="teal" aria-pressed="false">Teal</button>
      </div>
      <button class="toggle" id="tg">切换为亮色</button>
    </div>
  </div>`;
}

export function head(title, desc = 'DSH 插件生态日报 · 每天三次，1 分钟读懂 DSH 生态的脉搏') {
  return `<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="${desc}" />
<meta name="generator" content="dsh-daily-pulse" />
<title>${title}</title>
<script>
  (function(){try{
    var t=localStorage.getItem('dsh-theme');
    if(!t && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) t='light';
    if(t) document.documentElement.dataset.theme=t;
  }catch(e){}})();
</script>`;
}

// 完整设计系统 CSS（三层令牌 + 全部组件样式）
export function CSS() {
  return `
  :root{
    --brand:#3E7BFA; --brand-2:#5C93FF; --brand-soft:rgba(62,123,250,.14);
    --up:#25C99B; --down:#F4606B; --warn:#F5B544; --info:#3E7BFA;
    --bg-base:#0A0E17; --bg-surface:#111623; --bg-elev:#181F2E;
    --border:#232C3F; --border-strong:#2E3A52;
    --text-1:#EAEEF6; --text-2:#9BA6BC; --text-3:#5E6A82;
    --cat-v:#7FC8FF; --cat-w:#C9A3FF; --logo-fg:#FFFFFF;
    --shadow:0 1px 0 rgba(255,255,255,.03) inset, 0 10px 30px rgba(0,0,0,.40);
    --shadow-sm:0 1px 0 rgba(255,255,255,.03) inset, 0 4px 14px rgba(0,0,0,.30);
  }
  :root[data-theme="light"]{
    --bg-base:#F6F8FC; --bg-surface:#FFFFFF; --bg-elev:#FFFFFF;
    --border:#E4E9F1; --border-strong:#CFD7E5;
    --text-1:#0E1726; --text-2:#46526A; --text-3:#8591A6;
    --shadow:0 1px 2px rgba(16,23,38,.06), 0 12px 32px rgba(16,23,38,.10);
    --shadow-sm:0 1px 2px rgba(16,23,38,.06), 0 4px 14px rgba(16,23,38,.08);
  }
  :root[data-accent="teal"]{ --brand:#1FB6C9; --brand-2:#3FD0E0; --brand-soft:rgba(31,182,201,.14); }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0; background:var(--bg-base); color:var(--text-1); font-family:"Inter",-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif; line-height:1.6; -webkit-font-smoothing:antialiased;}
  .mono{font-family:"JetBrains Mono","SF Mono","IBM Plex Mono",ui-monospace,"Cascadia Code",monospace}
  .wrap{max-width:1080px; margin:0 auto; padding:28px 24px 96px}
  a{color:var(--brand-2); text-decoration:none}
  h2{font-size:13px; font-weight:700; color:var(--text-3); text-transform:uppercase; letter-spacing:.06em; margin:54px 0 16px; display:flex; align-items:center; gap:10px}
  h2::before{content:""; width:7px; height:7px; border-radius:2px; background:var(--brand)}
  p{color:var(--text-2); font-size:14.5px}
  .muted{color:var(--text-3)}
  .topbar{display:flex; align-items:center; gap:14px; justify-content:space-between; flex-wrap:wrap; position:sticky; top:0; z-index:20; background:color-mix(in srgb,var(--bg-base) 88%, transparent); backdrop-filter:blur(8px); padding:14px 0; border-bottom:1px solid var(--border); margin-bottom:8px}
  .brand{display:flex; align-items:center; gap:12px}
  .logo{width:34px; height:34px; border-radius:9px; background:linear-gradient(135deg,var(--brand),var(--brand-2)); display:grid; place-items:center; color:var(--logo-fg); font-weight:800; font-size:15px; box-shadow:var(--shadow-sm)}
  .brand b{font-size:16px; font-weight:700; letter-spacing:-.01em}
  .brand span{color:var(--text-3); font-size:12px}
  .controls{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .navi{font-size:12.5px; color:var(--text-2); padding:5px 11px; border-radius:999px; background:transparent; border:0; cursor:pointer; text-decoration:none; font-family:inherit}
  .navi:hover{color:var(--text-1)}
  .navi.on{background:var(--brand-soft); color:var(--brand-2); font-weight:600}
  .seg{display:inline-flex; align-items:center; gap:6px; background:var(--bg-surface); border:1px solid var(--border); border-radius:999px; padding:4px 6px 4px 10px}
  .seg-lbl{font-size:11px; color:var(--text-3); text-transform:uppercase; letter-spacing:.04em}
  .seg-btn{font-size:12.5px; color:var(--text-2); background:transparent; border:0; padding:5px 11px; border-radius:999px; cursor:pointer; font-family:inherit}
  .seg-btn:hover{color:var(--text-1)}
  .seg-btn[aria-pressed="true"]{background:var(--brand-soft); color:var(--brand-2); font-weight:600}
  .toggle{font-size:13px; color:var(--text-2); border:1px solid var(--border); background:var(--bg-surface); padding:7px 14px; border-radius:999px; cursor:pointer}
  .toggle:hover{color:var(--text-1)}
  .hero{padding:18px 0 6px}
  .hero .kicker{font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:var(--brand-2); font-weight:700}
  .hero h1{font-size:42px; font-weight:800; margin:8px 0 4px; letter-spacing:-.03em; line-height:1.05}
  .hero .sub{font-size:15.5px; color:var(--text-2)}
  .hero .meta{display:flex; flex-wrap:wrap; gap:8px 18px; margin-top:16px; font-size:12.5px; color:var(--text-3)}
  .hero .meta b{color:var(--text-1); font-weight:600}
  .hero .meta .dot{width:5px; height:5px; border-radius:50%; background:var(--up); display:inline-block; margin-right:6px; box-shadow:0 0 0 3px var(--brand-soft)}
  .kpi-row{display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px}
  .kpi{background:var(--bg-surface); border:1px solid var(--border); border-radius:14px; padding:18px; box-shadow:var(--shadow-sm); position:relative; overflow:hidden}
  .kpi::after{content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:linear-gradient(var(--brand),var(--brand-2))}
  .kpi .k{font-size:12.5px; color:var(--text-3)}
  .kpi .v{font-size:30px; font-weight:800; margin:6px 0 4px; letter-spacing:-.02em; font-family:"JetBrains Mono","SF Mono",ui-monospace,monospace}
  .delta{font-size:12.5px; font-weight:700; display:inline-flex; align-items:center; gap:4px}
  .delta.up{color:var(--up)} .delta.down{color:var(--down)} .delta.warn{color:var(--warn)}
  .board{background:var(--bg-surface); border:1px solid var(--border); border-radius:14px; overflow:hidden; box-shadow:var(--shadow-sm)}
  .board .row{display:grid; grid-template-columns:34px 1fr 120px; align-items:center; gap:14px; padding:14px 18px; border-bottom:1px solid var(--border)}
  .board .row:last-child{border-bottom:0}
  .rank{font-weight:800; color:var(--text-3); font-family:"JetBrains Mono",ui-monospace,monospace; font-size:14px}
  .rank.top{color:var(--warn)}
  .pname{font-weight:700; font-size:15px; display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .pname small{display:block; color:var(--text-3); font-weight:400; font-size:12px; width:100%}
  .bar{height:7px; border-radius:999px; background:var(--brand-soft); overflow:hidden}
  .bar i{display:block; height:100%; background:linear-gradient(90deg,var(--brand),var(--brand-2))}
  .gain{text-align:right; font-weight:800; color:var(--up); font-family:"JetBrains Mono",ui-monospace,monospace; font-size:15px; white-space:nowrap}
  .chips{display:flex; flex-wrap:wrap; gap:8px; margin-top:16px}
  .cat{font-size:12px; padding:4px 11px; border-radius:999px; border:1px solid var(--border-strong); color:var(--text-2)}
  .cat.v{color:var(--cat-v); border-color:color-mix(in srgb,var(--cat-v) 40%, transparent)}
  .cat.w{color:var(--cat-w); border-color:color-mix(in srgb,var(--cat-w) 40%, transparent)}
  .cat.t{color:var(--up); border-color:color-mix(in srgb,var(--up) 40%, transparent)}
  .cat.n{color:var(--text-3); border-color:color-mix(in srgb,var(--text-3) 35%, transparent)}
  .timeline{background:var(--bg-surface); border:1px solid var(--border); border-radius:14px; padding:8px 20px; box-shadow:var(--shadow-sm)}
  .tl{display:grid; grid-template-columns:88px 1fr; gap:16px; padding:16px 0; border-bottom:1px solid var(--border)}
  .tl:last-child{border-bottom:0}
  .tl .t{font-size:12.5px; color:var(--text-3); font-family:"JetBrains Mono",ui-monospace,monospace; padding-top:2px}
  .tl .t b{display:block; color:var(--brand-2); font-size:13px}
  .tl .c b{font-size:14.5px; color:var(--text-1); font-weight:700}
  .tl .c p{margin:3px 0 0; font-size:13.5px}
  .two{display:grid; grid-template-columns:1fr 1.3fr; gap:16px}
  .card{background:var(--bg-surface); border:1px solid var(--border); border-radius:14px; padding:20px; box-shadow:var(--shadow-sm)}
  .card .ct{font-size:12px; color:var(--text-3); text-transform:uppercase; letter-spacing:.05em; margin-bottom:14px}
  .health{display:flex; align-items:center; gap:22px}
  .ring{--p:78; --ring-c:var(--up); width:104px; height:104px; border-radius:50%; background:conic-gradient(var(--ring-c) calc(var(--p)*1%), var(--border) 0); display:grid; place-items:center; flex:none}
  .ring--brand{--ring-c:var(--brand)}
  .ring--down{--ring-c:var(--down)}
  .ring i{width:78px; height:78px; border-radius:50%; background:var(--bg-surface); display:grid; place-items:center; font-size:28px; font-weight:800; font-style:normal; font-family:"JetBrains Mono",ui-monospace,monospace}
  .health .note{font-size:13px}
  .warnlist{display:flex; flex-direction:column; gap:10px}
  .wl{display:flex; align-items:center; gap:12px; padding:11px 13px; border:1px solid var(--border); border-radius:10px; background:var(--bg-elev)}
  .wl .ic{width:8px; height:8px; border-radius:50%; flex:none}
  .wl .ic.warn{background:var(--warn)} .wl .ic.down{background:var(--down)}
  .wl b{font-size:15px; font-family:"JetBrains Mono",ui-monospace,monospace; font-weight:800}
  .wl span{color:var(--text-3); font-size:13px}
  .i18n{display:grid; grid-template-columns:1fr; gap:12px; margin-top:4px}
  :root[data-lang="bi"] .i18n{grid-template-columns:1fr 1fr}
  [data-lang="zh"] .i18n-en{display:none}
  [data-lang="en"] .i18n-zh{display:none}
  .i18n-zh,.i18n-en{background:var(--brand-soft); border:1px solid color-mix(in srgb,var(--brand) 30%, transparent); border-left:3px solid var(--brand); border-radius:10px; padding:15px 17px}
  .i18n-tag{display:inline-block; font-size:11px; font-weight:700; letter-spacing:.05em; color:var(--brand-2); text-transform:uppercase; margin-bottom:7px}
  .i18n-zh p,.i18n-en p{margin:0; font-size:14.5px; color:var(--text-1); line-height:1.6}
  .i18n-en p{font-family:"JetBrains Mono","SF Mono",ui-monospace,monospace; font-size:12px; line-height:1.55}
  .archive{background:var(--bg-surface); border:1px solid var(--border); border-radius:14px; padding:22px; box-shadow:var(--shadow-sm)}
  .archive .head{display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px}
  .archive .head b{font-size:16px}
  .archive .head a{font-size:13px; font-weight:600}
  .spark{width:100%; height:170px; display:block}
  .archive .cap{display:flex; justify-content:space-between; font-size:12px; color:var(--text-3); margin-top:8px; font-family:"JetBrains Mono",ui-monospace,monospace}
  .issues{display:flex; flex-direction:column}
  .issue{display:grid; grid-template-columns:52px 1fr auto; align-items:center; gap:14px; padding:14px 6px; border-bottom:1px solid var(--border)}
  .issue:last-child{border-bottom:0}
  .issue .no{font-family:"JetBrains Mono",monospace; font-weight:800; font-size:17px; color:var(--brand-2)}
  .issue .t b{font-size:15px; color:var(--text-1); font-weight:700; display:block}
  .issue .t span{font-size:12.5px; color:var(--text-3)}
  .issue .go{color:var(--brand-2); font-size:13px; font-weight:600}
  .issue:hover{background:var(--bg-elev)}
  footer{margin-top:60px; padding-top:20px; border-top:1px solid var(--border); font-size:12.5px; color:var(--text-3); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px}
  @media (max-width:680px){ .two{grid-template-columns:1fr} .hero h1{font-size:32px} .board .row{grid-template-columns:28px 1fr 84px} }
`;
}

// 交互脚本（语言 / 配色 / 明暗），供各页统一注入
export function scripts() {
  return `<script>
  (function(){
    var root=document.documentElement;
    try{
      var sa=localStorage.getItem('dsh-accent'); if(sa) root.dataset.accent=sa;
      var sl=localStorage.getItem('dsh-lang');   if(sl) root.dataset.lang=sl; else root.dataset.lang='bi';
    }catch(e){}
    var tg=document.getElementById('tg');
    function themeLabel(){ if(tg) tg.textContent = root.dataset.theme==='light' ? '切换为暗色' : '切换为亮色'; }
    if(tg){ tg.onclick=function(){
      var next = root.dataset.theme==='light' ? 'dark' : 'light';
      root.dataset.theme=next;
      try{ localStorage.setItem('dsh-theme', next); }catch(e){}
      themeLabel();
    };}
    themeLabel();
    function bindSeg(attr, storeKey){
      var btns=[].slice.call(document.querySelectorAll('[data-'+attr+']'));
      btns.forEach(function(b){
        b.onclick=function(){
          var val=b.dataset[attr];
          root.setAttribute('data-'+attr, val);
          btns.forEach(function(x){ x.setAttribute('aria-pressed', x.dataset[attr]===val); });
          try{ if(storeKey) localStorage.setItem(storeKey, val); }catch(e){}
        };
      });
    }
    bindSeg('lang','dsh-lang');
    bindSeg('accent','dsh-accent');
  })();
</script>`;
}

// 由快照生成历史曲线 SVG（官方 stars 实线 + 插件总数 虚线 + 面积）
// rows=[{date, stars, total}, ...]（按时间正序即可，函数内排序）
export function historyChart(rows, w = 620, h = 170) {
  if (!rows || rows.length < 1) return '';
  const data = rows.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const pad = { l: 10, r: 10, t: 14, b: 22 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const x = (i) => pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const scale = (arr) => {
    const min = Math.min(...arr), max = Math.max(...arr);
    return (v) => (max === min ? pad.t + ih * 0.5 : pad.t + ((max - v) / (max - min)) * ih);
  };
  const ys = scale(data.map((d) => d.stars));
  const yt = scale(data.map((d) => d.total));

  const line = (fn, accessor) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${fn(accessor(d)).toFixed(1)}`).join(' ');
  const area = (fn, accessor) =>
    `${line(fn, accessor)} L${x(data.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;

  const last = data[data.length - 1];
  const pts = data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${ys(d.stars).toFixed(1)}" r="2.2" fill="var(--brand)"/>`).join('');

  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="官方 stars 与插件总数历史曲线">
  <defs>
    <linearGradient id="fillA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="fillB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--up)" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="var(--up)" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="${area(ys, (d) => d.stars)}" fill="url(#fillA)"/>
  <path d="${line(ys, (d) => d.stars)}" fill="none" stroke="var(--brand)" stroke-width="2" vector-effect="non-scaling-stroke"/>
  <path d="${line(yt, (d) => d.total)}" fill="none" stroke="var(--up)" stroke-width="1.4" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>
  ${pts}
  <text x="${x(0).toFixed(1)}" y="160" text-anchor="start" fill="var(--text-3)" font-size="11" font-family="JetBrains Mono,monospace">${isoDate(data[0].date)}</text>
  <text x="${x(data.length - 1).toFixed(1)}" y="160" text-anchor="end" fill="var(--text-3)" font-size="11" font-family="JetBrains Mono,monospace">${isoDate(last.date)}</text>
</svg>
<div class="cap"><span>官方 stars ${fmtNum(last.stars)} · 插件总数 ${fmtNum(last.total)}</span><span>${data.length} 期快照</span></div>`;
}
