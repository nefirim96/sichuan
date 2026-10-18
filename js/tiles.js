/* 타일 테마: 원조 마작패(SVG로 직접 그림) + 귀여운 이모지 테마들 */
(function () {
  'use strict';

  const BLUE = '#1d4f9c', GREEN = '#17804a', RED = '#c62f2a', INK = '#1d1d24';
  const svg = (inner) => `<svg viewBox="0 0 60 80" class="face" aria-hidden="true">${inner}</svg>`;
  const text = (t, x, y, size, color, weight) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight || 700}" text-anchor="middle" dominant-baseline="central" font-family="'Noto Serif KR','Noto Serif JP','Batang','SimSun',serif">${t}</text>`;

  // 통(筒) — 동그라미
  const PIN_POS = {
    1: [[30, 40]], 2: [[30, 22], [30, 58]], 3: [[16, 18], [30, 40], [44, 62]],
    4: [[18, 22], [42, 22], [18, 58], [42, 58]], 5: [[17, 19], [43, 19], [30, 40], [17, 61], [43, 61]],
    6: [[18, 15], [42, 15], [18, 40], [42, 40], [18, 65], [42, 65]],
    7: [[15, 13], [30, 21], [45, 29], [18, 49], [42, 49], [18, 67], [42, 67]],
    8: [[18, 13], [42, 13], [18, 31], [42, 31], [18, 49], [42, 49], [18, 67], [42, 67]],
    9: [[15, 16], [30, 16], [45, 16], [15, 40], [30, 40], [45, 40], [15, 64], [30, 64], [45, 64]],
  };
  const PIN_COL = { 1: [RED], 2: [GREEN, BLUE], 3: [BLUE, RED, GREEN], 4: [BLUE, GREEN, GREEN, BLUE], 5: [BLUE, GREEN, RED, GREEN, BLUE], 6: [GREEN, GREEN, RED, RED, RED, RED], 7: [GREEN, GREEN, GREEN, RED, RED, RED, RED], 8: Array(8).fill(BLUE), 9: [BLUE, BLUE, BLUE, RED, RED, RED, GREEN, GREEN, GREEN] };
  function pin(n) {
    const r = n === 1 ? 17 : n <= 4 ? 10 : n <= 6 ? 8.6 : 7.6;
    return svg(PIN_POS[n].map(([x, y], i) => {
      const c = PIN_COL[n][i];
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${c}" stroke-width="${r * 0.32}"/>` +
        `<circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="${c}"/>` +
        (n === 1 ? `<circle cx="${x}" cy="${y}" r="${r * 0.72}" fill="none" stroke="${GREEN}" stroke-width="1.6" stroke-dasharray="3 2"/>` : '');
    }).join(''));
  }

  // 삭(索) — 대나무
  const SOU_POS = {
    2: [[30, 22], [30, 58]], 3: [[30, 22], [19, 58], [41, 58]], 4: [[19, 22], [41, 22], [19, 58], [41, 58]],
    5: [[16, 22], [44, 22], [30, 40], [16, 58], [44, 58]], 6: [[16, 22], [30, 22], [44, 22], [16, 58], [30, 58], [44, 58]],
    7: [[30, 14], [16, 42], [30, 42], [44, 42], [16, 66], [30, 66], [44, 66]],
    8: [[12, 22], [24, 22], [36, 22], [48, 22], [12, 58], [24, 58], [36, 58], [48, 58]],
    9: [[16, 15], [30, 15], [44, 15], [16, 40], [30, 40], [44, 40], [16, 65], [30, 65], [44, 65]],
  };
  function stick(x, y, h, c) {
    const w = 6.4;
    return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="3" fill="${c}"/>` +
      `<rect x="${x - w / 2 - 0.6}" y="${y - 1.2}" width="${w + 1.2}" height="2.4" rx="1" fill="#fff" opacity=".85"/>` +
      `<line x1="${x}" y1="${y - h / 2 + 2}" x2="${x}" y2="${y + h / 2 - 2}" stroke="#fff" stroke-width="1" opacity=".5"/>`;
  }
  function sou(n) {
    if (n === 1) {
      // 1삭: 작은 새
      return svg(`<ellipse cx="30" cy="46" rx="15" ry="12" fill="${GREEN}"/>` +
        `<circle cx="39" cy="30" r="8" fill="${GREEN}"/><circle cx="41" cy="28" r="2" fill="#fff"/><circle cx="41.5" cy="28" r="1" fill="${INK}"/>` +
        `<path d="M46 30 L54 32 L46 34 Z" fill="${RED}"/>` +
        `<path d="M16 44 L4 36 L8 50 Z" fill="${RED}"/><path d="M22 44 Q30 52 38 44" stroke="#fff" stroke-width="2" fill="none"/>` +
        `<line x1="26" y1="58" x2="24" y2="68" stroke="${RED}" stroke-width="2.4"/><line x1="34" y1="58" x2="36" y2="68" stroke="${RED}" stroke-width="2.4"/>`);
    }
    const h = n >= 7 ? 20 : 28;
    return svg(SOU_POS[n].map(([x, y], i) => {
      const red = (n === 5 && i === 2) || (n === 7 && i === 0) || (n === 9 && i % 3 === 1);
      return stick(x, y, h, red ? RED : (n === 8 && i % 2 ? BLUE : GREEN));
    }).join(''));
  }

  // 만(萬) — 한자 숫자
  const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const man = (n) => svg(text(NUM[n - 1], 30, 22, 26, INK) + text('萬', 30, 56, 30, RED));
  const honor = (ch, color) => svg(text(ch, 30, 41, 42, color));
  const haku = () => svg(`<rect x="10" y="12" width="40" height="56" rx="4" fill="none" stroke="${BLUE}" stroke-width="3"/><rect x="15" y="17" width="30" height="46" rx="2" fill="none" stroke="${BLUE}" stroke-width="1.4"/>`);
  const flower = (ch, color, n) => svg(
    `<circle cx="30" cy="34" r="17" fill="${color}" opacity=".16"/>` + text(ch, 30, 36, 34, color) +
    `<text x="49" y="70" font-size="12" fill="${color}" font-weight="700" text-anchor="middle" font-family="sans-serif">${n}</text>`);

  const classic = [];
  for (let n = 1; n <= 9; n++) classic.push({ svg: man(n), label: NUM[n - 1] + '만' });
  for (let n = 1; n <= 9; n++) classic.push({ svg: pin(n), label: n + '통' });
  for (let n = 1; n <= 9; n++) classic.push({ svg: sou(n), label: n + '삭' });
  [['東', INK, '동'], ['南', INK, '남'], ['西', INK, '서'], ['北', INK, '북'], ['中', RED, '중'], ['發', GREEN, '발']]
    .forEach(([c, col, l]) => classic.push({ svg: honor(c, col), label: l }));
  classic.push({ svg: haku(), label: '백' });
  [['梅', '#d0457a'], ['蘭', '#7a4cc2'], ['菊', '#d98a12'], ['竹', GREEN]].forEach(([c, col], i) => classic.push({ svg: flower(c, col, i + 1), label: c }));
  [['春', '#2f9e44'], ['夏', RED], ['秋', '#c8661c'], ['冬', '#2c6fc0']].forEach(([c, col], i) => classic.push({ svg: flower(c, col, i + 1), label: c }));

  const emo = (s) => Array.from(s.matchAll(/\S+/g)).map((m) => ({ emoji: m[0] }));

  const THEMES = [
    { id: 'classic', name: '원조 사천성', desc: '진짜 마작패 42종', tiles: classic, kind: 'svg' },
    { id: 'animal', name: '귀여운 동물', desc: '멍멍 냥냥 친구들', kind: 'emoji',
      tiles: emo('🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐤 🦆 🦉 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐢 🐙 🦀 🐠 🐬 🐳 🦔 🦒 🐘 🦩 🦥') },
    { id: 'fruit', name: '과일 바구니', desc: '새콤달콤 과일·채소', kind: 'emoji',
      tiles: emo('🍎 🍏 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🍆 🥕 🌽 🌶️ 🥒 🥬 🥦 🧄 🧅 🍄 🥜 🌰 🍠 🥔 🍯 🥚 🧀 🍞 🥐 🥨') },
    { id: 'snack', name: '간식 파티', desc: '디저트와 분식', kind: 'emoji',
      tiles: emo('🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍦 🍧 🍨 🍿 🥞 🧇 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🍙 🍘 🍡 🥟 🥠 🥮 🍢 🍣 🍤 🍱 🍜 🍝 🍹 🥤 🍵') },
    { id: 'nature', name: '꽃과 날씨', desc: '꽃·별·날씨 모음', kind: 'emoji',
      tiles: emo('🌸 🌻 🌹 🌷 🌼 🌺 💐 🍀 🌵 🌴 🌲 🍁 🍂 🌾 🌈 ☀️ 🌙 ⭐ ☁️ ⚡ ❄️ 🔥 💧 🌊 🪐 🌍 ☄️ 🌋 🗻 🏝️ 🍄 🐚 💎 🔮 🎈 🎀 🎁 🧸') },
  ];

  const byId = Object.fromEntries(THEMES.map((t) => [t.id, t]));

  // 스테이지마다 다른 패 조합이 나오도록 시드로 섞어서 type → 테마 그림 매핑
  function mapping(themeId, seed, count) {
    const th = byId[themeId] || THEMES[0];
    const idx = th.tiles.map((_, i) => i);
    Engine.shuffleArr(idx, Engine.rng(seed ^ 0x5bd1e995));
    const out = [];
    for (let i = 0; i < count; i++) out.push(idx[i % idx.length]);
    return out;
  }

  function faceHTML(themeId, symIndex) {
    const th = byId[themeId] || THEMES[0];
    const t = th.tiles[symIndex % th.tiles.length];
    if (th.kind === 'svg') return t.svg;
    return `<span class="emo">${t.emoji}</span>`;
  }

  window.Tiles = { THEMES, byId, mapping, faceHTML };
})();
