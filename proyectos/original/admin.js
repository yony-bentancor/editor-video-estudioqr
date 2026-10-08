const projectStorage = {getItem:k=>localStorage.getItem(location.pathname+':'+k),setItem:(k,v)=>localStorage.setItem(location.pathname+':'+k,v),removeItem:k=>localStorage.removeItem(location.pathname+':'+k)};
/* ESTUDIO QR — panel de edición (sin dependencias). Edita config.json con vista previa en vivo,
   línea de tiempo, keyframes de cámara, pistas por elemento, deshacer/rehacer y biblioteca de medios. */
(() => {
'use strict';
const Q = window.QRM, CAT = Q.CAT;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, p, v) => { const a = p.split('.'), l = a.pop(); a.reduce((x, k) => (x[k] ??= {}), o)[l] = v; };
const isV = p => /\.(mp4|webm|mov)$/i.test(p || '');
const clamp = Q.clamp, r2 = v => Math.round(v * 100) / 100, pad = n => String(n).padStart(2, '0');
const LS = { get(k) { try { return JSON.parse(projectStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { projectStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }, del(k) { try { projectStorage.removeItem(k); } catch (e) { } } };

// ---------------- estado ----------------
let cfg, def, TM, saved = '', sel = 0, tab = 'es', sec = LS.get('qr-sec') || 'cont', selKey = 0, selLayer = 0;
let server = false, lib = null, T = 0, playing = false, follow = true, loopScene = false, dragPH = false, pvReady = false, magnet = LS.get('qr-magnet') ?? true;
const H = { undo: [], redo: [], cur: '' };
const pvf = $('#pvf'), pv = () => pvf.contentWindow;

window.QREditor = {getConfig:()=>cfg, change:()=>commit({ui:'all'}), save:()=>save(), dirty:()=>isDirty(), pause:()=>pause(), seekSeconds:s=>seek(s/(cfg.general.duration||44)*TM.total)};
// ---------------- utilidades de UI ----------------
let toastT; const toast = (t, ms = 2200) => { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), ms); };
const msg = (t, c = '') => { const e = $('#st'); e.textContent = t; e.className = c; };
const isDirty = () => JSON.stringify(cfg) !== saved;
const refreshDirty = () => { if (isDirty()) msg('● Cambios sin guardar', 'bad'); else msg('Todo guardado', 'ok'); };
const key = () => $('#key').value;
const post = m => { try { pv().postMessage(m, '*'); } catch (e) { } };
const fmtT = t => (t / TM.total * (cfg.general.duration || 44)).toFixed(1) + ' s';
const secs = L => (L / TM.total * (cfg.general.duration || 44)).toFixed(1);
const lum = h => { const c = (h || '#000').replace('#', ''), v = [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255).map(x => (x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4))); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
const contrast = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + .05) / (Math.min(A, B) + .05); };

// ---------------- commit / deshacer / borrador / vista previa ----------------
let tU, tP, tD;
// normaliza EN EL LUGAR: conserva la identidad de los objetos que tienen tomados los editores
function syncObj(d, s) {
  for (const k of Object.keys(d)) if (!(k in s)) delete d[k];
  for (const k of Object.keys(s)) {
    const a = d[k], b = s[k];
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && (!Array.isArray(a) || a.length === b.length)) {
      if (Array.isArray(a)) b.forEach((v, j) => { if (a[j] && v && typeof a[j] === 'object' && typeof v === 'object') syncObj(a[j], v); else a[j] = v; }); else syncObj(a, b);
    } else d[k] = b;
  }
}
function renorm() { syncObj(cfg, Q.normalize(cfg)); TM = Q.timing(cfg); }
function commit(o = {}) {
  renorm();
  clearTimeout(tU); tU = setTimeout(pushUndo, o.now ? 0 : 380);
  clearTimeout(tP); tP = setTimeout(pushPreview, o.fast ? 16 : 70);
  clearTimeout(tD); tD = setTimeout(() => LS.set('qr-panel-draft', { cfg, at: Date.now() }), 700);
  refreshDirty();
  if (o.ui === 'all') drawAll(); else { if (o.ui !== 'none') { drawList(); drawTL(); } if (o.ins) drawIns(); else if (o.frame) drawFrame(); }
}
function pushUndo() { const j = JSON.stringify(cfg); if (j === H.cur) return; if (H.cur) H.undo.push(H.cur); if (H.undo.length > 150) H.undo.shift(); H.cur = j; H.redo = []; undoBtns(); }
function undoBtns() { $('#undo').disabled = !H.undo.length; $('#redo').disabled = !H.redo.length; }
function undo(r) { clearTimeout(tU); pushUndo(); const from = r ? H.redo : H.undo, to = r ? H.undo : H.redo; if (!from.length) return; to.push(H.cur); H.cur = from.pop(); cfg = JSON.parse(H.cur); sel = Math.min(sel, cfg.scenes.length - 1); TM = Q.timing(cfg); pushPreview(); drawAll(); undoBtns(); refreshDirty(); toast(r ? 'Rehecho' : 'Deshecho'); }
function pushPreview() { if (pvReady) post({ type: 'qr:config', cfg }); }

// ---------------- generadores de campos ----------------
const fd = (l, h, c, out) => `<div class="fd">${l ? `<label><span>${l}</span>${out ? '<output></output>' : ''}</label>` : ''}${c}${h ? `<small>${h}</small>` : ''}</div>`;
const F = {
  text: (k, l, h, ph = '') => fd(l, h, `<input type="text" data-k="${k}" placeholder="${esc(ph)}">`),
  area: (k, l, h, r = 3) => fd(l, h, `<textarea rows="${r}" data-k="${k}"></textarea>`),
  range: (k, l, h, a, b, s, u = '', nb = true) => fd(l, h, `<div class="row" style="flex-wrap:nowrap"><input type="range" min="${a}" max="${b}" step="${s}" data-k="${k}">${nb ? `<input type="number" min="${a}" max="${b}" step="${s}" data-k="${k}" style="width:76px">` : ''}${u ? `<span style="color:var(--mute)">${u}</span>` : ''}</div>`),
  sel: (k, l, h, o, rr) => fd(l, h, `<select data-k="${k}"${rr ? ' data-rr' : ''}>${Object.entries(o).map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select>`),
  chk: (k, l, h, rr) => `<label class="chk"><input type="checkbox" data-k="${k}"${rr ? ' data-rr' : ''}><span><b>${l}</b>${h ? `<br><small style="color:var(--mute)">${h}</small>` : ''}</span></label>`,
  col: (k, l, h) => fd(l, h, `<div class="row"><input type="color" data-k="${k}"><input type="text" data-k="${k}" style="width:100px;font-family:ui-monospace,monospace"></div>`),
  media: (k, l, h) => { const v = get(cfg, k); return fd(l, h, `<div class="mu"><div class="th" data-drop="${k}">${thumb(v)}</div><div class="row"><button data-lib="${k}" title="Elegir de los archivos ya subidos">Biblioteca…</button><button data-up="${k}" title="Subir un archivo nuevo desde tu computadora">Subir…</button>${v ? `<button data-rm="${k}" class="ghost" title="Dejar vacío">Quitar</button>` : ''}<small style="width:100%;color:var(--mute);word-break:break-all">${esc(v || 'Sin archivo — también podés arrastrar uno sobre la miniatura')}</small></div></div>`); }
};
const thumb = p => !p ? 'vacío' : isV(p) ? `<video src="${esc(p)}" muted autoplay loop playsinline></video>` : `<img src="${esc(p)}" alt="">`;
function bind(root) {
  $$('[data-k]', root).forEach(el => {
    const k = el.dataset.k, v = get(cfg, k);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
    const out = el.closest('.fd')?.querySelector('output'); if (out) out.textContent = el.value;
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input', () => {
      let val = el.type === 'checkbox' ? el.checked : (el.type === 'range' || el.type === 'number') ? +el.value : el.value;
      if ((el.type === 'number' || el.type === 'range') && isNaN(val)) return;
      if (el.type === 'color' || (el.type === 'text' && /palette/.test(k))) { if (!/^#[0-9a-f]{6}$/i.test(val)) return; }
      set(cfg, k, val);
      $$(`[data-k="${k}"]`, root).forEach(o => { if (o !== el) { if (o.type === 'checkbox') o.checked = val; else o.value = val; } });
      if (out) out.textContent = el.value;
      if (/\.tracks\./.test(k)) set(cfg, k.replace(/\.tracks\..*/, '.tracks.auto'), false);
      if (/\.cam\./.test(k)) { set(cfg, k.replace(/\.cam\..*/, '.cam.auto'), false); set(cfg, k.replace(/\.cam\..*/, '.motion'), 'custom'); }
      const hook = HOOKS[k.replace(/^scenes\.\d+\./, '')]; if (hook) hook(val);
      commit({ ins: el.hasAttribute('data-rr'), frame: /\.cam\./.test(k) });
    });
  });
  $$('[data-lib]', root).forEach(b => b.onclick = () => openLib(p => { set(cfg, b.dataset.lib, p); commit({ ins: true }); }));
  $$('[data-up]', root).forEach(b => b.onclick = () => pickUpload(p => { set(cfg, b.dataset.up, p); commit({ ins: true }); }));
  $$('[data-rm]', root).forEach(b => b.onclick = () => { set(cfg, b.dataset.rm, ''); commit({ ins: true }); });
  $$('[data-drop]', root).forEach(d => {
    d.ondragover = e => { e.preventDefault(); d.classList.add('dz'); }; d.ondragleave = () => d.classList.remove('dz');
    d.ondrop = e => { e.preventDefault(); d.classList.remove('dz'); const f = e.dataTransfer.files[0]; if (f) upload(f).then(p => { if (p) { set(cfg, d.dataset.drop, p); commit({ ins: true }); } }); };
  });
}
const HOOKS = {
  motion: v => { const s = cfg.scenes[sel]; if (v !== 'custom') { s.cam = { auto: true }; selKey = 0; toast('Movimiento aplicado · Ctrl+Z para deshacer'); } }
};

