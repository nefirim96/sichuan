/* 겹겹 모드: 2~4층으로 쌓인 패. 위에 덮인 패가 없고, 왼쪽이나 오른쪽 중 한쪽이 비어 있는 "열린 패" 두 개를 맞추면 지워짐.
 * 좌표는 반 칸 단위 (패 하나 = 2x2), z는 층. 판은 역순으로 쌓아서 만들기 때문에 항상 클리어 가능. */
(function () {
  'use strict';
  const { rng, shuffleArr } = Engine;

  // 위치 목록 → 이웃 관계 미리 계산
  function topology(pos) {
    const N = pos.length;
    const above = [], below = [], left = [], right = [];
    for (let i = 0; i < N; i++) { above.push([]); below.push([]); left.push([]); right.push([]); }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const a = pos[i], b = pos[j];
      const ox = Math.abs(a.x - b.x) < 2, oy = Math.abs(a.y - b.y) < 2;
      if (b.z === a.z + 1 && ox && oy) above[i].push(j);
      if (b.z === a.z - 1 && ox && oy) below[i].push(j);
      if (b.z === a.z && oy && b.x === a.x - 2) left[i].push(j);
      if (b.z === a.z && oy && b.x === a.x + 2) right[i].push(j);
    }
    return { above, below, left, right };
  }

  class LayerBoard {
    constructor(pos, topo) {
      this.kind = 'layer';
      this.pos = pos; this.topo = topo || topology(pos);
      this.t = new Int16Array(pos.length).fill(-1);
      let mx = 0, my = 0, mz = 0;
      for (const p of pos) { mx = Math.max(mx, p.x); my = Math.max(my, p.y); mz = Math.max(mz, p.z); }
      this.spanX = mx + 2; this.spanY = my + 2; this.maxZ = mz;
    }
    clone() { const b = new LayerBoard(this.pos, this.topo); b.t.set(this.t); return b; }
    keys() { const out = []; for (let i = 0; i < this.t.length; i++) if (this.t[i] >= 0) out.push(i); return out; }
    count() { let c = 0; for (let i = 0; i < this.t.length; i++) if (this.t[i] >= 0) c++; return c; }
    typeOf(k) { return this.t[k]; }
    isFree(k) {
      const T = this.t, tp = this.topo;
      // 위에 조금이라도 겹친 패가 없으면 선택 가능 (양옆은 따지지 않음)
      return !tp.above[k].some((j) => T[j] >= 0);
    }
    match(a, b) {
      if (a === b || this.t[a] < 0 || this.t[a] !== this.t[b] || !this.isFree(a) || !this.isFree(b)) return null;
      return this.connect(a, b);
    }
    /* 사천성 연결: 반 칸 단위 "점" 격자 위에서 패 중심 → 패 중심, 꺾기 2번 이하의 직선 경로.
     * 패 하나는 테두리를 포함한 정사각형(3x3 점)을 막음 → 붙어 있는 패 사이 틈으로는 못 지나감.
     * 선은 두 패 중 높은 쪽 층(L)의 높이로 그어짐: L층 이상의 다른 패는 통과 못 하고, 그보다 낮은 패 위로는 지나감.
     * 가능한 경로 중 꺾기가 적고 가장 짧은 것을 고름. */
    connect(a, b) {
      const P = 2, GW = this.spanX + P * 2 + 1, GH = this.spanY + P * 2 + 1;
      const L = Math.max(this.pos[a].z, this.pos[b].z);
      if (!this._buf || this._buf.pos !== this.pos) this._buf = { pos: this.pos, blk: new Uint8Array(GW * GH) };
      const blk = this._buf.blk;
      blk.fill(0);
      for (let k = 0; k < this.t.length; k++) {
        if (this.t[k] < 0 || k === a || k === b || this.pos[k].z < L) continue;
        const p = this.pos[k];
        for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) blk[(p.y + P + dy) * GW + p.x + P + dx] = 1;
      }
      const free = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && !blk[y * GW + x];
      const clear = (x1, y1, x2, y2) => {
        if (x1 === x2) { const s = Math.min(y1, y2), e = Math.max(y1, y2); for (let y = s; y <= e; y++) if (blk[y * GW + x1]) return false; return true; }
        const s = Math.min(x1, x2), e = Math.max(x1, x2); for (let x = s; x <= e; x++) if (blk[y1 * GW + x]) return false; return true;
      };
      const ax = this.pos[a].x + 1 + P, ay = this.pos[a].y + 1 + P, bx = this.pos[b].x + 1 + P, by = this.pos[b].y + 1 + P;
      let best = null, bestCost = 1e9;
      const consider = (pts) => {
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
        const cost = (pts.length - 2) * 1000 + len;
        if (cost < bestCost) { bestCost = cost; best = pts; }
      };
      if ((ax === bx || ay === by) && clear(ax, ay, bx, by)) consider([[ax, ay], [bx, by]]);
      if (!best) {
        if (free(ax, by) && clear(ax, ay, ax, by) && clear(ax, by, bx, by)) consider([[ax, ay], [ax, by], [bx, by]]);
        if (free(bx, ay) && clear(ax, ay, bx, ay) && clear(bx, ay, bx, by)) consider([[ax, ay], [bx, ay], [bx, by]]);
      }
      if (!best) {
        for (let x = 0; x < GW; x++) {
          if (x === ax || x === bx || ay === by) continue;
          if (free(x, ay) && free(x, by) && clear(ax, ay, x, ay) && clear(x, ay, x, by) && clear(x, by, bx, by)) consider([[ax, ay], [x, ay], [x, by], [bx, by]]);
        }
        for (let y = 0; y < GH; y++) {
          if (y === ay || y === by || ax === bx) continue;
          if (free(ax, y) && free(bx, y) && clear(ax, ay, ax, y) && clear(ax, y, bx, y) && clear(bx, y, bx, by)) consider([[ax, ay], [ax, y], [bx, y], [bx, by]]);
        }
      }
      if (!best) return null;
      const out = best.map(([x, y]) => [(x - P) / 2 + 0.5, (y - P) / 2 + 0.5]);
      out.z = L; out.za = this.pos[a].z; out.zb = this.pos[b].z;
      return out;
    }
    remove(a, b) { this.t[a] = -1; this.t[b] = -1; }
    restore(a, b, t) { this.t[a] = t; this.t[b] = t; }
    findMoveKeys() { return this.findMove(); }
    findMove() {
      const by = new Map();
      for (const k of this.keys()) {
        if (!this.isFree(k)) continue;
        const ty = this.t[k];
        if (!by.has(ty)) by.set(ty, []);
        for (const j of by.get(ty)) if (this.connect(j, k)) return [j, k];
        by.get(ty).push(k);
      }
      return null;
    }
  }

  // 실제 게임처럼 시뮬레이션: 전부 쌓인 상태에서 "열린 패" 두 개씩 걷어 내며 짝을 정함.
  // 걷어 낸 순서가 곧 정답 순서이므로 만들어진 판은 반드시 클리어 가능.
  function construct(board, cells, rand) {
    const T = board.t, tp = board.topo;
    for (const k of cells) T[k] = 0;
    const occ = (j) => T[j] >= 0;
    const free = (k) => !tp.above[k].some(occ);
    const pairs = [];
    let left = cells.length;
    while (left > 0) {
      const f = cells.filter((k) => T[k] >= 0 && free(k));
      if (f.length < 2) { for (const k of cells) T[k] = -1; return null; }
      // 높은 층부터 걷어 내야 마지막에 한 줄 탑만 남는 상황을 피함
      const w = (k) => board.pos[k].z * 2 + (tp.below[k].length ? 1 : 0) + rand() * 2.5;
      f.sort((p, q) => w(q) - w(p));
      let pair = null;
      for (let i = 0; i < f.length && !pair; i++) {
        const a = f[i];
        const cand = f.filter((k) => k !== a && board.connect(a, k));
        if (cand.length) pair = [a, cand[Math.floor(rand() * cand.length)]];
      }
      if (!pair) { for (const k of cells) T[k] = -1; return null; }
      T[pair[0]] = -1; T[pair[1]] = -1; left -= 2;
      pairs.push(pair);
    }
    return pairs;
  }

  const gen = {};
  function generate(stage, seed) {
    const rand = rng(seed);
    const topo = topology(stage.pos);
    const cells = stage.pos.map((_, i) => i);
    for (let attempt = 0; attempt < 600; attempt++) {
      const b = new LayerBoard(stage.pos, topo);
      const pairs = construct(b, cells, rand);
      if (!pairs) continue;
      const types = pairs.map((_, i) => i % stage.types);
      shuffleArr(types, rand);
      pairs.forEach(([a, c], i) => { b.t[a] = types[i]; b.t[c] = types[i]; });
      b.solution = pairs.slice();
      return b;
    }
    throw new Error('겹겹 판 생성 실패');
  }

  function reshuffle(board, rand) {
    rand = rand || Math.random;
    const cells = board.keys();
    const tcount = new Map();
    for (const k of cells) tcount.set(board.t[k], (tcount.get(board.t[k]) || 0) + 1);
    const pairTypes = [];
    for (const [t, n] of tcount) for (let i = 0; i < Math.floor(n / 2); i++) pairTypes.push(t);
    for (let attempt = 0; attempt < 400; attempt++) {
      const b = board.clone();
      const pairs = construct(b, cells, rand);
      if (!pairs) continue;
      shuffleArr(pairTypes, rand);
      pairs.forEach(([a, c], i) => { b.t[a] = pairTypes[i]; b.t[c] = pairTypes[i]; });
      board.t.set(b.t);
      return true;
    }
    const vals = cells.map((k) => board.t[k]);
    shuffleArr(vals, rand);
    cells.forEach((k, i) => { board.t[k] = vals[i]; });
    return false;
  }

  /* ---------- 50개 겹겹 스테이지 ---------- */
  // 층 쌓는 방식: aligned(같은 줄에 쌓기), offset(반 칸 어긋나게 = 사진처럼 겹쳐 보임), tower(가로로만 좁아지는 탑)
  function buildLayout(W, H, maskFn, layers, style, rand) {
    const pos = [];
    let cur = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = ((x + 0.5) / W) * 2 - 1, v = ((y + 0.5) / H) * 2 - 1;
      if (maskFn(x, y, W, H, u, v)) cur.push({ x: x * 2, y: y * 2, z: 0 });
    }
    pos.push(...cur);
    for (let z = 1; z < layers; z++) {
      const has = new Set(cur.map((p) => p.x + ',' + p.y));
      const h = (x, y) => has.has(x + ',' + y);
      const next = [];
      const st = style === 'mix' ? (z % 2 ? 'offset' : 'aligned') : style;
      if (st === 'offset') {
        // 아래 네 개의 패 사이에 걸쳐서 올림
        for (const p of cur) {
          if (h(p.x + 2, p.y) && h(p.x, p.y + 2) && h(p.x + 2, p.y + 2)) next.push({ x: p.x + 1, y: p.y + 1, z });
        }
        // 너무 빽빽하면 바둑판처럼 솎아서 더 다양하게
        if (next.length > cur.length * 0.6) {
          for (let i = next.length - 1; i >= 0; i--) if (((next[i].x - 1) / 2 + (next[i].y - 1) / 2) % 2 === 1 && rand() < 0.5) next.splice(i, 1);
        }
      } else {
        for (const p of cur) {
          const inner = st === 'tower' ? (h(p.x - 2, p.y) && h(p.x + 2, p.y) && (z % 2 === 1 || (h(p.x, p.y - 2) && h(p.x, p.y + 2)))) : (h(p.x - 2, p.y) && h(p.x + 2, p.y) && h(p.x, p.y - 2) && h(p.x, p.y + 2));
          if (inner) next.push({ x: p.x, y: p.y, z });
        }
      }
      if (!next.length) break;
      pos.push(...next);
      cur = next;
    }
    // 짝수로: 가장 위층의 한 개 제거
    if (pos.length % 2) {
      let bi = 0;
      pos.forEach((p, i) => { if (p.z >= pos[bi].z) bi = i; });
      pos.splice(bi, 1);
    }
    return pos;
  }

  const LSHAPES = [
    { name: '사각 탑', f: () => true, style: 'aligned' },
    { name: '거북이', f: (x, y, W, H, u, v) => u * u * 0.9 + v * v <= 1.1 || (Math.abs(v) < 0.25), style: 'offset' },
    { name: '피라미드', f: (x, y, W, H, u, v) => Math.abs(u) <= (v + 1) / 2 * 1.1 + 0.15, style: 'aligned' },
    { name: '쌍탑', f: (x, y, W) => { const m = W / 2; return !(x >= Math.floor(m) - 0 && x <= Math.ceil(m) - 1); }, style: 'tower' },
    { name: '다이아몬드', f: (x, y, W, H, u, v) => Math.abs(u) + Math.abs(v) <= 1.25, style: 'offset' },
    { name: '성벽', f: (x, y, W, H) => y < 2 || y >= H - 2 || x < 2 || x >= W - 2, style: 'tower' },
    { name: '십자탑', f: (x, y, W, H, u, v) => Math.abs(u) < 0.45 || Math.abs(v) < 0.5, style: 'mix' },
    { name: '나비', f: (x, y, W, H, u, v) => Math.abs(v) <= Math.abs(u) * 1.1 + 0.3, style: 'offset' },
    { name: '계단 탑', f: () => true, style: 'tower' },
    { name: '꽃', f: (x, y, W, H, u, v) => { const r = Math.sqrt(u * u + v * v), a = Math.atan2(v, u); return r <= 0.75 + 0.3 * Math.cos(a * 4); }, style: 'mix' },
  ];

  function buildList() {
  const list = [];
  for (let n = 1; n <= 50; n++) {
    const want = n <= 15 ? 2 : n <= 35 ? 3 : 4;
    const target = Math.round(32 + (n - 1) * 112 / 49);
    const sh = n === 1 ? LSHAPES[0] : n % 10 === 0 ? { name: '대형 피라미드', f: () => true, style: 'aligned' } : LSHAPES[(n - 1) % LSHAPES.length];
    const seed = 2000003 * n + 99;
    let best = null;
    // 목표 패 수와 층 수에 가장 가까운 크기를 찾음
    for (let W = 4; W <= 13; W++) for (let H = 3; H <= 8; H++) {
      if (W < H) continue;
      for (const style of [sh.style, 'aligned', 'tower']) {
        const pos = buildLayout(W, H, sh.f, want, style, rng(seed ^ (W * 31 + H)));
        if (pos.length < 20) continue;
        const layers = Math.max(...pos.map((p) => p.z)) + 1;
        const cost = Math.abs(pos.length - target) + (want - layers) * 40 + (style === sh.style ? 0 : 6) + Math.abs(W / H - 1.7) * 4;
        if (!best || cost < best.cost) best = { cost, pos, layers, style };
      }
    }
    const pos = best.pos;
    const types = Math.max(6, Math.min(36, Math.round(pos.length / 4)));
    list.push({ n, kind: 'layer', pos, types, seed, shape: sh.name, layers: best.layers, count: pos.length });
  }
  return list;
  }
  let cached = null;

  function randomLayerStage(seed) {
    const r = rng(seed);
    const sh = LSHAPES[Math.floor(r() * LSHAPES.length)];
    const layers = 2 + Math.floor(r() * 3);
    const W = 9 + Math.floor(r() * 4), H = 5 + Math.floor(r() * 3);
    const pos = buildLayout(W, H, sh.f, layers, sh.style, r);
    return { n: 0, kind: 'layer', pos, types: Math.max(6, Math.min(36, Math.round(pos.length / 4))), seed, shape: sh.name, layers: Math.max(...pos.map((p) => p.z)) + 1, count: pos.length };
  }

  window.Layers = { LayerBoard, generate, reshuffle, randomLayerStage, topology, get list() { return cached || (cached = buildList()); } };
})();
