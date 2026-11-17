(() => {
  // ============================================================
  //  EDGE DEVTOOLS v3
  //  Tab baru: Net (monitor request), Media (viewer), Src (daftar sumber)
  //  Animasi pindah halaman: Slide / Zoom / Flip / Fade
  // ============================================================

  // --- 0. Bersihkan instance lama (hook fetch/XHR/console dikembalikan) ---
  try { window.__edgeDT_cleanup && window.__edgeDT_cleanup(); } catch (e) {}
  const oldHost = document.getElementById('__edge_devtools_host');
  if (oldHost) oldHost.remove();

  const cleanups = [];
  const onCleanup = (fn) => cleanups.push(fn);
  const listen = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); onCleanup(() => t.removeEventListener(ev, fn, opt)); };
  const blobUrls = new Set();
  const mkBlobUrl = (blob) => { const u = URL.createObjectURL(blob); blobUrls.add(u); return u; };
  window.__edgeDT_cleanup = () => {
    cleanups.splice(0).reverse().forEach((f) => { try { f(); } catch (e) {} });
    blobUrls.forEach((u) => URL.revokeObjectURL(u));
    blobUrls.clear();
    ['__edge_devtools_host', '__edge_outline', '__edge_dark', '__edge_freeze', '__edge_unlock'].forEach((id) => {
      const n = document.getElementById(id);
      if (n) n.remove();
    });
    delete window.__edgeDT_cleanup;
  };

  // --- 1. HELPERS ---
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  };
  const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch (e) { return String(u); } };
  const fmtBytes = (n) => {
    if (n == null || isNaN(n)) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  };
  const fmtMs = (ms) => (ms == null || isNaN(ms) ? '—' : ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' s');
  const fmtDur = (s) => {
    if (!isFinite(s)) return 'live';
    s = Math.round(s);
    const m = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
    return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };
  const byteLen = (s) => new Blob([s]).size;
  const shortUrl = (u) => {
    if (u.startsWith('data:')) return u.slice(0, 48) + '… (data URI ~' + fmtBytes(Math.round(u.length * 0.75)) + ')';
    return u;
  };
  const urlParts = (u) => {
    try {
      const x = new URL(u);
      return { host: x.host, path: x.pathname + x.search + x.hash, origin: x.origin };
    } catch (e) { return { host: '', path: u, origin: '' }; }
  };
  const IMG_EXT = 'png jpg jpeg gif webp avif svg bmp ico apng'.split(' ');
  const VID_EXT = 'mp4 webm mov m4v ogv mkv'.split(' ');
  const AUD_EXT = 'mp3 wav ogg oga m4a aac flac opus weba'.split(' ');
  const FONT_EXT = 'woff woff2 ttf otf eot'.split(' ');
  function guessType(url, ctype, init) {
    const c = (ctype || '').toLowerCase();
    if (c.startsWith('image/')) return 'image';
    if (c.startsWith('video/')) return 'video';
    if (c.startsWith('audio/')) return 'audio';
    if (/javascript|ecmascript/.test(c)) return 'script';
    if (c.includes('css')) return 'style';
    if (c.includes('json')) return 'json';
    if (c.includes('html')) return 'html';
    if (c.includes('font')) return 'font';
    if (c.startsWith('text/') || c.includes('xml')) return 'text';
    url = String(url || '');
    if (url.startsWith('data:')) {
      const m = url.slice(5).split(/[;,]/)[0];
      return m ? guessType('', m, init) : 'other';
    }
    let ext = '';
    try { ext = new URL(url, document.baseURI).pathname.split('.').pop().toLowerCase(); } catch (e) {}
    if (IMG_EXT.includes(ext)) return 'image';
    if (VID_EXT.includes(ext)) return 'video';
    if (AUD_EXT.includes(ext)) return 'audio';
    if (FONT_EXT.includes(ext)) return 'font';
    if (ext === 'js' || ext === 'mjs') return 'script';
    if (ext === 'css') return 'style';
    if (ext === 'json') return 'json';
    if (ext === 'html' || ext === 'htm') return 'html';
    if (['txt', 'xml', 'md', 'csv'].includes(ext)) return 'text';
    if (init === 'img' || init === 'image') return 'image';
    if (init === 'audio') return 'audio';
    if (init === 'video') return 'video';
    if (init === 'script') return 'script';
    if (init === 'css') return 'style';
    if (init === 'iframe' || init === 'frame') return 'html';
    return 'other';
  }
  const isTextCt = (c) => /json|text|xml|javascript|ecmascript|html|css|svg|x-www-form-urlencoded|graphql/i.test(c || '');
  const MIME_EXT = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a',
    'text/html': 'html', 'text/css': 'css', 'application/json': 'json', 'application/javascript': 'js', 'text/javascript': 'js', 'text/plain': 'txt'
  };
  function fileNameFrom(url, ctype) {
    let n = '';
    try {
      if (!/^(data|blob):/.test(url)) n = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
    } catch (e) {}
    if (!n) n = 'file-' + Date.now();
    if (!/\.[a-z0-9]{2,5}$/i.test(n)) {
      let mime = (ctype || '').split(';')[0].trim();
      if (!mime && url.startsWith('data:')) mime = url.slice(5).split(/[;,]/)[0];
      if (MIME_EXT[mime]) n += '.' + MIME_EXT[mime];
    }
    return n.slice(0, 120);
  }
  const prettify = (text, hint) => {
    const t = String(text).trim();
    if ((hint && /json/i.test(hint)) || /^[\[{]/.test(t)) {
      try { return JSON.stringify(JSON.parse(t), null, 2); } catch (e) {}
    }
    return text;
  };
  function headersToObj(hd) {
    const o = {};
    if (!hd) return o;
    try {
      if (typeof Headers !== 'undefined' && hd instanceof Headers) hd.forEach((v, k) => (o[k] = v));
      else if (Array.isArray(hd)) hd.forEach(([k, v]) => (o[k] = v));
      else Object.assign(o, hd);
    } catch (e) {}
    return o;
  }
  function describeBody(b) {
    if (b == null) return null;
    try {
      if (typeof b === 'string') return b;
      if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) return b.toString();
      if (typeof FormData !== 'undefined' && b instanceof FormData) {
        const a = [];
        b.forEach((v, k) => a.push(k + '=' + (typeof File !== 'undefined' && v instanceof File ? `[File ${v.name} ${fmtBytes(v.size)}]` : v)));
        return a.join('\n');
      }
      if (b instanceof Blob) return `[Blob ${b.type || '?'} ${fmtBytes(b.size)}]`;
      if (b instanceof ArrayBuffer) return `[ArrayBuffer ${fmtBytes(b.byteLength)}]`;
      if (ArrayBuffer.isView(b)) return `[TypedArray ${fmtBytes(b.byteLength)}]`;
    } catch (e) {}
    return String(b);
  }
  function cssPath(el) {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      if (el.id) { parts.unshift('#' + CSS.escape(el.id)); break; }
      let s = el.tagName.toLowerCase();
      const p = el.parentElement;
      if (p) {
        const sib = [...p.children].filter((c) => c.tagName === el.tagName);
        if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(el) + 1})`;
      }
      parts.unshift(s);
      el = p;
    }
    return parts.join(' > ');
  }

  // --- 2. SHADOW DOM HOST ---
  const host = document.createElement('div');
  host.id = '__edge_devtools_host';
  host.setAttribute('contenteditable', 'false');
  Object.assign(host.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '2147483647', userSelect: 'none', webkitUserSelect: 'none'
  });
  // z-index: batas maksimum browser = 2147483647 (angka lebih besar otomatis dipotong ke nilai ini).
  // Supaya tetap menang dari elemen lain yang juga memakai nilai itu, host dimasukkan ke TOP LAYER (popover),
  // yang selalu di atas semua z-index.
  host.style.setProperty('z-index', '2147483647', 'important');
  host.setAttribute('popover', 'manual');
  Object.assign(host.style, { margin: '0', padding: '0', border: '0', background: 'transparent', overflow: 'visible', maxWidth: 'none', maxHeight: 'none' });
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const liftToTop = () => {
    try {
      if (!host.showPopover) return;
      if (host.matches(':popover-open')) host.hidePopover();
      host.showPopover();
    } catch (e) {}
  };
  liftToTop();
  try {
    // Kalau halaman membuka <dialog> / popover baru, naikkan lagi (kecuali sedang mengetik di DevTools)
    const lift = (muts) => {
      const hit = muts.some((m) => (m.type === 'attributes' && m.target.tagName === 'DIALOG') ||
        [...m.addedNodes].some((n) => n.nodeType === 1 && n !== host && (n.matches('dialog,[popover]') || n.querySelector('dialog,[popover]'))));
      if (hit && !host.matches(':focus-within')) setTimeout(liftToTop, 30);
    };
    const mo = new MutationObserver(lift);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    onCleanup(() => mo.disconnect());
    listen(document, 'toggle', (e) => { if (e.target !== host && !host.matches(':focus-within')) setTimeout(liftToTop, 30); }, true);
  } catch (e) {}

  // --- 3. STYLES ---
  const style = document.createElement('style');
  style.textContent = `
    :host {
      --accent:#38bdf8; --accent-soft:rgba(56,189,248,.16); --accent-glow:rgba(56,189,248,.35);
      --bg-alpha:.80; --card-bg:rgba(17,24,39,.78); --input-bg:rgba(9,13,22,.85);
      --border:rgba(148,163,184,.22); --text:#f8fafc; --muted:#94a3b8;
      --green:#10b981; --red:#f43f5e; --amber:#fbbf24;
      --ease:cubic-bezier(.16,1,.3,1); --dur:1;
    }
    * { box-sizing:border-box; font-family:'Inter',system-ui,-apple-system,sans-serif; font-size:12px; -webkit-tap-highlight-color:transparent; }
    #edge-handle, #overlay { pointer-events:auto; }

    /* Handle kanan */
    #edge-handle {
      position:fixed; right:0; top:50%; transform:translateY(-50%); width:28px; height:68px;
      background:rgba(15,23,42,.9); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
      border:1.5px solid var(--accent); border-right:none; border-radius:14px 0 0 14px;
      display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;
      color:var(--accent); box-shadow:-4px 0 18px rgba(0,0,0,.5),0 0 12px var(--accent-glow);
      cursor:pointer; touch-action:none; z-index:9999;
      transition:transform .25s var(--ease),opacity .25s ease,width .2s ease;
    }
    #edge-handle:active { width:34px; }
    #edge-handle.hidden { opacity:0; pointer-events:none; transform:translate(100%,-50%); }
    .grip-bar { width:3px; height:22px; border-radius:3px; background:var(--accent); box-shadow:0 0 8px var(--accent-glow); }

    /* Overlay */
    #overlay {
      position:fixed; inset:0; background:rgba(8,12,20,var(--bg-alpha));
      backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); color:var(--text);
      display:flex; flex-direction:row; z-index:9998; opacity:0; visibility:hidden;
      transform:translateX(34px) scale(.985);
      transition:opacity calc(.3s*var(--dur)) var(--ease),transform calc(.42s*var(--dur)) var(--ease),visibility .4s;
    }
    #overlay.open { opacity:1; visibility:visible; transform:none; }

    .main-area { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; position:relative; }
    .topbar { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-bottom:1px solid var(--border); background:rgba(15,23,42,.55); }
    .title-wrap { display:flex; align-items:center; gap:8px; font-weight:700; letter-spacing:.4px; }
    .dot { width:8px; height:8px; border-radius:50%; background:var(--green); box-shadow:0 0 8px var(--green); animation:pulse 2.4s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity:.45; transform:scale(.8); } }
    .mode-pill { font-size:10px; padding:2px 7px; border-radius:99px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--border); text-transform:uppercase; font-weight:700; }

    /* Rail kanan + indikator bergerak */
    .right-rail {
      position:relative; width:56px; background:rgba(11,16,27,.88); border-left:1px solid var(--border);
      display:flex; flex-direction:column; align-items:center; padding:8px 4px; gap:6px;
      overflow-y:auto; overflow-x:hidden; scrollbar-width:none;
    }
    .right-rail::-webkit-scrollbar { display:none; }
    .rail-ind {
      position:absolute; left:5px; top:0; width:46px; height:50px; border-radius:11px;
      background:var(--accent-soft); border:1px solid var(--accent); box-shadow:0 0 14px var(--accent-glow);
      transition:transform calc(.5s*var(--dur)) cubic-bezier(.34,1.45,.55,1),height .3s var(--ease);
      pointer-events:none; z-index:0;
    }
    .rail-ind::after { content:''; position:absolute; right:-6px; top:50%; margin-top:-10px; width:3px; height:20px; border-radius:3px 0 0 3px; background:var(--accent); }
    .tab-btn {
      position:relative; z-index:1; width:46px; padding:6px 2px; border-radius:10px; border:1px solid transparent;
      background:transparent; color:var(--muted); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; cursor:pointer;
      transition:color .25s ease,transform .2s var(--ease); flex-shrink:0;
    }
    .tab-btn svg { width:17px; height:17px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; transition:transform .35s var(--ease); }
    .tab-btn span { font-size:9.5px; font-weight:600; }
    .tab-btn:active { transform:scale(.9); }
    .tab-btn.active { color:var(--accent); }
    .tab-btn.active svg { transform:scale(1.12); }
    .badge { position:absolute; top:1px; right:1px; min-width:15px; height:15px; border-radius:8px; background:var(--accent); color:#06121e; font-size:8.5px; font-weight:800; display:none; align-items:center; justify-content:center; padding:0 3px; font-style:normal; }
    .badge.on { display:flex; }
    .badge.err { background:var(--red); color:#fff; }
    .close-rail-btn { margin-top:auto; flex-shrink:0; width:44px; height:36px; border-radius:10px; border:1px solid var(--border); background:rgba(244,63,94,.16); color:#fda4af; font-weight:700; cursor:pointer; position:relative; z-index:1; }

    /* Views + animasi pindah halaman */
    .views { flex:1; position:relative; overflow:hidden; perspective:1000px; }
    .view {
      position:absolute; inset:0; display:none; padding:10px; gap:8px; overflow-y:auto; overflow-x:hidden;
      user-select:text; -webkit-user-select:text; transform-origin:50% 40%;
    }
    .view > * { flex-shrink:0; }
    .view.active { display:flex; flex-direction:column; z-index:2; }
    .view.leaving { display:flex; flex-direction:column; z-index:1; pointer-events:none; }
    #overlay.landscape .view.active.split-view, #overlay.landscape .view.leaving.split-view { flex-direction:row; }
    #overlay.landscape .split-col { flex:1; display:flex; flex-direction:column; gap:8px; min-width:0; overflow-y:auto; }
    #overlay.portrait .split-col { display:flex; flex-direction:column; gap:8px; }
    #overlay.portrait .split-col.grow { flex:1; min-height:150px; }

    .view.in  { animation-duration:calc(.5s*var(--dur)); animation-timing-function:var(--ease); animation-fill-mode:both; }
    .view.out { animation-duration:calc(.28s*var(--dur)); animation-timing-function:cubic-bezier(.4,0,1,1); animation-fill-mode:both; }
    #overlay[data-anim="slide"] .view.in  { animation-name:slideIn; }
    #overlay[data-anim="slide"] .view.out { animation-name:slideOut; }
    #overlay[data-anim="zoom"]  .view.in  { animation-name:zoomIn; }
    #overlay[data-anim="zoom"]  .view.out { animation-name:zoomOut; }
    #overlay[data-anim="flip"]  .view.in  { animation-name:flipIn; }
    #overlay[data-anim="flip"]  .view.out { animation-name:flipOut; }
    #overlay[data-anim="fade"]  .view.in  { animation-name:fadeIn; }
    #overlay[data-anim="fade"]  .view.out { animation-name:fadeOut; }
    @keyframes slideIn  { from { opacity:0; transform:translateY(calc(var(--dir,1)*40px)) scale(.97); filter:blur(7px); } to { opacity:1; transform:none; filter:blur(0); } }
    @keyframes slideOut { from { opacity:1; } to { opacity:0; transform:translateY(calc(var(--dir,1)*-40px)) scale(.97); filter:blur(7px); } }
    @keyframes zoomIn   { from { opacity:0; transform:scale(.86); filter:blur(6px); } to { opacity:1; transform:none; filter:blur(0); } }
    @keyframes zoomOut  { from { opacity:1; } to { opacity:0; transform:scale(1.08); filter:blur(6px); } }
    @keyframes flipIn   { from { opacity:0; transform:rotateX(calc(var(--dir,1)*-16deg)) translateY(calc(var(--dir,1)*24px)); } to { opacity:1; transform:none; } }
    @keyframes flipOut  { from { opacity:1; } to { opacity:0; transform:rotateX(calc(var(--dir,1)*16deg)) translateY(calc(var(--dir,1)*-24px)); } }
    @keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
    @keyframes fadeOut  { from { opacity:1; } to { opacity:0; } }
    .stg { animation:rise calc(.55s*var(--dur)) var(--ease) both; animation-delay:var(--d,0ms); }
    #overlay[data-anim="none"] .stg { animation:none; }
    @keyframes rise { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
    .list.fresh > .item { animation:rise calc(.4s*var(--dur)) var(--ease) both; animation-delay:var(--d,0ms); }
    @keyframes secIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
    .sec { animation:secIn calc(.35s*var(--dur)) var(--ease) both; display:flex; flex-direction:column; gap:8px; }

    /* Primitif UI */
    .card { background:var(--card-bg); border:1px solid var(--border); border-radius:10px; padding:9px; display:flex; flex-direction:column; gap:7px; }
    .row { display:flex; gap:6px; align-items:center; }
    .row.wrap { flex-wrap:wrap; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
    .grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
    .btn { background:rgba(30,41,59,.85); color:var(--text); border:1px solid var(--border); border-radius:8px; padding:7px 10px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:5px; transition:transform .14s ease,background .18s ease,border-color .18s ease; }
    .btn:active { transform:scale(.94); }
    .btn.small { padding:4px 8px; font-size:11px; }
    .btn-accent { background:var(--accent); border-color:var(--accent); color:#06121e; font-weight:700; }
    .btn-green { background:rgba(16,185,129,.18); border-color:rgba(16,185,129,.45); color:#34d399; }
    .btn-red { background:rgba(244,63,94,.18); border-color:rgba(244,63,94,.45); color:#fb7185; }
    input, textarea, select { background:var(--input-bg); color:var(--text); border:1px solid var(--border); border-radius:8px; padding:7px 9px; outline:none; width:100%; font-size:12px; }
    textarea, pre, .mono { font-family:'JetBrains Mono','Fira Code',monospace; font-size:11.5px; }
    input:focus, textarea:focus, select:focus { border-color:var(--accent); }
    input[type=range] { padding:0; accent-color:var(--accent); }
    .muted { color:var(--muted); font-size:11px; }
    .empty { color:var(--muted); text-align:center; padding:18px 8px; }

    .terminal { flex:1; min-height:110px; background:rgba(5,8,15,.88); border:1px solid var(--border); border-radius:9px; padding:7px; overflow-y:auto; font-family:monospace; font-size:11px; }
    .log-item { padding:4px 6px; border-bottom:1px solid rgba(148,163,184,.12); word-break:break-all; white-space:pre-wrap; }
    .log-warn { color:var(--amber); background:rgba(251,191,36,.08); }
    .log-error { color:#fb7185; background:rgba(244,63,94,.1); }
    .log-info { color:var(--accent); }
    .terminal[data-f="log"] .log-item:not(.log-log), .terminal[data-f="warn"] .log-item:not(.log-warn),
    .terminal[data-f="error"] .log-item:not(.log-error), .terminal[data-f="info"] .log-item:not(.log-info) { display:none; }

    .chips { display:flex; gap:5px; overflow-x:auto; scrollbar-width:none; padding-bottom:2px; }
    .chips::-webkit-scrollbar { display:none; }
    .chip { flex-shrink:0; padding:4px 10px; border-radius:99px; background:rgba(15,23,42,.9); border:1px solid var(--border); color:var(--muted); font-weight:600; font-size:11px; cursor:pointer; transition:all .2s var(--ease); }
    .chip.on { background:var(--accent); border-color:var(--accent); color:#06121e; }
    .chip:active { transform:scale(.92); }

    .list { display:flex; flex-direction:column; gap:6px; }
    .view > .list { flex:1 1 0; min-height:0; overflow-y:auto; }
    .item { background:rgba(12,18,30,.85); border:1px solid var(--border); border-radius:9px; padding:7px 8px; display:flex; flex-direction:column; gap:4px; transition:transform .15s var(--ease),border-color .2s; flex-shrink:0; }
    .item.tap { cursor:pointer; }
    .item.tap:active { transform:scale(.985); border-color:var(--accent); }
    .url { word-break:break-all; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; font-size:11px; }
    .u-host { color:var(--muted); }
    .pill { display:inline-block; padding:2px 7px; border-radius:6px; font-size:10px; font-weight:700; background:rgba(15,23,42,.9); border:1px solid var(--border); color:var(--accent); white-space:nowrap; }
    .pill.ok { color:#34d399; border-color:rgba(16,185,129,.45); } .pill.warn { color:var(--amber); border-color:rgba(251,191,36,.45); }
    .pill.bad { color:#fb7185; border-color:rgba(244,63,94,.5); } .pill.dim { color:var(--muted); }
    .pill.m-POST,.pill.m-PUT,.pill.m-PATCH { color:var(--amber); } .pill.m-DELETE { color:#fb7185; } .pill.m-WS { color:#c084fc; }

    .dropzone { border:1.5px dashed var(--accent); background:rgba(56,189,248,.06); border-radius:12px; padding:16px 12px; text-align:center; cursor:pointer; transition:all .2s ease; display:flex; flex-direction:column; align-items:center; gap:6px; }
    .dropzone.dragover { background:rgba(56,189,248,.18); transform:scale(.99); }
    .pill-row { display:flex; gap:5px; }

    .st-card { background:rgba(10,15,26,.85); border:1px solid var(--border); border-radius:8px; padding:7px; margin-bottom:6px; }
    .st-head { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:4px; }
    .st-pre { margin:0; padding:6px; background:rgba(4,7,13,.9); border-radius:6px; color:#a5f3fc; max-height:140px; overflow:auto; white-space:pre-wrap; word-break:break-all; }
    .st-pre.big { max-height:none; user-select:text; -webkit-user-select:text; }
    .var-item { display:flex; flex-direction:column; gap:3px; padding:6px 8px; background:rgba(12,18,30,.85); border:1px solid var(--border); border-radius:8px; margin-bottom:5px; }
    .kw-const { color:#c084fc; font-weight:700; } .kw-let { color:#38bdf8; font-weight:700; } .kw-var { color:#fbbf24; font-weight:700; }
    .attr-row { display:grid; grid-template-columns:1fr 1.3fr 30px 30px; gap:4px; align-items:center; }

    /* Media */
    .media-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:8px; align-content:start; }
    .media-card { padding:0; overflow:hidden; gap:0; }
    .media-prev { background:repeating-conic-gradient(rgba(255,255,255,.05) 0% 25%,transparent 0% 50%) 50%/16px 16px; display:flex; align-items:center; justify-content:center; min-height:120px; max-height:220px; overflow:hidden; }
    .media-prev img, .media-prev video { max-width:100%; max-height:220px; display:block; object-fit:contain; }
    .media-prev audio { width:94%; margin:18px 0; }
    .media-prev.big { max-height:46vh; } .media-prev.big img, .media-prev.big video { max-height:46vh; }
    .prev-err { color:var(--amber); padding:16px; text-align:center; }
    .media-info { padding:8px; display:flex; flex-direction:column; gap:5px; }

    /* Sheet detail */
    #sheet-back { position:absolute; inset:0; right:0; background:rgba(0,0,0,.5); opacity:0; visibility:hidden; transition:opacity .3s,visibility .3s; z-index:20; }
    #sheet-back.open { opacity:1; visibility:visible; }
    #sheet { position:absolute; left:0; right:0; bottom:0; height:84%; background:rgba(12,18,31,.98); border-top:1px solid var(--accent); border-radius:18px 18px 0 0; transform:translateY(106%); transition:transform calc(.46s*var(--dur)) var(--ease); z-index:21; display:flex; flex-direction:column; box-shadow:0 -12px 40px rgba(0,0,0,.6); }
    #sheet.open { transform:none; }
    .sheet-head { padding:6px 12px 4px; display:flex; flex-direction:column; gap:5px; touch-action:none; }
    .sheet-grab { width:42px; height:4px; border-radius:4px; background:var(--border); align-self:center; }
    .sheet-title-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    #sheet-title { font-weight:700; font-size:13px; word-break:break-all; }
    #sheet-meta { display:flex; flex-wrap:wrap; gap:5px; padding:0 12px; }
    #sheet-actions { display:flex; flex-wrap:wrap; gap:5px; padding:6px 12px; }
    #sheet-tabs { display:none; gap:5px; padding:0 12px 6px; }
    #sheet-body { flex:1; overflow:auto; padding:6px 12px 16px; user-select:text; -webkit-user-select:text; }
    .kv { display:grid; grid-template-columns:minmax(76px,30%) 1fr; gap:4px 8px; font-size:11px; }
    .kv .k { color:var(--muted); word-break:break-all; } .kv .v { font-family:monospace; word-break:break-all; user-select:text; }
    .sec-title { color:var(--accent); font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.5px; }

    /* Efek */
    #hl { position:fixed; display:none; border:2px dashed var(--accent); background:rgba(56,189,248,.08); pointer-events:none; z-index:10000; border-radius:3px; transition:all .12s ease; }
    #fps { position:fixed; top:8px; left:8px; display:none; background:rgba(5,8,15,.85); color:var(--green); border:1px solid var(--border); border-radius:8px; padding:3px 8px; font:700 11px monospace; pointer-events:none; z-index:10001; }
    .ripple { position:fixed; width:46px; height:46px; margin:-23px 0 0 -23px; border-radius:50%; border:2px solid var(--accent); background:var(--accent-soft); pointer-events:none; animation:rip .6s ease-out forwards; z-index:10001; }
    @keyframes rip { from { transform:scale(.3); opacity:1; } to { transform:scale(1.5); opacity:0; } }
    #toast { position:fixed; bottom:14px; left:50%; transform:translateX(-50%) translateY(20px); background:#0f172a; color:#fff; border:1px solid var(--accent); padding:5px 14px; border-radius:99px; font-weight:600; opacity:0; pointer-events:none; transition:all .25s var(--ease); z-index:10002; max-width:88vw; text-align:center; }
    #toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
  `;
  shadow.appendChild(style);

  // --- 4. MARKUP ---
  const ico = (inner) => `<svg viewBox="0 0 24 24">${inner}</svg>`;
  const TABS = [
    ['console', 'Console', '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>'],
    ['dom', 'DOM', '<circle cx="12" cy="12" r="3"/><path d="M3 12h3m12 0h3M12 3v3m0 12v3"/>'],
    ['network', 'Net', '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'],
    ['media', 'Media', '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'],
    ['src', 'Src', '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'],
    ['vars', 'Vars', '<path d="M4 7h6M7 7l-3 10m3-10l3 10M14 10h6M14 14h6"/>'],
    ['files', 'Import', '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>'],
    ['req', 'Req', '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'],
    ['storage', 'Storage', '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>'],
    ['tools', 'Tools', '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'],
    ['settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>']
  ];
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="edge-handle" role="button" aria-label="Open DevTools"><div class="grip-bar"></div></div>
    <div id="hl"></div><div id="fps">FPS</div>

    <div id="overlay" class="portrait" data-anim="slide">
      <div class="main-area">
        <div class="topbar">
          <div class="title-wrap">
            <span class="dot"></span>
            <span>EDGE <span style="color:var(--accent)">DEVTOOLS</span></span>
            <span class="mode-pill" id="orient-badge">AUTO</span>
          </div>
          <div class="row"><button class="btn small" id="btn-peek" title="Tahan untuk intip HTML">👁️ Peek</button></div>
        </div>

        <div class="views">
          <!-- CONSOLE -->
          <div class="view active split-view" id="view-console">
            <div class="split-col">
              <textarea id="js-input" rows="4" placeholder="// Tulis / paste JavaScript di sini (await didukung)..."></textarea>
              <div class="row">
                <button class="btn btn-accent" id="btn-run-js" style="flex:1">▶ Run JS</button>
                <button class="btn" id="btn-hist-prev" title="Riwayat sebelumnya">↑</button>
                <button class="btn" id="btn-hist-next" title="Riwayat berikutnya">↓</button>
                <button class="btn" id="btn-clear-js">Clear</button>
              </div>
              <div class="row" style="overflow-x:auto;">
                <button class="btn small" data-snip="document.title">Title</button>
                <button class="btn small" data-snip="document.cookie">Cookies</button>
                <button class="btn small" data-snip="Object.keys(window).filter(k => !k.startsWith('webkit')).slice(0,30)">Globals</button>
                <button class="btn small" data-snip="document.querySelectorAll('*').length + ' nodes'">DOM Count</button>
                <button class="btn small" data-snip="location.href">URL</button>
              </div>
            </div>
            <div class="split-col grow">
              <div class="row">
                <div class="chips" id="log-chips" style="flex:1">
                  <button class="chip on" data-v="all">All</button><button class="chip" data-v="log">Log</button>
                  <button class="chip" data-v="info">Info</button><button class="chip" data-v="warn">Warn</button><button class="chip" data-v="error">Error</button>
                </div>
                <button class="btn small" id="btn-copy-log">📋</button>
                <button class="btn small" id="btn-clear-log">🗑️</button>
              </div>
              <div class="terminal" id="log-list" data-f="all"></div>
            </div>
          </div>

          <!-- DOM -->
          <div class="view split-view" id="view-dom">
            <div class="split-col">
              <div class="row">
                <button class="btn btn-accent" id="btn-pick" style="flex:1">🎯 Select</button>
                <button class="btn" id="btn-parent" title="Parent">⬆</button>
                <button class="btn" id="btn-child" title="Child pertama">⬇</button>
                <button class="btn" id="btn-prev-sib" title="Sebelumnya">◀</button>
                <button class="btn" id="btn-next-sib" title="Berikutnya">▶</button>
                <button class="btn btn-red" id="btn-del-el" title="Hapus">🗑️</button>
              </div>
              <div id="el-info" class="card mono" style="color:var(--accent);">No element selected</div>
              <div class="muted" id="el-box"></div>
              <div class="row">
                <button class="btn small" id="btn-copy-sel" style="flex:1">📋 Selector</button>
                <button class="btn small" id="btn-copy-html" style="flex:1">📋 outerHTML</button>
              </div>
              <div class="card">
                <span class="muted">Edit InnerText</span>
                <div class="row"><input id="el-text-edit" placeholder="Teks elemen..."><button class="btn btn-green" id="btn-save-text">Save</button></div>
                <span class="muted">Edit inline style</span>
                <div class="row"><input id="el-style-edit" placeholder="color:red; padding:8px"><button class="btn btn-green" id="btn-save-style">Apply</button></div>
              </div>
            </div>
            <div class="split-col grow">
              <div class="attr-row">
                <input id="new-attr-k" placeholder="attribute"><input id="new-attr-v" placeholder="value">
                <button class="btn btn-green" id="btn-add-attr" style="grid-column:span 2">+</button>
              </div>
              <div id="attr-list" style="display:flex;flex-direction:column;gap:4px;overflow-y:auto;flex:1;"></div>
            </div>
          </div>

          <!-- NETWORK -->
          <div class="view" id="view-network">
            <div class="row">
              <input id="nt-search" placeholder="Filter URL / method / status...">
              <button class="btn small" id="nt-rec" title="Rekam on/off">⏺ ON</button>
              <button class="btn small" id="nt-clear">🗑️</button>
              <button class="btn small" id="nt-export">⬇ JSON</button>
            </div>
            <div class="chips" id="nt-chips">
              <button class="chip on" data-v="all">All</button><button class="chip" data-v="api">Fetch/XHR</button><button class="chip" data-v="ws">WS</button>
              <button class="chip" data-v="media">Media</button><button class="chip" data-v="code">JS/CSS/HTML</button><button class="chip" data-v="err">Error</button><button class="chip" data-v="other">Lainnya</button>
            </div>
            <div class="muted" id="nt-count"></div>
            <div class="list" id="nt-list"></div>
          </div>

          <!-- MEDIA -->
          <div class="view" id="view-media">
            <div class="row">
              <input id="md-search" placeholder="Filter URL...">
              <button class="btn btn-accent" id="md-scan">🔄 Scan</button>
            </div>
            <div class="chips" id="md-chips">
              <button class="chip on" data-v="all">All</button><button class="chip" data-v="image">Image</button><button class="chip" data-v="video">Video</button><button class="chip" data-v="audio">Audio</button>
            </div>
            <div class="muted" id="md-count"></div>
            <div class="list media-grid" id="md-list"></div>
          </div>

          <!-- SRC -->
          <div class="view" id="view-src">
            <div class="row">
              <input id="sc-search" placeholder="Filter src / href / nama...">
              <button class="btn btn-accent" id="sc-scan">🔄 Scan</button>
            </div>
            <div class="chips" id="sc-chips">
              <button class="chip on" data-v="all">All</button><button class="chip" data-v="script">JS</button><button class="chip" data-v="style">CSS</button>
              <button class="chip" data-v="image">Image</button><button class="chip" data-v="media">Media</button><button class="chip" data-v="frame">Frame</button>
              <button class="chip" data-v="link">Link</button><button class="chip" data-v="font">Font</button><button class="chip" data-v="inline">Inline</button><button class="chip" data-v="other">Lainnya</button>
            </div>
            <div class="muted" id="sc-count"></div>
            <div class="list" id="sc-list"></div>
          </div>

          <!-- VARS -->
          <div class="view" id="view-vars">
            <div class="row"><input id="var-search" placeholder="Filter variable name or value..."><button class="btn btn-accent" id="btn-scan-vars">🔍 Rescan</button></div>
            <div class="row" style="justify-content:space-between;">
              <span id="var-count" class="muted">0 variables found</span>
              <div class="row">
                <button class="btn small var-filter btn-accent" data-kind="ALL">All</button><button class="btn small var-filter" data-kind="const">const</button>
                <button class="btn small var-filter" data-kind="let">let</button><button class="btn small var-filter" data-kind="var">var</button>
              </div>
            </div>
            <div class="list" id="var-list" style="display:block"></div>
          </div>

          <!-- IMPORT -->
          <div class="view split-view" id="view-files">
            <div class="split-col">
              <label class="dropzone" id="drop-zone">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <div style="font-weight:700;">Tap or Drop Scripts Here</div>
                <div class="muted">Multi-select atau ZIP</div>
                <div class="pill-row"><span class="pill">.JS</span><span class="pill">.ZIP</span></div>
                <input type="file" id="file-loader" multiple accept=".js,.zip,application/zip,text/javascript" style="display:none;">
              </label>
            </div>
            <div class="split-col grow"><div class="terminal" id="file-log"><div class="muted">Waiting for files...</div></div></div>
          </div>

          <!-- REQ -->
          <div class="view split-view" id="view-req">
            <div class="split-col">
              <div class="row">
                <select id="net-method" style="width:82px;"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select>
                <input id="net-url" placeholder="https://api.example.com/data">
                <button class="btn btn-accent" id="btn-fetch">Send</button>
              </div>
              <textarea id="net-headers" rows="2" placeholder='Headers JSON (opsional): {"Authorization":"Bearer ..."}'></textarea>
              <textarea id="net-body" rows="3" placeholder='JSON Body: {"key":"value"}'></textarea>
              <div class="chips" id="req-hist"></div>
              <div class="row" style="justify-content:space-between;">
                <span id="net-status" class="muted">Idle</span>
                <div class="row">
                  <button class="btn small" id="btn-res-headers">Headers</button>
                  <button class="btn small" id="btn-copy-res">📋 Copy</button>
                  <button class="btn small btn-green" id="btn-dl-res">💾</button>
                </div>
              </div>
            </div>
            <div class="split-col grow"><div class="terminal" id="net-res"></div></div>
          </div>

          <!-- STORAGE -->
          <div class="view" id="view-storage">
            <div class="row">
              <select id="st-type" style="width:128px;"><option value="local">localStorage</option><option value="session">sessionStorage</option><option value="cookie">Cookies</option></select>
              <input id="st-search" placeholder="Search keys..."><button class="btn" id="st-refresh">↻</button>
            </div>
            <div class="row">
              <input id="st-k" placeholder="Key" style="flex:1;"><input id="st-v" placeholder='Value or {"json":true}' style="flex:1.5;">
              <button class="btn btn-green" id="st-add">+ Save</button>
            </div>
            <div class="list" id="st-list" style="display:block"></div>
          </div>

          <!-- TOOLS -->
          <div class="view" id="view-tools">
            <div class="grid-2">
              <button class="btn" id="t-html">📄 Page HTML (lihat/copy/DL)</button>
              <button class="btn" id="t-info">📱 Device & Viewport</button>
              <button class="btn" id="t-perf">⏱️ Performance</button>
              <button class="btn" id="t-forms">🧾 Forms & Inputs</button>
              <button class="btn" id="t-edit">✏️ Edit Page Text: OFF</button>
              <button class="btn" id="t-outline">📐 Layout Outlines: OFF</button>
              <button class="btn" id="t-unlock">🔓 Unlock Right-Click & Copy</button>
              <button class="btn" id="t-pass">👁️ Reveal Passwords: OFF</button>
              <button class="btn" id="t-fps">📈 FPS Meter: OFF</button>
              <button class="btn" id="t-taps">👆 Show Taps: OFF</button>
              <button class="btn" id="t-dark">🌙 Force Dark: OFF</button>
              <button class="btn" id="t-freeze">🧊 Freeze Animasi: OFF</button>
              <button class="btn" id="t-img">🖼️ List Page Images</button>
              <button class="btn" id="t-links">🔗 List Page Links</button>
              <button class="btn" id="t-text">📋 Copy Page Text</button>
              <button class="btn" id="t-reload">🔄 Reload Page</button>
              <button class="btn" id="t-top">⏫ Scroll Top</button>
              <button class="btn" id="t-bot">⏬ Scroll Bottom</button>
              <button class="btn btn-red" id="t-clear" style="grid-column:span 2">🧹 Clear Site Data (storage, cookies, cache)</button>
            </div>
            <div class="terminal" id="tool-out"><div class="muted">Tool output appears here...</div></div>
          </div>

          <!-- SETTINGS -->
          <div class="view" id="view-settings">
            <div class="card">
              <div style="font-weight:700;">Animasi Pindah Halaman</div>
              <select id="anim-style">
                <option value="slide">Slide + blur (default)</option><option value="zoom">Zoom</option>
                <option value="flip">Flip 3D</option><option value="fade">Fade</option><option value="none">Tanpa animasi</option>
              </select>
              <div class="row" style="justify-content:space-between;"><span class="muted">Kecepatan</span><span id="speed-val" class="mono">1.0x</span></div>
              <input type="range" id="anim-speed" min="50" max="250" value="100">
            </div>
            <div class="card">
              <div style="font-weight:700;">Screen Orientation Layout</div>
              <div class="muted">Portrait satu kolom, Landscape split-screen:</div>
              <div class="grid-3">
                <button class="btn orient-opt" data-orient="portrait">📱 Portrait</button>
                <button class="btn orient-opt" data-orient="landscape">🖥️ Landscape</button>
                <button class="btn btn-accent orient-opt" data-orient="auto">🔄 Auto</button>
              </div>
            </div>
            <div class="card">
              <div class="row" style="justify-content:space-between;"><span style="font-weight:700;">Background Opacity</span><span id="alpha-val" class="mono">80%</span></div>
              <input type="range" id="bg-alpha" min="25" max="98" value="80">
            </div>
            <div class="card">
              <div style="font-weight:700;">Accent Color</div>
              <div class="row">
                <button class="btn theme-btn" data-c="#38bdf8" style="flex:1;border-color:#38bdf8;color:#38bdf8;">Cyan</button>
                <button class="btn theme-btn" data-c="#ff2a5f" style="flex:1;border-color:#ff2a5f;color:#ff2a5f;">Crimson</button>
                <button class="btn theme-btn" data-c="#10b981" style="flex:1;border-color:#10b981;color:#10b981;">Emerald</button>
                <button class="btn theme-btn" data-c="#a855f7" style="flex:1;border-color:#a855f7;color:#a855f7;">Purple</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Sheet detail (muncul dari bawah) -->
        <div id="sheet-back"></div>
        <div id="sheet">
          <div class="sheet-head" id="sheet-head">
            <div class="sheet-grab"></div>
            <div class="sheet-title-row"><div id="sheet-title"></div><button class="btn small" id="sheet-x">✕</button></div>
          </div>
          <div id="sheet-meta"></div>
          <div id="sheet-actions"></div>
          <div id="sheet-tabs"></div>
          <div id="sheet-body"></div>
        </div>
      </div>

      <div class="right-rail" id="rail">
        <div class="rail-ind" id="rail-ind"></div>
        ${TABS.map(([v, l, p], i) => `<button class="tab-btn${i === 0 ? ' active' : ''}" data-view="${v}">${ico(p)}<span>${l}</span><i class="badge" id="bd-${v}"></i></button>`).join('')}
        <button class="close-rail-btn" id="btn-close" title="Dock to Edge">✕</button>
      </div>
    </div>
    <div id="toast"></div>
  `;
  shadow.appendChild(wrap);

  const $ = (s) => shadow.querySelector(s);
  const $$ = (s) => Array.from(shadow.querySelectorAll(s));
  const edgeHandle = $('#edge-handle');
  const overlay = $('#overlay');
  const toastEl = $('#toast');
  const rail = $('#rail');
  const railInd = $('#rail-ind');
  const tabBtns = $$('.tab-btn');
  const views = $$('.view');
  let toastTimer = null;
  let curView = 'console';
  let durMult = 1;

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }
  const btn = (label, fn, cls) => h('button', { class: 'btn small ' + (cls || ''), text: label, onclick: fn });
  const chipGroup = (el, cb) => {
    el.addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c || !el.contains(c)) return;
      el.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
      cb(c.dataset.v);
    });
  };
  const listFresh = (list) => {
    list.classList.add('fresh');
    [...list.children].slice(0, 14).forEach((c, i) => c.style.setProperty('--d', i * 35 + 'ms'));
    clearTimeout(list._ft);
    list._ft = setTimeout(() => list.classList.remove('fresh'), 900 * durMult);
  };

  // --- 5. CLIPBOARD / DOWNLOAD / OPEN ---
  async function copyText(text, limit) {
    let out = String(text);
    let cut = false;
    const MAX = limit || 1048576;
    if (new Blob([out]).size > MAX) {
      out = out.slice(0, MAX);
      while (new Blob([out]).size > MAX) out = out.slice(0, -100);
      cut = true;
    }
    try { await navigator.clipboard.writeText(out); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = out;
      shadow.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e2) {}
      ta.remove();
    }
    showToast(cut ? `Tersalin (terpotong ${fmtBytes(MAX)})` : 'Tersalin ke clipboard');
  }
  function triggerDownload(href, name, newTab) {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    if (newTab) { a.target = '_blank'; a.rel = 'noopener'; }
    shadow.appendChild(a);
    a.click();
    a.remove();
  }
  function downloadText(text, name, mime) {
    const u = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    triggerDownload(u, name);
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    showToast('Download: ' + name);
  }
  async function downloadUrl(url, name) {
    const fn = name || fileNameFrom(url);
    try {
      if (/^(data|blob):/.test(url)) { triggerDownload(url, fn); showToast('Download: ' + fn); return; }
      const res = await origFetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      triggerDownload(u, name || fileNameFrom(url, blob.type));
      setTimeout(() => URL.revokeObjectURL(u), 5000);
      showToast('Download: ' + fn);
    } catch (err) {
      triggerDownload(url, fn, true);
      showToast('Fetch diblokir (CORS) — coba via link langsung');
    }
  }
  async function openUrl(url) {
    try {
      if (url.startsWith('data:')) {
        const b = await (await origFetch(url)).blob();
        const u = mkBlobUrl(b);
        window.open(u, '_blank');
      } else window.open(url, '_blank', 'noopener');
    } catch (e) { showToast('Tidak bisa membuka URL'); }
  }
  function flashEl(el) {
    if (!el || !el.isConnected) { showToast('Elemen sudah tidak ada'); return; }
    setOverlayOpen(false);
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    const col = getComputedStyle(host).getPropertyValue('--accent').trim() || '#38bdf8';
    try {
      el.animate([
        { outline: `3px solid ${col}`, outlineOffset: '2px' },
        { outline: '3px solid transparent', outlineOffset: '12px' }
      ], { duration: 900, iterations: 3 });
    } catch (e) {}
  }

  // --- 6. NETWORK CORE (hook fetch / XHR / WS / beacon + resource timing) ---
  const origFetchRaw = window.fetch;
  const origFetch = origFetchRaw ? origFetchRaw.bind(window) : () => Promise.reject(new Error('fetch tidak tersedia'));
  const injectPerf = performance.now();
  const netLog = [];
  let netSeq = 0, netRec = true, netTimer = null;
  const NET_MAX = 500, BODY_MAX = 1024 * 1024;

  function netAdd(e) {
    if (!netRec) return e;
    e.id = ++netSeq;
    e.ts = e.ts || Date.now();
    netLog.push(e);
    if (netLog.length > NET_MAX) netLog.shift();
    netChanged();
    return e;
  }
  function netChanged() {
    if (netTimer) return;
    netTimer = setTimeout(() => {
      netTimer = null;
      updateNetBadge();
      if (overlay.classList.contains('open') && curView === 'network') renderNet();
    }, 180);
  }
  function updateNetBadge() {
    const b = $('#bd-network');
    const errs = netLog.filter((e) => netIsErr(e)).length;
    b.textContent = netLog.length > 99 ? '99+' : netLog.length;
    b.classList.toggle('on', netLog.length > 0);
    b.classList.toggle('err', errs > 0);
  }
  const netIsErr = (e) => !!e.error || (e.kind !== 'res' && !e.pending && e.kind !== 'beacon' && e.kind !== 'ws' && !e.status) || e.status >= 400;

  if (origFetchRaw) {
    window.fetch = function (input, init) {
      const t0 = performance.now();
      let e = {};
      try {
        const isReq = typeof Request !== 'undefined' && input instanceof Request;
        e = netAdd({
          kind: 'fetch', pending: true,
          method: String((init && init.method) || (isReq && input.method) || 'GET').toUpperCase(),
          url: abs(isReq ? input.url : String(input)),
          reqHeaders: headersToObj((init && init.headers) || (isReq ? input.headers : null)),
          reqBody: describeBody(init && init.body)
        });
      } catch (err) {}
      return origFetchRaw.apply(this, arguments).then((res) => {
        try {
          e.pending = false; e.status = res.status; e.statusText = res.statusText; e.dur = performance.now() - t0;
          e.finalUrl = res.url; e.redirected = res.redirected;
          e.resHeaders = headersToObj(res.headers);
          e.ctype = res.headers.get('content-type') || '';
          const cl = res.headers.get('content-length');
          if (cl) e.size = +cl;
          const ty = guessType(e.url, e.ctype);
          if (!['image', 'video', 'audio', 'font'].includes(ty) && (isTextCt(e.ctype) || (!e.ctype && !(e.size > BODY_MAX * 4)))) {
            res.clone().text().then((t) => {
              if (e.size == null) e.size = byteLen(t);
              if (t.length > BODY_MAX) { e.resBody = t.slice(0, BODY_MAX); e.truncated = true; } else e.resBody = t;
              netChanged();
            }).catch(() => {});
          }
          netChanged();
        } catch (err) {}
        return res;
      }, (err) => {
        e.pending = false; e.error = String((err && err.message) || err); e.dur = performance.now() - t0; netChanged();
        throw err;
      });
    };
    onCleanup(() => { window.fetch = origFetchRaw; });
  }

  (() => {
    const xp = XMLHttpRequest.prototype;
    const oOpen = xp.open, oSend = xp.send, oSet = xp.setRequestHeader;
    xp.open = function (method, url) {
      try { this.__edge = { method: String(method).toUpperCase(), url: abs(String(url)), reqHeaders: {} }; } catch (e) {}
      return oOpen.apply(this, arguments);
    };
    xp.setRequestHeader = function (k, v) {
      try { if (this.__edge) this.__edge.reqHeaders[k] = v; } catch (e) {}
      return oSet.apply(this, arguments);
    };
    xp.send = function (body) {
      const m = this.__edge;
      if (m) {
        const t0 = performance.now();
        const e = netAdd({ kind: 'xhr', method: m.method, url: m.url, reqHeaders: m.reqHeaders, reqBody: describeBody(body), pending: true });
        const xhr = this;
        xhr.addEventListener('loadend', () => {
          try {
            e.pending = false; e.status = xhr.status; e.statusText = xhr.statusText; e.dur = performance.now() - t0;
            if (xhr.responseURL) e.finalUrl = xhr.responseURL;
            const rh = {};
            (xhr.getAllResponseHeaders() || '').trim().split(/\r?\n/).forEach((l) => { const i = l.indexOf(':'); if (i > 0) rh[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); });
            e.resHeaders = rh; e.ctype = rh['content-type'] || '';
            let txt = null;
            if (xhr.responseType === '' || xhr.responseType === 'text') txt = xhr.responseText;
            else if (xhr.responseType === 'json') txt = JSON.stringify(xhr.response, null, 2);
            if (txt != null) { e.size = byteLen(txt); e.resBody = txt.length > BODY_MAX ? txt.slice(0, BODY_MAX) : txt; e.truncated = txt.length > BODY_MAX; }
            else if (rh['content-length']) e.size = +rh['content-length'];
            if (!xhr.status) e.error = 'Gagal / diblokir / dibatalkan';
          } catch (err) {}
          netChanged();
        });
      }
      return oSend.apply(this, arguments);
    };
    onCleanup(() => { xp.open = oOpen; xp.send = oSend; xp.setRequestHeader = oSet; });
  })();

  if (navigator.sendBeacon) {
    const oBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function (url, data) {
      const e = netAdd({ kind: 'beacon', method: 'POST', url: abs(String(url)), reqBody: describeBody(data), pending: false, note: 'sendBeacon' });
      const r = oBeacon.apply(navigator, arguments);
      e.status = r ? 202 : 0;
      netChanged();
      return r;
    };
    onCleanup(() => { try { delete navigator.sendBeacon; } catch (e) {} });
  }

  if (window.WebSocket) {
    const OrigWS = window.WebSocket;
    const wsPush = (e, dir, data) => {
      (e.msgs = e.msgs || []).push({ dir, t: Date.now(), data: typeof data === 'string' ? data : data instanceof Blob ? `[Blob ${fmtBytes(data.size)}]` : `[binary ${fmtBytes(data && data.byteLength)}]` });
      if (e.msgs.length > 300) e.msgs.shift();
      netChanged();
    };
    const WS = function (url, protocols) {
      const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
      const t0 = performance.now();
      const e = netAdd({ kind: 'ws', method: 'WS', url: abs(String(url)), pending: true, msgs: [] });
      ws.addEventListener('open', () => { e.pending = false; e.status = 101; e.statusText = 'Open'; e.dur = performance.now() - t0; netChanged(); });
      ws.addEventListener('message', (ev) => wsPush(e, '←', ev.data));
      ws.addEventListener('error', () => { e.error = 'WebSocket error'; e.pending = false; netChanged(); });
      ws.addEventListener('close', (ev) => { e.pending = false; e.closed = true; e.statusText = 'Closed ' + ev.code; netChanged(); });
      const os = ws.send.bind(ws);
      ws.send = function (d) { wsPush(e, '→', d); return os(d); };
      return ws;
    };
    WS.prototype = OrigWS.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k) => (WS[k] = OrigWS[k]));
    window.WebSocket = WS;
    onCleanup(() => { window.WebSocket = OrigWS; });
  }

  const ingestPerf = (en) => {
    if (en.entryType !== 'resource') return;
    if (['fetch', 'xmlhttprequest', 'beacon'].includes(en.initiatorType) && en.startTime >= injectPerf - 5) return;
    netAdd({
      kind: 'res', method: 'GET', url: en.name, initiator: en.initiatorType, pending: false,
      status: en.responseStatus || 0, dur: en.duration, size: en.transferSize || en.encodedBodySize || null,
      ts: Math.round(performance.timeOrigin + en.startTime)
    });
  };
  try {
    performance.setResourceTimingBufferSize && performance.setResourceTimingBufferSize(1000);
    performance.getEntriesByType('resource').forEach(ingestPerf);
    const po = new PerformanceObserver((l) => l.getEntries().forEach(ingestPerf));
    po.observe({ type: 'resource' });
    onCleanup(() => po.disconnect());
  } catch (e) {}

  // Registrasi media dinamis (new Audio(), video.play(), dll)
  const mediaKeep = new Map();
  const oPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    try {
      const u = this.currentSrc || this.src;
      if (u) {
        const k = /^(data|blob):/.test(u) ? u : abs(u);
        mediaKeep.set(k, { url: k, type: this.tagName === 'VIDEO' ? 'video' : 'audio', via: 'play()' });
      }
    } catch (e) {}
    return oPlay.apply(this, arguments);
  };
  onCleanup(() => { HTMLMediaElement.prototype.play = oPlay; });

  // --- 7. SHEET (detail panel dari bawah) ---
  const sheet = $('#sheet'), sheetBack = $('#sheet-back'), sheetBody = $('#sheet-body');
  let sheetO = null;

  function releaseMedia(root) {
    root.querySelectorAll('video,audio').forEach((m) => {
      try { m.pause(); m.removeAttribute('src'); m.querySelectorAll('source').forEach((s) => s.remove()); m.load(); } catch (e) {}
    });
    root.querySelectorAll('img').forEach((i) => i.removeAttribute('src'));
  }
  function showSection(i) {
    releaseMedia(sheetBody);
    sheetBody.replaceChildren();
    const c = h('div', { class: 'sec' });
    sheetBody.append(c);
    sheetBody.scrollTop = 0;
    try { sheetO.sections[i].build(c); } catch (err) { c.append(h('div', { class: 'empty', text: 'Error: ' + err.message })); }
  }
  function openSheet(o) {
    sheetO = o;
    $('#sheet-title').textContent = o.title || '';
    $('#sheet-meta').replaceChildren(...(o.meta || []));
    $('#sheet-actions').replaceChildren(...(o.actions || []).map((a) => btn(a.label, () => a.fn(), a.cls)));
    const tabs = $('#sheet-tabs');
    tabs.replaceChildren();
    const secs = o.sections || [];
    if (secs.length > 1) {
      secs.forEach((s, i) => tabs.append(h('button', {
        class: 'chip' + (i === 0 ? ' on' : ''), text: s.name,
        onclick: (ev) => { [...tabs.children].forEach((c) => c.classList.remove('on')); ev.currentTarget.classList.add('on'); showSection(i); }
      })));
    }
    tabs.style.display = secs.length > 1 ? 'flex' : 'none';
    showSection(0);
    sheet.classList.add('open');
    sheetBack.classList.add('open');
  }
  function closeSheet() {
    sheet.classList.remove('open');
    sheetBack.classList.remove('open');
    sheetO = null;
    clearTimeout(closeSheet._t);
    closeSheet._t = setTimeout(() => { if (!sheet.classList.contains('open')) { releaseMedia(sheetBody); sheetBody.replaceChildren(); } }, 500);
  }
  sheetBack.onclick = closeSheet;
  $('#sheet-x').onclick = closeSheet;
  (() => {
    const head = $('#sheet-head');
    let sy = 0, dy = 0, drag = false;
    head.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; dy = 0; drag = true; sheet.style.transition = 'none'; }, { passive: true });
    head.addEventListener('touchmove', (e) => { if (!drag) return; dy = Math.max(0, e.touches[0].clientY - sy); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
    head.addEventListener('touchend', () => { drag = false; sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 90) closeSheet(); });
  })();

  const kvTable = (pairs) => {
    const g = h('div', { class: 'kv' });
    pairs.forEach(([k, v]) => { if (v == null || v === '') return; g.append(h('div', { class: 'k', text: k }), h('div', { class: 'v', text: String(v) })); });
    return g;
  };
  const DISP_MAX = 200000;
  const codeBlock = (text, hint) => {
    let t = prettify(text, hint);
    let note = null;
    if (t.length > DISP_MAX) { t = t.slice(0, DISP_MAX); note = h('div', { class: 'muted', text: `Tampilan dipotong ${DISP_MAX.toLocaleString()} karakter — Copy/Download memberi isi penuh.` }); }
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, h('pre', { class: 'st-pre big', text: t || '(kosong)' }), note);
  };
  const objTable = (o) => (Object.keys(o || {}).length ? kvTable(Object.entries(o)) : h('div', { class: 'muted', text: '(tidak ada)' }));

  // --- 8. NAVIGASI TAB + ANIMASI ---
  function moveIndicator() {
    const b = tabBtns.find((x) => x.classList.contains('active'));
    if (!b) return;
    railInd.style.height = b.offsetHeight + 'px';
    railInd.style.transform = `translateY(${b.offsetTop}px)`;
    try { rail.scrollTo({ top: b.offsetTop - rail.clientHeight / 2 + b.offsetHeight / 2, behavior: 'smooth' }); } catch (e) {}
  }
  const animOn = () => overlay.dataset.anim !== 'none';

  function stagger(view) {
    const t = [...view.querySelectorAll(':scope > :not(.split-col), :scope > .split-col > *')].slice(0, 12);
    t.forEach((el, i) => { el.style.setProperty('--d', 60 + i * 45 + 'ms'); el.classList.add('stg'); });
    clearTimeout(view._ts);
    view._ts = setTimeout(() => t.forEach((el) => el.classList.remove('stg')), 1100 * durMult);
  }

  function switchView(name, instant) {
    const next = $('#view-' + name);
    if (!next) return;
    const prevName = curView;
    const prev = $('#view-' + prevName);
    const ni = tabBtns.findIndex((b) => b.dataset.view === name);
    const pi = tabBtns.findIndex((b) => b.dataset.view === prevName);
    const dir = ni >= pi ? 1 : -1;
    tabBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    moveIndicator();
    if (prevName !== name) { closeSheet(); onLeaveView(prevName); }
    views.forEach((v) => { if (v !== next && v !== prev) { v.classList.remove('active', 'leaving', 'in', 'out'); } });
    if (prev && prev !== next) {
      prev.classList.remove('active', 'in');
      clearTimeout(prev._t);
      if (!instant && animOn()) {
        prev.style.setProperty('--dir', dir);
        prev.classList.add('leaving', 'out');
        prev._t = setTimeout(() => prev.classList.remove('leaving', 'out'), 340 * durMult);
      } else prev.classList.remove('leaving', 'out');
    }
    clearTimeout(next._t);
    next.classList.remove('leaving', 'out');
    next.classList.add('active');
    if (!instant && animOn() && prev !== next) {
      next.style.setProperty('--dir', dir);
      next.classList.remove('in');
      void next.offsetWidth;
      next.classList.add('in');
      stagger(next);
      clearTimeout(next._ti);
      next._ti = setTimeout(() => next.classList.remove('in'), 700 * durMult);
    }
    curView = name;
    onEnterView(name);
    updateHl();
  }
  tabBtns.forEach((b) => (b.onclick = () => switchView(b.dataset.view)));

  let mediaDirty = true;
  function onLeaveView(name) {
    if (name === 'media') $('#md-list').querySelectorAll('video,audio').forEach((m) => m.pause());
  }
  function onEnterView(name) {
    if (name === 'vars') runVariableScan();
    else if (name === 'storage') renderStorage();
    else if (name === 'network') { renderNet(); listFresh($('#nt-list')); }
    else if (name === 'media') { if (mediaDirty) scanMedia(); }
    else if (name === 'src') scanSources();
    else if (name === 'console') logList.scrollTop = logList.scrollHeight;
  }

  function setOverlayOpen(open) {
    overlay.classList.toggle('open', open);
    edgeHandle.classList.toggle('hidden', open);
    if (open) { mediaDirty = true; moveIndicator(); onEnterView(curView); }
    else { closeSheet(); clearMediaPreviews(); }
    updateHl();
  }

  // Handle drag + tap
  (() => {
    let startY = 0, origTop = 0, isDown = false, moved = false;
    const onDown = (e) => {
      isDown = true; moved = false;
      const pt = e.touches ? e.touches[0] : e;
      startY = pt.clientY;
      origTop = edgeHandle.getBoundingClientRect().top;
    };
    const onMove = (e) => {
      if (!isDown) return;
      const pt = e.touches ? e.touches[0] : e;
      const dy = pt.clientY - startY;
      if (!moved && Math.abs(dy) > 12) moved = true;
      if (!moved) return;
      if (e.cancelable) e.preventDefault();
      const maxTop = window.innerHeight - edgeHandle.offsetHeight;
      edgeHandle.style.top = Math.max(10, Math.min(maxTop - 10, origTop + dy)) + 'px';
      edgeHandle.style.transform = 'none';
    };
    const onUp = (e) => {
      if (!isDown) return;
      isDown = false;
      if (!moved) { if (e.cancelable) e.preventDefault(); setOverlayOpen(true); }
    };
    edgeHandle.addEventListener('touchstart', onDown, { passive: true });
    listen(window, 'touchmove', onMove, { passive: false });
    listen(window, 'touchend', onUp);
    edgeHandle.addEventListener('mousedown', onDown);
    listen(window, 'mousemove', onMove);
    listen(window, 'mouseup', onUp);
  })();
  $('#btn-close').onclick = () => setOverlayOpen(false);

  const peekBtn = $('#btn-peek');
  const startPeek = () => { overlay.style.opacity = '0.08'; };
  const endPeek = () => { overlay.style.opacity = ''; };
  peekBtn.addEventListener('touchstart', startPeek, { passive: true });
  peekBtn.addEventListener('touchend', endPeek);
  peekBtn.addEventListener('mousedown', startPeek);
  peekBtn.addEventListener('mouseup', endPeek);
  peekBtn.addEventListener('mouseleave', endPeek);

  // --- 9. CONSOLE ---
  const logList = $('#log-list');
  const formatVal = (v) => {
    try {
      if (v instanceof Error) return v.stack || v.message;
      if (v === undefined) return 'undefined';
      if (typeof v === 'function') return String(v).slice(0, 300);
      if (typeof Node !== 'undefined' && v instanceof Node) return v.nodeType === 1 ? `<${v.tagName.toLowerCase()}${v.id ? '#' + v.id : ''}${typeof v.className === 'string' && v.className.trim() ? '.' + v.className.trim().split(/\s+/).join('.') : ''}>` : String(v.nodeName);
      if (v instanceof Map) return `Map(${v.size}) ` + JSON.stringify([...v]);
      if (v instanceof Set) return `Set(${v.size}) ` + JSON.stringify([...v]);
      if (typeof v === 'object' && v !== null) {
        const seen = new WeakSet();
        return JSON.stringify(v, (k, val) => {
          if (typeof val === 'bigint') return val + 'n';
          if (typeof val === 'object' && val !== null) { if (seen.has(val)) return '[Circular]'; seen.add(val); }
          return val;
        }, 2);
      }
    } catch (e) {}
    return String(v);
  };
  function addLog(type, args) {
    const div = document.createElement('div');
    div.className = `log-item log-${type === 'debug' ? 'log' : type}`;
    const t = new Date().toLocaleTimeString('en-US', { hour12: false });
    div.textContent = `[${t}] ` + Array.from(args).map(formatVal).join(' ');
    logList.appendChild(div);
    while (logList.children.length > 500) logList.firstChild.remove();
    logList.scrollTop = logList.scrollHeight;
  }
  ['log', 'warn', 'error', 'info', 'debug'].forEach((m) => {
    const orig = console[m];
    console[m] = function (...args) { orig.apply(console, args); try { addLog(m, args); } catch (e) {} };
    onCleanup(() => { console[m] = orig; });
  });
  listen(window, 'error', (e) => {
    const t = e.target;
    if (t && t !== window && (t.src || t.href)) addLog('error', [`Gagal memuat <${t.tagName.toLowerCase()}>:`, t.src || t.href]);
    else addLog('error', [e.message + (e.filename ? `  (${e.filename}:${e.lineno})` : '')]);
  }, true);
  listen(window, 'unhandledrejection', (e) => addLog('error', ['Promise:', e.reason]));

  chipGroup($('#log-chips'), (v) => (logList.dataset.f = v));
  $('#btn-clear-log').onclick = () => (logList.innerHTML = '');
  $('#btn-copy-log').onclick = () => copyText([...logList.children].map((c) => c.textContent).join('\n'));
  $('#btn-clear-js').onclick = () => ($('#js-input').value = '');

  const jsHist = [];
  let histIdx = 0;
  async function evalSmart(code) {
    try { return (0, eval)(code); }
    catch (err) {
      if (err instanceof SyntaxError && /await/.test(code)) {
        try { return await (0, eval)(`(async()=>(${code}\n))()`); }
        catch (e2) { if (e2 instanceof SyntaxError) return await (0, eval)(`(async()=>{${code}\n})()`); throw e2; }
      }
      throw err;
    }
  }
  $('#btn-run-js').onclick = async () => {
    const code = $('#js-input').value.trim();
    if (!code) return;
    if (jsHist[jsHist.length - 1] !== code) jsHist.push(code);
    histIdx = jsHist.length;
    addLog('info', ['> ' + code]);
    try {
      const res = await evalSmart(code);
      if (res !== undefined) console.log(res);
      showToast('Executed');
    } catch (err) { console.error(err); }
  };
  $('#btn-hist-prev').onclick = () => { if (!jsHist.length) return; histIdx = Math.max(0, histIdx - 1); $('#js-input').value = jsHist[histIdx]; };
  $('#btn-hist-next').onclick = () => { if (!jsHist.length) return; histIdx = Math.min(jsHist.length, histIdx + 1); $('#js-input').value = jsHist[histIdx] || ''; };
  $$('[data-snip]').forEach((b) => { b.onclick = () => { $('#js-input').value = b.dataset.snip; $('#btn-run-js').click(); }; });

  // --- 10. DOM PICKER ---
  let selectedEl = null;
  function updateHl() {
    const hl = $('#hl');
    const show = selectedEl && selectedEl.isConnected && (curView === 'dom' || !overlay.classList.contains('open'));
    if (!show) { hl.style.display = 'none'; return; }
    const r = selectedEl.getBoundingClientRect();
    Object.assign(hl.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    $('#el-box').textContent = `${Math.round(r.width)}×${Math.round(r.height)} @ ${Math.round(r.left)},${Math.round(r.top)}`;
  }
  listen(window, 'scroll', updateHl, true);
  listen(window, 'resize', updateHl);

  function selectElement(el) {
    if (!el || el === host || host.contains(el)) return;
    selectedEl = el;
    $('#el-text-edit').value = el.children.length === 0 ? el.textContent : '';
    $('#el-style-edit').value = el.getAttribute('style') || '';
    renderAttributes();
    updateHl();
  }
  function renderAttributes() {
    const info = $('#el-info');
    const list = $('#attr-list');
    list.replaceChildren();
    if (!selectedEl) { info.textContent = 'No element selected'; return; }
    const tag = selectedEl.tagName.toLowerCase();
    const id = selectedEl.id ? `#${selectedEl.id}` : '';
    const cls = typeof selectedEl.className === 'string' && selectedEl.className.trim() ? '.' + selectedEl.className.trim().split(/\s+/).join('.') : '';
    info.textContent = `<${tag}${id}${cls}>`;
    Array.from(selectedEl.attributes).forEach((attr) => {
      const valInput = h('input', { value: attr.value });
      valInput.value = attr.value;
      const nameInput = h('input', { readonly: true, style: { color: '#94a3b8' } });
      nameInput.value = attr.name;
      list.append(h('div', { class: 'attr-row' }, nameInput, valInput,
        h('button', { class: 'btn btn-green', style: { padding: '5px' }, text: '✓', onclick: () => { selectedEl.setAttribute(attr.name, valInput.value); renderAttributes(); showToast('Attribute updated'); } }),
        h('button', { class: 'btn btn-red', style: { padding: '5px' }, text: '✕', onclick: () => { selectedEl.removeAttribute(attr.name); renderAttributes(); showToast('Attribute deleted'); } })));
    });
  }
  const pickHandler = (e) => {
    if (e.target === host || host.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    document.removeEventListener('click', pickHandler, true);
    selectElement(e.target);
    switchView('dom', true);
    setOverlayOpen(true);
  };
  $('#btn-pick').onclick = () => {
    setOverlayOpen(false);
    showToast('Tap elemen HTML apa saja...');
    setTimeout(() => document.addEventListener('click', pickHandler, true), 60);
  };
  onCleanup(() => document.removeEventListener('click', pickHandler, true));
  $('#btn-parent').onclick = () => selectedEl && selectedEl.parentElement && selectElement(selectedEl.parentElement);
  $('#btn-child').onclick = () => selectedEl && selectedEl.firstElementChild && selectElement(selectedEl.firstElementChild);
  $('#btn-prev-sib').onclick = () => selectedEl && selectedEl.previousElementSibling && selectElement(selectedEl.previousElementSibling);
  $('#btn-next-sib').onclick = () => selectedEl && selectedEl.nextElementSibling && selectElement(selectedEl.nextElementSibling);
  $('#btn-del-el').onclick = () => { if (!selectedEl) return; selectedEl.remove(); selectedEl = null; renderAttributes(); updateHl(); showToast('Element removed'); };
  $('#btn-save-text').onclick = () => { if (!selectedEl) return; selectedEl.textContent = $('#el-text-edit').value; showToast('Teks diperbarui'); };
  $('#btn-save-style').onclick = () => { if (!selectedEl) return; selectedEl.setAttribute('style', $('#el-style-edit').value); renderAttributes(); updateHl(); showToast('Style diterapkan'); };
  $('#btn-copy-sel').onclick = () => selectedEl && copyText(cssPath(selectedEl));
  $('#btn-copy-html').onclick = () => selectedEl && copyText(selectedEl.outerHTML);
  $('#btn-add-attr').onclick = () => {
    if (!selectedEl) return;
    const k = $('#new-attr-k').value.trim();
    if (!k) return;
    try { selectedEl.setAttribute(k, $('#new-attr-v').value); } catch (e) { showToast('Nama attribute tidak valid'); return; }
    $('#new-attr-k').value = ''; $('#new-attr-v').value = '';
    renderAttributes();
    showToast('Attribute added');
  };

  // --- 11. VARIABLE SCANNER ---
  let scannedVars = [];
  let activeVarKind = 'ALL';
  function tokenizeJS(code) {
    const tokens = [];
    let i = 0;
    const len = code.length;
    const isIdStart = (c) => /[A-Za-z_$]/.test(c);
    const isIdPart = (c) => /[A-Za-z0-9_$]/.test(c);
    while (i < len) {
      const ch = code[i];
      const next = code[i + 1];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '/' && next === '/') { i += 2; while (i < len && code[i] !== '\n') i++; continue; }
      if (ch === '/' && next === '*') { i += 2; while (i < len && !(code[i] === '*' && code[i + 1] === '/')) i++; i += 2; continue; }
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        let start = i++;
        while (i < len) {
          if (code[i] === '\\') { i += 2; continue; }
          if (code[i] === quote) { i++; break; }
          i++;
        }
        tokens.push({ type: 'string', value: code.slice(start, i) });
        continue;
      }
      if (isIdStart(ch)) {
        let start = i++;
        while (i < len && isIdPart(code[i])) i++;
        const word = code.slice(start, i);
        tokens.push({ type: (word === 'const' || word === 'let' || word === 'var') ? 'decl' : 'id', value: word });
        continue;
      }
      if (/[0-9]/.test(ch)) {
        let start = i++;
        while (i < len && /[0-9a-fA-FxXoObBn._]/.test(code[i])) i++;
        tokens.push({ type: 'num', value: code.slice(start, i) });
        continue;
      }
      tokens.push({ type: 'punc', value: ch });
      i++;
    }
    return tokens;
  }
  function extractVariablesFromScript(code, sourceLabel) {
    const tokens = tokenizeJS(code);
    const found = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const prev = tokens[i - 1];
      if (tok.type !== 'decl' || (prev && prev.value === '.')) continue;
      const kind = tok.value;
      let j = i + 1;
      while (j < tokens.length) {
        const names = [];
        const cur = tokens[j];
        if (!cur) break;
        if (cur.type === 'id') { names.push(cur.value); j++; }
        else if (cur.value === '{') {
          let depth = 1; j++;
          while (j < tokens.length && depth > 0) {
            if (tokens[j].value === '{') depth++;
            else if (tokens[j].value === '}') depth--;
            else if (depth === 1 && tokens[j].type === 'id') {
              const after = tokens[j + 1];
              if (!after || after.value !== ':') names.push(tokens[j].value);
            }
            j++;
          }
        } else if (cur.value === '[') {
          let depth = 1; j++;
          while (j < tokens.length && depth > 0) {
            if (tokens[j].value === '[') depth++;
            else if (tokens[j].value === ']') depth--;
            else if (depth === 1 && tokens[j].type === 'id') names.push(tokens[j].value);
            j++;
          }
        } else break;

        let initExpr = '(uninitialized)';
        if (tokens[j] && tokens[j].value === '=') {
          j++;
          const exprParts = [];
          let paren = 0, brace = 0, bracket = 0;
          while (j < tokens.length) {
            const t = tokens[j];
            if (t.value === '(') paren++; else if (t.value === ')') paren--;
            else if (t.value === '{') brace++; else if (t.value === '}') brace--;
            else if (t.value === '[') bracket++; else if (t.value === ']') bracket--;
            if (paren === 0 && brace === 0 && bracket === 0 && (t.value === ',' || t.value === ';')) break;
            if (paren === 0 && brace === 0 && bracket === 0 && t.type === 'decl') break;
            exprParts.push(t.value);
            j++;
          }
          initExpr = exprParts.join(' ').trim() || 'undefined';
        }
        for (const varName of names) {
          let liveVal = null, hasLive = false;
          try { if (varName in window) { liveVal = formatVal(window[varName]); hasLive = true; } } catch (e) {}
          found.push({ kind, name: varName, initExpr, liveVal, hasLive, source: sourceLabel });
        }
        if (tokens[j] && tokens[j].value === ',') j++; else break;
      }
    }
    return found;
  }
  function runVariableScan() {
    scannedVars = [];
    Array.from(document.querySelectorAll('script')).forEach((sc, idx) => {
      if (sc.textContent && !sc.textContent.includes('__edge_devtools_host')) {
        const label = sc.id ? `script#${sc.id}` : `inline script #${idx + 1}`;
        scannedVars.push(...extractVariablesFromScript(sc.textContent, label));
      }
    });
    renderVariables();
  }
  function renderVariables() {
    const list = $('#var-list');
    const q = $('#var-search').value.trim().toLowerCase();
    const filtered = scannedVars.filter((v) => (activeVarKind === 'ALL' || v.kind === activeVarKind) && (!q || v.name.toLowerCase().includes(q) || v.initExpr.toLowerCase().includes(q)));
    $('#var-count').textContent = `${filtered.length} of ${scannedVars.length} variables`;
    list.replaceChildren();
    if (!filtered.length) { list.append(h('div', { class: 'empty', text: 'No matching variables found in HTML scripts.' })); return; }
    filtered.forEach((v) => {
      list.append(h('div', { class: 'var-item' },
        h('div', { class: 'row', style: { justifyContent: 'space-between' } },
          h('div', { class: 'mono' }, h('span', { class: 'kw-' + v.kind, text: v.kind }), ' ', h('b', { text: v.name })),
          h('span', { class: 'muted', text: v.source })),
        h('div', { class: 'mono', style: { color: '#cbd5e1', fontSize: '11px' }, text: '= ' + v.initExpr }),
        v.hasLive ? h('div', { class: 'mono', style: { color: 'var(--green)', fontSize: '10.5px' }, text: `Live window.${v.name}: ${v.liveVal}` }) : null));
    });
  }
  $('#btn-scan-vars').onclick = () => { runVariableScan(); showToast('HTML scripts rescanned'); };
  $('#var-search').oninput = renderVariables;
  $$('.var-filter').forEach((b) => {
    b.onclick = () => {
      $$('.var-filter').forEach((x) => x.classList.remove('btn-accent'));
      b.classList.add('btn-accent');
      activeVarKind = b.dataset.kind;
      renderVariables();
    };
  });

  // --- 12. IMPORT .JS / .ZIP ---
  const dropZone = $('#drop-zone');
  const fileInput = $('#file-loader');
  const fileLog = $('#file-log');
  const logFile = (msg, isErr) => {
    fileLog.append(h('div', { class: 'log-item ' + (isErr ? 'log-error' : ''), text: msg }));
    fileLog.scrollTop = fileLog.scrollHeight;
  };
  async function extractZipJS(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let eocdOffset = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
    }
    if (eocdOffset === -1) throw new Error('Invalid ZIP file');
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    let cdOffset = view.getUint32(eocdOffset + 16, true);
    const decoder = new TextDecoder();
    const jsFiles = [];
    for (let i = 0; i < totalEntries; i++) {
      if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
      const method = view.getUint16(cdOffset + 10, true);
      const compSize = view.getUint32(cdOffset + 20, true);
      const fnLen = view.getUint16(cdOffset + 28, true);
      const exLen = view.getUint16(cdOffset + 30, true);
      const cmLen = view.getUint16(cdOffset + 32, true);
      const localOffset = view.getUint32(cdOffset + 42, true);
      const fileName = decoder.decode(bytes.slice(cdOffset + 46, cdOffset + 46 + fnLen));
      cdOffset += 46 + fnLen + exLen + cmLen;
      if (!fileName.toLowerCase().endsWith('.js') || fileName.startsWith('__MACOSX')) continue;
      const lFnLen = view.getUint16(localOffset + 26, true);
      const lExLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + lFnLen + lExLen;
      const compData = bytes.slice(dataStart, dataStart + compSize);
      let code = '';
      if (method === 0) code = decoder.decode(compData);
      else if (method === 8) {
        const ds = new DecompressionStream('deflate-raw');
        code = await new Response(new Blob([compData]).stream().pipeThrough(ds)).text();
      } else throw new Error(`Unsupported compression (${method}) in ${fileName}`);
      jsFiles.push({ name: fileName, code });
    }
    return jsFiles;
  }
  async function processFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return;
    fileLog.innerHTML = '';
    for (const file of files) {
      const kb = (file.size / 1024).toFixed(1);
      try {
        if (file.name.toLowerCase().endsWith('.zip')) {
          logFile(`📦 Extracting ${file.name} (${kb} KB)...`);
          const scripts = await extractZipJS(await file.arrayBuffer());
          if (!scripts.length) logFile(`⚠️ No .js files inside ${file.name}`, true);
          for (const s of scripts) { logFile(`▶ Executing ${s.name}`); (0, eval)(s.code); }
        } else {
          logFile(`▶ Executing ${file.name} (${kb} KB)`);
          (0, eval)(await file.text());
        }
        logFile(`✅ Done: ${file.name}`);
      } catch (err) { logFile(`❌ Failed (${file.name}): ${err.message}`, true); console.error(err); }
    }
  }
  fileInput.onchange = (e) => { processFiles(e.target.files); e.target.value = ''; };
  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
  dropZone.ondragleave = () => dropZone.classList.remove('dragover');
  dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); processFiles(e.dataTransfer.files); };

  // --- 13. REQ (kirim fetch manual, tercatat juga di tab Net) ---
  let lastResponseText = '', lastResHeaders = {}, showResHeaders = false, lastBodyView = '';
  const reqHist = [];
  function renderReqHist() {
    const box = $('#req-hist');
    box.replaceChildren(...reqHist.map((r) => h('button', { class: 'chip', text: `${r.method} ${urlParts(r.url).path.slice(0, 22)}`, onclick: () => fillReq(r) })));
  }
  function fillReq(r) {
    $('#net-method').value = r.method || 'GET';
    $('#net-url').value = r.url || '';
    $('#net-body').value = r.body || '';
    $('#net-headers').value = r.headers && Object.keys(r.headers).length ? JSON.stringify(r.headers) : '';
  }
  $('#btn-fetch').onclick = async () => {
    const url = $('#net-url').value.trim();
    const method = $('#net-method').value;
    const rawBody = $('#net-body').value.trim();
    if (!url) return;
    let headers = {};
    const rawH = $('#net-headers').value.trim();
    if (rawH) { try { headers = JSON.parse(rawH); } catch (e) { showToast('Headers harus JSON valid'); return; } }
    $('#net-status').textContent = 'Loading...';
    $('#net-res').textContent = '';
    const opts = { method, headers };
    if (rawBody && method !== 'GET') {
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
      opts.body = rawBody;
    }
    const t0 = performance.now();
    const e = netAdd({ kind: 'fetch', method, url: abs(url), reqHeaders: headers, reqBody: rawBody || null, pending: true, note: 'dikirim dari tab Req' });
    reqHist.unshift({ method, url, body: rawBody, headers: rawH ? headers : {} });
    if (reqHist.length > 12) reqHist.pop();
    renderReqHist();
    try {
      const res = await origFetch(url, opts);
      const text = await res.text();
      lastResponseText = text;
      lastResHeaders = headersToObj(res.headers);
      const dur = performance.now() - t0;
      Object.assign(e, { pending: false, status: res.status, statusText: res.statusText, dur, ctype: res.headers.get('content-type') || '', resHeaders: lastResHeaders, size: byteLen(text), resBody: text.slice(0, BODY_MAX) });
      netChanged();
      $('#net-status').textContent = `${res.status} ${res.statusText} • ${(byteLen(text) / 1024).toFixed(2)} KB • ${fmtMs(dur)}`;
      lastBodyView = prettify(text, e.ctype);
      showResHeaders = false;
      $('#net-res').textContent = lastBodyView;
    } catch (err) {
      lastResponseText = '';
      Object.assign(e, { pending: false, error: err.message });
      netChanged();
      $('#net-status').textContent = 'Error';
      $('#net-res').textContent = err.message + '\n\n(Kemungkinan diblokir CORS / jaringan.)';
    }
  };
  $('#btn-res-headers').onclick = () => {
    showResHeaders = !showResHeaders;
    $('#net-res').textContent = showResHeaders ? Object.entries(lastResHeaders).map(([k, v]) => `${k}: ${v}`).join('\n') || '(tidak ada header terbaca)' : lastBodyView;
  };
  $('#btn-copy-res').onclick = () => lastResponseText && copyText(lastResponseText, 102400);
  $('#btn-dl-res').onclick = () => {
    if (!lastResponseText) return;
    const t = lastResponseText.trim();
    const isJson = t.startsWith('{') || t.startsWith('[');
    downloadText(lastResponseText, `fetch-${Date.now()}.${isJson ? 'json' : 'txt'}`, isJson ? 'application/json' : 'text/plain');
  };

  // --- 14. NETWORK VIEW ---
  let ntFilter = 'all';
  const netType = (e) => {
    if (e.kind === 'ws') return 'ws';
    const t = guessType(e.url, e.ctype, e.initiator);
    if (['image', 'video', 'audio'].includes(t)) return 'media';
    if (['script', 'style', 'html'].includes(t)) return 'code';
    if (e.kind === 'fetch' || e.kind === 'xhr' || e.kind === 'beacon') return 'api';
    return 'other';
  };
  const statusCls = (e) => (e.pending ? 'dim' : netIsErr(e) ? 'bad' : e.status >= 300 ? 'warn' : e.status ? 'ok' : 'dim');
  const timeStr = (ts) => new Date(ts).toLocaleTimeString('en-US', { hour12: false });
  const urlEl = (u) => { const p = urlParts(u); return h('div', { class: 'url mono' }, p.host ? h('span', { class: 'u-host', text: p.host }) : null, h('span', { text: u.startsWith('data:') || !p.host ? shortUrl(u) : p.path })); };

  function renderNet() {
    const list = $('#nt-list');
    const q = $('#nt-search').value.trim().toLowerCase();
    const rows = netLog.filter((e) => {
      if (ntFilter === 'err') { if (!netIsErr(e)) return false; }
      else if (ntFilter !== 'all' && netType(e) !== ntFilter) return false;
      if (!q) return true;
      return (e.url + ' ' + e.method + ' ' + (e.status || '') + ' ' + (e.ctype || '')).toLowerCase().includes(q);
    }).slice().reverse();
    const total = netLog.reduce((s, e) => s + (e.size || 0), 0);
    $('#nt-count').textContent = `${rows.length} dari ${netLog.length} request • ${fmtBytes(total)} • ${netRec ? 'merekam' : 'berhenti'}`;
    const keepScroll = list.scrollTop;
    list.replaceChildren();
    if (!rows.length) { list.append(h('div', { class: 'empty', text: 'Belum ada request. Aksi di halaman (fetch/XHR/WS) akan muncul di sini; resource yang sudah dimuat ikut terdaftar.' })); return; }
    rows.slice(0, 250).forEach((e) => {
      list.append(h('div', { class: 'item tap', onclick: () => openNetDetail(e) },
        h('div', { class: 'row wrap' },
          h('span', { class: 'pill m-' + e.method, text: e.method }),
          h('span', { class: 'pill ' + statusCls(e), text: e.pending ? '…' : e.error && !e.status ? 'ERR' : e.status || (e.kind === 'res' ? '—' : 'ERR') }),
          h('span', { class: 'pill dim', text: e.kind === 'res' ? (e.initiator || 'res') : e.kind }),
          h('span', { class: 'muted', text: [e.size != null ? fmtBytes(e.size) : null, e.dur != null ? fmtMs(e.dur) : null, timeStr(e.ts)].filter(Boolean).join(' • ') })),
        urlEl(e.url)));
    });
    list.scrollTop = keepScroll;
  }
  chipGroup($('#nt-chips'), (v) => { ntFilter = v; renderNet(); });
  $('#nt-search').oninput = renderNet;
  $('#nt-clear').onclick = () => { netLog.length = 0; renderNet(); updateNetBadge(); showToast('Log network dibersihkan'); };
  $('#nt-rec').onclick = () => { netRec = !netRec; $('#nt-rec').textContent = netRec ? '⏺ ON' : '⏸ OFF'; showToast(netRec ? 'Perekaman aktif' : 'Perekaman dihentikan'); renderNet(); };
  $('#nt-export').onclick = () => downloadText(JSON.stringify(netLog, null, 2), `network-log-${Date.now()}.json`, 'application/json');

  const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
  function toCurl(e) {
    let c = `curl ${shq(e.url)}`;
    if (e.method && e.method !== 'GET') c += ` -X ${e.method}`;
    Object.entries(e.reqHeaders || {}).forEach(([k, v]) => (c += ` -H ${shq(k + ': ' + v)}`));
    if (e.reqBody) c += ` --data-raw ${shq(e.reqBody)}`;
    return c;
  }
  async function loadResource(url) {
    if (loadResource.cache.has(url)) return loadResource.cache.get(url);
    const out = { url };
    try {
      const res = await origFetch(url, { credentials: 'same-origin' });
      out.status = res.status; out.ok = res.ok;
      out.ctype = res.headers.get('content-type') || '';
      out.headers = headersToObj(res.headers);
      const type = guessType(url, out.ctype);
      out.type = type;
      const cl = +res.headers.get('content-length') || 0;
      if (cl > 25 * 1048576 && !isTextCt(out.ctype)) { out.size = cl; out.tooBig = true; try { res.body && res.body.cancel(); } catch (e) {} }
      else {
        const buf = await res.arrayBuffer();
        out.size = buf.byteLength;
        let textual = isTextCt(out.ctype) || ['script', 'style', 'json', 'html', 'text'].includes(type);
        if (!textual) { const u8 = new Uint8Array(buf.slice(0, 512)); textual = u8.length > 0 && !u8.includes(0) && !['image', 'video', 'audio', 'font'].includes(type); }
        if (textual) out.text = new TextDecoder().decode(buf);
        else { out.blob = new Blob([buf], { type: out.ctype }); out.blobUrl = mkBlobUrl(out.blob); }
      }
    } catch (err) {
      out.error = err.message || String(err);
    }
    loadResource.cache.set(url, out);
    return out;
  }
  loadResource.cache = new Map();

  function renderLoaded(c, r, url) {
    if (r.error) {
      c.append(h('div', { class: 'card' },
        h('div', { style: { color: 'var(--amber)' }, text: '⚠ Isi tidak bisa dibaca dari JavaScript: ' + r.error }),
        h('div', { class: 'muted', text: 'Biasanya karena CORS atau file:// . Gunakan tombol Buka / Download (tanpa fetch) di atas.' }),
        btn('↻ Coba lagi', () => { loadResource.cache.delete(url); c.replaceChildren(); loadIntoSection(c, url); })));
      return;
    }
    c.append(kvTable([['Status', r.status], ['Content-Type', r.ctype], ['Ukuran', r.size != null ? fmtBytes(r.size) : null]]));
    if (r.tooBig) c.append(h('div', { class: 'muted', text: 'File terlalu besar untuk dimuat ke memori (>25 MB). Gunakan Buka / Download.' }));
    else if (r.text != null) c.append(codeBlock(r.text, r.ctype));
    else if (r.blobUrl) {
      if (['image', 'video', 'audio'].includes(r.type)) {
        const it = { url: r.blobUrl, type: r.type };
        c.append(h('div', { class: 'media-prev big' }, previewNode(it, true)));
      } else c.append(h('div', { class: 'muted', text: `File biner (${r.type}). Pakai Download untuk menyimpan.` }));
    }
  }
  async function loadIntoSection(c, url) {
    c.append(h('div', { class: 'muted', text: 'Memuat isi...' }));
    const r = await loadResource(url);
    c.replaceChildren();
    renderLoaded(c, r, url);
  }

  function openNetDetail(e) {
    const secs = [
      { name: 'Info', build: (c) => c.append(kvTable([
        ['URL', e.url], ['Final URL', e.finalUrl && e.finalUrl !== e.url ? e.finalUrl : null], ['Method', e.method],
        ['Status', e.pending ? 'pending…' : `${e.status || '—'} ${e.statusText || ''}`.trim()], ['Error', e.error],
        ['Jenis', e.kind === 'res' ? 'resource (' + (e.initiator || '?') + ')' : e.kind], ['Content-Type', e.ctype],
        ['Ukuran', e.size != null ? fmtBytes(e.size) : null], ['Durasi', e.dur != null ? fmtMs(e.dur) : null],
        ['Waktu', new Date(e.ts).toLocaleString()], ['Catatan', e.note], ['Redirect', e.redirected ? 'ya' : null]])) },
      { name: 'Request', build: (c) => {
        c.append(h('div', { class: 'sec-title', text: 'Headers' }), e.kind === 'res' ? h('div', { class: 'muted', text: 'Tidak tersedia untuk resource yang dimuat browser (img/script/css).' }) : objTable(e.reqHeaders));
        c.append(h('div', { class: 'sec-title', text: 'Body' }), e.reqBody ? codeBlock(e.reqBody, e.reqHeaders && (e.reqHeaders['Content-Type'] || e.reqHeaders['content-type'])) : h('div', { class: 'muted', text: '(kosong)' }));
      } },
      { name: 'Response', build: (c) => {
        if (e.kind === 'ws') { c.append(h('div', { class: 'muted', text: 'Lihat tab Pesan.' })); return; }
        c.append(h('div', { class: 'sec-title', text: 'Headers' }), e.resHeaders ? objTable(e.resHeaders) : h('div', { class: 'muted', text: '(tidak tersedia)' }));
        c.append(h('div', { class: 'sec-title', text: 'Body' }));
        const ty = guessType(e.url, e.ctype, e.initiator);
        if (e.resBody != null) { c.append(codeBlock(e.resBody, e.ctype)); if (e.truncated) c.append(h('div', { class: 'muted', text: 'Body dipotong 1 MB saat direkam.' })); }
        else if (['image', 'video', 'audio'].includes(ty)) c.append(h('div', { class: 'media-prev big' }, previewNode({ url: e.url, type: ty }, true)));
        else if (e.pending) c.append(h('div', { class: 'muted', text: 'Masih berjalan...' }));
        else {
          const holder = h('div', { class: 'sec' });
          c.append(holder, btn('📥 Muat isi (fetch ulang GET)', () => { holder.replaceChildren(); loadIntoSection(holder, e.url); }, 'btn-accent'));
        }
      } }
    ];
    if (e.kind === 'ws') secs.push({ name: 'Pesan', build: (c) => {
      const m = e.msgs || [];
      if (!m.length) { c.append(h('div', { class: 'muted', text: 'Belum ada pesan.' })); return; }
      m.slice().reverse().forEach((x) => c.append(h('div', { class: 'item' }, h('div', { class: 'muted', text: `${x.dir === '→' ? 'KIRIM →' : '← TERIMA'} • ${timeStr(x.t)}` }), h('pre', { class: 'st-pre', text: prettify(x.data) }))));
    } });
    openSheet({
      title: e.url,
      meta: [h('span', { class: 'pill m-' + e.method, text: e.method }), h('span', { class: 'pill ' + statusCls(e), text: e.pending ? '…' : e.status || 'ERR' }), h('span', { class: 'pill dim', text: e.kind })],
      actions: [
        { label: '📋 URL', fn: () => copyText(e.url) },
        { label: '📋 cURL', fn: () => copyText(toCurl(e)) },
        { label: '🔗 Buka', fn: () => openUrl(e.url) },
        { label: '⬇ Unduh', fn: () => (e.resBody != null ? downloadText(e.resBody, fileNameFrom(e.url, e.ctype) || 'response.txt', e.ctype || 'text/plain') : downloadUrl(e.url)) },
        { label: '📋 Body', fn: () => (e.resBody != null ? copyText(e.resBody) : showToast('Body belum ada — buka tab Response & muat isi')) },
        { label: '↻ Replay di Req', cls: 'btn-green', fn: () => { fillReq({ method: e.method === 'WS' ? 'GET' : e.method, url: e.url, body: e.reqBody && !e.reqBody.startsWith('[') ? e.reqBody : '', headers: e.reqHeaders }); closeSheet(); switchView('req'); } }
      ],
      sections: secs
    });
  }

  // --- 15. MEDIA VIEWER ---
  let mediaItems = [], mdFilter = 'all';
  function previewNode(it, big, onMeta) {
    let n;
    if (it.type === 'image') {
      n = h('img', { alt: '', referrerpolicy: 'no-referrer', decoding: 'async' });
      n.onload = () => onMeta && onMeta(`${n.naturalWidth}×${n.naturalHeight}`);
      n.onerror = () => { const p = n.parentNode; if (p) p.replaceChild(h('div', { class: 'prev-err', text: '⚠ Preview gagal (diblokir / CORS / hotlink / format tidak didukung)' }), n); onMeta && onMeta('gagal dimuat'); };
      n.src = it.url;
    } else {
      n = h(it.type === 'video' ? 'video' : 'audio', { controls: true, preload: 'metadata', playsinline: true });
      n.onloadedmetadata = () => onMeta && onMeta((it.type === 'video' ? `${n.videoWidth}×${n.videoHeight} • ` : '') + fmtDur(n.duration));
      n.onerror = () => onMeta && onMeta('gagal dimuat');
      n.addEventListener('play', () => shadow.querySelectorAll('video,audio').forEach((m) => { if (m !== n) m.pause(); }));
      n.src = it.url;
    }
    return n;
  }
  function urlSize(url) {
    if (url.startsWith('data:')) return Math.round((url.length - url.indexOf(',') - 1) * 0.75);
    if (url.startsWith('blob:')) return null;
    const ne = netLog.slice().reverse().find((e) => e.url === url && e.size);
    if (ne) return ne.size;
    try { const en = performance.getEntriesByName(url).pop(); if (en) return en.transferSize || en.encodedBodySize || en.decodedBodySize || null; } catch (e) {}
    return null;
  }
  function parseSrcset(s) {
    return String(s || '').split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean);
  }
  function collectMedia() {
    const map = new Map();
    const add = (raw, type, via, el, extra) => {
      if (!raw) return;
      raw = String(raw).trim();
      if (!raw || raw.startsWith('javascript:') || raw === 'about:blank') return;
      const url = /^(data|blob):/.test(raw) ? raw : abs(raw);
      let it = map.get(url);
      if (!it) { it = { url, type: type || guessType(url), vias: new Set(), els: [] }; map.set(url, it); }
      if (it.type === 'other' && type) it.type = type;
      it.vias.add(via);
      if (el) it.els.push(el);
      if (extra) Object.assign(it, extra);
    };
    const q = (s) => document.querySelectorAll(s);
    q('img').forEach((el) => { add(el.currentSrc || el.src, 'image', '<img>', el); parseSrcset(el.srcset).forEach((u) => add(u, 'image', 'srcset', el)); });
    q('picture source[srcset]').forEach((el) => parseSrcset(el.srcset).forEach((u) => add(u, 'image', '<picture>', el)));
    q('video').forEach((el) => { add(el.currentSrc || el.src, 'video', '<video>', el); if (el.poster) add(el.poster, 'image', 'poster', el); });
    q('audio').forEach((el) => add(el.currentSrc || el.src, 'audio', '<audio>', el));
    q('video source[src], audio source[src]').forEach((el) => add(el.src, el.parentElement.tagName === 'AUDIO' ? 'audio' : 'video', '<source>', el));
    q('input[type=image]').forEach((el) => add(el.src, 'image', '<input image>', el));
    q('link[rel~=icon], link[rel=apple-touch-icon]').forEach((el) => add(el.href, 'image', '<link icon>', el));
    q('meta[property="og:image"], meta[name="twitter:image"]').forEach((el) => add(el.content, 'image', '<meta>', el));
    q('svg image').forEach((el) => add(el.getAttribute('href') || el.getAttribute('xlink:href'), 'image', '<svg image>', el));
    q('embed[src], object[data]').forEach((el) => add(el.src || el.data, null, '<embed/object>', el));
    const all = document.querySelectorAll('html, body, body *');
    const lim = Math.min(all.length, 6000);
    for (let i = 0; i < lim; i++) {
      let bg = '';
      try { bg = getComputedStyle(all[i]).backgroundImage; } catch (e) {}
      if (bg && bg !== 'none') {
        const re = /url\((['"]?)(.*?)\1\)/g;
        let m;
        while ((m = re.exec(bg))) add(m[2], 'image', 'background', all[i]);
      }
    }
    q('canvas').forEach((cv, i) => {
      try { if (cv.width * cv.height > 0) add(cv.toDataURL('image/png'), 'image', '<canvas>', cv, { label: `canvas #${i + 1} (${cv.width}×${cv.height})`, fname: `canvas-${i + 1}.png` }); } catch (e) {}
    });
    mediaKeep.forEach((m) => add(m.url, m.type, m.via));
    netLog.forEach((e) => {
      if (e.kind === 'ws') return;
      const t = guessType(e.url, e.ctype, e.initiator);
      if (['image', 'video', 'audio'].includes(t)) add(e.url, t, e.kind === 'res' ? 'network' : e.kind.toUpperCase());
    });
    return [...map.values()].filter((it) => ['image', 'video', 'audio'].includes(it.type));
  }
  function clearMediaPreviews() {
    const list = $('#md-list');
    releaseMedia(list);
    list.replaceChildren();
    mediaItems = [];
    mediaDirty = true;
  }
  function scanMedia() {
    clearMediaPreviews();            // hapus preview lama dulu → tidak ada duplikat
    mediaItems = collectMedia();
    mediaDirty = false;
    renderMedia();
  }
  function renderMedia() {
    const list = $('#md-list');
    releaseMedia(list);
    list.replaceChildren();
    const q = $('#md-search').value.trim().toLowerCase();
    const items = mediaItems.filter((it) => (mdFilter === 'all' || it.type === mdFilter) && (!q || it.url.toLowerCase().includes(q) || (it.label || '').toLowerCase().includes(q)));
    const cnt = (t) => mediaItems.filter((i) => i.type === t).length;
    $('#md-count').textContent = `${items.length} tampil • ${cnt('image')} gambar, ${cnt('video')} video, ${cnt('audio')} audio`;
    if (!items.length) { list.append(h('div', { class: 'empty', style: { gridColumn: '1/-1' }, text: 'Tidak ada media. Tekan Scan setelah halaman memuat media.' })); return; }
    items.forEach((it) => list.append(mediaCard(it)));
    listFresh(list);
  }
  function mediaCard(it) {
    const dim = h('span', { class: 'muted' });
    const prev = h('div', { class: 'media-prev' });
    const node = previewNode(it, false, (t) => (dim.textContent = t));
    if (it.type === 'image') { node.style.cursor = 'zoom-in'; node.onclick = () => openMediaDetail(it); }
    prev.append(node);
    const sz = urlSize(it.url);
    return h('div', { class: 'item media-card' }, prev,
      h('div', { class: 'media-info' },
        h('div', { class: 'row wrap' }, h('span', { class: 'pill', text: it.type.toUpperCase() }), dim, h('span', { class: 'muted', text: sz != null ? fmtBytes(sz) : '' })),
        h('div', { class: 'url mono', text: it.label || shortUrl(it.url) }),
        h('div', { class: 'muted', text: 'via ' + [...it.vias].join(', ') }),
        h('div', { class: 'row wrap' },
          btn('🔗 Buka', () => openUrl(it.url)), btn('📋 URL', () => copyText(it.url)), btn('⬇ Unduh', () => downloadUrl(it.url, it.fname)),
          it.els.length ? btn('🎯 Sorot', () => flashEl(it.els[0])) : null, btn('ℹ️ Detail', () => openMediaDetail(it)))));
  }
  function openMediaDetail(it) {
    const sz = urlSize(it.url);
    const dim = h('span', { class: 'pill dim', text: '…' });
    openSheet({
      title: it.label || fileNameFrom(it.url),
      meta: [h('span', { class: 'pill', text: it.type.toUpperCase() }), dim],
      actions: [
        { label: '🔗 Buka', fn: () => openUrl(it.url) }, { label: '📋 URL', fn: () => copyText(it.url) },
        { label: '⬇ Unduh', cls: 'btn-green', fn: () => downloadUrl(it.url, it.fname) },
        ...(it.els.length ? [{ label: '🎯 Sorot', fn: () => flashEl(it.els[0]) }] : [])
      ],
      sections: [{ name: 'Preview', build: (c) => {
        c.append(h('div', { class: 'media-prev big' }, previewNode(it, true, (t) => (dim.textContent = t))));
        c.append(kvTable([['Source URL', shortUrl(it.url)], ['Ukuran', sz != null ? fmtBytes(sz) : null], ['Ditemukan via', [...it.vias].join(', ')], ['Jumlah elemen', it.els.length || null]]));
      } }]
    });
  }
  chipGroup($('#md-chips'), (v) => { mdFilter = v; renderMedia(); });
  $('#md-search').oninput = renderMedia;
  $('#md-scan').onclick = () => { scanMedia(); showToast('Media discan ulang'); };

  // --- 16. SRC VIEWER ---
  let srcItems = [], scFilter = 'all';
  const CAT_ICON = { script: '📜', style: '🎨', image: '🖼️', media: '🎞️', frame: '🪟', link: '🔗', font: '🔤', inline: '📝', other: '📦' };
  const catOf = (t) => ({ image: 'image', video: 'media', audio: 'media', script: 'script', style: 'style', font: 'font', html: 'frame' }[t] || 'other');
  function collectSources() {
    const items = [], seen = new Set();
    const push = (o) => { const k = o.cat + '|' + (o.url || o.label) + '|' + o.attr; if (seen.has(k)) return; seen.add(k); items.push(o); };
    const add = (el, attr, val, cat) => {
      if (!val) return;
      const raw = String(val).trim();
      if (!raw || raw.startsWith('javascript:') || raw.startsWith('#')) return;
      const url = /^(data|blob|mailto|tel):/.test(raw) ? raw : abs(raw);
      push({ cat: cat || catOf(guessType(url)), url, tag: el.tagName.toLowerCase(), attr, el });
    };
    const q = (s) => document.querySelectorAll(s);
    q('script[src]').forEach((el) => add(el, 'src', el.getAttribute('src'), 'script'));
    q('link[href]').forEach((el) => {
      const rel = (el.getAttribute('rel') || '').toLowerCase();
      const cat = rel.includes('stylesheet') ? 'style' : rel.includes('icon') ? 'image' : /preload|prefetch|modulepreload/.test(rel) ? catOf(guessType(el.href, '', el.getAttribute('as') === 'font' ? '' : el.getAttribute('as'))) : rel.includes('manifest') ? 'other' : 'link';
      add(el, 'href', el.getAttribute('href'), cat);
    });
    q('img').forEach((el) => { add(el, 'src', el.getAttribute('src'), 'image'); parseSrcset(el.getAttribute('srcset')).forEach((u) => add(el, 'srcset', u, 'image')); });
    q('picture source[srcset]').forEach((el) => parseSrcset(el.getAttribute('srcset')).forEach((u) => add(el, 'srcset', u, 'image')));
    q('video, audio').forEach((el) => { add(el, 'src', el.getAttribute('src'), 'media'); if (el.getAttribute('poster')) add(el, 'poster', el.getAttribute('poster'), 'image'); });
    q('source[src], track[src]').forEach((el) => add(el, 'src', el.getAttribute('src'), 'media'));
    q('iframe[src], frame[src], embed[src]').forEach((el) => add(el, 'src', el.getAttribute('src'), 'frame'));
    q('object[data]').forEach((el) => add(el, 'data', el.getAttribute('data'), 'frame'));
    q('input[type=image][src]').forEach((el) => add(el, 'src', el.getAttribute('src'), 'image'));
    q('a[href]').forEach((el) => add(el, 'href', el.getAttribute('href'), 'link'));
    q('form[action]').forEach((el) => add(el, 'action', el.getAttribute('action'), 'other'));
    q('[data-src]').forEach((el) => add(el, 'data-src', el.getAttribute('data-src')));
    q('[data-srcset]').forEach((el) => parseSrcset(el.getAttribute('data-srcset')).forEach((u) => add(el, 'data-srcset', u)));
    q('svg image').forEach((el) => add(el, 'href', el.getAttribute('href') || el.getAttribute('xlink:href'), 'image'));
    let n = 0;
    q('script:not([src])').forEach((el, i) => {
      const t = el.textContent || '';
      if (!t.trim() || t.includes('__edge_devtools_host')) return;
      push({ cat: 'inline', url: null, tag: 'script', attr: el.type || 'inline', label: `<script> inline #${++n} (${fmtBytes(byteLen(t))})`, text: t, el });
    });
    n = 0;
    q('style').forEach((el) => {
      const t = el.textContent || '';
      if (!t.trim() || el.id === '__edge_outline' || el.id.startsWith('__edge')) return;
      push({ cat: 'inline', url: null, tag: 'style', attr: 'inline', label: `<style> inline #${++n} (${fmtBytes(byteLen(t))})`, text: t, el });
    });
    // url() di dalam CSS
    let rc = 0;
    for (const sh of document.styleSheets) {
      let rules;
      try { rules = sh.cssRules; } catch (e) { continue; }
      const base = sh.href || document.baseURI;
      for (const r of rules) {
        if (++rc > 4000) break;
        if (r.href) push({ cat: 'style', url: abs(r.href), tag: '@import', attr: 'css', el: null });
        const re = /url\(\s*(['"]?)(.*?)\1\s*\)/g;
        let m;
        const txt = r.cssText || '';
        while ((m = re.exec(txt))) {
          const raw = m[2];
          if (!raw || raw.startsWith('#')) continue;
          let url = raw;
          if (!/^(data|blob):/.test(raw)) { try { url = new URL(raw, base).href; } catch (e) {} }
          push({ cat: catOf(guessType(url)), url, tag: 'css', attr: 'url()', el: null });
        }
      }
    }
    // resource lain yang benar-benar dimuat browser
    try {
      performance.getEntriesByType('resource').forEach((en) => {
        if (items.some((x) => x.url === en.name)) return;
        push({ cat: catOf(guessType(en.name, '', en.initiatorType)), url: en.name, tag: en.initiatorType || 'res', attr: 'loaded', el: null });
      });
    } catch (e) {}
    return items;
  }
  function scanSources() {
    srcItems = collectSources();
    renderSources();
  }
  function renderSources() {
    const list = $('#sc-list');
    const q = $('#sc-search').value.trim().toLowerCase();
    const items = srcItems.filter((it) => (scFilter === 'all' || it.cat === scFilter) && (!q || (it.url || it.label || '').toLowerCase().includes(q) || it.tag.includes(q)));
    $('#sc-count').textContent = `${items.length} dari ${srcItems.length} sumber`;
    list.replaceChildren();
    if (!items.length) { list.append(h('div', { class: 'empty', text: 'Tidak ada sumber yang cocok.' })); return; }
    items.slice(0, 600).forEach((it) => {
      const same = it.url && it.url.startsWith(location.origin);
      const org = !it.url ? 'inline' : it.url.startsWith('data:') ? 'data' : it.url.startsWith('blob:') ? 'blob' : same ? 'same-origin' : 'external';
      list.append(h('div', { class: 'item tap', onclick: () => openSrcDetail(it) },
        h('div', { class: 'row wrap' }, h('span', { text: CAT_ICON[it.cat] || '📦' }), h('span', { class: 'pill', text: `<${it.tag}> ${it.attr}` }), h('span', { class: 'pill ' + (org === 'external' ? 'warn' : 'dim'), text: org })),
        it.url ? urlEl(it.url) : h('div', { class: 'url mono', text: it.label })));
    });
    listFresh(list);
  }
  function openSrcDetail(it) {
    const title = it.url ? fileNameFrom(it.url) : it.label;
    const type = it.url ? guessType(it.url, '', it.tag) : it.tag === 'style' ? 'style' : 'script';
    const actions = [];
    if (it.url) actions.push({ label: '📋 URL', fn: () => copyText(it.url) }, { label: '🔗 Buka', fn: () => openUrl(it.url) }, { label: '⬇ Unduh', cls: 'btn-green', fn: () => downloadUrl(it.url) });
    else actions.push({ label: '📋 Copy isi', fn: () => copyText(it.text) }, { label: '⬇ Unduh', cls: 'btn-green', fn: () => downloadText(it.text, it.tag === 'style' ? 'inline.css' : 'inline.js') });
    if (it.url) actions.push({ label: '📋 Isi', fn: async () => { const r = await loadResource(it.url); r.text != null ? copyText(r.text) : showToast('Isi teks tidak tersedia'); } });
    if (it.el && it.el.isConnected) actions.push({ label: '🎯 Sorot', fn: () => flashEl(it.el) }, { label: '🎯 Pilih di DOM', fn: () => { selectElement(it.el); closeSheet(); switchView('dom'); } });
    openSheet({
      title,
      meta: [h('span', { class: 'pill', text: `${CAT_ICON[it.cat] || ''} ${it.cat}` }), h('span', { class: 'pill dim', text: `<${it.tag}> ${it.attr}` })],
      actions,
      sections: [
        { name: 'Isi', build: (c) => {
          if (!it.url) { c.append(codeBlock(it.text, it.tag === 'style' ? 'css' : '')); return; }
          if (['image', 'video', 'audio'].includes(type)) { c.append(h('div', { class: 'media-prev big' }, previewNode({ url: it.url, type }, true))); return; }
          if (it.url.startsWith('data:')) { c.append(h('div', { class: 'muted', text: 'Data URI — dekode:' })); loadIntoSection(c, it.url); return; }
          if (/^(mailto|tel):/.test(it.url)) { c.append(h('div', { class: 'muted', text: it.url })); return; }
          loadIntoSection(c, it.url);
        } },
        { name: 'Info', build: (c) => c.append(kvTable([['URL', it.url ? shortUrl(it.url) : null], ['Tag', it.tag], ['Attribute', it.attr], ['Kategori', it.cat], ['Ukuran', it.url ? (urlSize(it.url) != null ? fmtBytes(urlSize(it.url)) : null) : fmtBytes(byteLen(it.text || ''))]])) }
      ]
    });
  }
  chipGroup($('#sc-chips'), (v) => { scFilter = v; renderSources(); });
  $('#sc-search').oninput = renderSources;
  $('#sc-scan').onclick = () => { scanSources(); showToast('Sumber discan ulang'); };

  // --- 17. STORAGE ---
  function getStorageEntries() {
    const type = $('#st-type').value;
    if (type === 'local') return Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]);
    if (type === 'session') return Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)]);
    if (!document.cookie.trim()) return [];
    return document.cookie.split(';').map((c) => {
      const idx = c.indexOf('=');
      return idx === -1 ? [c.trim(), ''] : [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1))];
    });
  }
  function renderStorage() {
    const box = $('#st-list');
    const q = $('#st-search').value.trim().toLowerCase();
    const type = $('#st-type').value;
    let entries = [];
    try { entries = getStorageEntries().filter(([k, v]) => !q || k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)); } catch (e) { box.replaceChildren(h('div', { class: 'empty', text: 'Storage tidak dapat diakses: ' + e.message })); return; }
    box.replaceChildren();
    if (!entries.length) { box.append(h('div', { class: 'empty', text: 'No storage entries found.' })); return; }
    entries.forEach(([k, rawVal]) => {
      let displayVal = String(rawVal);
      let badge = 'STRING';
      try {
        const tr = displayVal.trim();
        if ((tr.startsWith('{') && tr.endsWith('}')) || (tr.startsWith('[') && tr.endsWith(']'))) {
          const parsed = JSON.parse(tr);
          displayVal = JSON.stringify(parsed, null, 2);
          badge = Array.isArray(parsed) ? 'JSON ARRAY' : 'JSON OBJECT';
        }
      } catch (e) {}
      box.append(h('div', { class: 'st-card' },
        h('div', { class: 'st-head' },
          h('div', { class: 'row', style: { minWidth: '0' } }, h('b', { class: 'mono', style: { color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis' }, text: k }), h('span', { class: 'pill', text: badge })),
          h('div', { class: 'row' },
            btn('Edit', () => { $('#st-k').value = k; $('#st-v').value = displayVal; showToast('Dimuat ke editor di atas'); }),
            btn('Copy', () => copyText(displayVal)),
            btn('✕', () => {
              if (type === 'local') localStorage.removeItem(k);
              else if (type === 'session') sessionStorage.removeItem(k);
              else document.cookie = `${k}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
              renderStorage(); showToast('Deleted');
            }, 'btn-red'))),
        h('pre', { class: 'st-pre', text: displayVal })));
    });
  }
  $('#st-type').onchange = renderStorage;
  $('#st-search').oninput = renderStorage;
  $('#st-refresh').onclick = renderStorage;
  $('#st-add').onclick = () => {
    const type = $('#st-type').value;
    const k = $('#st-k').value.trim();
    const v = $('#st-v').value;
    if (!k) return;
    if (type === 'local') localStorage.setItem(k, v);
    else if (type === 'session') sessionStorage.setItem(k, v);
    else document.cookie = `${k}=${encodeURIComponent(v)}; path=/`;
    $('#st-k').value = ''; $('#st-v').value = '';
    renderStorage(); showToast('Saved');
  };

  // --- 18. TOOLS ---
  const toolOut = (t) => ($('#tool-out').textContent = t);
  const toggleBtn = (id, label, state) => { const b = $(id); b.textContent = `${label}: ${state ? 'ON' : 'OFF'}`; b.classList.toggle('btn-green', state); };
  const injectStyle = (id, css) => { let s = document.getElementById(id); if (!s) { s = document.createElement('style'); s.id = id; s.textContent = css; document.head.appendChild(s); } return s; };

  let isEditing = false;
  $('#t-edit').onclick = () => {
    isEditing = !isEditing;
    document.body.contentEditable = isEditing ? 'true' : 'false';
    host.contentEditable = 'false';
    toggleBtn('#t-edit', '✏️ Edit Page Text', isEditing);
    showToast(`Page editing ${isEditing ? 'enabled' : 'disabled'}`);
  };
  onCleanup(() => { if (isEditing) document.body.contentEditable = 'false'; });

  let outlined = false;
  $('#t-outline').onclick = () => {
    outlined = !outlined;
    if (outlined) injectStyle('__edge_outline', '*:not(#__edge_devtools_host) { outline: 1px solid rgba(56,189,248,0.45) !important; }');
    else { const s = document.getElementById('__edge_outline'); if (s) s.remove(); }
    toggleBtn('#t-outline', '📐 Layout Outlines', outlined);
  };

  $('#t-unlock').onclick = () => {
    ['contextmenu', 'copy', 'cut', 'paste', 'selectstart'].forEach((ev) => listen(document, ev, (e) => e.stopPropagation(), true));
    injectStyle('__edge_unlock', '* { user-select: text !important; -webkit-user-select: text !important; }');
    showToast('Right-click & text selection unlocked');
  };

  let passShown = false;
  $('#t-pass').onclick = () => {
    passShown = !passShown;
    document.querySelectorAll('input[type="password"], input[data-edge-pw]').forEach((inp) => {
      if (passShown) { inp.dataset.edgePw = '1'; inp.type = 'text'; } else inp.type = 'password';
    });
    toggleBtn('#t-pass', '👁️ Reveal Passwords', passShown);
  };

  // FPS meter
  let fpsOn = false, fpsRaf = 0;
  $('#t-fps').onclick = () => {
    fpsOn = !fpsOn;
    const el = $('#fps');
    el.style.display = fpsOn ? 'block' : 'none';
    toggleBtn('#t-fps', '📈 FPS Meter', fpsOn);
    cancelAnimationFrame(fpsRaf);
    if (fpsOn) {
      let last = performance.now(), frames = 0;
      const loop = (t) => {
        frames++;
        if (t - last >= 500) { const f = Math.round((frames * 1000) / (t - last)); el.textContent = f + ' FPS'; el.style.color = f >= 50 ? 'var(--green)' : f >= 30 ? 'var(--amber)' : 'var(--red)'; frames = 0; last = t; }
        fpsRaf = requestAnimationFrame(loop);
      };
      fpsRaf = requestAnimationFrame(loop);
    }
  };
  onCleanup(() => cancelAnimationFrame(fpsRaf));

  // Tap ripple
  let tapsOn = false;
  const tapHandler = (e) => {
    const r = h('div', { class: 'ripple' });
    r.style.left = e.clientX + 'px';
    r.style.top = e.clientY + 'px';
    wrap.appendChild(r);
    setTimeout(() => r.remove(), 650);
  };
  $('#t-taps').onclick = () => {
    tapsOn = !tapsOn;
    if (tapsOn) window.addEventListener('pointerdown', tapHandler, true); else window.removeEventListener('pointerdown', tapHandler, true);
    toggleBtn('#t-taps', '👆 Show Taps', tapsOn);
  };
  onCleanup(() => window.removeEventListener('pointerdown', tapHandler, true));

  let darkOn = false;
  $('#t-dark').onclick = () => {
    darkOn = !darkOn;
    if (darkOn) injectStyle('__edge_dark', 'body{filter:invert(1) hue-rotate(180deg)!important;background:#fff} body img,body video,body canvas,body picture,body svg image{filter:invert(1) hue-rotate(180deg)!important}');
    else { const s = document.getElementById('__edge_dark'); if (s) s.remove(); }
    toggleBtn('#t-dark', '🌙 Force Dark', darkOn);
  };
  let freezeOn = false;
  $('#t-freeze').onclick = () => {
    freezeOn = !freezeOn;
    if (freezeOn) injectStyle('__edge_freeze', '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;scroll-behavior:auto!important}');
    else { const s = document.getElementById('__edge_freeze'); if (s) s.remove(); }
    toggleBtn('#t-freeze', '🧊 Freeze Animasi', freezeOn);
  };

  $('#t-html').onclick = () => {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('#__edge_devtools_host, #__edge_outline, #__edge_dark, #__edge_freeze, #__edge_unlock').forEach((n) => n.remove());
    const live = '<!DOCTYPE html>\n' + clone.outerHTML;
    openSheet({
      title: 'HTML halaman — ' + (document.title || location.href),
      meta: [h('span', { class: 'pill', text: fmtBytes(byteLen(live)) })],
      actions: [{ label: '📋 Copy', fn: () => copyText(live) }, { label: '⬇ Unduh', cls: 'btn-green', fn: () => downloadText(live, (document.title || 'page').replace(/[^\w\-]+/g, '_') + '.html', 'text/html') }],
      sections: [
        { name: 'DOM sekarang', build: (c) => c.append(codeBlock(live)) },
        { name: 'Source asli', build: (c) => loadIntoSection(c, location.href) }
      ]
    });
  };
  $('#t-info').onclick = () => {
    const nav = navigator, cn = nav.connection || {};
    toolOut([
      `URL: ${location.href}`, `Title: ${document.title}`, `Referrer: ${document.referrer || '-'}`, `Charset: ${document.characterSet} • ${document.readyState}`,
      `UA: ${nav.userAgent}`, `Platform: ${nav.platform} • Lang: ${nav.language}`,
      `Screen: ${screen.width}×${screen.height} • Viewport: ${innerWidth}×${innerHeight} • DPR: ${devicePixelRatio}`,
      `Orientasi: ${innerWidth > innerHeight ? 'landscape' : 'portrait'} • Touch points: ${nav.maxTouchPoints}`,
      `CPU cores: ${nav.hardwareConcurrency || '?'} • RAM: ${nav.deviceMemory || '?'} GB`,
      `Koneksi: ${cn.effectiveType || '?'} • ${cn.downlink || '?'} Mbps • RTT ${cn.rtt || '?'} ms • ${nav.onLine ? 'online' : 'offline'}`,
      `Cookies: ${nav.cookieEnabled} • Dark scheme: ${matchMedia('(prefers-color-scheme: dark)').matches} • Secure ctx: ${isSecureContext}`
    ].join('\n'));
  };
  $('#t-perf').onclick = () => {
    const L = [];
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      L.push('— Navigation —', `DNS: ${fmtMs(nav.domainLookupEnd - nav.domainLookupStart)}`, `Connect: ${fmtMs(nav.connectEnd - nav.connectStart)}`, `TTFB: ${fmtMs(nav.responseStart - nav.requestStart)}`,
        `Download: ${fmtMs(nav.responseEnd - nav.responseStart)}`, `DOM Interactive: ${fmtMs(nav.domInteractive)}`, `DOMContentLoaded: ${fmtMs(nav.domContentLoadedEventEnd)}`, `Load: ${fmtMs(nav.loadEventEnd)}`);
    }
    const res = performance.getEntriesByType('resource');
    const sum = res.reduce((s, r) => s + (r.transferSize || 0), 0);
    L.push('', `— Resource: ${res.length} file, transfer ${fmtBytes(sum)} —`, 'Terlambat:');
    res.slice().sort((a, b) => b.duration - a.duration).slice(0, 5).forEach((r) => L.push(`  ${fmtMs(r.duration)}  ${r.name}`));
    L.push('Terbesar:');
    res.slice().sort((a, b) => (b.transferSize || b.encodedBodySize || 0) - (a.transferSize || a.encodedBodySize || 0)).slice(0, 5).forEach((r) => L.push(`  ${fmtBytes(r.transferSize || r.encodedBodySize)}  ${r.name}`));
    if (performance.memory) L.push('', `JS heap: ${fmtBytes(performance.memory.usedJSHeapSize)} / ${fmtBytes(performance.memory.jsHeapSizeLimit)}`);
    L.push(`DOM nodes: ${document.querySelectorAll('*').length}`);
    toolOut(L.join('\n'));
  };
  $('#t-forms').onclick = () => {
    const L = [];
    document.querySelectorAll('form').forEach((f, i) => {
      L.push(`FORM #${i + 1} ${(f.method || 'get').toUpperCase()} → ${f.getAttribute('action') || '(halaman ini)'}`);
      f.querySelectorAll('input,select,textarea,button').forEach((x) => L.push(`   <${x.tagName.toLowerCase()}> name="${x.name || ''}" type="${x.type || ''}" ${x.type === 'password' ? 'value=••• (' + x.value.length + ')' : 'value="' + String(x.value).slice(0, 40) + '"'}`));
    });
    const loose = [...document.querySelectorAll('input,select,textarea')].filter((x) => !x.form);
    if (loose.length) { L.push('INPUT di luar form:'); loose.forEach((x) => L.push(`   <${x.tagName.toLowerCase()}> id="${x.id}" name="${x.name || ''}" type="${x.type || ''}"`)); }
    toolOut(L.length ? L.join('\n') : 'Tidak ada form / input.');
  };
  $('#t-img').onclick = () => {
    const imgs = Array.from(document.images).map((im, i) => `${i + 1}. ${im.currentSrc || im.src || '(no src)'} [${im.naturalWidth}x${im.naturalHeight}]`);
    toolOut(imgs.length ? imgs.join('\n') : 'No images found.');
  };
  $('#t-links').onclick = () => {
    const links = Array.from(document.links).map((a, i) => `${i + 1}. ${a.textContent.trim() || '(icon)'} -> ${a.href}`);
    toolOut(links.length ? links.join('\n') : 'No links found.');
  };
  $('#t-text').onclick = () => copyText(document.body.innerText || '');
  $('#t-reload').onclick = () => location.reload();
  $('#t-top').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  $('#t-bot').onclick = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  $('#t-clear').onclick = async () => {
    if (!confirm('Hapus localStorage, sessionStorage, cookies, Cache Storage & IndexedDB situs ini?')) return;
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
    document.cookie.split(';').forEach((c) => { const n = c.split('=')[0].trim(); if (n) document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`; });
    try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
    try { if (indexedDB.databases) for (const d of await indexedDB.databases()) if (d.name) indexedDB.deleteDatabase(d.name); } catch (e) {}
    showToast('Data situs dihapus');
    if (curView === 'storage') renderStorage();
  };

  // --- 19. SETTINGS ---
  let orientMode = 'auto';
  function applyOrientation(mode) {
    orientMode = mode;
    const eff = mode === 'auto' ? (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait') : mode;
    overlay.classList.remove('portrait', 'landscape');
    overlay.classList.add(eff);
    $('#orient-badge').textContent = mode === 'auto' ? `AUTO (${eff.toUpperCase()})` : eff.toUpperCase();
    $$('.orient-opt').forEach((b) => b.classList.toggle('btn-accent', b.dataset.orient === mode));
    setTimeout(() => { moveIndicator(); updateHl(); }, 60);
  }
  $$('.orient-opt').forEach((b) => { b.onclick = () => { applyOrientation(b.dataset.orient); showToast(`Layout: ${b.dataset.orient.toUpperCase()}`); }; });
  listen(window, 'resize', () => { if (orientMode === 'auto') applyOrientation('auto'); else moveIndicator(); });

  $('#bg-alpha').oninput = (e) => {
    $('#alpha-val').textContent = `${e.target.value}%`;
    host.style.setProperty('--bg-alpha', (e.target.value / 100).toFixed(2));
  };
  $$('.theme-btn').forEach((b) => {
    b.onclick = () => {
      const c = b.dataset.c;
      host.style.setProperty('--accent', c);
      host.style.setProperty('--accent-soft', c + '29');
      host.style.setProperty('--accent-glow', c + '59');
      showToast('Accent color updated');
    };
  });
  $('#anim-style').onchange = (e) => {
    overlay.dataset.anim = e.target.value;
    showToast('Animasi: ' + e.target.selectedOptions[0].textContent);
    // demo singkat: kedip tab aktif
    const v = $('#view-settings');
    v.classList.remove('in'); void v.offsetWidth; v.style.setProperty('--dir', 1); v.classList.add('in');
    setTimeout(() => v.classList.remove('in'), 700 * durMult);
  };
  $('#anim-speed').oninput = (e) => {
    const s = e.target.value / 100;
    durMult = 1 / s;
    host.style.setProperty('--dur', durMult.toFixed(3));
    $('#speed-val').textContent = s.toFixed(1) + 'x';
  };

  // --- 20. INIT ---
  applyOrientation('auto');
  moveIndicator();
  updateNetBadge();
  renderReqHist();
  console.info('Edge DevTools v3 aktif — tab baru: Net, Media, Src');
})();