// ---------------- lista de escenas ----------------
function drawList() {
  const L = $('#list');
  if (tab === 'ge') { L.innerHTML = `<div style="padding:6px;color:var(--mute);font-size:12px">Ajustes que afectan a toda la web. Se editan a la derecha.<br><br><b style="color:var(--ink)">Duración total:</b> ${fmtT(TM.total)} pantallas<br>≈ ${secs(TM.total)} s en reproducción automática</div>`; return; }
  if (tab === 'ay') { L.innerHTML = `<div style="padding:6px;color:var(--mute);font-size:12px">Guía y atajos a la derecha.</div>`; return; }
  const cur = Q.sceneAt(TM, T);
  L.innerHTML = cfg.scenes.map((s, i) => `<div class="sc${i === sel ? ' on' : ''}" draggable="true" data-i="${i}" title="Arrastrá para reordenar · doble clic para verla">
    <span class="n">${cur === i ? '▶' : pad(i + 1)}</span><div class="th" style="${s.media && !isV(s.media) ? `background-image:url('${esc(s.media)}')` : ''}">${isV(s.media) ? `<video src="${esc(s.media)}" muted preload="metadata"></video>` : ''}</div>
    <div class="nm"><b>${esc(s.name || 'Sin nombre')}</b><small><span class="dot" style="background:${s.palette.bg};box-shadow:inset 0 0 0 1px var(--line)"></span>${fmtT(TM.scenes[i].L)} pant${i ? ' · ' + TSHORT[s.trans.type] : ''}${isV(s.media) ? ' · video' : ''}</small></div>
    <button class="ic ghost mn" data-menu="${i}" title="Más acciones">⋯</button></div>`).join('') + `<button id="addsc" style="width:100%" title="Agrega una escena al final">＋ Nueva escena</button>`;
  $$('.sc', L).forEach(c => {
    const i = +c.dataset.i;
    c.onclick = e => { if (e.target.closest('[data-menu]')) return; if (sel !== i) { sel = i; selKey = 0; selLayer = 0; drawAll(); } };
    c.ondblclick = () => { post({ type: 'qr:goto', i, at: 'hold' }); };
    c.ondragstart = e => { e.dataTransfer.setData('text/plain', i); c.classList.add('drag'); };
    c.ondragend = () => c.classList.remove('drag');
    c.ondragover = e => { e.preventDefault(); c.classList.add('over'); }; c.ondragleave = () => c.classList.remove('over');
    c.ondrop = e => { e.preventDefault(); c.classList.remove('over'); const from = +e.dataTransfer.getData('text/plain'); if (isNaN(from) || from === i) return; const [m] = cfg.scenes.splice(from, 1); cfg.scenes.splice(i, 0, m); sel = i; commit({ ui: 'all' }); toast('Escena movida'); };
  });
  $$('[data-menu]', L).forEach(b => b.onclick = e => sceneMenu(+b.dataset.menu, e));
  $('#addsc').onclick = () => { const last = cfg.scenes[cfg.scenes.length - 1]; cfg.scenes.push(Q.defScene({ palette: { ...last.palette } })); sel = cfg.scenes.length - 1; commit({ ui: 'all' }); };
}
function menu(e, items) {
  $$('.menu').forEach(m => m.remove());
  const m = document.createElement('div'); m.className = 'menu';
  m.innerHTML = items.map((it, k) => it === '-' ? '<hr>' : `<button data-k="${k}"${it.dis ? ' disabled' : ''}>${it.t}</button>`).join('');
  document.body.append(m); const r = e.target.getBoundingClientRect();
  m.style.left = Math.min(innerWidth - 220, r.left) + 'px'; m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 4) + 'px';
  $$('button', m).forEach(b => b.onclick = () => { m.remove(); items[+b.dataset.k].f(); });
  setTimeout(() => addEventListener('pointerdown', function h(ev) { if (!m.contains(ev.target)) { m.remove(); removeEventListener('pointerdown', h); } }), 0);
}
let clip = null;
const GROUPS = { cam: ['Cámara y zoom', ['motion', 'cam']], time: ['Tiempos (duración, fases, pistas)', ['length', 'phases', 'tracks']], trans: ['Transición de entrada', ['trans']], color: ['Colores y tinte', ['palette', 'grade']], type: ['Tipografía y posición del texto', ['size', 'textPos', 'textAnim', 'scrim']], obj: ['Objeto 3D', ['obj']], media: ['Fondo (archivo, ajuste, video)', ['media', 'fit', 'fragment', 'video']] };
function sceneMenu(i, e) {
  const S = cfg.scenes;
  menu(e, [
    { t: '⧉ Duplicar', f: () => { S.splice(i + 1, 0, JSON.parse(JSON.stringify(S[i]))); S[i + 1].name += ' (copia)'; sel = i + 1; commit({ ui: 'all' }); } },
    { t: '↑ Subir', dis: i === 0, f: () => { [S[i - 1], S[i]] = [S[i], S[i - 1]]; sel = i - 1; commit({ ui: 'all' }); } },
    { t: '↓ Bajar', dis: i === S.length - 1, f: () => { [S[i + 1], S[i]] = [S[i], S[i + 1]]; sel = i + 1; commit({ ui: 'all' }); } },
    '-',
    { t: '⎘ Copiar ajustes…', f: () => groupsModal('Copiar ajustes de «' + S[i].name + '»', 'Copiar', g => { clip = { from: S[i].name, data: pick(S[i], g) }; toast('Ajustes copiados'); }) },
    { t: '⎗ Pegar ajustes' + (clip ? ' de «' + clip.from + '»' : ''), dis: !clip, f: () => { Object.assign(S[i], JSON.parse(JSON.stringify(clip.data))); sel = i; commit({ ui: 'all' }); toast('Ajustes pegados'); } },
    { t: '⇶ Aplicar a todas las escenas…', f: () => groupsModal('Aplicar ajustes de «' + S[i].name + '» a todas', 'Aplicar a todas', g => { const d = pick(S[i], g); S.forEach((s, j) => { if (j !== i) Object.assign(s, JSON.parse(JSON.stringify(d))); }); commit({ ui: 'all' }); toast('Aplicado a ' + (S.length - 1) + ' escenas'); }) },
    '-',
    { t: '▶ Ver en la vista previa', f: () => post({ type: 'qr:goto', i, at: 'hold' }) },
    { t: '✕ Eliminar', dis: S.length < 2, f: () => { if (!confirm('¿Eliminar «' + S[i].name + '»? (se puede deshacer)')) return; S.splice(i, 1); sel = Math.max(0, Math.min(sel, S.length - 1)); commit({ ui: 'all' }); } }
  ]);
}
const pick = (s, g) => { const o = {}; g.forEach(k => GROUPS[k][1].forEach(p => { o[p] = JSON.parse(JSON.stringify(s[p])); })); return o; };
function groupsModal(title, okT, ok) {
  modal(title, `<p style="margin-top:0;color:var(--mute)">Elegí qué grupos de ajustes incluir:</p>` + Object.entries(GROUPS).map(([k, [n]]) => `<label class="chk"><input type="checkbox" value="${k}" ${['cam', 'time', 'trans', 'type'].includes(k) ? 'checked' : ''}> <span>${n}</span></label>`).join(''),
    [{ t: 'Cancelar' }, { t: okT, pri: 1, f: m => { const g = $$('input:checked', m).map(x => x.value); if (!g.length) return false; ok(g); } }]);
}
function modal(title, body, btns = [{ t: 'Cerrar' }], wide) {
  const w = document.createElement('div'); w.className = 'modal';
  w.innerHTML = `<div style="${wide ? 'width:min(1100px,96vw)' : 'width:min(560px,94vw)'}"><header><b>${title}</b><span class="grow"></span><button class="ghost ic" data-x>✕</button></header><div class="bd">${body}</div><footer>${btns.map((b, k) => `<button data-b="${k}"${b.pri ? ' class="pri"' : ''}>${b.t}</button>`).join('')}</footer></div>`;
  document.body.append(w); const close = () => w.remove();
  $('[data-x]', w).onclick = close; w.onclick = e => { if (e.target === w) close(); };
  $$('[data-b]', w).forEach(b => b.onclick = () => { const f = btns[+b.dataset.b].f; if (f && f(w) === false) return; close(); });
  return w;
}

// ---------------- inspector ----------------
const TSHORT = { mask: 'Máscara', fade: 'Fundido', iris: 'Iris', wipe: 'Cortina', slide: 'Deslizar', zoom: 'Zoom', pixel: 'Píxeles', blur: 'Blur', cut: 'Corte' };
const SECS = { cont: 'Contenido', cam: 'Fondo y cámara', time: 'Tiempo', trans: 'Transición', lay: 'Capas', obj: '3D', col: 'Color' };
function drawIns() {
  const Hh = $('#insh'), B = $('#insb');
  if (tab === 'ge') { Hh.innerHTML = '<h2>Ajustes generales</h2>'; B.innerHTML = generalHTML(); bind(B); return; }
  if (tab === 'ay') { Hh.innerHTML = '<h2>Ayuda</h2>'; B.innerHTML = helpHTML(); return; }
  const s = cfg.scenes[sel]; if (!s) return;
  Hh.innerHTML = `<h2>${pad(sel + 1)} · ${esc(s.name || 'Sin nombre')} <small>${fmtT(TM.scenes[sel].L)} pantallas · ≈ ${secs(TM.scenes[sel].L)} s</small><span class="grow"></span>
    <button class="ic ghost" id="sprev" title="Escena anterior">‹</button><button class="ic ghost" id="snext" title="Escena siguiente">›</button><button class="ghost" id="sgo" title="Llevar la vista previa a la pausa de esta escena">▶ Ver</button></h2>
    <div class="secs">${Object.entries(SECS).map(([k, n]) => `<button data-sec="${k}" class="${k === sec ? 'on' : ''}">${n}${k === 'lay' && s.layers.length ? ` (${s.layers.length})` : ''}${k === 'obj' && s.obj.on ? ' ●' : ''}</button>`).join('')}</div>`;
  $$('[data-sec]', Hh).forEach(b => b.onclick = () => { sec = b.dataset.sec; LS.set('qr-sec', sec); drawIns(); });
  $('#sprev').onclick = () => { if (sel > 0) { sel--; selKey = 0; drawAll(); } }; $('#snext').onclick = () => { if (sel < cfg.scenes.length - 1) { sel++; selKey = 0; drawAll(); } };
  $('#sgo').onclick = () => post({ type: 'qr:goto', i: sel, at: 'hold' });
  const p = `scenes.${sel}`;
  B.innerHTML = ({ cont: contHTML, cam: camHTML, time: timeHTML, trans: transHTML, lay: layHTML, obj: objHTML, col: colHTML }[sec] || contHTML)(s, p);
  bind(B);
  ({ cam: camBind, time: timeBind, trans: transBind, lay: layBind, cont: contBind, col: colBind, obj: objBind }[sec] || (() => { }))(s, p);
}
function contHTML(s, p) {
  return `<div class="card"><h3>Textos</h3>
   ${F.text(p + '.name', 'Nombre interno', 'Para vos, la lista y el contador de la web.')}
   ${F.text(p + '.kicker', 'Etiqueta pequeña', 'Línea chica sobre el título, en color de acento.')}
   ${F.area(p + '.title', 'Título', 'Un renglón por línea. *Asteriscos* = cursiva.', 3)}
   ${F.area(p + '.text', 'Texto de apoyo', 'Opcional. Párrafo corto debajo del título.', 2)}
   <div class="g2">${F.text(p + '.ctaText', 'Botón: texto', 'Si lo llenás aparece un botón.')}${F.text(p + '.ctaHref', 'Botón: enlace', 'mailto:… · https://… · tel:…')}</div></div>
  <div class="card"><h3>Presentación del texto</h3>
   <div class="g2">${F.sel(p + '.size', 'Tamaño del título', '', CAT.size)}${F.sel(p + '.textAnim', 'Animación de letras', 'Cómo entra y sale el título.', CAT.textAnim)}</div>
   <div class="fd"><label>Posición en pantalla</label><div class="row" style="gap:14px"><div class="pos9" id="pos9">${['tl', 'x', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br'].map(k => `<button data-p="${k}" class="${k === 'x' ? 'x' : ''}${s.textPos === k ? ' on' : ''}" title="${CAT.textPos[k] || ''}"></button>`).join('')}</div><small style="margin:0">${CAT.textPos[s.textPos] || ''}</small></div></div>
   ${F.range(p + '.scrim', 'Velo de contraste', 'Oscurece (con el color de fondo) la zona del texto para que se lea sobre cualquier imagen.', 0, 1, .05)}</div>
  <div class="card"><h3>Notas</h3>${F.area(p + '.notes', '', 'Notas internas (no se publican).', 2)}</div>`;
}
function contBind(s) { $$('#pos9 button').forEach(b => b.onclick = () => { if (b.dataset.p === 'x') return; s.textPos = b.dataset.p; commit({ ins: true }); }); }

