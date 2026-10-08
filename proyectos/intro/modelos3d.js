/* ESTUDIO QR — lector de modelos 3D propios, sin librerías.
   Formatos: .glb (glTF 2.0 binario, exportado desde Blender, Cinema 4D, Spline, etc.) y .obj.
   Devuelve la geometría "aplanada" (triángulos sueltos), centrada y escalada a un tamaño estándar,
   con grupos por material (color base y textura base si la tiene). */
(function (root) {
  'use strict';
  const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

  // ---------- matrices 4x4 (column-major) ----------
  const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  const trs = (t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) => {
    const [x, y, z, w] = q, xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    return [(1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0, 2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0, 2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
  };
  const nmat = m => { // inversa transpuesta de la parte 3x3 (normales correctas con escalas no uniformes)
    const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1;
    return [A / det, B / det, C / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det];
  };

  // ---------- GLB ----------
  async function parseGLB(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('No es un archivo .glb válido (exportá como glTF Binario .glb)');
    let off = 12, json = null, bin = null;
    while (off < buf.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
      else if (type === 0x004E4942) bin = buf.slice(off + 8, off + 8 + len);
      off += 8 + len;
    }
    if (!json) throw new Error('El .glb no tiene datos');
    const ext = (json.extensionsRequired || []).filter(x => /draco|meshopt|basisu|ktx/i.test(x));
    if (ext.length) throw new Error('El modelo usa compresión (' + ext.join(', ') + '). Exportalo sin compresión Draco/Meshopt.');
    const views = json.bufferViews || [], accs = json.accessors || [];
    const read = idx => {
      const a = accs[idx], v = views[a.bufferView], n = NC[a.type], T = CT[a.componentType];
      const stride = v.byteStride || n * T.BYTES_PER_ELEMENT, base = (v.byteOffset || 0) + (a.byteOffset || 0), out = new Float32Array(a.count * n);
      const src = new DataView(bin), get = { 5126: (o) => src.getFloat32(o, true), 5125: o => src.getUint32(o, true), 5123: o => src.getUint16(o, true), 5122: o => src.getInt16(o, true), 5121: o => src.getUint8(o), 5120: o => src.getInt8(o) }[a.componentType];
      for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) { let x = get(base + i * stride + k * T.BYTES_PER_ELEMENT); if (a.normalized && NORM[a.componentType]) x /= NORM[a.componentType]; out[i * n + k] = x; }
      return { d: out, n, count: a.count };
    };
    // texturas embebidas
    const texCache = {};
    const image = async ti => {
      if (ti == null) return null; if (texCache[ti] !== undefined) return texCache[ti];
      const tx = (json.textures || [])[ti], im = tx && (json.images || [])[tx.source];
      let bmp = null;
      try {
        if (im && im.bufferView != null) { const v = views[im.bufferView]; const blob = new Blob([new Uint8Array(bin, v.byteOffset || 0, v.byteLength)], { type: im.mimeType || 'image/png' }); bmp = await createImageBitmap(blob); }
      } catch (e) { bmp = null; }
      return (texCache[ti] = bmp);
    };
    const prims = [];
    const walk = (ni, parent) => {
      const nd = json.nodes[ni], M = mul(parent, nd.matrix || trs(nd.translation, nd.rotation, nd.scale));
      if (nd.mesh != null) json.meshes[nd.mesh].primitives.forEach(p => prims.push({ p, M }));
      (nd.children || []).forEach(c => walk(c, M));
    };
    const sc = (json.scenes || [])[json.scene || 0];
    if (sc) sc.nodes.forEach(n => walk(n, I4())); else (json.meshes || []).forEach(m => m.primitives.forEach(p => prims.push({ p, M: I4() })));
    const groups = [];
    for (const { p, M } of prims) {
      if ((p.mode ?? 4) !== 4 || p.attributes.POSITION == null) continue; // solo triángulos
      const P = read(p.attributes.POSITION), Nn = p.attributes.NORMAL != null ? read(p.attributes.NORMAL) : null;
      const UV = p.attributes.TEXCOORD_0 != null ? read(p.attributes.TEXCOORD_0) : null, CO = p.attributes.COLOR_0 != null ? read(p.attributes.COLOR_0) : null;
      const idx = p.indices != null ? read(p.indices).d : Array.from({ length: P.count }, (_, i) => i);
      const mat = (json.materials || [])[p.material] || {}, pbr = mat.pbrMetallicRoughness || {};
      const col = (pbr.baseColorFactor || [1, 1, 1, 1]).slice(0, 3), tex = await image(pbr.baseColorTexture ? pbr.baseColorTexture.index : null);
      const N3 = nmat(M), g = { pos: [], nor: [], uv: [], col: [], tex, base: col };
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const tri = [idx[t], idx[t + 1], idx[t + 2]], vs = tri.map(i => { const x = P.d[i * 3], y = P.d[i * 3 + 1], z = P.d[i * 3 + 2]; return [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]; });
        let fn = null;
        if (!Nn) { const a = vs[1].map((v, k) => v - vs[0][k]), b = vs[2].map((v, k) => v - vs[0][k]); fn = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const l = Math.hypot(...fn) || 1; fn = fn.map(v => v / l); }
        tri.forEach((i, k) => {
          g.pos.push(...vs[k]);
          if (Nn) { const x = Nn.d[i * 3], y = Nn.d[i * 3 + 1], z = Nn.d[i * 3 + 2]; const n = [N3[0] * x + N3[3] * y + N3[6] * z, N3[1] * x + N3[4] * y + N3[7] * z, N3[2] * x + N3[5] * y + N3[8] * z], l = Math.hypot(...n) || 1; g.nor.push(n[0] / l, n[1] / l, n[2] / l); } else g.nor.push(...fn);
          g.uv.push(UV ? UV.d[i * 2] : 0, UV ? UV.d[i * 2 + 1] : 0);
          g.col.push(...(CO ? [CO.d[i * CO.n], CO.d[i * CO.n + 1], CO.d[i * CO.n + 2]] : [1, 1, 1]).map((v, c) => v * col[c]));
        });
      }
      if (g.pos.length) groups.push(g);
    }
    if (!groups.length) throw new Error('No se encontraron mallas de triángulos en el modelo');
    return fit(groups);
  }

  // ---------- OBJ ----------
  function parseOBJ(text) {
    const V = [], VN = [], VT = [], g = { pos: [], nor: [], uv: [], col: [], tex: null, base: [1, 1, 1] };
    const ix = (s, arr) => { const i = parseInt(s, 10); return i < 0 ? arr.length + i : i - 1; };
    for (const line of text.split('\n')) {
      const p = line.trim().split(/\s+/);
      if (p[0] === 'v') V.push(p.slice(1, 4).map(Number)); else if (p[0] === 'vn') VN.push(p.slice(1, 4).map(Number)); else if (p[0] === 'vt') VT.push(p.slice(1, 3).map(Number));
      else if (p[0] === 'f') {
        const f = p.slice(1).map(s => s.split('/'));
        for (let k = 1; k + 1 < f.length; k++) {
          const tri = [f[0], f[k], f[k + 1]], vs = tri.map(q => V[ix(q[0], V)]);
          if (vs.some(v => !v)) continue;
          const a = vs[1].map((v, j) => v - vs[0][j]), b = vs[2].map((v, j) => v - vs[0][j]); let fn = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const l = Math.hypot(...fn) || 1; fn = fn.map(v => v / l);
          tri.forEach((q, j) => { g.pos.push(...vs[j]); const n = q[2] ? VN[ix(q[2], VN)] : null; g.nor.push(...(n || fn)); const t = q[1] ? VT[ix(q[1], VT)] : null; g.uv.push(t ? t[0] : 0, t ? 1 - t[1] : 0); g.col.push(1, 1, 1); });
        }
      }
    }
    if (!g.pos.length) throw new Error('El .obj no tiene caras');
    return fit([g]);
  }

  // ---------- centrar y escalar (el objeto siempre entra en el mismo tamaño) ----------
  function fit(groups) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    groups.forEach(g => { for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g.pos[i + k]); mx[k] = Math.max(mx[k], g.pos[i + k]); } });
    const c = mn.map((v, k) => (v + mx[k]) / 2), r = Math.max(...mx.map((v, k) => v - mn[k])) / 2 || 1, s = 1.45 / r;
    let tris = 0;
    groups.forEach(g => { for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) g.pos[i + k] = (g.pos[i + k] - c[k]) * s; tris += g.pos.length / 9; });
    return { groups, tris };
  }

  async function load(url) {
    const r = await fetch(url); if (!r.ok) throw new Error('No se encontró ' + url);
    return /\.obj$/i.test(url) ? parseOBJ(await r.text()) : parseGLB(await r.arrayBuffer());
  }
  root.QR3D = { load, parseGLB, parseOBJ };
})(typeof window !== 'undefined' ? window : globalThis);
