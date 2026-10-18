/* 50개 스테이지 정의: 크기와 모양이 점점 커지고 복잡해짐. 10의 배수 스테이지는 꽉 찬 보스판 */
(function () {
  'use strict';

  // u, v: 판 중심 기준 -1 ~ 1 좌표
  const SHAPES = [
    { name: '모서리 컷', f: (x, y, W, H) => !((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) },
    { name: '다이아몬드', f: (x, y, W, H, u, v) => Math.abs(u) + Math.abs(v) <= 1.2 },
    { name: '도넛', f: (x, y, W, H, u, v) => !(Math.abs(u) < 0.42 && Math.abs(v) < 0.34) },
    { name: '십자가', f: (x, y, W, H, u, v) => Math.abs(u) < 0.42 || Math.abs(v) < 0.42 },
    { name: '쌍둥이 섬', f: (x, y, W) => { const m = W / 2; return W % 2 ? x !== Math.floor(m) : (x !== m && x !== m - 1); } },
    { name: '모래시계', f: (x, y, W, H, u, v) => Math.abs(u) <= Math.abs(v) * 0.9 + 0.38 },
    { name: '하트', f: (x, y, W, H, u, v) => { const X = u * 1.25, Y = -v * 1.2 + 0.15; const a = X * X + Y * Y - 1; return a * a * a - X * X * Y * Y * Y <= 0.02; } },
    { name: '격자', f: (x, y) => x % 2 === 0 || y % 2 === 0 },
    { name: '엑스', f: (x, y, W, H, u, v) => Math.abs(Math.abs(u) - Math.abs(v)) < 0.5 },
    { name: '피라미드', f: (x, y, W, H, u, v) => Math.abs(u) <= (v + 1) / 2 * 1.08 + 0.05 },
    { name: '원', f: (x, y, W, H, u, v) => u * u + v * v <= 1.08 },
    { name: '빗살', f: (x, y, W, H) => x % 4 !== 3 || y === 0 || y === H - 1 },
    { name: '겹 테두리', f: (x, y, W, H, u, v) => { const r = Math.max(Math.abs(u), Math.abs(v)); return r > 0.66 || (r > 0.2 && r < 0.45); } },
    { name: '지그재그', f: (x, y) => ((x + Math.floor(y / 2) * 2) % 6) < 4 },
    { name: '나비', f: (x, y, W, H, u, v) => Math.abs(v) <= Math.abs(u) * 1.1 + 0.25 },
    { name: '계단', f: (x, y, W, H) => { const k = Math.floor(x * H / W); return y >= H - 2 - k || y === 0; } },
    { name: '물결', f: (x, y, W, H) => Math.abs(y - (H - 1) / 2 - Math.sin(x / 1.5) * (H * 0.28)) <= H * 0.36 },
    { name: '창문', f: (x, y, W, H) => { const cx = Math.floor(W / 2), cy = Math.floor(H / 2); return x === 0 || y === 0 || x === W - 1 || y === H - 1 || x === cx || y === cy || x === cx - 1 || ((x + y) % 3 === 0); } },
  ];

  function makeMask(W, H, shape) {
    const cells = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = ((x + 0.5) / W) * 2 - 1, v = ((y + 0.5) / H) * 2 - 1;
      if (shape.f(x, y, W, H, u, v)) cells.push([x + 1, y + 1]);
    }
    // 짝수 개로 맞추기: 중앙에 가장 가까운 칸 하나 제거
    if (cells.length % 2) {
      const cx = (W + 1) / 2, cy = (H + 1) / 2;
      let bi = 0, bd = 1e9;
      cells.forEach(([x, y], i) => { const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; bi = i; } });
      cells.splice(bi, 1);
    }
    return cells;
  }

  const RECT = { name: '정사각 보스판', f: () => true };
  const list = [];
  for (let n = 1; n <= 50; n++) {
    const W = 8 + Math.round((n - 1) * 10 / 49);
    const H = 4 + Math.round((n - 1) * 4 / 49);
    let shape;
    if (n === 1) shape = { name: '기본판', f: () => true };
    else if (n % 10 === 0) shape = RECT;
    else shape = SHAPES[(n - 2) % SHAPES.length];
    let cells = makeMask(W, H, shape);
    if (cells.length < 20) { shape = SHAPES[0]; cells = makeMask(W, H, shape); }
    const types = Math.max(6, Math.min(36, Math.round(cells.length / 4)));
    list.push({ n, W, H, cells, types, shape: shape.name, seed: 1000003 * n + 777 });
  }

  // 무한(연습) 모드: 무작위 크기와 모양
  function randomStage(seed) {
    const r = Engine.rng(seed);
    const W = 12 + Math.floor(r() * 7), H = 6 + Math.floor(r() * 3);
    const shape = r() < 0.25 ? RECT : SHAPES[Math.floor(r() * SHAPES.length)];
    let cells = makeMask(W, H, shape);
    if (cells.length < 40) cells = makeMask(W, H, RECT);
    const types = Math.max(6, Math.min(36, Math.round(cells.length / 4)));
    return { n: 0, W, H, cells, types, shape: shape.name, seed };
  }

  window.Stages = { list, randomStage, makeMask };
})();