// ---------- Fondo y cámara ----------
function camHTML(s, p) {
  const k = s.cam.keys[selKey] || s.cam.keys[0], v = isV(s.media);
  return `<div class="card"><h3>Fondo</h3>${F.media(p + '.media', '', 'Imagen (jpg, png, webp) o video (mp4, webm).')}
   <div class="g3">${F.sel(p + '.fit', 'Ajuste', '', CAT.fit, 1)}${F.range(p + '.fragment', 'Tiras (fragmentación)', v ? 'No aplica a videos.' : '1 = imagen entera.', 1, 6, 1, '', false)}${F.range(p + '.grade', 'Tinte de acento', '', 0, .8, .05, '', false)}</div>
   ${v ? `<div class="g3">${F.sel(p + '.video.mode', 'Reproducción', 'Atado al scroll: el video avanza y retrocede con el usuario.', CAT.video)}${F.range(p + '.video.rate', 'Velocidad', '', .25, 3, .05, '×', false)}${F.range(p + '.video.start', 'Empieza en', 'segundos', 0, 60, .1, 's', false)}</div>` : ''}</div>
  <div class="card"><h3>Cámara <span class="grow"></span><select data-k="${p}.motion" data-rr style="width:auto">${Object.entries(CAT.motion).map(([a, b]) => `<option value="${a}">${b}</option>`).join('')}</select></h3>
   <p class="d">Cada <b>keyframe</b> es un encuadre en un momento de la escena. Arrastrá el recuadro para mover, la esquina (o la rueda del mouse) para hacer zoom de 1× a 8×. <kbd>Alt</kbd>+clic centra el encuadre en ese punto. El recuadro amarillo punteado es lo que se ve en el cursor.</p>
   <div id="frame" class="${s.fit === 'contain' ? 'contain' : ''}">${s.media ? (v ? `<video src="${esc(s.media)}" muted autoplay loop playsinline></video>` : `<img src="${esc(s.media)}" alt="">`) : ''}</div>
   <div class="row" style="margin-top:8px"><button class="ic" id="kprev" title="Keyframe anterior">◀</button><b id="klab" style="min-width:110px;text-align:center"></b><button class="ic" id="knext" title="Keyframe siguiente">▶</button><span class="grow"></span>
    <button id="kgo" title="Mover el cursor a este keyframe">Ir</button><button id="kadd" title="Nuevo keyframe en la posición del cursor (K)">◆+ En el cursor</button><button id="kdel" class="ghost" title="Eliminar este keyframe (Supr)">Eliminar</button></div>
   <div class="g2">
    ${fd('Momento', '% de la escena', `<div class="row" style="flex-wrap:nowrap"><input type="range" min="0" max="100" step=".1" id="kt"><input type="number" min="0" max="100" step=".1" id="ktn" style="width:76px"></div>`)}
    ${fd('Zoom', '1× = imagen completa · hasta 8×', `<div class="row" style="flex-wrap:nowrap"><input type="range" min="1" max="8" step=".01" id="ks"><input type="number" min="1" max="8" step=".01" id="ksn" style="width:76px"></div>`)}
    ${fd('Horizontal', 'punto focal 0 → 1', `<input type="range" min="0" max="1" step=".001" id="kx">`)}
    ${fd('Vertical', 'punto focal 0 → 1', `<input type="range" min="0" max="1" step=".001" id="ky">`)}
    ${fd('Rotación', 'grados (se compensa el borde)', `<div class="row" style="flex-wrap:nowrap"><input type="range" min="-20" max="20" step=".1" id="kr"><input type="number" min="-20" max="20" step=".1" id="krn" style="width:76px"></div>`)}
    ${fd('Curva hacia este keyframe', 'cómo se llega desde el anterior', `<select id="ke">${Object.entries(CAT.ease).map(([a, b]) => `<option value="${a}">${b}</option>`).join('')}</select>`)}
   </div>
   <div class="row"><button id="kfull" title="Zoom 1×, centrado">Encuadre completo</button><button id="kcen" title="Centrar el punto focal">Centrar</button><button id="kcopy" title="Copiar este encuadre al keyframe siguiente">Copiar al siguiente →</button></div>
   <table class="klist" style="margin-top:10px"><tr><th>#</th><th>Momento</th><th>Zoom</th><th>Foco</th><th>Curva</th></tr>${s.cam.keys.map((q, j) => `<tr data-kr="${j}" class="${j === selKey ? 'on' : ''}" style="cursor:pointer"><td>${j + 1}</td><td>${r2(q.t)}%</td><td>${q.s.toFixed(2)}×</td><td>${q.x.toFixed(2)}, ${q.y.toFixed(2)}${q.r ? ` · ${q.r}°` : ''}</td><td>${CAT.ease[q.e] || q.e}</td></tr>`).join('')}</table>
  </div>`;
}
function camBind(s) {
  const K = () => s.cam.keys[selKey];
  const edit = (fn, seek) => { fn(K()); s.cam.auto = false; s.motion = 'custom'; commit({ frame: true, fast: true }); if (seek) seekKey(); fillK(); };
  const fillK = () => { const k = K(); if (!k) return; $('#klab').textContent = `Keyframe ${selKey + 1} de ${s.cam.keys.length}`; $('#kt').value = $('#ktn').value = r2(k.t); $('#ks').value = $('#ksn').value = k.s.toFixed(2); $('#kx').value = k.x; $('#ky').value = k.y; $('#kr').value = $('#krn').value = k.r || 0; $('#ke').value = k.e || 'inOut'; $$('[data-kr]').forEach(r => r.classList.toggle('on', +r.dataset.kr === selKey)); };
  fillK(); drawFrame();
  const md = $('#frame img,#frame video');
  const setAR = (w, h) => { if (!w || !h) return; FAR = w / h; $('#frame').style.aspectRatio = s.fit === 'contain' ? '16/9' : `${w}/${h}`; drawFrame(); };
  FAR = 16 / 9; if (md) { if (md.tagName === 'IMG') { if (md.complete) setAR(md.naturalWidth, md.naturalHeight); else md.onload = () => setAR(md.naturalWidth, md.naturalHeight); } else md.onloadedmetadata = () => setAR(md.videoWidth, md.videoHeight); }
  const num = (ids, f) => ids.forEach(id => $(id).oninput = e => { const v = +e.target.value; if (isNaN(v)) return; edit(k => f(k, v)); });
  num(['#kt', '#ktn'], (k, v) => { k.t = clamp(v, 0, 100); }); num(['#ks', '#ksn'], (k, v) => { k.s = clamp(v, s.fit === 'contain' ? .3 : 1, 8); clampK(k, s); });
  num(['#kx'], (k, v) => { k.x = v; clampK(k, s); }); num(['#ky'], (k, v) => { k.y = v; clampK(k, s); }); num(['#kr', '#krn'], (k, v) => { k.r = v; });
  $('#ke').onchange = e => edit(k => { k.e = e.target.value; });
  $('#kprev').onclick = () => { selKey = Math.max(0, selKey - 1); fillK(); drawFrame(); seekKey(); drawTL(); };
  $('#knext').onclick = () => { selKey = Math.min(s.cam.keys.length - 1, selKey + 1); fillK(); drawFrame(); seekKey(); drawTL(); };
  $('#kgo').onclick = seekKey; $('#kadd').onclick = addKeyAtCursor; $('#kdel').onclick = delKey;
  $('#kfull').onclick = () => edit(k => { k.s = 1; k.x = .5; k.y = .5; k.r = 0; }, 1); $('#kcen').onclick = () => edit(k => { k.x = .5; k.y = .5; }, 1);
  $('#kcopy').onclick = () => { const k = K(), n = s.cam.keys[selKey + 1]; if (!n) return toast('No hay keyframe siguiente'); Object.assign(n, { s: k.s, x: k.x, y: k.y, r: k.r }); s.cam.auto = false; s.motion = 'custom'; commit({ ins: true }); };
  $$('[data-kr]').forEach(r => r.onclick = () => { selKey = +r.dataset.kr; fillK(); drawFrame(); seekKey(); drawTL(); });
  // interacción sobre el encuadre
  const fr = $('#frame');
  fr.onpointerdown = e => {
    const k = K(); if (!k) return; const rc = fr.getBoundingClientRect();
    if (e.altKey) { k.x = (e.clientX - rc.left) / rc.width; k.y = (e.clientY - rc.top) / rc.height; clampK(k, s); edit(() => { }, 1); return; }
    const hd = e.target.classList.contains('hd'), onSel = e.target.closest('.fr.sel'); if (!hd && !onSel) return;
    e.preventDefault(); fr.setPointerCapture(e.pointerId);
    const x0 = e.clientX, y0 = e.clientY, k0 = { ...k }, cx = rc.left + k.x * rc.width, cy = rc.top + k.y * rc.height;
    fr.onpointermove = ev => {
      if (hd) { const [w1, h1] = vis(1), w = Math.max(Math.abs(ev.clientX - cx) / rc.width / w1, Math.abs(ev.clientY - cy) / rc.height / h1) * 2; k.s = clamp(1 / Math.max(w, .01), s.fit === 'contain' ? .3 : 1, 8); }
      else { k.x = k0.x + (ev.clientX - x0) / rc.width; k.y = k0.y + (ev.clientY - y0) / rc.height; }
      clampK(k, s); s.cam.auto = false; s.motion = 'custom'; drawFrame(); fillK(); clearTimeout(tP); tP = setTimeout(pushPreview, 30);
    };
    fr.onpointerup = () => { fr.onpointermove = null; commit({ frame: true, ui: 'tl' }); seekKey(); };
  };
  fr.onwheel = e => { const k = K(); if (!k) return; e.preventDefault(); k.s = clamp(k.s * (1 - e.deltaY * .0012), s.fit === 'contain' ? .3 : 1, 8); clampK(k, s); s.cam.auto = false; s.motion = 'custom'; fillK(); drawFrame(); commit({ frame: true, fast: true }); };
}
let FAR = 16 / 9; const VA = 16 / 9; // FAR = proporción de la imagen del fondo; VA = pantalla de escritorio
const vis = ks => (VA < FAR ? [VA / FAR / ks, 1 / ks] : [1 / ks, FAR / VA / ks]); // fracción visible (ancho, alto) de la imagen
function clampK(k, s) { if (s.fit === 'contain') return; const [w, h] = vis(Math.max(1, k.s)); k.x = clamp(k.x, w / 2, 1 - w / 2); k.y = clamp(k.y, h / 2, 1 - h / 2); }
function drawFrame() {
  const fr = $('#frame'); if (!fr) return; const s = cfg.scenes[sel]; $$('.fr', fr).forEach(e => e.remove());
  const t = TM.scenes[sel], u = clamp((T - t.T0) / t.L, 0, 1) * 100, inside = T >= t.T0 && T <= t.end;
  const box = (k, cls, lab) => { const [vw, vh] = vis(Math.max(k.s, .3)), w = vw * 100, hh = vh * 100, d = document.createElement('div'); d.className = 'fr ' + cls; Object.assign(d.style, { left: (k.x * 100 - w / 2) + '%', top: (k.y * 100 - hh / 2) + '%', width: w + '%', height: hh + '%', transform: `rotate(${k.r || 0}deg)` }); d.innerHTML = lab; fr.append(d); return d; };
  s.cam.keys.forEach((k, j) => { if (j !== selKey) box(k, '', `<b>${j + 1}</b>`); });
  if (inside) box(Q.evalKeys(s.cam.keys, u), 'cur', '');
  const k = s.cam.keys[selKey]; if (k) box(k, 'sel', `<b>${selKey + 1}</b><span class="z">${k.s.toFixed(2)}×</span><i class="cx"></i><i class="hd" title="Arrastrá para hacer zoom"></i>`);
}
function seekKey() { const s = cfg.scenes[sel], k = s.cam.keys[selKey]; if (!k) return; seek(TM.scenes[sel].T0 + TM.scenes[sel].L * k.t / 100); }
function addKeyAtCursor() {
  const s = cfg.scenes[sel], t = TM.scenes[sel]; let u = (T - t.T0) / t.L * 100;
  if (u < 0 || u > 100) { u = 50; toast('El cursor está fuera de la escena: keyframe agregado a la mitad'); }
  const v = Q.evalKeys(s.cam.keys, u), k = { t: r2(u), s: +v.s.toFixed(3), x: +v.x.toFixed(3), y: +v.y.toFixed(3), r: +(v.r || 0).toFixed(2), e: 'inOut' };
  s.cam.keys.push(k); s.cam.keys.sort((a, b) => a.t - b.t); selKey = s.cam.keys.indexOf(k); s.cam.auto = false; s.motion = 'custom';
  if (sec !== 'cam') sec = 'cam'; commit({ ins: true }); toast('Keyframe agregado · movelo en el recuadro');
}
function delKey() { const s = cfg.scenes[sel]; if (s.cam.keys.length < 2) return toast('Tiene que quedar al menos un keyframe'); s.cam.keys.splice(selKey, 1); selKey = Math.max(0, selKey - 1); s.cam.auto = false; s.motion = 'custom'; commit({ ins: true }); }

