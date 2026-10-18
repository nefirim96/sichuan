/* 사천성 게임 엔진: 경로 판정(최대 2번 꺾기), 클리어가 보장되는 판 생성, 힌트, 섞기 */
(function () {
  'use strict';

  // 시드 고정 난수 (같은 시드 → 모든 브라우저에서 같은 판)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffleArr(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // W x H 내부 칸 + 바깥 테두리 1칸(경로가 지나갈 수 있음)
  class Board {
    constructor(W, H) {
      this.W = W; this.H = H;
      this.GW = W + 2; this.GH = H + 2;
      this.g = new Int16Array(this.GW * this.GH).fill(-1);
    }
    clone() { const b = new Board(this.W, this.H); b.g.set(this.g); return b; }
    i(x, y) { return y * this.GW + x; }
    get(x, y) { return this.g[y * this.GW + x]; }
    set(x, y, v) { this.g[y * this.GW + x] = v; }
    free(x, y) {
      if (x < 0 || y < 0 || x >= this.GW || y >= this.GH) return false;
      return this.g[y * this.GW + x] < 0;
    }
    // 두 점 사이(양 끝 제외)가 비어 있는지
    clear(x1, y1, x2, y2) {
      if (x1 === x2) {
        const s = Math.min(y1, y2), e = Math.max(y1, y2);
        for (let y = s + 1; y < e; y++) if (this.g[y * this.GW + x1] >= 0) return false;
        return true;
      }
      if (y1 === y2) {
        const s = Math.min(x1, x2), e = Math.max(x1, x2);
        for (let x = s + 1; x < e; x++) if (this.g[y1 * this.GW + x] >= 0) return false;
        return true;
      }
      return false;
    }
    // 최대 2번 꺾어서 연결되는 가장 짧은 경로 (점 배열) 또는 null
    path(x1, y1, x2, y2) {
      if (x1 === x2 && y1 === y2) return null;
      if ((x1 === x2 || y1 === y2) && this.clear(x1, y1, x2, y2)) return [[x1, y1], [x2, y2]];
      if (this.free(x1, y2) && this.clear(x1, y1, x1, y2) && this.clear(x1, y2, x2, y2)) return [[x1, y1], [x1, y2], [x2, y2]];
      if (this.free(x2, y1) && this.clear(x1, y1, x2, y1) && this.clear(x2, y1, x2, y2)) return [[x1, y1], [x2, y1], [x2, y2]];
      let best = null, bestLen = 1e9;
      if (y1 !== y2) {
        for (let x = 0; x < this.GW; x++) {
          if (x === x1 || x === x2) continue;
          if (!this.free(x, y1) || !this.free(x, y2)) continue;
          if (this.clear(x1, y1, x, y1) && this.clear(x, y1, x, y2) && this.clear(x, y2, x2, y2)) {
            const len = Math.abs(x - x1) + Math.abs(y2 - y1) + Math.abs(x2 - x);
            if (len < bestLen) { bestLen = len; best = [[x1, y1], [x, y1], [x, y2], [x2, y2]]; }
          }
        }
      }
      if (x1 !== x2) {
        for (let y = 0; y < this.GH; y++) {
          if (y === y1 || y === y2) continue;
          if (!this.free(x1, y) || !this.free(x2, y)) continue;
          if (this.clear(x1, y1, x1, y) && this.clear(x1, y, x2, y) && this.clear(x2, y, x2, y2)) {
            const len = Math.abs(y - y1) + Math.abs(x2 - x1) + Math.abs(y2 - y);
            if (len < bestLen) { bestLen = len; best = [[x1, y1], [x1, y], [x2, y], [x2, y2]]; }
          }
        }
      }
      return best;
    }
    // 공통 인터페이스 (겹겹 모드 LayerBoard와 같은 이름). 키 = 칸 번호
    get kind() { return 'flat'; }
    keys() { return this.tiles().map(([x, y]) => y * this.GW + x); }
    xy(k) { return [k % this.GW, Math.floor(k / this.GW)]; }
    count() { return this.tiles().length; }
    typeOf(k) { return this.g[k]; }
    isFree() { return true; }
    match(a, b) {
      if (a === b || this.g[a] < 0 || this.g[a] !== this.g[b]) return null;
      const [x1, y1] = this.xy(a), [x2, y2] = this.xy(b);
      return this.path(x1, y1, x2, y2);
    }
    remove(a, b) { this.g[a] = -1; this.g[b] = -1; }
    restore(a, b, t) { this.g[a] = t; this.g[b] = t; }
    findMoveKeys() { const m = this.findMove(); return m ? m.map(([x, y]) => y * this.GW + x) : null; }
    tiles() {
      const out = [];
      for (let y = 1; y <= this.H; y++) for (let x = 1; x <= this.W; x++) if (this.get(x, y) >= 0) out.push([x, y]);
      return out;
    }
    // 지금 맞출 수 있는 한 쌍 (힌트)
    findMove() {
      const byType = new Map();
      for (const [x, y] of this.tiles()) {
        const t = this.get(x, y);
        if (!byType.has(t)) byType.set(t, []);
        byType.get(t).push([x, y]);
      }
      for (const list of byType.values()) {
        for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
          const p = list[a], q = list[b];
          if (this.path(p[0], p[1], q[0], q[1])) return [p, q];
        }
      }
      return null;
    }
  }

  /*
   * 역순 생성: 빈 판에서 "지금 연결 가능한 두 칸"에 한 쌍씩 채워 넣는다.
   * 게임에서는 채운 순서의 정반대로 지우면 항상 연결되므로, 모든 판은 반드시 클리어 가능하다.
   * cells: 채울 칸 목록, 나머지 칸은 board에 있는 그대로 둔다.
   */
  function construct(board, cells, rand) {
    const b = board;
    for (const [x, y] of cells) b.set(x, y, -1);
    // 바깥에서 먼 칸(안쪽)부터 먼저 채우면 막힐 확률이 낮다
    // 깊이 = 채울 칸이 아닌 곳(테두리, 구멍)까지의 거리
    const inSet = new Uint8Array(b.GW * b.GH);
    for (const [x, y] of cells) inSet[y * b.GW + x] = 1;
    const dist = new Int16Array(b.GW * b.GH).fill(-1);
    let queue = [];
    for (let i = 0; i < inSet.length; i++) if (!inSet[i]) { dist[i] = 0; queue.push(i); }
    while (queue.length) {
      const next = [];
      for (const i of queue) {
        const x = i % b.GW, y = (i / b.GW) | 0;
        const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        for (const [nx, ny] of nb) {
          if (nx < 0 || ny < 0 || nx >= b.GW || ny >= b.GH) continue;
          const j = ny * b.GW + nx;
          if (dist[j] < 0) { dist[j] = dist[i] + 1; next.push(j); }
        }
      }
      queue = next;
    }
    const depth = new Map();
    for (const [x, y] of cells) depth.set(y * b.GW + x, dist[y * b.GW + x] + rand() * 1.3);
    const empties = cells.map(([x, y]) => [x, y]);
    const pairs = [];
    while (empties.length) {
      empties.sort((p, q) => depth.get(q[1] * b.GW + q[0]) - depth.get(p[1] * b.GW + p[0]));
      let placed = false;
      const tryCount = Math.min(empties.length, 8);
      for (let ai = 0; ai < tryCount && !placed; ai++) {
        const a = empties[ai];
        const cands = [];
        for (let bi = 0; bi < empties.length; bi++) {
          if (bi === ai) continue;
          const c = empties[bi];
          if (b.path(a[0], a[1], c[0], c[1])) cands.push(bi);
        }
        if (!cands.length) continue;
        // 같은 깊이(안쪽)의 칸을 우선 짝으로 골라 바깥 칸을 마지막까지 남겨 둔다
        cands.sort((p, q) => depth.get(empties[q][1] * b.GW + empties[q][0]) - depth.get(empties[p][1] * b.GW + empties[p][0]));
        const top = Math.max(1, Math.min(cands.length, 2 + Math.floor(cands.length * 0.3)));
        const order = cands.slice(0, top);
        shuffleArr(order, rand);
        for (let k = top; k < cands.length; k++) order.push(cands[k]);
        let bi = -1;
        for (const ci of order) {
          const c = empties[ci];
          b.set(a[0], a[1], 0); b.set(c[0], c[1], 0);
          const okPocket = noDeadPocket(b, inSet);
          b.set(a[0], a[1], -1); b.set(c[0], c[1], -1);
          if (okPocket) { bi = ci; break; }
        }
        if (bi < 0) continue;
        const c = empties[bi];
        b.set(a[0], a[1], 0); b.set(c[0], c[1], 0);
        pairs.push([a, c]);
        const hi = Math.max(ai, bi), lo = Math.min(ai, bi);
        empties.splice(hi, 1); empties.splice(lo, 1);
        placed = true;
      }
      if (!placed) return null;
    }
    return pairs;
  }

  // 바깥과 끊긴 빈 공간(주머니) 중 채워야 할 칸이 홀수 개인 곳이 생기면 절대 못 채우므로 거부
  function noDeadPocket(b, inSet) {
    const N = b.GW * b.GH;
    const seen = new Uint8Array(N);
    const stack = [];
    // 바깥 테두리와 이어진 빈 공간은 안전
    for (let x = 0; x < b.GW; x++) { stack.push(x, (b.GH - 1) * b.GW + x); }
    for (let y = 0; y < b.GH; y++) { stack.push(y * b.GW, y * b.GW + b.GW - 1); }
    const flood = (st, countOnly) => {
      let cnt = 0;
      while (st.length) {
        const i = st.pop();
        if (seen[i] || b.g[i] >= 0) continue;
        seen[i] = 1;
        if (inSet[i]) cnt++;
        const x = i % b.GW, y = (i / b.GW) | 0;
        if (x > 0) st.push(i - 1);
        if (x < b.GW - 1) st.push(i + 1);
        if (y > 0) st.push(i - b.GW);
        if (y < b.GH - 1) st.push(i + b.GW);
      }
      return cnt;
    };
    flood(stack);
    for (let i = 0; i < N; i++) {
      if (seen[i] || b.g[i] >= 0 || !inSet[i]) continue;
      const cnt = flood([i]);
      if (cnt % 2 === 1 || cnt === 1) return false;
    }
    return true;
  }

  // 판 만들기: 모양(mask) + 패 종류 수 + 시드 → 클리어 보장된 Board
  function generate(W, H, cells, typeCount, seed) {
    const rand = rng(seed);
    for (let attempt = 0; attempt < 400; attempt++) {
      const board = new Board(W, H);
      const pairs = construct(board, cells, rand);
      if (!pairs) continue;
      const types = [];
      for (let i = 0; i < pairs.length; i++) types.push(i % typeCount);
      shuffleArr(types, rand);
      pairs.forEach(([a, c], i) => { board.set(a[0], a[1], types[i]); board.set(c[0], c[1], types[i]); });
      board.solution = pairs.slice().reverse();
      return board;
    }
    throw new Error('판 생성 실패');
  }

  // 남은 패를 다시 섞기 (섞은 뒤에도 반드시 클리어 가능)
  function reshuffle(board, rand) {
    rand = rand || Math.random;
    const cells = board.tiles();
    const counts = new Map();
    for (const [x, y] of cells) { const t = board.get(x, y); counts.set(t, (counts.get(t) || 0) + 1); }
    const pairTypes = [];
    for (const [t, n] of counts) for (let k = 0; k < Math.floor(n / 2); k++) pairTypes.push(t);
    for (let attempt = 0; attempt < 300; attempt++) {
      const b = board.clone();
      const pairs = construct(b, cells, rand);
      if (!pairs) continue;
      shuffleArr(pairTypes, rand);
      pairs.forEach(([a, c], i) => { b.set(a[0], a[1], pairTypes[i]); b.set(c[0], c[1], pairTypes[i]); });
      board.g.set(b.g);
      return true;
    }
    // 예외적으로 실패하면 단순 섞기
    const vals = cells.map(([x, y]) => board.get(x, y));
    shuffleArr(vals, rand);
    cells.forEach(([x, y], i) => board.set(x, y, vals[i]));
    return false;
  }

  window.Engine = { rng, shuffleArr, Board, generate, reshuffle, construct };
})();
