/* ESTUDIO QR — modelo de datos compartido por el motor (app.js) y el panel (admin.html).
   Normaliza config.json (incluye configs viejas), calcula la línea de tiempo y evalúa keyframes.
   Unidad de tiempo: "pantallas de scroll" x100 (length 300 = 3 pantallas). */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- curvas de aceleración ----------
  const EASE = {
    linear: t => t,
    in: t => t * t * t,
    out: t => 1 - Math.pow(1 - t, 3),
    inOut: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    expo: t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    sine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    step: t => (t < 1 ? 0 : 1)
  };
  const ease = (name, t) => (EASE[name] || EASE.inOut)(clamp(t, 0, 1));

  // ---------- catálogos (con nombres para el panel) ----------
  const CAT = {
    ease: { linear: 'Lineal', inOut: 'Suave (entra y sale)', out: 'Frena al final', in: 'Acelera', sine: 'Seno (muy suave)', expo: 'Exponencial', back: 'Rebote leve', step: 'Corte seco' },
    trans: {
      mask: 'Máscara que se abre', fade: 'Fundido', iris: 'Iris (círculo)', wipe: 'Cortina', slide: 'Deslizar',
      zoom: 'Zoom a través', pixel: 'Píxeles QR', blur: 'Desenfoque', cut: 'Corte directo'
    },
    dir: { left: '← Desde la derecha', right: '→ Desde la izquierda', up: '↑ Desde abajo', down: '↓ Desde arriba' },
    textAnim: { rise: 'Emergen desde abajo', fade: 'Aparecen (fundido)', blur: 'Desenfoque a nítido', scale: 'Crecen', scramble: 'Código que se descifra', none: 'Sin animación' },
    layerAnim: { fade: 'Fundido', rise: 'Sube', scale: 'Crece', none: 'Sin animación' },
    motion: { dolly: 'Acercarse (push-in)', pullout: 'Alejarse (pull-out)', orbit: 'Paneo lateral', still: 'Casi quieta', panL: 'Paneo hacia la izquierda', panR: 'Paneo hacia la derecha', tilt: 'Subir (tilt)', punch: 'Zoom fuerte al detalle', custom: 'Personalizado (keyframes)' },
    textPos: { bl: 'Abajo izquierda', bc: 'Abajo centro', br: 'Abajo derecha', ml: 'Medio izquierda', c: 'Centro', mr: 'Medio derecha', tl: 'Arriba izquierda', tr: 'Arriba derecha' },
    size: { xl: 'Gigante', l: 'Grande', m: 'Mediano', s: 'Chico' },
    video: { loop: 'En bucle', scrub: 'Atado al scroll', once: 'Una vez al entrar' },
    shape: { knot: 'Nudo', crystal: 'Cristal', sphere: 'Esfera líquida', qrcube: 'Cubo QR (vóxeles)', custom: '★ Mi modelo 3D (.glb / .obj)' },
    mat: { original: 'Colores y texturas del modelo', glass: 'Vidrio (como las formas del sitio)', solid: 'Color de acento de la escena' },
    nav: { dots: 'Puntos a la derecha', list: 'Lista de capítulos', none: 'Sin navegación' },
    fit: { cover: 'Llenar la pantalla', contain: 'Mostrar completa' }
  };

  // ---------- presets de cámara → keyframes ----------
  function presetKeys(motion, ph) {
    const e = ph.e * 100, d = (ph.e + ph.d) * 100, h = (ph.e + ph.d + ph.h) * 100;
    const K = (t, s, x = .5, y = .5, r = 0, ez = 'inOut') => ({ t: +t.toFixed(2), s: +s.toFixed(3), x, y, r, e: ez });
    switch (motion) {
      case 'pullout': return [K(0, 1.52), K(e, 1.38, .5, .5, 0, 'out'), K(d, 1.1), K(h, 1.08, .5, .5, 0, 'linear'), K(100, 1.02, .5, .5, 0, 'in')];
      case 'orbit': return [K(0, 1.25, .47), K(e, 1.14, .48, .5, 0, 'out'), K(d, 1.16, .52), K(h, 1.17, .53, .5, 0, 'linear'), K(100, 1.22, .55, .5, 0, 'in')];
      case 'still': return [K(0, 1.18), K(e, 1.06, .5, .5, 0, 'out'), K(d, 1.07), K(h, 1.08, .5, .5, 0, 'linear'), K(100, 1.1, .5, .5, 0, 'in')];
      case 'panL': return [K(0, 1.35, .62), K(e, 1.3, .6, .5, 0, 'out'), K(d, 1.3, .4), K(h, 1.3, .38, .5, 0, 'linear'), K(100, 1.34, .36, .5, 0, 'in')];
      case 'panR': return [K(0, 1.35, .38), K(e, 1.3, .4, .5, 0, 'out'), K(d, 1.3, .6), K(h, 1.3, .62, .5, 0, 'linear'), K(100, 1.34, .64, .5, 0, 'in')];
      case 'tilt': return [K(0, 1.35, .5, .66), K(e, 1.3, .5, .62, 0, 'out'), K(d, 1.3, .5, .4), K(h, 1.3, .5, .38, 0, 'linear'), K(100, 1.33, .5, .36, 0, 'in')];
      case 'punch': return [K(0, 1.14), K(e, 1.02, .5, .5, 0, 'out'), K(d, 2.4, .62, .42, 0, 'expo'), K(h, 2.45, .62, .42, 0, 'linear'), K(100, 3, .62, .42, 0, 'in')];
      default: return [K(0, 1.14), K(e, 1.02, .5, .5, 0, 'out'), K(d, 1.2), K(h, 1.22, .5, .5, 0, 'linear'), K(100, 1.42, .5, .5, 0, 'in')];
    }
  }
  function evalKeys(keys, tt) {
    if (!keys || !keys.length) return { s: 1, x: .5, y: .5, r: 0 };
    if (tt <= keys[0].t) return keys[0];
    for (let i = 1; i < keys.length; i++) {
      const b = keys[i];
      if (tt <= b.t) {
        const a = keys[i - 1], k = ease(b.e || 'inOut', (tt - a.t) / Math.max(1e-6, b.t - a.t));
        return { s: lerp(a.s, b.s, k), x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), r: lerp(a.r || 0, b.r || 0, k) };
      }
    }
    return keys[keys.length - 1];
  }

  // ---------- fases y pistas por defecto ----------
  function phases(s) {
    const p = s.phases || {}, e = p.enter ?? 18, d = p.develop ?? 37, h = p.hold ?? 30, x = p.exit ?? 15, t = (e + d + h + x) || 1;
    return { e: e / t, d: d / t, h: h / t, x: x / t };
  }
  function defaultTracks(ph, isFirst) {
    const e = ph.e * 100, x = ph.x * 100, hEnd = (1 - ph.x) * 100;
    return {
      title: { from: isFirst ? 0 : +(e * .05).toFixed(1), to: 100, rin: +(Math.max(e * .6, 4)).toFixed(1), rout: +(Math.max(x * .55, 3)).toFixed(1) },
      meta: { from: +(e).toFixed(1), to: +(hEnd + x * .5).toFixed(1), rin: +(Math.max(ph.d * 35, 3)).toFixed(1), rout: +(Math.max(x * .45, 3)).toFixed(1) },
      obj: { from: 0, to: 100, rin: +(Math.max(e, 3)).toFixed(1), rout: +(Math.max(x, 3)).toFixed(1) }
    };
  }
  const defLayer = () => ({ src: '', caption: '', x: 30, y: 25, w: 24, depth: .5, mask: 'rect', rot: 0, anim: 'fade', from: 5, to: 95, rin: 12, rout: 12 });
  function defScene(n) {
    return {
      name: 'Escena nueva', kicker: '', title: 'Título de\n*la escena*', text: '', size: 'l', ctaText: '', ctaHref: '',
      media: '', fit: 'cover', fragment: 1, grade: .2, layers: [],
      obj: { on: false, shape: 'knot', pos: 'center', size: 1, morph: .5, model: '', mat: 'original', rx: 0, ry: 0, spin: 0, follow: true },
      motion: 'dolly', length: 300, phases: { enter: 18, develop: 37, hold: 30, exit: 15 },
      palette: { bg: '#10151a', ink: '#efe9dc', accent: '#e3a857' },
      textPos: 'bl', textAnim: 'rise', scrim: .25, trans: { type: 'mask', dir: 'left', ease: 'inOut' },
      video: { mode: 'loop', rate: 1, start: 0 }, notes: '', ...(n || {})
    };
  }

  // ---------- normalización (acepta configs viejas) ----------
  function normalize(input) {
    const c = clone(input || {});
    c.version = 2;
    const G = c.general = Object.assign({
      brand: 'ESTUDIO QR', hint: 'SCROLL', smooth: true, smoothness: .09, particles: .6, grain: .15, grade: .35,
      nav: 'dots', keys: true, snap: false, progress: true, counter: true, loader: 'Estudio QR', scrollScale: 1,
      autoplay: { on: false, speed: .35, resume: 4, loop: true }
    }, c.general || {});
    G.autoplay = Object.assign({ on: false, speed: .35, resume: 4, loop: true }, G.autoplay || {});
    c.scenes = (c.scenes && c.scenes.length ? c.scenes : [defScene()]).map((s0, i) => {
      const s = Object.assign(defScene(), s0);
      s.phases = Object.assign({ enter: 18, develop: 37, hold: 30, exit: 15 }, s0.phases || {});
      s.palette = Object.assign({ bg: '#10151a', ink: '#efe9dc', accent: '#e3a857' }, s0.palette || {});
      s.obj = Object.assign({ on: false, shape: 'knot', pos: 'center', size: 1, morph: .5, model: '', mat: 'original', rx: 0, ry: 0, spin: 0, follow: true }, s0.obj || {});
      s.trans = Object.assign({ type: 'mask', dir: 'left', ease: 'inOut' }, s0.trans || {});
      s.video = Object.assign({ mode: 'loop', rate: 1, start: 0 }, s0.video || {});
      const ph = phases(s);
      // cámara: "auto" = los keyframes siguen al preset y a las fases; al editarlos a mano pasa a personalizado
      if (!s0.cam || s0.cam.auto || !Array.isArray(s0.cam.keys) || !s0.cam.keys.length) s.cam = { auto: true, keys: presetKeys(s.motion === 'custom' ? 'dolly' : (s.motion || 'dolly'), ph) };
      else s.cam = { auto: false, keys: s0.cam.keys.map(k => ({ t: clamp(+k.t || 0, 0, 100), s: clamp(+k.s || 1, .2, 8), x: k.x ?? .5, y: k.y ?? .5, r: +k.r || 0, e: k.e || 'inOut' })).sort((a, b) => a.t - b.t) };
      // pistas de tiempo: "auto" = se derivan de las fases
      const dt = defaultTracks(ph, i === 0);
      s.tracks = (s0.tracks && !s0.tracks.auto) ? { auto: false, title: Object.assign(dt.title, s0.tracks.title), meta: Object.assign(dt.meta, s0.tracks.meta), obj: Object.assign(dt.obj, s0.tracks.obj) } : Object.assign({ auto: true }, dt);
      s.layers = (s0.layers || []).map(l => Object.assign(defLayer(), l));
      return s;
    });
    return c;
  }

  // ---------- línea de tiempo global ----------
  function timing(cfg) {
    const S = cfg.scenes, sc = (cfg.general && cfg.general.scrollScale) || 1, out = [];
    let acc = 0;
    S.forEach((s, i) => {
      const ph = phases(s), L = Math.max(50, s.length || 300) * sc;
      const last = i === S.length - 1;
      const T0 = acc, end = T0 + L;
      out.push({ i, T0, L, end, ph, te: T0 + L * ph.e, td: T0 + L * (ph.e + ph.d), th: T0 + L * (ph.e + ph.d + ph.h), hold: T0 + L * (ph.e + ph.d + ph.h * .5), overlap: last ? 0 : L * ph.x });
      acc = T0 + L * (1 - (last ? 0 : ph.x));
    });
    const total = out.length ? out[out.length - 1].end : 1;
    return { scenes: out, total };
  }
  // escena activa (la última que ya empezó a entrar) para un tiempo T
  function sceneAt(tm, T) { let k = 0; tm.scenes.forEach((s, j) => { if (T >= s.T0 + (j ? (s.te - s.T0) * .35 : 0)) k = j; }); return k; }

  root.QRM = { clamp, lerp, clone, ease, EASE, CAT, presetKeys, evalKeys, phases, defaultTracks, defScene, defLayer, normalize, timing, sceneAt };
})(typeof window !== 'undefined' ? window : globalThis);