// ---------- Tiempo ----------
function timeHTML(s, p) {
  const t = TM.scenes[sel], ph = t.ph, trk = (k, n, h) => `<div class="fd"><label>${n}</label><div class="g4">${['from', 'to', 'rin', 'rout'].map(q => `<div><small style="margin:0 0 2px">${{ from: 'Aparece en', to: 'Termina en', rin: 'Duración entrada', rout: 'Duración salida' }[q]}</small><input type="number" min="0" max="100" step=".5" data-k="${p}.tracks.${k}.${q}"></div>`).join('')}</div><small>${h}</small></div>`;
  return `<div class="card"><h3>Duración</h3>
   ${F.range(p + '.length', 'Largo de la escena', `= ${fmtT(t.L)} pantallas de scroll · ≈ ${secs(t.L)} s en reproducción automática. 300 = normal.`, 100, 1500, 10)}
   <div class="phbar" title="Proporción de las fases"><i style="width:${ph.e * 100}%;background:var(--ph-e)"></i><i style="width:${ph.d * 100}%;background:var(--ph-d)"></i><i style="width:${ph.h * 100}%;background:var(--ph-h)"></i><i style="width:${ph.x * 100}%;background:var(--ph-x)"></i></div>
   <p class="d">Las 4 fases se reparten el largo (importa la proporción). También podés arrastrar sus bordes directamente en la línea de tiempo.</p>
   <div class="g2">${F.range(p + '.phases.enter', '<span class="dot" style="background:var(--ph-e)"></span>Entrada', 'La escena aparece y el título emerge.', 0, 100, 1)}${F.range(p + '.phases.develop', '<span class="dot" style="background:var(--ph-d)"></span>Desarrollo', 'La cámara viaja, las capas se separan.', 0, 100, 1)}
   ${F.range(p + '.phases.hold', '<span class="dot" style="background:var(--ph-h)"></span>Pausa (HOLD)', 'Calma para leer. Los botones de navegación paran acá.', 0, 100, 1)}${F.range(p + '.phases.exit', '<span class="dot" style="background:var(--ph-x)"></span>Transición', sel === cfg.scenes.length - 1 ? 'Última escena: dejalo en 0.' : 'Se superpone con la siguiente escena.', 0, 100, 1)}</div></div>
  <div class="card"><h3>Pistas de tiempo por elemento <span class="grow"></span><button id="trauto" class="${s.tracks.auto ? 'on' : ''}" title="Las pistas se recalculan solas cuando cambiás las fases">${s.tracks.auto ? '✓ Automáticas' : 'Volver a automáticas'}</button></h3>
   <p class="d">Valores en % de la escena. Se editan también arrastrando las barras en la línea de tiempo (bordes = aparece/termina, rombos = duración de la animación).</p>
   ${trk('title', 'Título', sel === 0 ? 'En la primera escena el título entra con la animación de inicio.' : '')}${trk('meta', 'Etiqueta, texto y botón', '')}${s.obj.on ? trk('obj', 'Objeto 3D', '') : ''}</div>`;
}
function timeBind(s) { $('#trauto').onclick = () => { s.tracks = { auto: true }; commit({ ins: true }); toast('Pistas automáticas'); }; }
HOOKS['phases.enter'] = HOOKS['phases.develop'] = HOOKS['phases.hold'] = HOOKS['phases.exit'] = () => { };

// ---------- Transición ----------
const TICON = {
  mask: '<rect x="2" y="2" width="56" height="30" rx="2" fill="var(--faint)"/><rect x="14" y="8" width="32" height="18" fill="var(--acc)"/>',
  fade: '<defs><linearGradient id="gf"><stop offset="0" stop-color="var(--faint)"/><stop offset="1" stop-color="var(--acc)"/></linearGradient></defs><rect x="2" y="2" width="56" height="30" rx="2" fill="url(#gf)"/>',
  iris: '<rect x="2" y="2" width="56" height="30" rx="2" fill="var(--faint)"/><circle cx="30" cy="17" r="11" fill="var(--acc)"/>',
  wipe: '<rect x="2" y="2" width="56" height="30" rx="2" fill="var(--faint)"/><rect x="30" y="2" width="28" height="30" fill="var(--acc)"/>',
  slide: '<rect x="-14" y="2" width="40" height="30" rx="2" fill="var(--faint)"/><rect x="30" y="2" width="40" height="30" rx="2" fill="var(--acc)"/><path d="M40 17h-12m4-4-4 4 4 4" stroke="#fff" fill="none" stroke-width="2"/>',
  zoom: '<rect x="2" y="2" width="56" height="30" rx="2" fill="var(--faint)"/><rect x="20" y="10" width="20" height="14" fill="var(--acc)"/><path d="M8 6l10 7M52 6l-10 7M8 28l10-6M52 28l-10-6" stroke="#fff" stroke-width="1.5"/>',
  pixel: '<rect x="2" y="2" width="56" height="30" rx="2" fill="var(--faint)"/>' + [[8, 6], [20, 6], [38, 12], [14, 18], [44, 22], [26, 22], [32, 6], [50, 8], [8, 24]].map(([x, y]) => `<rect x="${x}" y="${y}" width="7" height="7" fill="var(--acc)"/>`).join(''),
  blur: '<defs><filter id="bf"><feGaussianBlur stdDeviation="2.4"/></filter></defs><rect x="2" y="2" width="56" height="30" rx="2" fill="var(--faint)"/><rect x="14" y="8" width="32" height="18" fill="var(--acc)" filter="url(#bf)"/>',
  cut: '<rect x="2" y="2" width="27" height="30" fill="var(--faint)"/><rect x="31" y="2" width="27" height="30" fill="var(--acc)"/>'
};
function transHTML(s, p) {
  const prev = cfg.scenes[sel - 1], t = TM.scenes[sel];
  if (!prev) return `<div class="card"><h3>Inicio</h3><p class="d">La primera escena no tiene transición de entrada: aparece con la animación de inicio (el título emerge al cargar la web).</p>
    ${F.range(p + '.phases.exit', 'Duración de la salida hacia la escena 02', 'Proporción de esta escena que se superpone con la siguiente.', 0, 100, 1)}</div>`;
  const pp = `scenes.${sel - 1}`, ov = TM.scenes[sel - 1].overlap;
  return `<div class="card"><h3>Entrada desde «${esc(prev.name)}»</h3><p class="d">Cómo pasa la escena ${pad(sel)} a la ${pad(sel + 1)}. Dura lo que se superponen ambas (${fmtT(ov)} pantallas).</p>
    <div class="tgrid">${Object.entries(CAT.trans).map(([k, n]) => `<button data-t="${k}" class="${s.trans.type === k ? 'on' : ''}"><svg viewBox="0 0 60 34">${TICON[k]}</svg>${n}</button>`).join('')}</div>
    <div class="g2" style="margin-top:6px">${['wipe', 'slide'].includes(s.trans.type) ? F.sel(p + '.trans.dir', 'Dirección', '', CAT.dir) : ''}${F.sel(p + '.trans.ease', 'Curva', '', CAT.ease)}</div>
    ${F.range(pp + '.phases.exit', 'Duración (fase de transición de la escena anterior)', 'Más = superposición más larga y transición más lenta.', 0, 100, 1)}
    <div class="row"><button id="tprev" title="Reproduce en bucle solo este pasaje">▶ Probar transición en bucle</button><button id="tset" class="ghost" title="Usar esta transición en todas las escenas">Usar en todas</button></div></div>
   ${sel < cfg.scenes.length - 1 ? `<div class="card"><h3>Salida hacia «${esc(cfg.scenes[sel + 1].name)}»</h3><p class="d">Se define en la escena siguiente: <b>${CAT.trans[cfg.scenes[sel + 1].trans.type]}</b>.</p><button id="tnext">Editar transición siguiente →</button></div>` : ''}`;
}
function transBind(s) {
  $$('[data-t]').forEach(b => b.onclick = () => { s.trans.type = b.dataset.t; commit({ ins: true }); tryTrans(); });
  const tp = $('#tprev'); if (tp) tp.onclick = tryTrans;
  const ts = $('#tset'); if (ts) ts.onclick = () => { cfg.scenes.forEach((x, j) => { if (j) x.trans = { ...s.trans }; }); commit({ ui: 'all' }); toast('Transición aplicada a todas'); };
  const tn = $('#tnext'); if (tn) tn.onclick = () => { sel++; drawAll(); };
}
function tryTrans() { const t = TM.scenes[sel], a = TM.scenes[sel - 1]; if (!a) return; const r = [Math.max(0, t.T0 - 40), Math.min(TM.total, t.te + 30)]; seek(r[0]); play(true, r); }

