/* ESTUDIO QR — motor de escenas v2 (sin dependencias externas).
   Todo lo que se ve es una función del tiempo T de la línea de tiempo; el scroll (o la reproducción
   automática, o el panel) solo mueve T. Lee config.json y se puede controlar desde admin.html. */
(async () => {
  'use strict';
  const { clamp, lerp, ease, evalKeys, normalize, timing, sceneAt } = window.QRM;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const mk = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const R = document.documentElement, QS = new URLSearchParams(location.search), PREVIEW = QS.has('preview');
  const mob = matchMedia('(max-width:800px)').matches, rm = matchMedia('(prefers-reduced-motion:reduce)').matches && !PREVIEW;
  const isV = p => /\.(mp4|webm|mov)$/i.test(p || ''), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const safe = h => (/^\s*javascript:/i.test(h || '') ? '#' : (h || '#'));
  const rgb = h => { h = (h || '#000000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) || 0); };
  if (PREVIEW) R.classList.add('preview');

  // ---------- configuración ----------
  let raw;
  try { raw = await (await fetch('config.json?t=' + Date.now())).json(); } catch (e) { }
  if (!raw || !raw.scenes) {
    if (!PREVIEW) { document.body.insertAdjacentHTML('beforeend', '<p style="padding:20vh 6vw;position:relative;z-index:60">No se pudo leer config.json. Abrí el sitio con iniciar.bat / iniciar.sh</p>'); return; }
    raw = { scenes: [] };
  }
  let cfg, G, S, N, TM, total, SC = [];
  const SZ = { xl: [13, 17], l: [10, 14], m: [7, 10], s: [5, 8] };
  const GLYPH = '█▓▒░01QR<>/\\#';

  // ---------- construcción del DOM ----------
  function tHTML(t) {
    let it = false;
    return String(t || '').split('\n').map(l => '<span class="l">' + l.split(' ').map(w => '<span class="wd">' + [...w].map(ch => {
      if (ch === '*') { it = !it; return ''; }
      const c = `<span class="c">${esc(ch)}</span>`; return it ? `<i>${c}</i>` : c;
    }).join('') + '</span>').join(' ') + '</span>').join('');
  }
  function build(input) {
    cfg = normalize(input); window.QRAudio?.configure(cfg); G = cfg.general; S = cfg.scenes; N = S.length; TM = timing(cfg); total = TM.total;
    ['#bg', '#tb', '#tf'].forEach(s => { $(s).innerHTML = ''; });
    SC = [];
    R.style.setProperty('--gn', rm ? 0 : (G.grain ?? .12));
    $('#brand').textContent = G.brand || ''; $('#hint').textContent = G.hint || '';
    $('#bar').style.display = G.progress === false ? 'none' : ''; $('#cnt').style.display = G.counter === false ? 'none' : '';
    S.forEach((s, i) => {
      const o = { s, t: TM.scenes[i], slices: [], media: [], layers: [], vid: null };
      const b = mk('div', 'w'), m = mk('div', 'm'), v = isV(s.media);
      const n = v ? 1 : Math.max(1, Math.min(s.fragment || 1, mob ? 3 : 6));
      b.style.setProperty('--gr', s.grade ?? G.grade ?? .35);
      if (s.fit === 'contain') m.classList.add('fit');
      for (let k = 0; k < n; k++) {
        const d = mk('div', 'sl'); if (n > 1) d.style.clipPath = `inset(0 ${100 - (k + 1) * 100 / n}% 0 ${k * 100 / n}%)`;
        const e = mk(v ? 'video' : 'img');
        if (s.media) e.dataset.src = s.media;
        if (!k) { if (v) e.addEventListener('loadedmetadata', () => { o.ar = e.videoWidth / e.videoHeight; last.force = true; }); else e.addEventListener('load', () => { o.ar = e.naturalWidth / e.naturalHeight; last.force = true; }); }
        if (v) { e.muted = true; e.loop = s.video.mode === 'loop'; e.playsInline = true; e.preload = s.video.mode === 'scrub' ? 'auto' : 'none'; e.setAttribute('muted', ''); o.vid = e; } else { e.alt = ''; e.decoding = 'async'; }
        d.append(e); m.append(d); o.slices.push(d); o.media.push(e);
      }
      b.append(m, mk('div', 'gr'));
      (s.layers || []).forEach(l => {
        if (!l.src) return;
        const f = mk('figure', 'ly'), c = mk('div', 'ci'), im = mk(isV(l.src) ? 'video' : 'img');
        im.dataset.src = l.src; if (im.tagName === 'VIDEO') { im.muted = im.loop = im.playsInline = true; im.setAttribute('muted', ''); } else { im.alt = l.caption || ''; im.decoding = 'async'; }
        c.append(im); f.append(c); if (l.caption) f.append(mk('figcaption', '', esc(l.caption)));
        f.style.left = (l.x ?? 20) + '%'; f.style.top = (l.y ?? 20) + '%'; f.style.width = Math.min(90, (l.w ?? 30) * (mob ? 1.7 : 1)) + '%';
        c.style.aspectRatio = l.mask === 'circle' ? '1' : l.mask === 'slit' ? '1/3' : l.mask === 'wide' ? '16/9' : '4/5';
        c.style.clipPath = { arch: 'inset(0 round 999px 999px 0 0)', circle: 'circle(50%)' }[l.mask] || 'none';
        b.append(f); o.layers.push({ el: f, l }); o.media.push(im);
      });
      const T = mk('div', 'w'), tx = mk('div', 'tx pos-' + (s.textPos || 'bl'));
      tx.style.setProperty('--fs', SZ[s.size || 'l'][mob ? 1 : 0] + 'vw');
      tx.innerHTML = (s.kicker ? `<div class="k">${esc(s.kicker)}</div>` : '') + `<h2 class="tt">${tHTML(s.title)}</h2>` + (s.text ? `<p class="p">${esc(s.text)}</p>` : '') + (s.ctaText ? `<a class="cta" href="${esc(safe(s.ctaHref))}">${esc(s.ctaText)}</a>` : '');
      const scrim = mk('div', 'scrim pos-' + (s.textPos || 'bl')); scrim.style.opacity = s.scrim ?? 0;
      T.append(scrim, tx);
      const F = mk('div', 'w f'); F.append(tx.cloneNode(true)); $$('a', F).forEach(a => { a.tabIndex = -1; a.setAttribute('aria-hidden', 'true'); });
      $('#bg').append(b); $('#tb').append(T); $('#tf').append(F);
      Object.assign(o, { b, m, T, F, scrimEl: scrim });
      const cb = $$('.c', T), cf = $$('.c', F);
      o.chars = cb.map((c, k) => ({ a: c, b: cf[k], ch: c.textContent, st: -1 }));
      o.meta = [...$$('.k,.p,.cta', T), ...$$('.k,.p,.cta', F)];
      o.pal = { bg: rgb(s.palette.bg), ink: rgb(s.palette.ink), acc: rgb(s.palette.accent) };
      SC.push(o);
    });
    buildNav();
    $('#track').style.height = (total / 100 * innerHeight + innerHeight) + 'px';
    last = { T: -1 };
    load(0); load(1);
  }

  // actualización suave: si la estructura no cambió, no se reconstruye el DOM (sin parpadeos al editar)
  const sig = c => JSON.stringify([c.general && [c.general.nav, c.general.brand, c.general.hint, c.general.progress, c.general.counter], (c.scenes || []).map(s => [s.media, s.fragment, s.fit, s.title, s.kicker, s.text, s.ctaText, s.ctaHref, s.textPos, s.video && s.video.mode, (s.layers || []).map(l => [l.src, l.caption, l.mask])])]);
  let lastSig = '';
  function update(input) {
    const n = normalize(input), sg = sig(n);
    if (sg !== lastSig || !SC.length) { build(input); lastSig = sg; return; }
    cfg = n; window.QRAudio?.configure(cfg); G = cfg.general; S = cfg.scenes; TM = timing(cfg); total = TM.total;
    R.style.setProperty('--gn', rm ? 0 : (G.grain ?? .12));
    SC.forEach((o, i) => {
      const s = S[i]; o.s = s; o.t = TM.scenes[i];
      o.pal = { bg: rgb(s.palette.bg), ink: rgb(s.palette.ink), acc: rgb(s.palette.accent) };
      o.b.style.setProperty('--gr', s.grade ?? G.grade ?? .35); o.scrimEl.style.opacity = s.scrim ?? 0;
      $$('.tx', o.T).concat($$('.tx', o.F)).forEach(t => t.style.setProperty('--fs', SZ[s.size || 'l'][mob ? 1 : 0] + 'vw'));
      o.layers.forEach((L, j) => { const l = (s.layers || []).filter(x => x.src)[j]; if (!l) return; L.l = l; L.el.style.left = (l.x ?? 20) + '%'; L.el.style.top = (l.y ?? 20) + '%'; L.el.style.width = Math.min(90, (l.w ?? 30) * (mob ? 1.7 : 1)) + '%'; });
      if (o.vid) { o.vid.loop = s.video.mode === 'loop'; o.vid.playbackRate = +s.video.rate || 1; }
    });
    $('#track').style.height = (total / 100 * innerHeight + innerHeight) + 'px'; idx = -1; last.force = true;
  }
  // ---------- navegación entre escenas ----------
  function buildNav() {
    const nav = $('#nav'); nav.innerHTML = ''; nav.className = 'nav-' + (G.nav || 'dots');
    if (G.nav === 'none') return;
    S.forEach((s, i) => {
      const b = mk('button', '', `<i></i><span>${esc(s.name || 'Escena ' + (i + 1))}</span>`);
      b.setAttribute('aria-label', `Ir a ${String(i + 1).padStart(2, '0')} — ${s.name || ''}`); b.onclick = () => goto(i);
      nav.append(b);
    });
  }
  const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const tToY = t => t / total * maxScroll();
  const yToT = y => clamp(y / maxScroll(), 0, 1) * total;
  let tween = null;
  function scrollToT(t, dur = 1.3) {
    const y0 = scrollY, y1 = tToY(clamp(t, 0, total));
    if (dur <= 0 || rm) { scrollTo(0, y1); return; }
    tween = { y0, y1, t0: performance.now(), dur: dur * 1000 };
  }
  function goto(i, at = 'hold') {
    i = clamp(i, 0, N - 1); const t = TM.scenes[i];
    const T = at === 'start' ? t.T0 + (i ? (t.te - t.T0) : 0) : typeof at === 'number' ? t.T0 + t.L * at / 100 : t.hold;
    scrollToT(T, Math.min(2.2, .9 + Math.abs(T - curT) / 900));
  }
  window.__goto = i => goto(i);

  // ---------- carga diferida de medios ----------
  const load = i => { (SC[i]?.media || []).forEach(e => { if (e.dataset.src && !e.getAttribute('src')) { e.src = e.dataset.src; if (e.tagName === 'VIDEO') e.load(); } }); };

  // ---------- capa de píxeles (transición QR) ----------
  const PX = { cols: mob ? 9 : 16, rows: mob ? 16 : 9, cells: [] };
  (function () { const g = $('#px'); g.style.gridTemplateColumns = `repeat(${PX.cols},1fr)`; g.style.gridTemplateRows = `repeat(${PX.rows},1fr)`; for (let k = 0; k < PX.cols * PX.rows; k++) { const c = mk('i'); c.dataset.r = Math.random(); g.append(c); PX.cells.push(c); } })();
  let pxOn = false;
  function pixels(p, col) {
    const g = $('#px');
    if (p == null) { if (pxOn) { g.style.display = 'none'; pxOn = false; } return; }
    if (!pxOn) { g.style.display = 'grid'; pxOn = true; }
    g.style.setProperty('--pc', col);
    PX.cells.forEach(c => {
      const r = +c.dataset.r, a = p < .5 ? clamp((p * 2 - r * .6) / .4, 0, 1) : 1 - clamp(((p - .5) * 2 - r * .6) / .4, 0, 1);
      c.style.transform = `scale(${a.toFixed(3)})`;
    });
  }

  // ---------- render de un instante T ----------
  const C = { bg: [0, 0, 0], ink: [0, 0, 0], acc: [0, 0, 0] };
  const O = { x: 0, y: 0, k: {}, p: {}, morph: .4, ry: 0, rx: 0, cz: 7, orb: 0, vis: 0 };
  let last = { T: -1 }, curT = 0, introK = PREVIEW ? 1 : 0, idx = -1;
  const XP = { left: -1, center: 0, right: 1 }, SHK = { knot: 0, crystal: 1, sphere: 2, qrcube: 3 };
  const coverR = r => { const a = Math.abs(r) * Math.PI / 180, ar = innerWidth / innerHeight; return Math.cos(a) + Math.max(ar, 1 / ar) * Math.sin(a); };

  function camStyle(o, u) {
    const k = evalKeys(o.s.cam.keys, u * 100), fit = o.s.fit === 'contain';
    const s = Math.max(fit ? .2 : 1, k.s) * (k.r ? coverR(k.r) : 1);
    // el foco (x,y) es un punto de la IMAGEN: se convierte a coordenadas de pantalla según el recorte (cover)
    let ex = k.x, ey = k.y; const ia = o.ar || 16 / 9, va = innerWidth / innerHeight;
    if (!fit) {
      // Pantallas más angostas que la imagen (celular vertical): el recorte se corre hacia el foco de la cámara
      // para que el sujeto no quede afuera. Si la pantalla tiene la misma forma que la imagen, no cambia nada.
      let px = .5, py = .5;
      if (va < ia) { const r = ia / va; if (r > 1.02) px = clamp((.5 - k.x * r) / (1 - r), 0, 1); ex = px * (1 - r) + k.x * r; }
      else { const r = va / ia; if (r > 1.02) py = clamp((.5 - k.y * r) / (1 - r), 0, 1); ey = py * (1 - r) + k.y * r; }
      const pos = (px * 100).toFixed(1) + '% ' + (py * 100).toFixed(1) + '%';
      if (o.op !== pos) { o.op = pos; o.m.querySelectorAll('.sl img,.sl video').forEach(e => { e.style.objectPosition = pos; }); }
    }
    let xp = -(ex - .5) * s * 100, yp = -(ey - .5) * s * 100;
    if (!fit) { const lim = (s - 1) * 50; xp = clamp(xp, -lim, lim); yp = clamp(yp, -lim, lim); }
    o.m.style.transform = `translate3d(${xp.toFixed(3)}%,${yp.toFixed(3)}%,0) rotate(${(k.r || 0).toFixed(3)}deg) scale(${s.toFixed(4)})`;
    return k;
  }
  // estilo del envoltorio de fondo según la transición: dir = 'in' (entra) | 'out' (sale)
  function transFx(type, dir, p, s, k) {
    const e = ease(s.trans.ease || 'inOut', p), fx = { op: 1, clip: 'none', tf: '', filter: 'none' }, d = s.trans.dir || 'left';
    const IN = dir === 'in';
    switch (type) {
      case 'fade': if (IN) fx.op = e; break;
      case 'iris': if (IN) fx.clip = `circle(${(e * 78).toFixed(2)}% at ${(k.x * 100).toFixed(1)}% ${(k.y * 100).toFixed(1)}%)`; else fx.tf = `scale(${1 + .06 * e})`; break;
      case 'wipe': if (IN) { const v = ((1 - e) * 100).toFixed(2); fx.clip = { left: `inset(0 0 0 ${v}%)`, right: `inset(0 ${v}% 0 0)`, up: `inset(${v}% 0 0 0)`, down: `inset(0 0 ${v}% 0)` }[d]; } else fx.tf = `translate3d(${{ left: -8, right: 8, up: 0, down: 0 }[d] * e}%,${{ up: -8, down: 8, left: 0, right: 0 }[d] * e}%,0)`; break;
      case 'slide': { const v = IN ? (1 - e) * 100 : -30 * e; fx.tf = { left: `translate3d(${v}%,0,0)`, right: `translate3d(${-v}%,0,0)`, up: `translate3d(0,${v}%,0)`, down: `translate3d(0,${-v}%,0)` }[d]; break; }
      case 'zoom': if (IN) { fx.op = clamp(e * 1.6, 0, 1); fx.tf = `scale(${.72 + .28 * e})`; } else { fx.op = 1 - clamp(e * 1.3, 0, 1); fx.tf = `scale(${1 + .9 * e})`; if (!mob) fx.filter = `blur(${(e * 10).toFixed(1)}px)`; } break;
      case 'blur': if (IN) { fx.op = e; fx.filter = `blur(${((1 - e) * 26).toFixed(1)}px)`; } else { fx.op = 1 - e * .6; fx.filter = `blur(${(e * 26).toFixed(1)}px)`; } break;
      case 'pixel': fx.op = IN ? (p >= .5 ? 1 : 0) : (p < .5 ? 1 : 0); break;
      case 'cut': fx.op = IN ? (p >= .5 ? 1 : 0) : (p < .5 ? 1 : 0); break;
      default: // mask (original)
        if (IN) { fx.op = clamp(p * 2, 0, 1); fx.clip = `inset(${(16 * (1 - e)).toFixed(2)}% ${(12 * (1 - e)).toFixed(2)}%)`; }
        else { fx.op = 1 - ease('in', p) * .85; fx.tf = `scale(${1 + .1 * e})`; }
    }
    return fx;
  }
  function trackK(tr, tt) { // devuelve [entrada 0..1, salida 0..1]
    const a = clamp((tt - tr.from) / Math.max(.01, tr.rin), 0, 1), b = clamp((tt - (tr.to - tr.rout)) / Math.max(.01, tr.rout), 0, 1);
    return [tt < tr.from ? 0 : a, tt > tr.to ? 1 : b];
  }
  function textFx(o, kin, kout, anim) {
    const n = o.chars.length || 1, st = .55;
    o.chars.forEach((c, j) => {
      const li = clamp(kin * (1 + st) - (j / n) * st, 0, 1), lo = clamp(kout * (1 + st * .6) - (j / n) * st * .6, 0, 1);
      let tf = '', op = 1, fl = '';
      switch (anim) {
        case 'fade': op = ease('out', li) * (1 - ease('in', lo)); break;
        case 'blur': op = ease('out', li) * (1 - lo); fl = `blur(${((1 - li) * 14 + lo * 14).toFixed(1)}px)`; break;
        case 'scale': op = li > 0 ? 1 - lo : 0; tf = `scale(${(ease('back', li) * (1 - ease('in', lo))).toFixed(3)})`; break;
        case 'none': op = kin > 0 && kout < 1 ? 1 : 0; break;
        case 'scramble': op = li > 0 && lo < 1 ? 1 : 0; {
          const shown = li >= 1 && lo <= 0 ? c.ch : (li > 0 ? (li > .85 && lo < .15 ? c.ch : GLYPH[(j * 7 + Math.floor((li + lo) * 20)) % GLYPH.length]) : c.ch);
          if (c.st !== shown) { c.a.textContent = shown; c.b.textContent = shown; c.st = shown; }
        } break;
        default: tf = `translate3d(0,${(115 * (1 - ease('out', li)) - 115 * ease('in', lo)).toFixed(2)}%,0)`;
      }
      if (anim !== 'scramble' && c.st !== -1) { c.a.textContent = c.ch; c.b.textContent = c.ch; c.st = -1; }
      for (const el of [c.a, c.b]) { el.style.transform = tf; el.style.opacity = op; el.style.filter = fl; }
    });
  }
  function render(T) {
    const T_ = clamp(T, 0, total);
    // escena "actual" (para HUD, video, nav)
    const k = sceneAt(TM, T_);
    SC.forEach((o, i) => {
      const t = o.t, s = o.s, next = SC[i + 1];
      const vis = (i === 0 ? T_ >= -1 : T_ >= t.T0) && (i === N - 1 ? true : T_ <= t.end);
      if (!vis) { if (o.on !== false) { o.b.style.visibility = o.T.style.visibility = o.F.style.visibility = 'hidden'; o.on = false; } return; }
      if (o.on !== true) { o.b.style.visibility = o.T.style.visibility = o.F.style.visibility = ''; o.on = true; }
      const u = clamp((T_ - t.T0) / t.L, 0, 1), tt = u * 100;
      const kc = camStyle(o, u);
      // transición de entrada (desde la anterior) y de salida (hacia la siguiente)
      let fxIn = null, fxOut = null, pIn = 1;
      if (i > 0) { const ov = SC[i - 1].t.overlap; pIn = ov > 0 ? clamp((T_ - t.T0) / ov, 0, 1) : 1; if (pIn < 1) fxIn = transFx(s.trans.type, 'in', pIn, s, kc); }
      if (next && T_ > next.t.T0) { const ov = t.overlap, p = ov > 0 ? clamp((T_ - next.t.T0) / ov, 0, 1) : 1; fxOut = transFx(next.s.trans.type, 'out', p, next.s, evalKeys(next.s.cam.keys, 0)); o.pOut = p; } else o.pOut = 0;
      const fx = fxIn || fxOut || { op: 1, clip: 'none', tf: '', filter: 'none' };
      if (fxIn && fxOut) { fx.op = fxIn.op * fxOut.op; }
      o.b.style.opacity = fx.op; o.b.style.clipPath = fx.clip; o.b.style.transform = fx.tf; o.b.style.filter = fx.filter;
      const txtOp = (i > 0 && pIn < 1 ? clamp((pIn - .42) * 2.6, 0, 1) : 1) * (1 - clamp(o.pOut * 2.2, 0, 1)); // relevo: sale uno, después entra el otro
      o.T.style.opacity = o.F.style.opacity = txtOp;
      // pistas de texto
      const tr = s.tracks;
      let [ti, to] = trackK(tr.title, tt); if (i === 0) ti = introK;
      textFx(o, ti, to, rm ? 'fade' : (s.textAnim || 'rise'));
      const [mi, mo] = trackK(tr.meta, tt), mk_ = ease('out', mi) * (1 - ease('in', mo));
      o.meta.forEach(e => { e.style.opacity = mk_ * (i === 0 ? introK : 1); e.style.transform = `translate3d(0,${((1 - mk_) * 24).toFixed(1)}px,0)`; });
      // capas flotantes: pista + parallax por profundidad
      const PAR = mob ? .5 : 1;
      o.layers.forEach(({ el, l }) => {
        const [a, b] = trackK(l, tt), d = +l.depth || 0, v = ease('out', a) * (1 - ease('in', b));
        let tf = `translate3d(${lerp(-d * 5, d * 5, u) * PAR}%,${lerp(d * 30, -d * 30, u) * PAR}%,0) scale(${lerp(1 + d * .05, 1 + d * .16, u)}) rotate(${l.rot || 0}deg)`;
        if (l.anim === 'rise') tf += ` translate3d(0,${(1 - v) * 18}%,0)`; else if (l.anim === 'scale') tf += ` scale(${.6 + .4 * v})`;
        el.style.transform = tf; el.style.opacity = l.anim === 'none' ? (a > 0 && b < 1 ? 1 : 0) : v;
      });
      // fragmentación en tiras
      if (o.slices.length > 1) {
        const ph = t.ph, ud = clamp((u - ph.e) / ph.d, 0, 1), uh = clamp((u - ph.e - ph.d) / Math.max(ph.h, .001), 0, 1), ux = clamp((u - 1 + ph.x) / Math.max(ph.x, .001), 0, 1);
        o.slices.forEach((d, j, arr) => {
          const dir = j % 2 ? 1 : -1, ay = dir * (9 + j * 3) * PAR, az = (j - (arr.length - 1) / 2) * (mob ? 60 : 150);
          const f = ease('inOut', ud) * (1 - ease('sine', uh) * .8) + ease('in', ux) * 2;
          d.style.transform = `translate3d(0,${(ay * f).toFixed(2)}%,${(az * f).toFixed(1)}px)`;
        });
      }
      // video atado al scroll
      if (o.vid && s.video.mode === 'scrub' && o.vid.readyState >= 1 && o.vid.duration) {
        const st = +s.video.start || 0, en = +s.video.end || o.vid.duration, ct = st + (en - st) * u;
        if (Math.abs(o.vid.currentTime - ct) > .033) o.vid.currentTime = ct;
      }
    });
    // pixel overlay (transición QR)
    let px = null;
    for (let i = 1; i < N; i++) { const t = SC[i].t, ov = SC[i - 1].t.overlap; if (SC[i].s.trans.type === 'pixel' && ov > 0 && T_ > t.T0 && T_ < t.T0 + ov) { const c = SC[i].pal.bg; px = [(T_ - t.T0) / ov, `rgb(${c})`]; } }
    pixels(px ? px[0] : null, px ? px[1] : '');
    // paleta
    const sc = SC[k], prev = SC[k - 1];
    const pc = prev ? clamp((T_ - sc.t.T0) / Math.max(1, sc.t.te - sc.t.T0), 0, 1) : 1, ec = ease('sine', pc);
    ['bg', 'ink', 'acc'].forEach(n => { for (let j = 0; j < 3; j++) C[n][j] = prev ? lerp(prev.pal[n][j], sc.pal[n][j], ec) : sc.pal[n][j]; });
    R.style.setProperty('--bg', `rgb(${C.bg.map(v => v | 0).join(' ')})`); R.style.setProperty('--ink', `rgb(${C.ink.map(v => v | 0).join(' ')})`); R.style.setProperty('--acc', `rgb(${C.acc.map(v => v | 0).join(' ')})`);
    // objeto 3D
    objState(T_, k);
    // HUD
    $('#bar').style.transform = `scaleX(${(T_ / total).toFixed(4)})`; $('#hint').style.opacity = T_ > total * .01 ? 0 : 1;
    if (k !== idx) {
      idx = k; $('#cnt').textContent = `${String(k + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')} — ${S[k].name || ''}`;
      load(k); load(k + 1); if (k > 0) load(k - 1);
      $$('#nav button').forEach((b, j) => b.classList.toggle('on', j === k));
      SC.forEach((o, j) => { if (!o.vid || o.s.video.mode === 'scrub') return; if (j === k || (j === k + 1 && T_ > o.t.T0)) { o.vid.playbackRate = +o.s.video.rate || 1; if (o.s.video.mode === 'once' && o.vid.ended) return; if (o.vid.currentTime < (+o.s.video.start || 0)) o.vid.currentTime = +o.s.video.start || 0; o.vid.play().catch(() => { }); } else o.vid.pause(); });
    }
  }
  function objState(T, k) {
    const sc = SC[k], t = sc.t, o = sc.s.obj || {}, prev = SC[k - 1];
    const tgt = st => { const ob = st.s.obj || {}, r = { x: (XP[ob.pos || 'center'] || 0) * (mob ? .4 : 1.9), y: mob ? .8 : 0, k: {}, p: {}, morph: ob.morph ?? .5 };
      if (ob.on) { const key = ob.shape === 'custom' ? (ob.model ? 'm:' + ob.model : null) : ob.shape; if (key) { r.k[key] = (ob.size ?? 1) * (mob ? .7 : 1); r.p[key] = ob; } } return r; };
    const a = prev ? tgt(prev) : tgt(sc), b = tgt(sc), p = prev ? ease('inOut', clamp((T - t.T0) / Math.max(1, t.te - t.T0), 0, 1)) : 1;
    const u = clamp((T - t.T0) / t.L, 0, 1), tt = u * 100, [oi, oo] = trackK(sc.s.tracks.obj, tt), vis = o.on ? ease('inOut', oi) * (1 - ease('inOut', oo)) : 1;
    O.x = lerp(a.x, b.x, p); O.y = lerp(a.y, b.y, p);
    const keys = new Set([...Object.keys(a.k), ...Object.keys(b.k)]); O.k = {}; O.p = Object.assign({}, a.p, b.p);
    keys.forEach(key => { O.k[key] = lerp(a.k[key] || 0, (b.k[key] || 0) * (o.on ? vis : 1), p); });
    // precarga del modelo de la escena siguiente
    const nx = SC[k + 1]; if (nx && nx.s.obj && nx.s.obj.on && nx.s.obj.shape === 'custom' && nx.s.obj.model) O.pre = nx.s.obj.model;
    const ud = clamp((u - t.ph.e) / Math.max(.001, t.ph.d), 0, 1), uh = clamp((u - t.ph.e - t.ph.d) / Math.max(.001, t.ph.h), 0, 1);
    O.morph = lerp(a.morph, b.morph, p) * (1 + .7 * Math.sin(Math.PI * ease('sine', ud)) * (1 - uh)) + .15 * ease('sine', ud) * (1 - uh);
    O.ry = T / total * Math.PI * 3; O.rx = T / total * .6;
    const kc = evalKeys(sc.s.cam.keys, tt); O.cz = 7.4 - clamp(kc.s - 1, 0, 2) * 1.2;
    O.orb = SC.slice(0, k + 1).reduce((acc, s2, j) => acc + (s2.s.motion === 'orbit' ? (j < k ? .9 : .9 * u) : 0), 0);
  }

  // ---------- bucle: scroll → T suavizado ----------
  let play = null, lastIn = 0, pt = performance.now(), loopRange = null, lastMsg = 0, snapTimer = 0, userScroll = false;
  function frame(now) {
    const dt = Math.min(.1, (now - pt) / 1000); pt = now;
    if (tween) {
      const q = clamp((now - tween.t0) / tween.dur, 0, 1); scrollTo(0, lerp(tween.y0, tween.y1, ease('inOut', q)));
      if (q >= 1) tween = null;
    }
    // reproducción (autoplay del sitio o "play" del panel)
    const auto = G.autoplay && G.autoplay.on && !PREVIEW && !rm && now - lastIn > (G.autoplay.resume || 4) * 1000;
    const sp = play ? play.speed : auto ? G.autoplay.speed : 0;
    if (sp && !tween) {
      let t = yToT(scrollY) + sp * 100 * dt;
      const [a, b] = loopRange || [0, total];
      if (t >= b) t = (play ? play.loop : G.autoplay.loop) ? a : b;
      if (t >= total && !play) { if (G.autoplay.loop) t = 0; }
      scrollTo(0, tToY(t)); if (t >= b && !(play ? play.loop : G.autoplay.loop)) play = null;
    }
    const target = yToT(scrollY), smooth = !PREVIEW && G.smooth !== false && !rm;
    const k = smooth ? 1 - Math.pow(1 - clamp(G.smoothness || .09, .02, .5), dt * 60) : 1;
    curT += (target - curT) * k; if (Math.abs(target - curT) < .002) curT = target;
    if (Math.abs(curT - last.T) > 1e-4 || last.force) { render(curT); last = { T: curT }; }
    const audioDuration = Math.max(1, +G.duration || total / (100 * (G.autoplay.speed || .35)));
    const audioPlaying = document.hidden ? false : PREVIEW ? !!play : window.QRIntro?.active ? !!window.QRIntro.playing : !!auto;
    window.QRAudio?.tick(curT / total * audioDuration, audioPlaying, PREVIEW && play ? play.speed * 100 / total * audioDuration : 1);
    if (PREVIEW && parent !== window && now - lastMsg > 60) { lastMsg = now; parent.postMessage({ type: 'qr:time', t: curT, i: idx, total, playing: !!play }, '*'); }
    if (!introDone && !PREVIEW) { introK = clamp((now - introStart) / 1900, 0, 1); last.force = true; if (introK >= 1) introDone = true; }
    requestAnimationFrame(frame);
  }
  let introStart = 0, introDone = PREVIEW;
  addEventListener('resize', () => { $('#track').style.height = (total / 100 * innerHeight + innerHeight) + 'px'; last.force = true; });
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => addEventListener(ev, () => { lastIn = performance.now(); tween = null; userScroll = true; }, { passive: true }));
  addEventListener('scroll', () => {
    if (!G || !G.snap || PREVIEW || tween || play || (G.autoplay && G.autoplay.on && performance.now() - lastIn > (G.autoplay.resume || 4) * 1000)) return;
    clearTimeout(snapTimer); snapTimer = setTimeout(() => {
      const T = yToT(scrollY), k = sceneAt(TM, T), cand = [TM.scenes[k], TM.scenes[k + 1]].filter(Boolean);
      const t = TM.scenes[k]; if (T > t.td && T < t.th) return; // ya está en la pausa
      const best = cand.reduce((a, b) => Math.abs(b.hold - T) < Math.abs(a.hold - T) ? b : a);
      if (Math.abs(best.hold - T) < 160) scrollToT(best.hold, .9);
    }, 220);
  }, { passive: true });
  addEventListener('keydown', e => {
    if (!G || G.keys === false || e.target.closest('input,textarea,select')) return;
    const nextK = ['ArrowDown', 'PageDown', 'ArrowRight'], prevK = ['ArrowUp', 'PageUp', 'ArrowLeft'];
    if (nextK.includes(e.key)) { e.preventDefault(); goto(Math.min(N - 1, sceneAt(TM, yToT(scrollY)) + (yToT(scrollY) >= TM.scenes[idx].hold - 5 ? 1 : 0))); }
    else if (prevK.includes(e.key)) { e.preventDefault(); const T = yToT(scrollY), j = sceneAt(TM, T); goto(T > TM.scenes[j].hold + 5 ? j : j - 1); }
    else if (e.key === 'Home') { e.preventDefault(); scrollToT(0, 1.4); } else if (e.key === 'End') { e.preventDefault(); scrollToT(total, 1.6); }
  });

  // ---------- API de vista previa (la usa el panel) ----------
  addEventListener('message', ev => {
    const m = ev.data || {}; if (!m.type || !String(m.type).startsWith('qr:')) return;
    if (m.type === 'qr:config') { const keep = curT; update(m.cfg); curT = clamp(keep, 0, total); scrollTo(0, tToY(curT)); last.force = true; post('qr:ready'); }
    if (m.type === 'qr:seek') { tween = null; curT = clamp(+m.t || 0, 0, total); scrollTo(0, tToY(curT)); last.force = true; }
    if (m.type === 'qr:goto') { const t = TM.scenes[clamp(m.i, 0, N - 1)]; const T = m.at === 'start' ? t.T0 : m.at === 'end' ? t.end : typeof m.at === 'number' ? t.T0 + t.L * m.at / 100 : t.hold; tween = null; curT = T; scrollTo(0, tToY(T)); last.force = true; }
    if (m.type === 'qr:play') { play = { speed: +m.speed || .35, loop: !!m.loop }; loopRange = m.range || null; }
    if (m.type === 'qr:pause') { play = null; }
    if (m.type === 'qr:guides') R.classList.toggle('guides', !!m.on);
    if (m.type === 'qr:safe') R.classList.toggle('safe', !!m.on);
  });
  const post = type => { if (parent !== window) parent.postMessage({ type, total, timing: TM.scenes.map(s => ({ T0: s.T0, L: s.L, end: s.end, te: s.te, td: s.td, th: s.th, hold: s.hold, overlap: s.overlap })) }, '*'); };

  // ---------- 3D (WebGL propio, sin librerías) ----------
  function init3D() {
    const cv = mk('canvas'); $('#cv').append(cv);
    const gl = cv.getContext('webgl', { alpha: true, antialias: !mob, premultipliedAlpha: false }); if (!gl) return;
    const DPR = Math.min(devicePixelRatio || 1, mob ? 1.5 : 2);
    const size = () => { cv.width = innerWidth * DPR; cv.height = innerHeight * DPR; gl.viewport(0, 0, cv.width, cv.height); };
    size(); addEventListener('resize', size);
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(x)); return x; };
    const prog = (v, f) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.warn('link', gl.getProgramInfoLog(p)); return p; };
    // matrices 4x4 (column-major)
    const M = {
      persp(f, a, n, fr) { const t = 1 / Math.tan(f / 2); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, 2 * fr * n / (n - fr), 0]; },
      mul(a, b) { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; },
      look(e, c) { let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; const nz = Math.hypot(...z); z = z.map(v => v / nz); let x = [z[2], 0, -z[0]]; const nx = Math.hypot(...x) || 1; x = x.map(v => v / nx); const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]; return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]; },
      model(tx, ty, rx, ry, s) { const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry); return [cy * s, sx * sy * s, -cx * sy * s, 0, 0, cx * s, sx * s, 0, sy * s, -sx * cy * s, cx * cy * s, 0, tx, ty, 0, 1]; }
    };
    // geometrías
    function knot(tub, rad) { const P = 2, Q = 3, R = 1, r = .32, pos = [], nor = []; const cc = u => { const q = Q / P * u, cs = Math.cos(q); return [R * (2 + cs) * .5 * Math.cos(u), R * (2 + cs) * .5 * Math.sin(u), R * Math.sin(q) * .5]; };
      const ring = []; for (let i = 0; i <= tub; i++) { const u = i / tub * P * Math.PI * 2, p1 = cc(u), p2 = cc(u + .01), T = p2.map((v, k) => v - p1[k]), Nn = p2.map((v, k) => v + p1[k]); let B = [T[1] * Nn[2] - T[2] * Nn[1], T[2] * Nn[0] - T[0] * Nn[2], T[0] * Nn[1] - T[1] * Nn[0]]; let NN = [B[1] * T[2] - B[2] * T[1], B[2] * T[0] - B[0] * T[2], B[0] * T[1] - B[1] * T[0]]; const lb = Math.hypot(...B), ln = Math.hypot(...NN); B = B.map(v => v / lb); NN = NN.map(v => v / ln);
        const row = []; for (let j = 0; j <= rad; j++) { const v = j / rad * Math.PI * 2, cx = -r * Math.cos(v), cy = r * Math.sin(v); const vx = [p1[0] + cx * NN[0] + cy * B[0], p1[1] + cx * NN[1] + cy * B[1], p1[2] + cx * NN[2] + cy * B[2]]; const n = vx.map((w, k) => w - p1[k]); const l = Math.hypot(...n); row.push([vx, n.map(w => w / l)]); } ring.push(row); }
      for (let i = 0; i < tub; i++) for (let j = 0; j < rad; j++) { const a = ring[i][j], b = ring[i + 1][j], c = ring[i + 1][j + 1], d = ring[i][j + 1]; [a, b, d, b, c, d].forEach(q => { pos.push(...q[0]); nor.push(...q[1]); }); }
      return { pos, nor }; }
    function ico() { const t = (1 + Math.sqrt(5)) / 2; let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v => { const l = Math.hypot(...v); return v.map(w => w / l); });
      let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]].map(f => f.map(i => V[i]));
      const mid = (a, b) => { const m = a.map((v, k) => (v + b[k]) / 2), l = Math.hypot(...m); return m.map(v => v / l); };
      F = F.flatMap(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
      const pos = [], nor = []; F.forEach(f => { const n = [0, 1, 2].map(k => (f[0][k] + f[1][k] + f[2][k]) / 3), l = Math.hypot(...n); f.forEach(v => { pos.push(...v.map(w => w * 1.4)); nor.push(...n.map(w => w / l)); }); }); return { pos, nor }; }
    function sphere(a, b) { const pos = [], nor = [], P = (i, j) => { const th = i / a * Math.PI * 2, ph = j / b * Math.PI; return [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)]; };
      for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) { const p = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];[p[0], p[1], p[3], p[1], p[2], p[3]].forEach(v => { pos.push(...v.map(w => w * 1.35)); nor.push(...v); }); } return { pos, nor }; }
    function qrcube() { const n = 7, pos = [], nor = [], cen = [], dir = [], col = [], h = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5; return s - Math.floor(s); };
      const face = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) { if (x && y && z && x < n - 1 && y < n - 1 && z < n - 1) continue;
        const c = [(x - (n - 1) / 2) * .36, (y - (n - 1) / 2) * .36, (z - (n - 1) / 2) * .36], r = h(x, y, z), d = [h(y, z, x) - .5, h(z, x, y) - .5, h(x + 3, y, z) - .5], k = r < .45 ? .06 : .92, s = .165;
        face.forEach(f => { const u = [f[1], f[2], f[0]], v = [f[2], f[0], f[1]]; const q = (a, b) => [0, 1, 2].map(i => c[i] + (f[i] + a * u[i] + b * v[i]) * s);
          [q(-1, -1), q(1, -1), q(1, 1), q(-1, -1), q(1, 1), q(-1, 1)].forEach(p => { pos.push(...p); nor.push(...f); cen.push(...c); dir.push(...d); col.push(k); }); }); }
      return { pos, nor, cen, dir, col }; }
    const glassV = 'attribute vec3 p,n;uniform mat4 uP,uV,uM;uniform mediump float uT;uniform float uMo;varying vec3 vN,vV;void main(){vec3 q=p;float w=sin(q.y*3.+uT)*.5+sin(q.x*4.-uT*.8)*.5;q+=n*w*uMo*.35;vec4 mv=uV*uM*vec4(q,1.);vN=normalize((uV*uM*vec4(n,0.)).xyz);vV=-mv.xyz;gl_Position=uP*mv;}';
    const glassF = 'precision mediump float;uniform vec3 uA,uB;uniform float uT,uAl;varying vec3 vN,vV;void main(){vec3 n=normalize(vN),v=normalize(vV);float f=pow(1.-abs(dot(n,v)),2.2);float b=.5+.5*sin(n.y*7.+n.x*5.+uT*.6);vec3 c=mix(uB*.05,uA,f)+uA*b*.14*(1.-f)+vec3(.9,.95,1.)*pow(f,6.)*.6;gl_FragColor=vec4(c,(.5+.5*f)*uAl);}';
    const cubeV = 'attribute vec3 p,n,c,d;attribute float k;uniform mat4 uP,uV,uM;uniform float uMo,uT;varying vec3 vN,vV;varying float vK;void main(){float e=uMo*uMo;vec3 q=p+c*e*.9+d*e*3.2+vec3(0.,sin(uT+c.x*3.)*.04*e,0.);vec4 mv=uV*uM*vec4(q,1.);vN=normalize((uV*uM*vec4(n,0.)).xyz);vV=-mv.xyz;vK=k;gl_Position=uP*mv;}';
    const cubeF = 'precision mediump float;uniform vec3 uA;uniform float uAl;varying vec3 vN,vV;varying float vK;void main(){vec3 n=normalize(vN),v=normalize(vV);float l=.35+.65*max(dot(n,normalize(vec3(-.4,.8,.6))),0.);float f=pow(1.-abs(dot(n,v)),3.);vec3 c=vec3(vK)*l+uA*f*.5;gl_FragColor=vec4(c,uAl);}';
    const pG = prog(glassV, glassF), pC = prog(cubeV, cubeF);
    const buf = (p, data, name, sz) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); return { b, loc: gl.getAttribLocation(p, name), sz }; };
    const mesh = (p, g) => ({ p, n: g.pos.length / 3, at: [buf(p, g.pos, 'p', 3), buf(p, g.nor, 'n', 3), ...(g.cen ? [buf(p, g.cen, 'c', 3), buf(p, g.dir, 'd', 3), buf(p, g.col, 'k', 1)] : [])] });
    const MS = { knot: mesh(pG, knot(mob ? 120 : 220, mob ? 16 : 28)), crystal: mesh(pG, ico()), sphere: mesh(pG, sphere(mob ? 40 : 72, mob ? 28 : 48)), qrcube: mesh(pC, qrcube()) };
    // ----- modelos propios (.glb / .obj) -----
    const modelV = 'attribute vec3 p,n,c;attribute vec2 t;uniform mat4 uP,uV,uM;uniform mediump float uT;uniform float uMo;varying vec3 vN,vV,vC;varying vec2 vT;void main(){vec3 q=p;float w=sin(q.y*3.+uT)*.5+sin(q.x*4.-uT*.8)*.5;q+=n*w*uMo*.18;vec4 mv=uV*uM*vec4(q,1.);vN=normalize((uV*uM*vec4(n,0.)).xyz);vV=-mv.xyz;vC=c;vT=t;gl_Position=uP*mv;}';
    const modelF = 'precision mediump float;uniform sampler2D uTx;uniform float uHT,uSo,uAl;uniform vec3 uA;varying vec3 vN,vV,vC;varying vec2 vT;void main(){vec3 n=normalize(vN),v=normalize(vV);if(dot(n,v)<0.)n=-n;vec3 b=mix(vC,uA,uSo);if(uHT>.5)b*=texture2D(uTx,vT).rgb;float l=.28+.62*max(dot(n,normalize(vec3(-.4,.8,.6))),0.)+.18*max(dot(n,normalize(vec3(.6,-.2,.5))),0.);float f=pow(1.-max(dot(n,v),0.),3.);gl_FragColor=vec4(b*l+uA*f*.45,uAl);}';
    const pM = prog(modelV, modelF), MOD = {};
    const getModel = url => {
      if (MOD[url]) return MOD[url].m; if (!window.QR3D) return null;
      MOD[url] = { m: null }; QR3D.load(url).then(r => {
        MOD[url].m = r.groups.map(g => { let tex = null; if (g.tex) { tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
          return { n: g.pos.length / 3, tex, M: { p: pM, at: [buf(pM, g.pos, 'p', 3), buf(pM, g.nor, 'n', 3), buf(pM, g.col, 'c', 3), buf(pM, g.uv, 't', 2)] }, G: { p: pG, at: [buf(pG, g.pos, 'p', 3), buf(pG, g.nor, 'n', 3)] } }; });
      }).catch(e => { console.warn('Modelo 3D:', url, e.message); MOD[url].err = e.message; });
      return null;
    };
    const cnt = Math.round((mob ? 160 : 520) * (G.particles ?? .6)), pp = []; for (let i = 0; i < cnt; i++) pp.push((Math.random() - .5) * 18, (Math.random() - .5) * 11, (Math.random() - .5) * 9 - 1);
    const pP = prog('attribute vec3 p;uniform mat4 uP,uV,uM;uniform float uS;void main(){vec4 mv=uV*uM*vec4(p,1.);gl_Position=uP*mv;gl_PointSize=uS/-mv.z;}', 'precision mediump float;uniform vec3 uA;void main(){vec2 d=gl_PointCoord-.5;float a=smoothstep(.5,.1,length(d));gl_FragColor=vec4(uA,a*.75);}');
    const PB = buf(pP, pp, 'p', 3);
    const mouse = { x: 0, y: 0 }; if (!mob) addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; });
    const bind = m => m.at.forEach(a => { if (a.loc < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, a.b); gl.enableVertexAttribArray(a.loc); gl.vertexAttribPointer(a.loc, a.sz, gl.FLOAT, false, 0, 0); });
    const unbind = m => m.at.forEach(a => { if (a.loc >= 0) gl.disableVertexAttribArray(a.loc); });
    const U = (p, n) => gl.getUniformLocation(p, n);
    (function loop(t) {
      requestAnimationFrame(loop); t /= 1000;
      const any = Object.values(O.k).some(v => v > .01) || cnt;
      if (O.pre) { getModel(O.pre); O.pre = null; }
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); if (!any) return;
      const P = M.persp(40 * Math.PI / 180, innerWidth / innerHeight, .1, 60), V = M.look([Math.sin(O.orb) * 2.6, 0, O.cz], [0, 0, 0]);
      const A = C.acc.map(v => v / 255), B = C.ink.map(v => v / 255), tt = rm ? 0 : t;
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const setU = (pr, Mm, s) => { gl.useProgram(pr); gl.uniformMatrix4fv(U(pr, 'uP'), false, P); gl.uniformMatrix4fv(U(pr, 'uV'), false, V); gl.uniformMatrix4fv(U(pr, 'uM'), false, Mm);
        gl.uniform1f(U(pr, 'uT'), tt); gl.uniform1f(U(pr, 'uMo'), rm ? 0 : O.morph); gl.uniform3fv(U(pr, 'uA'), A); gl.uniform1f(U(pr, 'uAl'), clamp(s * 1.5, 0, 1)); };
      Object.entries(O.k).forEach(([key, s]) => { if (s < .01) return;
        const ob = O.p[key] || {}, D = Math.PI / 180, fol = ob.follow !== false, spin = (+ob.spin || 0) * tt;
        const Mm = M.model(O.x, O.y, (fol ? O.rx : 0) + (+ob.rx || 0) * D + mouse.y * .25, (fol ? O.ry : 0) + (+ob.ry || 0) * D + spin + mouse.x * .35, s);
        if (key.startsWith('m:')) {
          const gs = getModel(key.slice(2)); if (!gs) return;
          const glass = ob.mat === 'glass';
          gs.forEach(g => { const m = glass ? g.G : g.M; setU(m.p, Mm, s); bind(m);
            if (glass) { gl.uniform3fv(U(pG, 'uB'), B); gl.disable(gl.DEPTH_TEST); }
            else { gl.enable(gl.DEPTH_TEST); gl.uniform1f(U(pM, 'uSo'), ob.mat === 'solid' ? 1 : 0); gl.uniform1f(U(pM, 'uHT'), g.tex && ob.mat !== 'solid' ? 1 : 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.tex); gl.uniform1i(U(pM, 'uTx'), 0); }
            gl.drawArrays(gl.TRIANGLES, 0, g.n); unbind(m); });
          return;
        }
        const m = MS[key]; if (!m) return;
        setU(m.p, Mm, s); bind(m);
        if (m.p === pG) { gl.uniform3fv(U(m.p, 'uB'), B); gl.disable(gl.DEPTH_TEST); } else gl.enable(gl.DEPTH_TEST);
        gl.drawArrays(gl.TRIANGLES, 0, m.n); unbind(m); });
      if (cnt) { gl.disable(gl.DEPTH_TEST); gl.useProgram(pP); bind({ at: [PB] });
        gl.uniformMatrix4fv(U(pP, 'uP'), false, P); gl.uniformMatrix4fv(U(pP, 'uV'), false, V); gl.uniformMatrix4fv(U(pP, 'uM'), false, M.model(0, O.ry * .12, 0, O.ry * .06 + tt * .01, 1));
        gl.uniform3fv(U(pP, 'uA'), A); gl.uniform1f(U(pP, 'uS'), 3.2 * DPR * (innerHeight / 900) * 10); gl.drawArrays(gl.POINTS, 0, cnt); unbind({ at: [PB] }); }
    })(0);
  }

  // ---------- arranque ----------
  build(raw); lastSig = sig(normalize(raw));
  const initT = PREVIEW && QS.get('t') ? +QS.get('t') : 0;
  if (initT) { curT = initT; scrollTo(0, tToY(initT)); } else if (!PREVIEW) { history.scrollRestoration = 'manual'; scrollTo(0, 0); }
  const first = SC[0] ? SC[0].media.filter(e => e.tagName === 'IMG') : [];
  await Promise.race([Promise.all(first.map(e => new Promise(r => (e.complete ? r() : (e.onload = e.onerror = r))))), new Promise(r => setTimeout(r, PREVIEW ? 300 : 3000))]);
  const ld = $('#ld'); if (ld) { ld.style.opacity = 0; setTimeout(() => ld.remove(), 900); }
  introStart = performance.now() + (PREVIEW ? 0 : 500);
  render(curT); last = { T: curT }; requestAnimationFrame(frame);
  try { init3D(); } catch (e) { console.warn('3D desactivado', e); }
  if (!PREVIEW) {
    const audioButton=mk('button'); audioButton.textContent='▶ Reproducir con audio';
    audioButton.style.cssText='position:fixed;right:20px;bottom:20px;z-index:20;padding:12px 18px;border:1px solid #888;border-radius:24px;background:#18232be8;color:white;cursor:pointer';
    document.body.append(audioButton);
    audioButton.onclick=()=>{G.autoplay.on=!G.autoplay.on;G.autoplay.loop=false;G.autoplay.speed=total/(100*(G.duration||60));lastIn=-Infinity;if(curT>=total-1)scrollToT(0,0);audioButton.textContent=G.autoplay.on?'Ⅱ Pausar':'▶ Reproducir con audio';if(!G.autoplay.on)window.QRAudio?.pause();};
  }
  post('qr:ready');
})();