// ---------- Capas ----------
function layHTML(s, p) {
  return `<div class="card"><h3>Capas flotantes <span class="grow"></span><button id="ladd">＋ Agregar capa</button></h3>
   <p class="d">Imágenes o videos que flotan delante del fondo. Arrastralas en el escenario; la esquina cambia el tamaño. Profundidad + = más cerca (se mueve más rápido con el scroll).</p>
   <div id="stagebox" style="${s.media && !isV(s.media) ? `background-image:url('${esc(s.media)}')` : ''}"></div>
   ${s.layers.map((l, j) => `<div class="lycard${j === selLayer ? ' on' : ''}" data-ly="${j}"><h3 class="row" style="margin:0 0 4px;font-size:12px">Capa ${j + 1}<span class="grow"></span><button class="ghost ic" data-lu="${j}" title="Más atrás">↓</button><button class="ghost ic" data-ld="${j}" title="Más adelante">↑</button><button class="ghost" data-lx="${j}">Eliminar</button></h3>
     ${F.media(`${p}.layers.${j}.src`, '', '')}
     <div class="g3">${F.text(`${p}.layers.${j}.caption`, 'Leyenda', '')}${F.sel(`${p}.layers.${j}.mask`, 'Forma', '', { rect: 'Rectángulo 4:5', wide: 'Horizontal 16:9', arch: 'Arco', circle: 'Círculo', slit: 'Ranura' })}${F.sel(`${p}.layers.${j}.anim`, 'Animación', '', CAT.layerAnim)}</div>
     <div class="g2">${F.range(`${p}.layers.${j}.depth`, 'Profundidad', '', -1, 1, .1, '', false)}${F.range(`${p}.layers.${j}.rot`, 'Rotación', '', -30, 30, .5, '°', false)}</div>
     <div class="g4">${['from', 'to', 'rin', 'rout'].map(q => `<div><small>${{ from: 'Aparece %', to: 'Termina %', rin: 'Entrada %', rout: 'Salida %' }[q]}</small><input type="number" min="0" max="100" step=".5" data-k="${p}.layers.${j}.${q}"></div>`).join('')}</div></div>`).join('')}</div>`;
}
function layBind(s, p) {
  $('#ladd').onclick = () => openLib(src => { s.layers.push(Object.assign(Q.defLayer(), { src })); selLayer = s.layers.length - 1; commit({ ins: true }); });
  $$('[data-lx]').forEach(b => b.onclick = () => { s.layers.splice(+b.dataset.lx, 1); selLayer = 0; commit({ ins: true }); });
  $$('[data-lu]').forEach(b => b.onclick = () => { const j = +b.dataset.lu; if (j > 0) { [s.layers[j - 1], s.layers[j]] = [s.layers[j], s.layers[j - 1]]; commit({ ins: true }); } });
  $$('[data-ld]').forEach(b => b.onclick = () => { const j = +b.dataset.ld; if (j < s.layers.length - 1) { [s.layers[j + 1], s.layers[j]] = [s.layers[j], s.layers[j + 1]]; commit({ ins: true }); } });
  $$('[data-ly]').forEach(c => c.onclick = e => { if (e.target.closest('button,input,select,textarea')) return; selLayer = +c.dataset.ly; $$('[data-ly]').forEach(x => x.classList.toggle('on', x === c)); drawStage(); });
  drawStage();
}
function drawStage() {
  const sb = $('#stagebox'); if (!sb) return; const s = cfg.scenes[sel]; sb.innerHTML = ''; const rc = sb.getBoundingClientRect(); if (!rc.width) return;
  const AR = { rect: 1.25, wide: .5625, arch: 1.25, circle: 1, slit: 3 };
  s.layers.forEach((l, j) => {
    const d = document.createElement('div'); d.className = 'lyb' + (j === selLayer ? ' on' : '');
    const hpct = l.w * rc.width * (AR[l.mask] || 1.25) / rc.height;
    Object.assign(d.style, { left: l.x + '%', top: l.y + '%', width: l.w + '%', height: hpct + '%', backgroundImage: l.src && !isV(l.src) ? `url('${l.src}')` : '', borderRadius: l.mask === 'circle' ? '50%' : l.mask === 'arch' ? '999px 999px 2px 2px' : '2px', transform: `rotate(${l.rot || 0}deg)` });
    d.innerHTML = `<span>${j + 1}</span><i class="hd"></i>`; sb.append(d);
    d.onpointerdown = e => {
      e.preventDefault(); selLayer = j; $$('[data-ly]').forEach(x => x.classList.toggle('on', +x.dataset.ly === j)); $$('.lyb', sb).forEach(x => x.classList.toggle('on', x === d));
      d.setPointerCapture(e.pointerId); const x0 = e.clientX, y0 = e.clientY, l0 = { ...l }, hd = e.target.classList.contains('hd');
      d.onpointermove = ev => { const dx = (ev.clientX - x0) / rc.width * 100, dy = (ev.clientY - y0) / rc.height * 100;
        if (hd) l.w = clamp(Math.round(l0.w + dx), 6, 80); else { l.x = clamp(Math.round(l0.x + dx), -10, 95); l.y = clamp(Math.round(l0.y + dy), -10, 95); }
        d.style.left = l.x + '%'; d.style.top = l.y + '%'; d.style.width = l.w + '%'; d.style.height = (l.w * rc.width * (AR[l.mask] || 1.25) / rc.height) + '%'; clearTimeout(tP); tP = setTimeout(pushPreview, 40); };
      d.onpointerup = () => { d.onpointermove = null; commit({ ui: 'none' }); };
    };
  });
}
// ---------- 3D y color ----------
function objHTML(s, p) {
  const o = s.obj, cu = o.shape === 'custom';
  return `<div class="card"><h3>Objeto 3D</h3><p class="d">Una forma en tiempo real que pasa entre el fondo y el contorno del título. Puede ser una de las formas incluidas o <b>tu propio modelo</b>.</p>
   ${F.chk(p + '.obj.on', 'Mostrar objeto 3D en esta escena', '', 1)}
   ${o.on ? `<div class="g2">${F.sel(p + '.obj.shape', 'Forma', '', CAT.shape, 1)}${F.sel(p + '.obj.pos', 'Posición', '', { left: 'Izquierda', center: 'Centro', right: 'Derecha' })}</div>
   ${cu ? `<div class="fd"><label>Archivo del modelo</label><div class="mu"><div class="th" data-drop3d style="font-size:26px">◇</div><div class="row"><button id="m3lib" title="Elegir un modelo ya subido">Biblioteca…</button><button id="m3up" title="Subir un .glb o .obj desde tu computadora">Subir modelo…</button>
      <small style="width:100%;color:var(--mute);word-break:break-all">${esc(o.model || 'Sin archivo — arrastrá un .glb u .obj sobre el rombo')}</small><small id="m3info" style="width:100%"></small></div></div>
      <small>Recomendado: <b>.glb</b> (glTF binario) exportado desde Blender, Cinema 4D, Spline, etc. <b>Sin compresión Draco</b>. Idealmente menos de 100.000 triángulos y 10 MB. Se centra y escala solo.</small></div>
     ${F.sel(p + '.obj.mat', 'Material', '«Colores y texturas del modelo» respeta tu modelo; «Vidrio» y «Acento» lo tiñen con la paleta de la escena.', CAT.mat)}
     <div class="g3">${F.range(p + '.obj.rx', 'Inclinación', '°', -180, 180, 1, '', false)}${F.range(p + '.obj.ry', 'Giro inicial', '°', -180, 180, 1, '', false)}${F.range(p + '.obj.spin', 'Giro automático', 'vueltas lentas / rápidas', -2, 2, .05, '', false)}</div>
     ${F.chk(p + '.obj.follow', 'Girar también con el scroll', 'Apagalo si querés que el modelo quede de frente.')}` : ''}
   ${F.range(p + '.obj.size', 'Tamaño', '', .3, 1.8, .05)}${F.range(p + '.obj.morph', cu ? 'Ondulación de la superficie' : 'Deformación / explosión', '', 0, 1, .05)}<p class="d">Cuándo aparece: pestaña <b>Tiempo</b> o la pista «3D» de la línea de tiempo.</p>` : ''}</div>`;
}
function objBind(s, p) {
  if (s.obj.shape !== 'custom' || !s.obj.on) return;
  const setM = u => { s.obj.model = u; commit({ ins: true }); };
  $('#m3lib').onclick = () => openLib(setM, 'model');
  $('#m3up').onclick = () => pickUpload(setM, '.glb,.obj');
  const d = $('[data-drop3d]'); d.ondragover = e => { e.preventDefault(); d.classList.add('dz'); }; d.ondragleave = () => d.classList.remove('dz');
  d.ondrop = e => { e.preventDefault(); d.classList.remove('dz'); const f = e.dataTransfer.files[0]; if (f && /\.(glb|obj)$/i.test(f.name)) upload(f).then(u => u && setM(u)); else toast('Solo archivos .glb u .obj'); };
  const info = $('#m3info'); if (!s.obj.model || !window.QR3D) return;
  info.textContent = 'Leyendo modelo…';
  QR3D.load(s.obj.model).then(r => { info.className = 'okc'; info.textContent = `✓ ${r.tris.toLocaleString()} triángulos · ${r.groups.length} material(es)${r.groups.some(g => g.tex) ? ' · con textura' : ''}${r.tris > 150000 ? ' — pesado para celulares' : ''}`; })
    .catch(e => { info.className = 'bad'; info.textContent = '✕ ' + e.message; });
}
const PRESETS = [['Estudio blanco', '#e9e7e2', '#17150f', '#c8401c'], ['Gris cálido', '#8d8a84', '#f4f1ea', '#e3a857'], ['Noche', '#0f1215', '#efe9dc', '#e3a857'], ['Carbón', '#1b1c1e', '#f1efe9', '#6fd3b0'], ['Papel', '#efe9dc', '#14120e', '#c8401c'], ['Menta', '#0a1613', '#efe9dc', '#5fd0a8'], ['Azul', '#0b0f1d', '#eef0f7', '#5b7cff'], ['Cal', '#12140c', '#eef2df', '#c8f06a']];
function colHTML(s, p) {
  const c = contrast(s.palette.ink, s.palette.bg);
  return `<div class="card"><h3>Colores de la escena</h3><p class="d">Cambian suavemente de una escena a la otra durante la entrada.</p>
   <div class="g3">${F.col(p + '.palette.bg', 'Fondo', 'Bordes, velo de contraste.')}${F.col(p + '.palette.ink', 'Texto', '')}${F.col(p + '.palette.accent', 'Acento', 'Etiqueta, barra, 3D.')}</div>
   <p class="${c < 3 ? 'bad' : c < 4.5 ? 'warn' : 'okc'}" style="margin:4px 0 0">Contraste texto/fondo: <b>${c.toFixed(1)}:1</b> ${c < 3 ? '— muy bajo: subí el velo de contraste o cambiá colores' : c < 4.5 ? '— justo para títulos grandes' : '— bien'}</p>
   <div class="fd"><label>Paletas rápidas</label><div class="row">${PRESETS.map((q, j) => `<button data-pre="${j}" title="${q[0]}"><span class="dot" style="background:${q[1]};box-shadow:inset 0 0 0 1px var(--line)"></span><span class="dot" style="background:${q[2]};box-shadow:inset 0 0 0 1px var(--line)"></span><span class="dot" style="background:${q[3]}"></span>${q[0]}</button>`).join('')}</div></div></div>`;
}
function colBind(s) { $$('[data-pre]').forEach(b => b.onclick = () => { const q = PRESETS[+b.dataset.pre]; s.palette = { bg: q[1], ink: q[2], accent: q[3] }; commit({ ins: true }); }); }

// ---------- General y ayuda ----------
function generalHTML() {
  const g = 'general';
  return `<div class="card"><h3>Identidad</h3><div class="g2">${F.text(g + '.brand', 'Marca (arriba a la izquierda)', '')}${F.text(g + '.hint', 'Invitación a bajar', '')}</div>${F.text(g + '.loader', 'Texto de carga', '')}</div>
  <div class="card"><h3>Navegación entre escenas</h3>
   ${F.sel(g + '.nav', 'Índice de escenas', 'Permite saltar a cualquier escena; resalta la actual.', CAT.nav)}
   ${F.chk(g + '.keys', 'Teclado: ↑ ↓ ← → y RePág/AvPág saltan de escena en escena', 'Siempre aterriza en la pausa (HOLD) de cada escena.')}
   ${F.chk(g + '.snap', 'Imán de escenas', 'Al soltar el scroll en medio de una transición, la web se acomoda sola en la pausa más cercana.')}
   ${F.chk(g + '.progress', 'Barra de progreso', '')}${F.chk(g + '.counter', 'Contador «03 / 07 — Nombre»', '')}</div>
  <div class="card"><h3>Reproducción automática (modo película)</h3>
   ${F.chk(g + '.autoplay.on', 'Avanzar sola', 'La web se reproduce como un video; si la persona scrollea, se detiene y retoma después.', 1)}
   <div class="g2">${F.range(g + '.autoplay.speed', 'Velocidad', 'pantallas por segundo', .05, 1.5, .01, '', true)}${F.range(g + '.autoplay.resume', 'Retomar tras', 'segundos sin tocar', 1, 20, 1, 's')}</div>
   ${F.chk(g + '.autoplay.loop', 'Volver a empezar al terminar', '')}</div>
  <div class="card"><h3>Ritmo y sensación</h3>
   ${F.range(g + '.scrollScale', 'Duración global', 'Multiplica el largo de todas las escenas (1 = como están).', .4, 3, .05, '×')}
   ${F.chk(g + '.smooth', 'Scroll con inercia', 'Movimiento cinematográfico. Desactivalo si se siente lento.')}
   ${F.range(g + '.smoothness', 'Respuesta de la inercia', 'Bajo = más flotante · alto = más directo.', .03, .4, .01)}
   ${F.range(g + '.particles', 'Partículas', '', 0, 1, .05)}${F.range(g + '.grain', 'Grano de película', '', 0, .35, .01)}${F.range(g + '.grade', 'Tinte por defecto', 'Para escenas sin tinte propio.', 0, .8, .05)}</div>`;
}
function helpHTML() {
  return `<div class="card help"><h3>Cómo funciona</h3><ul>
   <li><b>Todo es una línea de tiempo.</b> El scroll del visitante (o la reproducción automática) mueve un cursor por la línea de tiempo de abajo. Cada bloque de color es una escena.</li>
   <li><b>Fases</b> de cada escena: <span style="color:var(--ph-e)">■</span> entrada, <span style="color:var(--ph-d)">■</span> desarrollo, <span style="color:var(--ph-h)">■</span> pausa para leer, <span style="color:var(--ph-x)">■</span> transición (se superpone con la siguiente). Arrastrá los bordes en la línea de tiempo; el borde derecho cambia el largo.</li>
   <li><b>Cámara:</b> los rombos ◆ son keyframes. Cada uno guarda un encuadre (zoom 1×–8×, punto focal y rotación). Se editan en <i>Fondo y cámara</i> arrastrando el recuadro.</li>
   <li><b>Pistas:</b> título, textos, 3D y capas tienen su barra: cuándo aparecen, cuándo se van y cuánto dura la animación (rombos pequeños).</li>
   <li><b>Transiciones</b> entre escenas: 9 tipos. Tocá la etiqueta entre dos bloques o la sección <i>Transición</i>.</li>
   <li><b>Vista previa en vivo:</b> los cambios se ven al instante; <b>nada se publica hasta Guardar</b>. Si cerrás sin guardar, el panel recupera el borrador.</li>
   <li><b>Entre escenas:</b> copiá/pegá ajustes desde el menú ⋯ de cada escena, o aplicalos a todas.</li></ul>
   <h4>Atajos</h4><table>
   <tr><td><kbd>Espacio</kbd></td><td>Reproducir / pausar</td></tr><tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Mover el cursor (con <kbd>Shift</kbd>: más rápido)</td></tr>
   <tr><td><kbd>[</kbd> <kbd>]</kbd></td><td>Escena anterior / siguiente</td></tr><tr><td><kbd>K</kbd></td><td>Keyframe de cámara en el cursor</td></tr>
   <tr><td><kbd>Supr</kbd></td><td>Eliminar keyframe seleccionado</td></tr><tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></td><td>Deshacer / rehacer</td></tr>
   <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Guardar</td></tr><tr><td><kbd>Ctrl</kbd>+<kbd>D</kbd></td><td>Duplicar escena</td></tr></table></div>`;
}

// ---------------- línea de tiempo ----------------
const TL = { z: 1, zoom: 0, rh: 30, padL: 14 };
function tlScale() { const w = $('#tls').clientWidth - 30; const fit = w / Math.max(1, TM.total); TL.z = fit * (1 + Math.pow(TL.zoom / 100, 1.6) * 24); return TL.z; }
const X = t => TL.padL + t * TL.z, UT = px => (px - TL.padL) / TL.z;
function drawTL() {
  if (!cfg) return; tlScale(); document.documentElement.style.setProperty('--rh', TL.rh + 'px');
  const C = $('#tlc'), Lb = $('#tll'), s = cfg.scenes[sel], ts = TM.scenes[sel], W = X(TM.total) + 40;
  const rows = [['rul', 'Tiempo', ''], ['big', '<b>Escenas</b>', '']], trk = [];
  let h = `<div class="rul" style="width:${W}px">`;
  const step = TL.z * 100 > 70 ? 50 : 100;
  for (let t = 0; t <= TM.total + 1; t += step) h += `<i style="left:${X(t)}px" class="${t % 100 ? 's' : ''}">${t % 100 ? '' : `<span>${t / 100}</span>`}</i>`;
  h += `</div><div class="trk big" style="width:${W}px">`;
  TM.scenes.forEach((t, i) => {
    const sc = cfg.scenes[i], ph = t.ph, top = (i % 2) * TL.rh + 3;
    h += `<div class="blk${i === sel ? ' on' : ''}" data-b="${i}" style="left:${X(t.T0)}px;width:${t.L * TL.z}px;top:${top}px" title="${esc(sc.name)} · doble clic para verla">
      <i style="width:${ph.e * 100}%;background:var(--ph-e)"></i><i style="width:${ph.d * 100}%;background:var(--ph-d)"></i><i class="h" style="width:${ph.h * 100}%;background:var(--ph-h)"></i><i style="width:${ph.x * 100}%;background:var(--ph-x)"></i>
      <span class="lb">${pad(i + 1)} ${esc(sc.name)} <small>${fmtT(t.L)}</small></span>
      ${[ph.e, ph.e + ph.d, ph.e + ph.d + ph.h].map((v, k) => `<span class="dv" data-dv="${i}:${k}" style="left:${v * 100}%" title="Arrastrá para cambiar la proporción de las fases"></span>`).join('')}<span class="re" data-re="${i}" title="Arrastrá para cambiar el largo"></span></div>`;
    if (i > 0) { const a = TM.scenes[i - 1], mid = (t.T0 + a.end) / 2; h += `<span class="trn" data-tr="${i}" style="left:${X(mid)}px;top:${TL.rh - 7}px" title="Transición: ${esc(CAT.trans[sc.trans.type])} (clic para editar)">${TSHORT[sc.trans.type]}</span>`; }
  });
  h += `</div>`;
  // pistas de la escena seleccionada
  const clipH = (id, tr, color, label, base) => `<div class="clip" data-c="${id}" style="--c:${color};left:${X(ts.T0 + ts.L * tr.from / 100)}px;width:${Math.max(4, ts.L * (tr.to - tr.from) / 100 * TL.z)}px">
     <i class="rin" style="width:${Math.min(100, tr.rin / Math.max(.01, tr.to - tr.from) * 100)}%"></i><i class="rout" style="width:${Math.min(100, tr.rout / Math.max(.01, tr.to - tr.from) * 100)}%"></i><span>${label}</span>
     <i class="e l" data-ce="${id}:from"></i><i class="e r" data-ce="${id}:to"></i><i class="rh" data-ce="${id}:rin" style="left:${Math.min(100, tr.rin / Math.max(.01, tr.to - tr.from) * 100)}%"></i><i class="rh" data-ce="${id}:rout" style="left:${100 - Math.min(100, tr.rout / Math.max(.01, tr.to - tr.from) * 100)}%"></i></div>`;
  const scope = `<div class="scope" style="left:${X(ts.T0)}px;width:${ts.L * TL.z}px"></div>`;
  // cámara: keyframes + curva de zoom
  const ks = s.cam.keys, smax = Math.max(...ks.map(k => k.s)), smin = Math.min(...ks.map(k => k.s)), pts = [];
  for (let q = 0; q <= 60; q++) { const u = q / 60 * 100, v = Q.evalKeys(ks, u).s; pts.push(`${(X(ts.T0 + ts.L * u / 100)).toFixed(1)},${(TL.rh - 4 - (smax > smin ? (v - smin) / (smax - smin) : .5) * (TL.rh - 10)).toFixed(1)}`); }
  h += `<div class="trk" data-row="cam" style="width:${W}px">${scope}<svg class="zc" width="${W}" height="${TL.rh}"><polyline points="${pts.join(' ')}" fill="none" stroke="#ffb020" stroke-width="1.5" opacity=".55"/></svg>${ks.map((k, j) => `<i class="kf${j === selKey ? ' on' : ''}" data-kf="${j}" style="left:${X(ts.T0 + ts.L * k.t / 100)}px" title="Keyframe ${j + 1}: ${k.s.toFixed(2)}× · ${r2(k.t)}%"></i>`).join('')}</div>`;
  rows.push(['', `◆ <b>Cámara</b> <small>${s.cam.auto ? 'auto' : ''}</small>`]);
  h += `<div class="trk" style="width:${W}px">${scope}${clipH('title', s.tracks.title, '#e0584f', 'Título', 'tracks.title')}</div>`; rows.push(['', 'T <b>Título</b>']);
  h += `<div class="trk" style="width:${W}px">${scope}${clipH('meta', s.tracks.meta, '#4fa3e0', 'Etiqueta · texto · botón')}</div>`; rows.push(['', '¶ <b>Textos</b>']);
  if (s.obj.on) { h += `<div class="trk" style="width:${W}px">${scope}${clipH('obj', s.tracks.obj, '#9b6ce0', CAT.shape[s.obj.shape])}</div>`; rows.push(['', '◇ <b>3D</b>']); }
  s.layers.forEach((l, j) => { h += `<div class="trk" style="width:${W}px">${scope}${clipH('ly' + j, l, '#3dbb85', l.caption || (l.src || '').split('/').pop() || 'vacía')}</div>`; rows.push(['', `▣ <b>Capa ${j + 1}</b>`]); });
  if (isV(s.media)) { h += `<div class="trk" style="width:${W}px">${scope}<div class="clip" style="--c:#888;left:${X(ts.T0)}px;width:${ts.L * TL.z}px;cursor:default"><span>▶ Video · ${CAT.video[s.video.mode]}${s.video.mode === 'scrub' ? ' — avanza con el scroll' : ''}</span></div></div>`; rows.push(['', '▶ <b>Video</b>']); }
  h += `<div id="ph" style="left:${X(T)}px"></div>`;
  C.innerHTML = h; C.style.width = W + 'px';
  Lb.innerHTML = rows.map(([c, t]) => `<div class="${c}">${t}</div>`).join('') + '<div style="height:40px;border:0"></div>';
  bindTL();
}
function snapT(t, excl) {
  if (!magnet) return t; const cand = [T]; TM.scenes.forEach(s => cand.push(s.T0, s.te, s.td, s.th, s.end));
  cand.push(...cfg.scenes[sel].cam.keys.map(k => TM.scenes[sel].T0 + TM.scenes[sel].L * k.t / 100));
  let best = t, bd = 7 / TL.z; cand.forEach(c => { if (c !== excl && Math.abs(c - t) < bd) { bd = Math.abs(c - t); best = c; } }); return best;
}
function drag(e, move, up) { e.preventDefault(); e.stopPropagation(); const x0 = e.clientX, el = e.target; el.setPointerCapture?.(e.pointerId); const mv = ev => move((ev.clientX - x0) / TL.z, ev); const u = ev => { removeEventListener('pointermove', mv); removeEventListener('pointerup', u); up && up(ev); }; addEventListener('pointermove', mv); addEventListener('pointerup', u); }
function bindTL() {
  const C = $('#tlc');
  $$('.blk', C).forEach(b => {
    const i = +b.dataset.b;
    b.onpointerdown = e => { if (e.target.closest('.dv,.re')) return; if (sel !== i) { sel = i; selKey = 0; selLayer = 0; drawAll(); } };
    b.ondblclick = () => post({ type: 'qr:goto', i, at: 'hold' });
  });
  $$('.dv', C).forEach(d => d.onpointerdown = e => {
    const [i, k] = d.dataset.dv.split(':').map(Number), s = cfg.scenes[i], t = TM.scenes[i], P = s.phases, tot = P.enter + P.develop + P.hold + P.exit;
    const pc = [P.enter, P.develop, P.hold, P.exit].map(v => v / tot * 100), bnd = [pc[0], pc[0] + pc[1], pc[0] + pc[1] + pc[2]];
    drag(e, du => {
      let b = clamp(bnd[k] + du / t.L * 100, (k ? bnd[k - 1] : 0) + 1, (k < 2 ? bnd[k + 1] : 100) - (k === 2 && i === cfg.scenes.length - 1 ? 0 : 1));
      const nb = [...bnd]; nb[k] = snapT(t.T0 + t.L * b / 100) === t.T0 + t.L * b / 100 ? b : (snapT(t.T0 + t.L * b / 100) - t.T0) / t.L * 100;
      s.phases = { enter: Math.round(nb[0]), develop: Math.round(nb[1] - nb[0]), hold: Math.round(nb[2] - nb[1]), exit: Math.round(100 - nb[2]) };
      renorm(); drawTL(); clearTimeout(tP); tP = setTimeout(pushPreview, 50);
    }, () => commit({ ins: sec === 'time' || sec === 'trans' }));
  });
  $$('.re', C).forEach(d => d.onpointerdown = e => {
    const i = +d.dataset.re, s = cfg.scenes[i], L0 = s.length, sc = cfg.general.scrollScale || 1;
    drag(e, du => { s.length = clamp(Math.round((L0 + du / sc) / 10) * 10, 100, 1500); renorm(); drawTL(); clearTimeout(tP); tP = setTimeout(pushPreview, 50); }, () => commit({ ins: true }));
  });
  $$('.trn', C).forEach(b => b.onclick = e => { e.stopPropagation(); sel = +b.dataset.tr; sec = 'trans'; drawAll(); });
  $$('.kf', C).forEach(k => k.onpointerdown = e => {
    const j = +k.dataset.kf, s = cfg.scenes[sel], t = TM.scenes[sel], key = s.cam.keys[j], t0 = key.t;
    selKey = j; seek(t.T0 + t.L * key.t / 100); if (sec === 'cam') { drawIns(); } else drawTL();
    let moved = false;
    drag(e, du => { moved = true; const nt = snapT(t.T0 + t.L * clamp(t0 + du / t.L * 100, 0, 100), t.T0 + t.L * t0 / 100); key.t = r2(clamp((nt - t.T0) / t.L * 100, 0, 100)); s.cam.auto = false; s.motion = 'custom'; s.cam.keys.sort((a, b) => a.t - b.t); selKey = s.cam.keys.indexOf(key); drawTL(); seek(t.T0 + t.L * key.t / 100); clearTimeout(tP); tP = setTimeout(pushPreview, 50); },
      () => { if (moved) commit({ ins: sec === 'cam' }); });
  });
  const camRow = $('[data-row="cam"]', C); if (camRow) camRow.ondblclick = e => { if (e.target.closest('.kf')) return; const r = C.getBoundingClientRect(); seek(UT(e.clientX - r.left)); addKeyAtCursor(); };
  $$('[data-ce]', C).forEach(h => h.onpointerdown = e => {
    const [id, f] = h.dataset.ce.split(':'), s = cfg.scenes[sel], t = TM.scenes[sel], tr = id.startsWith('ly') ? s.layers[+id.slice(2)] : s.tracks[id], o = { ...tr };
    drag(e, du => { const d = du / t.L * 100; const sn = v => (snapT(t.T0 + t.L * v / 100) - t.T0) / t.L * 100;
      if (f === 'from') tr.from = r2(clamp(sn(o.from + d), 0, tr.to - 1)); else if (f === 'to') tr.to = r2(clamp(sn(o.to + d), tr.from + 1, 100));
      else if (f === 'rin') tr.rin = r2(clamp(o.rin + d, .5, tr.to - tr.from)); else tr.rout = r2(clamp(o.rout - d, .5, tr.to - tr.from));
      if (!id.startsWith('ly')) s.tracks.auto = false; drawTL(); clearTimeout(tP); tP = setTimeout(pushPreview, 50); }, () => commit({ ins: sec === 'time' || sec === 'lay' }));
  });
  $$('.clip[data-c]', C).forEach(c => c.onpointerdown = e => {
    if (e.target.dataset.ce) return; const id = c.dataset.c, s = cfg.scenes[sel], t = TM.scenes[sel], tr = id.startsWith('ly') ? s.layers[+id.slice(2)] : s.tracks[id], o = { ...tr }, len = o.to - o.from;
    drag(e, du => { const d = du / t.L * 100; tr.from = r2(clamp(o.from + d, 0, 100 - len)); tr.to = r2(tr.from + len); if (!id.startsWith('ly')) s.tracks.auto = false; drawTL(); clearTimeout(tP); tP = setTimeout(pushPreview, 50); }, () => commit({ ins: sec === 'time' || sec === 'lay' }));
  });
  const rul = $('.rul', C);
  const scrub = e => { const r = C.getBoundingClientRect(); seek(clamp(UT(e.clientX - r.left), 0, TM.total)); };
  rul.onpointerdown = e => { pause(); dragPH = true; scrub(e); drag(e, (du, ev) => scrub(ev), () => { dragPH = false; }); };
  $$('.trk', C).forEach(r => r.addEventListener('pointerdown', e => { if (e.target === r || e.target.classList.contains('zc') || e.target.tagName === 'polyline') { pause(); scrub(e); } }));
}
function placePH() { const p = $('#ph'); if (p) { p.style.left = X(T) + 'px'; const sc = $('#tls'), x = X(T); if (playing && (x < sc.scrollLeft + 20 || x > sc.scrollLeft + sc.clientWidth - 40)) sc.scrollLeft = x - sc.clientWidth * .25; } $('#tc').innerHTML = `${fmtT(T)} <small>/ ${fmtT(TM.total)} pant · escena ${pad(Q.sceneAt(TM, T) + 1)}</small>`; }

// ---------------- transporte ----------------
function seek(t) { T = clamp(t, 0, TM.total); post({ type: 'qr:seek', t: T }); placePH(); if (sec === 'cam') drawFrame(); }
function play(loop, range) { playing = true; follow = !range; $('#pvplay').textContent = '⏸'; post({ type: 'qr:play', speed: TM.total / (100 * (cfg.general.duration || 44)) * (+$('#pvspd').value), loop: !!(loop || loopScene), range: range || (loopScene ? [TM.scenes[sel].T0, TM.scenes[sel].end] : null) }); }
function pause() { if (!playing) return; playing = false; $('#pvplay').textContent = '▶'; post({ type: 'qr:pause' }); }
$('#pvplay').onclick = () => { if (playing) pause(); else { if (T >= TM.total - .5) seek(0); if (loopScene && (T < TM.scenes[sel].T0 || T > TM.scenes[sel].end)) seek(TM.scenes[sel].T0); play(); } };
$('#pvprev').onclick = () => { pause(); sel = Math.max(0, Q.sceneAt(TM, T) - (T > TM.scenes[Q.sceneAt(TM, T)].hold + 2 ? 0 : 1)); seek(TM.scenes[sel].hold); drawAll(); };
$('#pvnext').onclick = () => { pause(); sel = Math.min(cfg.scenes.length - 1, Q.sceneAt(TM, T) + (T < TM.scenes[Q.sceneAt(TM, T)].hold - 2 ? 0 : 1)); seek(TM.scenes[sel].hold); drawAll(); };
$('#pvloop').onclick = () => { loopScene = !loopScene; $('#pvloop').classList.toggle('on', loopScene); if (playing) play(); };
$('#pvspd').onchange = () => { if (playing) play(); };
addEventListener('message', ev => {
  const m = ev.data || {};
  if (m.type === 'qr:ready' && !pvReady) { pvReady = true; pushPreview(); setTimeout(() => seek(T), 60); post({ type: 'qr:guides', on: $('#gd').classList.contains('on') }); }
  if (m.type === 'qr:time' && !dragPH) {
    if (Math.abs(m.t - T) > .01) { const was = Q.sceneAt(TM, T); T = m.t; placePH(); const now = Q.sceneAt(TM, T); if (playing && now !== was) { if (!loopScene && follow) { sel = now; drawAll(); } else drawList(); } else if (now !== was) drawList(); if (sec === 'cam' && playing) drawFrame(); }
    if (!m.playing && playing) { playing = false; $('#pvplay').textContent = '▶'; }
  }
});
// dispositivos
const DEV = { desk: [1440, 810], tab: [1024, 768], mob: [390, 844] }; let dev = LS.get('qr-dev') || 'desk';
function fitPV() { const b = $('#pvbox').getBoundingClientRect(), [w, h] = DEV[dev], k = Math.min((b.width - 16) / w, (b.height - 16) / h); Object.assign(pvf.style, { width: w + 'px', height: h + 'px', transform: `translate(${-w * k / 2}px,${-h * k / 2}px) scale(${k})` }); }
$$('#dev button').forEach(b => { b.classList.toggle('on', b.dataset.d === dev); b.onclick = () => { dev = b.dataset.d; LS.set('qr-dev', dev); $$('#dev button').forEach(x => x.classList.toggle('on', x === b)); fitPV(); pvReady = false; pvf.src = 'index.html?preview=1&t=' + T; }; });
new ResizeObserver(() => { fitPV(); drawTL(); if ($('#stagebox')) drawStage(); }).observe($('#pvbox'));
$('#gd').onclick = () => { const on = !$('#gd').classList.contains('on'); $('#gd').classList.toggle('on', on); post({ type: 'qr:guides', on }); };
$('#sf').onclick = () => { const on = !$('#sf').classList.contains('on'); $('#sf').classList.toggle('on', on); post({ type: 'qr:safe', on }); };
// barra de la línea de tiempo
$('#tlz').oninput = e => { TL.zoom = +e.target.value; const sc = $('#tls'), c = (sc.scrollLeft + sc.clientWidth / 2 - TL.padL) / TL.z; drawTL(); sc.scrollLeft = X(c) - sc.clientWidth / 2; };
$('#tlfit').onclick = () => { TL.zoom = 0; $('#tlz').value = 0; drawTL(); };
$('#addk').onclick = addKeyAtCursor;
$('#snapb').classList.toggle('on', magnet); $('#snapb').onclick = () => { magnet = !magnet; LS.set('qr-magnet', magnet); $('#snapb').classList.toggle('on', magnet); };
$('#tls').onscroll = () => { $('#tll').scrollTop = $('#tls').scrollTop; };
$('#tls').addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); TL.zoom = clamp(TL.zoom - e.deltaY * .08, 0, 100); $('#tlz').value = TL.zoom; drawTL(); } }, { passive: false });
$('#split').onpointerdown = e => { e.preventDefault(); const h0 = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tlh')) || 260, y0 = e.clientY; const mv = ev => { const h = clamp(h0 - (ev.clientY - y0), 120, innerHeight - 240); document.documentElement.style.setProperty('--tlh', h + 'px'); LS.set('qr-tlh', h); }; addEventListener('pointermove', mv); addEventListener('pointerup', () => removeEventListener('pointermove', mv), { once: true }); };
{ const h = LS.get('qr-tlh'); if (h) document.documentElement.style.setProperty('--tlh', h + 'px'); }

// ---------------- servidor, biblioteca, subir ----------------
async function ping() {
  if (!key()) { server = false; $('#srv').className = 'bad'; $('#srv').innerHTML = '<i></i>Poné la contraseña'; return false; }
  try { const r = await fetch('api/ping', { method: 'POST', headers: { 'X-Key': key() } }); server = r.ok; const e = $('#srv'); e.className = r.ok ? 'ok' : 'bad'; e.innerHTML = '<i></i>' + (r.ok ? 'Conectado' : r.status === 401 ? 'Contraseña incorrecta' : 'Sin servidor'); }
  catch { server = false; $('#srv').className = 'bad'; $('#srv').innerHTML = '<i></i>Sin servidor (solo descarga)'; }
  return server;
}
async function loadLib() { try { const r = await fetch('api/assets', { method: 'POST', headers: { 'X-Key': key() } }); if (r.ok) lib = (await r.json()).files.filter(f => f.kind !== 'audio'); } catch { } return lib; }
async function upload(f) {
  if (!server && !(await ping())) { toast('Para subir archivos abrí el panel con iniciar.bat / iniciar.sh y poné la contraseña', 4000); return null; }
  if (f.size > 80 * 1024 * 1024) { toast('Máximo 80 MB'); return null; }
  if (/^video/.test(f.type) && f.size > 12 * 1024 * 1024) toast('Aviso: video pesado (' + (f.size / 1048576).toFixed(1) + ' MB). Ideal: menos de 8 MB.', 4000);
  msg('Subiendo ' + f.name + '…');
  try { const r = await fetch('api/upload', { method: 'POST', headers: { 'X-Key': key(), 'X-Filename': encodeURIComponent(f.name) }, body: f }), j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); lib = null; toast('Subido: ' + f.name); refreshDirty(); return j.path; }
  catch (e) { msg('Error: ' + e.message, 'bad'); return null; }
}
function pickUpload(cb, accept) { const i = $('#upf'); i.accept = accept || 'image/*,video/mp4,video/webm,.glb,.obj'; i.value = ''; i.onchange = async () => { const f = i.files[0]; if (!f) return; const p = await upload(f); if (p) cb(p); }; i.click(); }
async function openLib(cb, only) {
  const w = modal('Biblioteca de medios', '<div class="drop" id="ldz">Arrastrá acá imágenes, videos o modelos 3D (.glb/.obj) para subirlos · o <button id="lup">elegir archivo…</button></div><div class="row" style="margin-bottom:10px"><div class="seg" id="lf"><button data-f="all" class="on">Todo</button><button data-f="image">Imágenes</button><button data-f="video">Videos</button><button data-f="model">Modelos 3D</button></div><input type="text" id="lq" placeholder="Buscar…" style="max-width:220px"></div><div class="lib" id="lg">Cargando…</div>', [{ t: 'Cerrar' }], true);
  let f = only || 'all'; $$('#lf button', w).forEach(x => x.classList.toggle('on', x.dataset.f === f));
  const draw = () => {
    const q = ($('#lq', w).value || '').toLowerCase();
    let files = lib || [...new Set(cfg.scenes.flatMap(s => [s.media, s.obj.model, ...s.layers.map(l => l.src)]).filter(Boolean))].map(p => ({ path: p, kind: /\.(glb|obj)$/i.test(p) ? 'model' : isV(p) ? 'video' : 'image' }));
    files = files.filter(x => (f === 'all' || x.kind === f) && x.path.toLowerCase().includes(q));
    $('#lg', w).innerHTML = (!lib ? '<p style="grid-column:1/-1;color:var(--mute)">Sin servidor: se muestran solo los archivos que ya usa el proyecto.</p>' : '') + files.map(x => `<button data-p="${esc(x.path)}"><div class="t" style="${x.kind === 'image' ? `background-image:url('${esc(x.path)}')` : ''}">${x.kind === 'video' ? `<video src="${esc(x.path)}" muted preload="metadata"></video>` : x.kind === 'model' ? '<span style="display:grid;place-items:center;height:100%;color:#bbb;font-size:28px">◇ 3D</span>' : ''}</div><small>${esc(x.path.split('/').pop())}${x.size ? ' · ' + (x.size / 1048576).toFixed(1) + ' MB' : ''}${x.kind === 'video' && x.size > 8388608 ? ' ⚠' : ''}</small></button>`).join('');
    $$('[data-p]', w).forEach(b => { b.onclick = () => { w.remove(); cb(b.dataset.p); }; const v = $('video', b); if (v) { b.onmouseenter = () => v.play().catch(() => { }); b.onmouseleave = () => v.pause(); } });
  };
  $$('#lf button', w).forEach(b => b.onclick = () => { f = b.dataset.f; $$('#lf button', w).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#lq', w).oninput = draw;
  const dz = $('#ldz', w); dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = async e => { e.preventDefault(); dz.classList.remove('over'); for (const file of e.dataTransfer.files) await upload(file); await loadLib(); draw(); };
  $('#lup', w).onclick = () => pickUpload(async p => { await loadLib(); draw(); });
  if (!lib) await loadLib(); draw();
}
async function save() {
  clearTimeout(tU); pushUndo();
  if (!(await ping())) { download(); return; }
  const r = await fetch('api/config', { method: 'POST', headers: { 'X-Key': key(), 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  if (r.ok) { saved = JSON.stringify(cfg); LS.del('qr-panel-draft'); msg('Guardado ✓ ' + new Date().toLocaleTimeString().slice(0, 5), 'ok'); toast('Guardado — la web ya está actualizada'); }
  else msg(r.status === 401 ? 'Contraseña incorrecta' : 'No se pudo guardar (' + r.status + ')', 'bad');
}
function download() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 1)], { type: 'application/json' })); a.download = 'config.json'; a.click(); msg('Sin servidor: se descargó config.json', 'bad'); toast('Reemplazá config.json en la carpeta del sitio', 4000); }

// ---------------- revisión ----------------
function review() {
  const out = [], S = cfg.scenes, sizes = Object.fromEntries((lib || []).map(f => [f.path, f.size]));
  S.forEach((s, i) => {
    const n = `${pad(i + 1)} ${s.name}`;
    if (!s.media) out.push(['warn', n, 'No tiene fondo.', i, 'cam']);
    else if (lib && !(s.media in sizes)) out.push(['bad', n, 'El archivo de fondo no existe: ' + s.media, i, 'cam']);
    if (isV(s.media) && sizes[s.media] > 8388608) out.push(['warn', n, `Video pesado (${(sizes[s.media] / 1048576).toFixed(1)} MB): puede tardar en celulares.`, i, 'cam']);
    const c = contrast(s.palette.ink, s.palette.bg); if (c < 3 && (s.scrim || 0) < .3) out.push(['warn', n, `Contraste bajo entre texto y fondo (${c.toFixed(1)}:1) y sin velo.`, i, 'col']);
    if (s.ctaText && !s.ctaHref) out.push(['bad', n, 'El botón no tiene enlace.', i, 'cont']);
    if ((s.title || s.text) && TM.scenes[i].ph.h < .06) out.push(['warn', n, 'Casi sin pausa para leer (HOLD muy corto).', i, 'time']);
    if (i === S.length - 1 && s.phases.exit > 0) out.push(['warn', n, 'La última escena tiene transición de salida: conviene ponerla en 0.', i, 'time']);
    if (i > 0 && TM.scenes[i - 1].overlap < 6 && s.trans.type !== 'cut') out.push(['info', n, 'Transición muy breve: casi un corte.', i, 'trans']);
    s.layers.forEach((l, j) => { if (!l.src) out.push(['warn', n, `La capa ${j + 1} está vacía.`, i, 'lay']); });
  });
  const dup = S.map(s => s.name).filter((v, i, a) => a.indexOf(v) !== i); if (dup.length) out.push(['info', 'General', 'Nombres repetidos: ' + [...new Set(dup)].join(', '), 0, 'cont']);
  return out;
}
function updRev() { const r = review(), n = r.filter(x => x[0] !== 'info').length; $('#rev').innerHTML = 'Revisión' + (n ? ` <b class="warn">⚠ ${n}</b>` : ' <span class="okc">✓</span>'); }
$('#rev').onclick = async () => {
  if (!lib) await loadLib(); const r = review();
  const w = modal('Revisión antes de publicar', r.length ? `<ul class="review" style="padding-left:18px">${r.map(([l, n, m, i, s], k) => `<li class="${l === 'bad' ? 'bad' : l === 'warn' ? 'warn' : ''}"><b>${esc(n)}</b> — ${esc(m)} <button class="ghost" data-go="${k}">Ir →</button></li>`).join('')}</ul>` : '<p class="okc">Todo en orden ✓</p>');
  $$('[data-go]', w).forEach(b => b.onclick = () => { const x = r[+b.dataset.go]; sel = x[3]; sec = x[4]; tab = 'es'; setTab(); w.remove(); drawAll(); });
};
$('#more').onclick = e => menu(e, [
  { t: '⬇ Descargar copia de config.json', f: download },
  { t: '⬆ Importar config.json…', f: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = async () => { try { cfg = JSON.parse(await i.files[0].text()); sel = 0; commit({ ui: 'all' }); toast('Importado (falta Guardar)'); } catch { toast('Archivo inválido'); } }; i.click(); } },
  { t: '↺ Volver a los originales', f: () => { if (confirm('¿Cargar la configuración original? (se puede deshacer)')) { cfg = JSON.parse(JSON.stringify(def)); sel = 0; commit({ ui: 'all' }); } } },
  '-',
  { t: '◐ Tema claro / oscuro', f: () => { const r = document.documentElement, dark = r.dataset.theme === 'dark' || (!r.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches); r.dataset.theme = dark ? 'light' : 'dark'; LS.set('qr-theme', r.dataset.theme); } }
]);

// ---------------- teclado ----------------
addEventListener('keydown', e => {
  const typing = e.target.closest('input,textarea,select,[contenteditable]'), mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
  if (typing) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); undo(true); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); const S = cfg.scenes; S.splice(sel + 1, 0, JSON.parse(JSON.stringify(S[sel]))); S[sel + 1].name += ' (copia)'; sel++; commit({ ui: 'all' }); return; }
  if (e.key === ' ') { e.preventDefault(); $('#pvplay').click(); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); pause(); seek(T + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 25 : 3)); }
  else if (e.key === '[') $('#pvprev').click(); else if (e.key === ']') $('#pvnext').click();
  else if (e.key.toLowerCase() === 'k') addKeyAtCursor();
  else if ((e.key === 'Delete' || e.key === 'Backspace') && sec === 'cam') delKey();
  else if (e.key === 'Home') seek(0); else if (e.key === 'End') seek(TM.total);
});
addEventListener('beforeunload', e => { if (cfg && isDirty()) e.preventDefault(); });

// ---------------- pestañas y arranque ----------------
function setTab() { $$('[data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === tab)); }
$$('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; setTab(); drawAll(); });
function drawAll() { dispatchEvent(new Event('qr:editor-change')); drawList(); drawIns(); drawTL(); placePH(); updRev(); }
$('#undo').onclick = () => undo(false); $('#redo').onclick = () => undo(true); $('#save').onclick = save;
$('#key').value = sessionStorage.getItem('k') || ''; $('#key').onchange = () => { sessionStorage.setItem('k', key()); ping().then(() => { lib = null; }); };
{ const th = LS.get('qr-theme'); if (th) document.documentElement.dataset.theme = th; }
(async () => {
  let raw; try { raw = await (await fetch('config.json?t=' + Date.now())).json(); } catch { raw = { scenes: [] }; }
  try { def = Q.normalize(await (await fetch('config.default.json')).json()); } catch { def = Q.normalize(raw); }
  cfg = Q.normalize(raw); saved = JSON.stringify(cfg); H.cur = saved; TM = Q.timing(cfg); undoBtns();
  const d = LS.get('qr-panel-draft');
  if (d && d.cfg && JSON.stringify(Q.normalize(d.cfg)) !== saved) {
    const b = $('#draft'); b.style.display = 'flex'; b.innerHTML = `<span>Hay cambios sin guardar del ${new Date(d.at).toLocaleString().slice(0, -3)}.</span><button class="pri" id="drok">Recuperar</button><button class="ghost" id="drno">Descartar</button>`;
    $('#drok').onclick = () => { cfg = Q.normalize(d.cfg); b.style.display = 'none'; commit({ ui: 'all' }); toast('Borrador recuperado (falta Guardar)'); };
    $('#drno').onclick = () => { LS.del('qr-panel-draft'); b.style.display = 'none'; };
  }
  fitPV(); drawAll(); refreshDirty(); ping();
  if (!pvf.src.includes('preview')) pvf.src = 'index.html?preview=1';
})();
})();
