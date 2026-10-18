/* 사천성 아케이드: 화면, 게임 진행, 랭킹, 친구 대결 + 채팅 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtTime = (ms) => {
    ms = Math.max(0, ms | 0);
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), d = Math.floor((ms % 1000) / 100);
    return `${m}:${pad2(s)}.${d}`;
  };
  const PEN = { hint: 10000, shuffle: 20000, undo: 5000 };

  /* ---------- 저장 ---------- */
  const KEY = 'sichuan.v1';
  let save = {};
  try { save = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { save = {}; }
  save.cleared = save.cleared || {};
  save.best = save.best || {};
  if (!save.uid) save.uid = 'u' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  if (!save.theme || !Tiles.byId[save.theme]) save.theme = 'classic';
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* 무시 */ } };
  persist();

  /* ---------- 공통 UI ---------- */
  let toastT;
  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms || 2200);
  }
  let modalClose = null;
  function openModal(html, opts) {
    opts = opts || {};
    const m = $('#modal');
    m.className = 'modal' + (opts.wide ? ' wide' : '');
    m.innerHTML = html;
    $('#modalBg').classList.add('on');
    modalClose = opts.onClose || null;
    m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    const f = m.querySelector('input'); if (f && !opts.noFocus) setTimeout(() => f.focus(), 50);
    return m;
  }
  function closeModal() {
    $('#modalBg').classList.remove('on');
    const cb = modalClose; modalClose = null;
    if (cb) cb();
  }
  $('#modalBg').addEventListener('mousedown', (e) => { if (e.target.id === 'modalBg' && !$('#modal').dataset.locked) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modalBg').classList.contains('on') && !$('#modal').dataset.locked) closeModal(); });

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    if (id === 'game') requestAnimationFrame(layout);
  }

  /* ---------- 소리 (WebAudio로 간단히 합성) ---------- */
  let actx = null;
  function beep(type) {
    if (save.muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = { pick: [660], match: [784, 1046], nope: [220], win: [523, 659, 784, 1046], shuffle: [440, 330] }[type] || [500];
      notes.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type === 'nope' ? 'square' : 'triangle';
        o.frequency.value = f;
        const t = actx.currentTime + i * 0.08;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.18);
      });
    } catch (e) { /* 무시 */ }
  }
  const muteBtn = $('#muteBtn');
  const syncMute = () => { muteBtn.textContent = save.muted ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { save.muted = !save.muted; persist(); syncMute(); });
  syncMute();

  /* ---------- 닉네임 ---------- */
  function nickKey(n) { return n.replace(/[.#$\[\]\/\s]/g, '_').slice(0, 20) || 'noname'; }
  function updateNick() { $('#nickLabel').textContent = save.nick || '닉네임 정하기'; }
  function askNick(force) {
    return new Promise((resolve) => {
      if (save.nick && !force) return resolve(save.nick);
      const m = openModal(`
        <h2>닉네임</h2>
        <p class="muted">랭킹과 채팅에 표시돼요. (2~10글자)</p>
        <form id="nickForm"><input id="nickInput" maxlength="10" placeholder="예: 사천성고수" value="${esc(save.nick || '')}" style="width:100%">
        <div class="actions">${save.nick ? '<button type="button" class="btn" data-close>취소</button>' : ''}<button class="btn primary">확인</button></div></form>`,
        { onClose: () => resolve(save.nick || null) });
      m.querySelector('#nickForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = m.querySelector('#nickInput').value.trim().replace(/\s+/g, ' ');
        if (v.length < 2) { toast('2글자 이상 입력해 주세요'); return; }
        save.nick = v; persist(); updateNick();
        if (room) Net.patch(`sichuan/rooms/${room.code}/players/${save.uid}`, { name: v }).catch(() => {});
        closeModal();
      });
    });
  }
  $('#nickChip').addEventListener('click', () => askNick(true));
  updateNick();

  /* ---------- 처음 화면 ---------- */
  function miniMask(st) {
    const set = new Set(st.cells.map(([x, y]) => x + ',' + y));
    let r = '';
    for (let y = 1; y <= st.H; y++) for (let x = 1; x <= st.W; x++) {
      if (set.has(x + ',' + y)) r += `<rect x="${x - 1}" y="${y - 1}" width=".86" height=".86" rx=".18"/>`;
    }
    return `<svg viewBox="-.2 -.2 ${st.W + .4} ${st.H + .4}" preserveAspectRatio="xMidYMid meet" fill="currentColor" style="color:#2f7a63">${r}</svg>`;
  }
  const unlocked = (n) => n === 1 || !!save.cleared[n - 1] || !!save.cleared[n];
  function nextStage() { for (let n = 1; n <= 50; n++) if (!save.cleared[n]) return n; return 50; }

  function renderThemes() {
    $('#themes').innerHTML = Tiles.THEMES.map((t) => {
      const samples = [0, 1, 2, 3].map((i) => {
        const idx = t.kind === 'svg' ? [4, 13, 22, 31][i] : i * 3;
        return `<div class="tile ${t.kind === 'emoji' ? 'emoji' : ''}" style="--d:3px;--fs:22px;--bg:${tileBg(idx)}">${Tiles.faceHTML(t.id, idx)}</div>`;
      }).join('');
      return `<button class="theme-card ${t.id === save.theme ? 'on' : ''}" data-theme="${t.id}">
        <div class="tn">${esc(t.name)}</div><div class="td">${esc(t.desc)}</div><div class="samples">${samples}</div></button>`;
    }).join('');
    $('#themes').querySelectorAll('.theme-card').forEach((b) => b.addEventListener('click', () => {
      save.theme = b.dataset.theme; persist(); renderThemes();
    }));
  }
  function renderStages() {
    const nx = nextStage();
    $('#stages').innerHTML = Stages.list.map((st) => {
      const n = st.n, ok = unlocked(n), cl = save.cleared[n];
      return `<button class="stage-btn ${cl ? 'cleared' : ''} ${n % 10 === 0 ? 'boss' : ''} ${n === nx && !cl ? 'next' : ''}" data-n="${n}" ${ok ? '' : 'disabled'} title="${esc(st.shape)} · ${st.cells.length}패">
        ${miniMask(st)}<span class="num">${n}</span><span class="best">${cl && save.best[n] ? '⏱ ' + fmtTime(save.best[n]) : st.cells.length + '패'}</span></button>`;
    }).join('');
    $('#stages').querySelectorAll('.stage-btn').forEach((b) => b.addEventListener('click', () => startSolo(+b.dataset.n)));
    const c = Object.keys(save.cleared).length;
    $('#progressLabel').textContent = `${c} / 50 클리어`;
    $('#continueBtn').textContent = c >= 50 ? '▶ 50스테이지 다시' : `▶ 이어하기 (${nx}스테이지)`;
  }
  function goHome() {
    if (room) { show('room'); return; }
    endGame(); renderStages(); renderThemes(); show('home');
  }
  $('#goHome').addEventListener('click', () => {
    if (game && !game.done && game.mode !== 'multi') { confirmQuit(); return; }
    if (game && game.mode === 'multi') { show('room'); return; }
    goHome();
  });
  $('#continueBtn').addEventListener('click', () => startSolo(nextStage()));
  $('#endlessBtn').addEventListener('click', () => startEndless());
  $('#howBtn').addEventListener('click', () => openModal(`
    <h2>사천성 규칙</h2>
    <ol class="how">
      <li>같은 그림의 패 두 개를 차례로 누르면 지워져요.</li>
      <li>두 패 사이를 <b>직선 3개 이하(꺾기 2번 이하)</b>로 연결할 수 있어야 해요. 다른 패를 통과할 순 없지만 판 바깥 테두리로는 돌아갈 수 있어요.</li>
      <li>모든 패를 지우면 클리어! 걸린 시간이 랭킹에 올라가요.</li>
      <li>💡 힌트 +10초, 🔀 섞기 +20초, ↩ 되돌리기 +5초 벌점이 붙어요.</li>
      <li>더 이상 지울 패가 없으면 벌점 없이 자동으로 섞어 줘요. 섞은 판도 항상 클리어할 수 있어요.</li>
    </ol>
    <div class="actions"><button class="btn primary" data-close>알겠어요!</button></div>`));

  /* ---------- 게임 ---------- */
  let game = null;
  let timerId = null;

  function tileBg(sym) { return `hsl(${(sym * 47) % 360} 85% 90%)`; }

  function buildGame(stage, seed, themeId, mode, label) {
    endGame();
    const board = Engine.generate(stage.W, stage.H, stage.cells, stage.types, seed);
    game = {
      mode, stage, seed, themeId, label,
      board, sym: Tiles.mapping(themeId, seed, stage.types),
      total: stage.cells.length, sel: null, undo: [], penalty: 0, hints: 0, shuffles: 0,
      startT: 0, running: false, done: false, paused: false, pausedAt: 0, els: new Map(),
    };
    document.body.classList.toggle('multi', mode === 'multi');
    $('#stageTitle').innerHTML = label;
    $('#pauseBtn').style.display = mode === 'multi' ? 'none' : '';
    $('#side').classList.remove('open');
    renderBoard(true);
    updateStats();
    show('game');
  }
  function startClock() {
    window.__guardTainted = false;
    game.startT = performance.now(); game.running = true;
    clearInterval(timerId);
    timerId = setInterval(updateStats, 100);
  }
  function elapsed() {
    if (!game || !game.startT) return 0;
    const end = game.done ? game.endT : (game.paused ? game.pausedAt : performance.now());
    return end - game.startT + game.penalty;
  }
  function endGame() {
    clearInterval(timerId); timerId = null;
    if (game) game.running = false;
    game = null;
    $('#boardOverlay').classList.remove('on');
  }

  function startSolo(n) {
    if (!unlocked(n)) { toast('앞 스테이지를 먼저 클리어해 주세요'); return; }
    const st = Stages.list[n - 1];
    buildGame(st, st.seed, save.theme, 'solo', `스테이지 ${n}${n % 10 === 0 ? ' 👑' : ''}<span class="hide-sm"> · ${esc(st.shape)}</span>`);
    startClock();
  }
  function startEndless() {
    const seed = (Math.random() * 2 ** 31) | 0;
    const st = Stages.randomStage(seed);
    buildGame(st, seed, save.theme, 'endless', `무한 연습<span class="hide-sm"> · ${esc(st.shape)}</span>`);
    startClock();
  }

  // 화면 좌표 (세로 화면에서 가로로 긴 판은 90도 돌려서 표시)
  function geom() {
    const g = game, b = g.board;
    const wrap = $('#boardWrap').getBoundingClientRect();
    const availW = Math.max(200, wrap.width - 16), availH = Math.max(200, wrap.height - 16);
    const trans = availH > availW * 1.1 && b.W > b.H;
    const cols = trans ? b.H : b.W, rows = trans ? b.W : b.H;
    const ratio = 0.8;
    let tw = Math.min(availW / (cols + 1), (availH / (rows + 1.1)) * ratio);
    tw = Math.min(tw, 86);
    const th = tw / ratio;
    return { trans, cols, rows, tw, th, W: (cols + 1) * tw, H: (rows + 1) * th + 6 };
  }
  function disp(gm, x, y) {
    const dx = gm.trans ? y : x, dy = gm.trans ? x : y;
    return { cx: dx * gm.tw, cy: dy * gm.th };
  }
  function renderBoard(fresh) {
    const g = game, b = g.board, el = $('#board');
    el.innerHTML = ''; g.els.clear();
    const th = Tiles.byId[g.themeId];
    for (const [x, y] of b.tiles()) {
      const t = b.get(x, y), sym = g.sym[t];
      const d = document.createElement('div');
      d.className = 'tile' + (th.kind === 'emoji' ? ' emoji' : '') + (fresh ? ' pop' : '');
      d.style.setProperty('--bg', tileBg(sym));
      d.innerHTML = Tiles.faceHTML(g.themeId, sym);
      d.dataset.x = x; d.dataset.y = y;
      d.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(x, y); });
      el.appendChild(d);
      g.els.set(x + ',' + y, d);
    }
    layout();
  }
  function layout() {
    if (!game || !$('#game').classList.contains('active')) return;
    const gm = geom(), el = $('#board');
    el.style.width = gm.W + 'px'; el.style.height = gm.H + 'px';
    const depth = Math.max(2, Math.round(gm.tw * 0.07));
    for (const [k, d] of game.els) {
      const [x, y] = k.split(',').map(Number);
      const p = disp(gm, x, y);
      d.style.left = (p.cx - gm.tw / 2) + 'px'; d.style.top = (p.cy - gm.th / 2) + 'px';
      d.style.width = (gm.tw - 3) + 'px'; d.style.height = (gm.th - 2 - depth) + 'px';
      d.style.setProperty('--d', depth + 'px');
      d.style.setProperty('--fs', Math.round(gm.tw * 0.62) + 'px');
    }
    game.gm = gm;
  }
  window.addEventListener('resize', () => { clearTimeout(layout.t); layout.t = setTimeout(layout, 60); });

  function drawPath(path) {
    const gm = game.gm, el = $('#board');
    const pts = path.map(([x, y]) => { const p = disp(gm, x, y); return `${p.cx},${p.cy - 2}`; }).join(' ');
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'path'); s.setAttribute('width', gm.W); s.setAttribute('height', gm.H);
    s.innerHTML = `<polyline points="${pts}"/>`;
    el.appendChild(s);
    setTimeout(() => s.remove(), 480);
  }
  const tileEl = (x, y) => game.els.get(x + ',' + y);
  function clearHint() { if (game) for (const d of game.els.values()) d.classList.remove('hint'); }

  function tap(x, y) {
    const g = game;
    if (!g || !g.running || g.done || g.paused) return;
    const b = g.board;
    if (b.get(x, y) < 0) return;
    const el = tileEl(x, y);
    if (!g.sel) { g.sel = [x, y]; el.classList.add('sel'); beep('pick'); return; }
    const [sx, sy] = g.sel;
    const sel = tileEl(sx, sy);
    if (sx === x && sy === y) { el.classList.remove('sel'); g.sel = null; return; }
    if (b.get(sx, sy) !== b.get(x, y)) {
      sel && sel.classList.remove('sel'); g.sel = [x, y]; el.classList.add('sel'); beep('pick'); return;
    }
    const path = b.path(sx, sy, x, y);
    if (!path) {
      el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); beep('nope');
      sel && sel.classList.remove('sel'); g.sel = [x, y]; el.classList.add('sel');
      return;
    }
    // 제거
    clearHint();
    const t = b.get(x, y);
    b.set(sx, sy, -1); b.set(x, y, -1);
    g.undo.push([[sx, sy], [x, y], t]);
    g.sel = null;
    drawPath(path);
    [sel, el].forEach((d) => { if (d) { d.classList.remove('sel'); d.classList.add('gone'); } });
    g.els.delete(sx + ',' + sy); g.els.delete(x + ',' + y);
    setTimeout(() => { sel && sel.remove(); el.remove(); }, 340);
    beep('match');
    updateStats();
    reportProgress();
    const left = b.tiles().length;
    if (!left) { win(); return; }
    if (!b.findMove()) {
      setTimeout(() => {
        if (!game || game !== g || g.done) return;
        Engine.reshuffle(g.board); g.undo = [];
        renderBoard(true); beep('shuffle');
        toast('지울 수 있는 패가 없어서 자동으로 섞었어요 (벌점 없음)');
      }, 380);
    }
  }

  function updateStats() {
    if (!game) return;
    if (window.__guardTainted && game.running) game.tainted = true;
    $('#timer').textContent = fmtTime(elapsed());
    $('#remain').textContent = game.board.tiles().length;
    $('#penalty').textContent = '+' + Math.round(game.penalty / 1000) + '초';
    $('#undoBtn').disabled = !game.undo.length;
  }
  function addPenalty(ms) { game.penalty += ms; updateStats(); }

  $('#hintBtn').addEventListener('click', () => {
    if (!game || !game.running || game.done || game.paused) return;
    const m = game.board.findMove();
    if (!m) return;
    clearHint();
    m.forEach(([x, y]) => { const d = tileEl(x, y); if (d) d.classList.add('hint'); });
    addPenalty(PEN.hint); game.hints++;
    toast('힌트! +10초');
  });
  $('#shuffleBtn').addEventListener('click', () => {
    if (!game || !game.running || game.done || game.paused) return;
    Engine.reshuffle(game.board); game.undo = []; game.sel = null;
    renderBoard(true); beep('shuffle');
    addPenalty(PEN.shuffle); game.shuffles++;
    toast('섞었어요! +20초');
  });
  $('#undoBtn').addEventListener('click', () => {
    if (!game || !game.running || game.done || game.paused || !game.undo.length) return;
    const [a, c, t] = game.undo.pop();
    game.board.set(a[0], a[1], t); game.board.set(c[0], c[1], t);
    game.sel = null;
    renderBoard(false);
    addPenalty(PEN.undo);
    reportProgress();
  });
  $('#pauseBtn').addEventListener('click', () => {
    if (!game || !game.running || game.done || game.mode === 'multi') return;
    if (!game.paused) {
      game.paused = true; game.pausedAt = performance.now();
      $('#board').classList.add('paused');
      const ov = $('#boardOverlay'); ov.innerHTML = '<div><div class="msg">일시정지</div><p>판은 가려져 있어요</p><button class="btn primary big" id="resumeBtn">계속하기</button></div>'; ov.classList.add('on');
      $('#resumeBtn').addEventListener('click', () => $('#pauseBtn').click());
    } else {
      game.startT += performance.now() - game.pausedAt; game.paused = false;
      $('#board').classList.remove('paused'); $('#boardOverlay').classList.remove('on');
    }
  });
  function confirmQuit() {
    openModal(`<h2>그만할까요?</h2><p>지금 판의 기록은 저장되지 않아요.</p>
      <div class="actions"><button class="btn" data-close>계속하기</button><button class="btn primary" id="reallyQuit">나가기</button></div>`);
    $('#reallyQuit').addEventListener('click', () => { closeModal(); goHome(); });
  }
  $('#quitBtn').addEventListener('click', () => {
    if (!game) { goHome(); return; }
    if (game.mode === 'multi') { show('room'); return; }
    if (game.done) { goHome(); return; }
    confirmQuit();
  });

  /* ---------- 클리어 ---------- */
  async function win() {
    const g = game;
    g.endT = performance.now(); g.done = true; g.running = false;
    clearInterval(timerId); updateStats();
    const ms = Math.round(elapsed());
    beep('win');
    if (g.mode === 'multi') { multiFinish(ms); return; }
    if (g.mode === 'endless') {
      openModal(`<h2>🎉 클리어!</h2><div class="result-time">${fmtTime(ms)}</div>
        <p class="result-sub">무한 연습 모드는 랭킹에 기록되지 않아요.</p>
        <div class="actions"><button class="btn" id="toHome">처음으로</button><button class="btn primary" id="again">한 판 더</button></div>`);
      $('#toHome').addEventListener('click', () => { closeModal(); goHome(); });
      $('#again').addEventListener('click', () => { closeModal(); startEndless(); });
      return;
    }
    const n = g.stage.n;
    if (g.tainted || window.__guardTainted) {
      openModal(`<h2>클리어!</h2><div class="result-time">${fmtTime(ms)}</div>
        <p class="result-sub">게임 중에 개발자 도구가 열려서 이번 기록은 저장되지 않았어요.</p>
        <div class="actions"><button class="btn" id="toHome">스테이지 목록</button><button class="btn primary" id="retry">다시 하기</button></div>`, { noFocus: true });
      $('#toHome').addEventListener('click', () => { closeModal(); goHome(); });
      $('#retry').addEventListener('click', () => { closeModal(); startSolo(n); });
      return;
    }
    const prevBest = save.best[n];
    const newBest = !prevBest || ms < prevBest;
    save.cleared[n] = true;
    if (newBest) save.best[n] = ms;
    persist();
    openModal(`<h2>🎉 스테이지 ${n} 클리어!</h2>
      <div class="result-time">${fmtTime(ms)}</div>
      <p class="result-sub">${newBest ? (prevBest ? `내 최고 기록 경신! (이전 ${fmtTime(prevBest)})` : '첫 클리어!') : `내 최고 기록 ${fmtTime(prevBest)}`}
      ${g.penalty ? ` · 벌점 +${Math.round(g.penalty / 1000)}초 포함` : ''}</p>
      <div id="rankArea" class="muted" style="text-align:center;margin-top:10px">랭킹 확인 중…</div>
      <div class="actions"><button class="btn" id="toHome">스테이지 목록</button><button class="btn" id="retry">다시 하기</button>
      ${n < 50 ? '<button class="btn primary" id="nextBtn">다음 스테이지 ▶</button>' : ''}</div>`, { noFocus: true });
    $('#toHome').addEventListener('click', () => { closeModal(); goHome(); });
    $('#retry').addEventListener('click', () => { closeModal(); startSolo(n); });
    const nb = $('#nextBtn'); if (nb) nb.addEventListener('click', () => { closeModal(); startSolo(n + 1); });
    submitRank(n, ms, g.themeId);
  }

  async function submitRank(n, ms, themeId) {
    const area = () => $('#rankArea');
    if (!save.nick) {
      const nick = await askNick(false);
      // 닉네임 창이 클리어 창을 덮었으므로 다시 결과를 띄움
      if (!nick) return;
      reopenResult(n, ms);
    }
    const path = `rankings/sichuan/s${pad2(n)}/${encodeURIComponent(nickKey(save.nick))}`;
    try {
      const prev = await Net.get(path);
      if (!prev || ms < prev.time) {
        const d = new Date();
        await Net.put(path, { name: save.nick, time: ms, theme: themeId, uid: save.uid, date: `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`, ts: Net.TS });
      }
      rankCache = null;
      const list = sortStage(await Net.get(`rankings/sichuan/s${pad2(n)}`));
      const myIdx = list.findIndex((r) => r.name === save.nick);
      const a = area();
      if (a) a.innerHTML = `🏆 스테이지 ${n} 랭킹 <b>${myIdx + 1}위</b> / ${list.length}명 &nbsp;<button class="btn small" id="seeRank">랭킹 보기</button>`;
      const sr = $('#seeRank'); if (sr) sr.addEventListener('click', () => openRanking(n));
    } catch (e) {
      const a = area(); if (a) a.textContent = '랭킹 서버에 연결하지 못했어요. 기록은 이 브라우저에 저장됐어요.';
    }
  }
  function reopenResult(n, ms) {
    openModal(`<h2>🎉 스테이지 ${n} 클리어!</h2><div class="result-time">${fmtTime(ms)}</div>
      <div id="rankArea" class="muted" style="text-align:center;margin-top:10px">랭킹 등록 중…</div>
      <div class="actions"><button class="btn" id="toHome">스테이지 목록</button>${n < 50 ? '<button class="btn primary" id="nextBtn">다음 스테이지 ▶</button>' : ''}</div>`, { noFocus: true });
    $('#toHome').addEventListener('click', () => { closeModal(); goHome(); });
    const nb = $('#nextBtn'); if (nb) nb.addEventListener('click', () => { closeModal(); startSolo(n + 1); });
  }

  /* ---------- 랭킹 ---------- */
  let rankCache = null, rankCacheT = 0;
  const sortStage = (obj) => Object.values(obj || {}).filter((r) => r && typeof r.time === 'number' && r.time > 0).sort((a, b) => a.time - b.time);
  async function loadAllRanks() {
    if (rankCache && Date.now() - rankCacheT < 20000) return rankCache;
    rankCache = (await Net.get('rankings/sichuan')) || {};
    rankCacheT = Date.now();
    return rankCache;
  }
  async function openRanking(stageN) {
    let tab = stageN ? 'stage' : 'stage', cur = stageN || Math.max(1, Math.min(50, nextStage() - (save.cleared[nextStage()] ? 0 : 1)) || 1);
    const m = openModal(`<h2>🏆 랭킹</h2>
      <div class="tabs"><button data-t="stage" class="on">스테이지별</button><button data-t="all">종합</button></div>
      <div id="rankCtl" class="row gap" style="margin-bottom:10px"></div>
      <div id="rankBody" class="muted">불러오는 중…</div>
      <div class="actions"><button class="btn" data-close>닫기</button></div>`, { wide: true, noFocus: true });
    const themeName = (id) => (Tiles.byId[id] ? Tiles.byId[id].name : '');
    const draw = async () => {
      m.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
      const ctl = $('#rankCtl'), body = $('#rankBody');
      let all;
      try { all = await loadAllRanks(); } catch (e) { body.textContent = '랭킹 서버에 연결하지 못했어요.'; return; }
      if (tab === 'stage') {
        ctl.innerHTML = `<button class="btn small" id="rkPrev">◀</button>
          <select id="rkSel">${Stages.list.map((s) => `<option value="${s.n}" ${s.n === cur ? 'selected' : ''}>스테이지 ${s.n} · ${esc(s.shape)}</option>`).join('')}</select>
          <button class="btn small" id="rkNext">▶</button>`;
        $('#rkSel').addEventListener('change', (e) => { cur = +e.target.value; draw(); });
        $('#rkPrev').addEventListener('click', () => { cur = Math.max(1, cur - 1); draw(); });
        $('#rkNext').addEventListener('click', () => { cur = Math.min(50, cur + 1); draw(); });
        const list = sortStage(all['s' + pad2(cur)]).slice(0, 100);
        body.innerHTML = list.length ? `<table class="rank-table"><tr><th>순위</th><th>닉네임</th><th>기록</th><th>테마</th><th>날짜</th></tr>
          ${list.map((r, i) => `<tr class="${r.name === save.nick ? 'me' : ''}"><td class="rk">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td>${esc(r.name)}</td><td class="mono">${fmtTime(r.time)}</td><td class="small">${esc(themeName(r.theme))}</td><td class="small muted">${esc(r.date || '')}</td></tr>`).join('')}</table>`
          : '<p>아직 아무도 클리어하지 못했어요. 첫 번째 주인공이 되어 보세요!</p>';
      } else {
        ctl.innerHTML = '<span class="small muted">많이 클리어한 순 → 같으면 총 시간이 짧은 순</span>';
        const players = new Map();
        for (const [k, stage] of Object.entries(all)) {
          if (!/^s\d+$/.test(k)) continue;
          for (const r of Object.values(stage || {})) {
            if (!r || typeof r.time !== 'number') continue;
            const p = players.get(r.name) || { name: r.name, count: 0, sum: 0 };
            p.count++; p.sum += r.time; players.set(r.name, p);
          }
        }
        const list = [...players.values()].sort((a, b) => b.count - a.count || a.sum - b.sum).slice(0, 100);
        body.innerHTML = list.length ? `<table class="rank-table"><tr><th>순위</th><th>닉네임</th><th>클리어</th><th>총 시간</th></tr>
          ${list.map((r, i) => `<tr class="${r.name === save.nick ? 'me' : ''}"><td class="rk">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td>${esc(r.name)}</td><td>${r.count} / 50</td><td class="mono">${fmtTime(r.sum)}</td></tr>`).join('')}</table>`
          : '<p>아직 기록이 없어요.</p>';
      }
    };
    m.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; draw(); }));
    draw();
  }
  $('#openRank').addEventListener('click', () => openRanking(game && game.mode === 'solo' ? game.stage.n : 0));

  /* ---------- 채팅 컴포넌트 ---------- */
  function mountChat(box, code, title, onNew) {
    box.innerHTML = `<div class="chat-head"><span>${esc(title)}</span><span class="small muted" id="cc-${code}"></span></div>
      <div class="chat-list"></div>
      <form class="chat-form"><input maxlength="200" placeholder="메시지 입력…" autocomplete="off"><button class="btn small primary">전송</button></form>`;
    const list = box.querySelector('.chat-list'), form = box.querySelector('form'), input = form.querySelector('input');
    let lastCount = -1;
    const sub = Net.listen(`sichuan/chat/${code}`, '?orderBy=%22%24key%22&limitToLast=60', (data) => {
      const msgs = Object.entries(data || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((e) => e[1]).filter(Boolean);
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
      list.innerHTML = msgs.map((m) => {
        if (m.sys) return `<div class="msg-row sys"><span class="bubble">${esc(m.text)}</span></div>`;
        const mine = m.uid === save.uid;
        return `<div class="msg-row ${mine ? 'mine' : ''}"><div class="who">${esc(m.name)}</div><span class="bubble">${esc(m.text)}</span></div>`;
      }).join('') || '<div class="muted small" style="text-align:center;margin:auto">첫 메시지를 남겨 보세요 👋</div>';
      if (atBottom || lastCount < 0) list.scrollTop = list.scrollHeight;
      if (lastCount >= 0 && msgs.length > lastCount && onNew) {
        const last = msgs[msgs.length - 1];
        if (last && last.uid !== save.uid) onNew(last);
      }
      lastCount = msgs.length;
    });
    let lastSend = 0;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      if (!save.nick) { await askNick(false); if (!save.nick) return; }
      if (Date.now() - lastSend < 700) { toast('조금 천천히 보내 주세요'); return; }
      lastSend = Date.now();
      input.value = '';
      Net.post(`sichuan/chat/${code}`, { uid: save.uid, name: save.nick, text: text.slice(0, 200), ts: Net.TS }).catch(() => toast('메시지를 보내지 못했어요'));
    });
    return { close: () => sub.close(), focus: () => input.focus() };
  }
  const sysChat = (code, text) => Net.post(`sichuan/chat/${code}`, { sys: true, text, ts: Net.TS }).catch(() => {});

  /* ---------- 친구랑: 로비 ---------- */
  let lobbyChat = null;
  const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  async function openLobby() {
    if (room) { show('room'); return; }
    if (!save.nick) { await askNick(false); if (!save.nick) return; }
    const m = openModal(`<h2>👥 친구랑 같이 하기</h2>
      <div class="lobby-grid">
        <div>
          <p class="muted small" style="margin-top:0">방을 만들고 코드나 초대 링크를 친구에게 보내세요. 같은 판으로 동시에 대결하고 채팅할 수 있어요.</p>
          <button class="btn primary big" id="mkRoom" style="width:100%">+ 새 방 만들기</button>
          <form id="joinForm" class="row gap" style="margin-top:12px"><input id="joinCode" maxlength="4" placeholder="방 코드 (4자리)" style="flex:1;text-transform:uppercase;letter-spacing:3px"><button class="btn">입장</button></form>
          <h3>열려 있는 방</h3>
          <div class="rooms-list" id="roomsList"><span class="muted small">불러오는 중…</span></div>
        </div>
        <div class="chat-panel" id="lobbyChatBox"></div>
      </div>
      <div class="actions"><button class="btn" data-close>닫기</button></div>`, { wide: true, noFocus: true, onClose: () => { if (lobbyChat) { lobbyChat.close(); lobbyChat = null; } } });
    lobbyChat = mountChat($('#lobbyChatBox'), '_lobby', '로비 채팅 (모두)');
    $('#mkRoom').addEventListener('click', createRoom);
    $('#joinForm').addEventListener('submit', (e) => { e.preventDefault(); joinRoom($('#joinCode').value.trim().toUpperCase()); });
    try {
      const rooms = (await Net.get('sichuan/rooms')) || {};
      const nowT = Net.now();
      const open = [];
      for (const [code, r] of Object.entries(rooms)) {
        const ps = Object.values((r && r.players) || {});
        const alive = ps.filter((p) => nowT - (p.seen || 0) < 60000);
        if (!r || !r.meta || !alive.length) {
          // 오래된 빈 방 정리
          if (!r || !r.meta || nowT - (r.meta.updated || 0) > 30 * 60000) { Net.del(`sichuan/rooms/${code}`).catch(() => {}); Net.del(`sichuan/chat/${code}`).catch(() => {}); }
          continue;
        }
        open.push({ code, r, n: alive.length });
      }
      const el = $('#roomsList'); if (!el) return;
      el.innerHTML = open.length ? open.map(({ code, r, n }) => `<button data-code="${code}"><span><b>${code}</b> · ${esc((r.players[r.meta.host] || {}).name || '방장')}의 방</span><span class="small muted">${n}명 · ${r.meta.status === 'playing' ? '게임 중' : '대기 중'}</span></button>`).join('')
        : '<span class="muted small">지금 열린 방이 없어요. 새로 만들어 보세요!</span>';
      el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => joinRoom(b.dataset.code)));
    } catch (e) { const el = $('#roomsList'); if (el) el.innerHTML = '<span class="muted small">방 목록을 불러오지 못했어요.</span>'; }
  }
  $('#openMulti').addEventListener('click', openLobby);

  function playerObj() { return { name: save.nick, joined: Net.TS, seen: Net.TS, round: 0, remaining: 0, total: 0, finished: false, time: 0 }; }

  async function createRoom() {
    try {
      await Net.syncTime(save.uid);
      let code = '';
      for (let i = 0; i < 6; i++) {
        code = Array.from({ length: 4 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
        if (!(await Net.get(`sichuan/rooms/${code}/meta`))) break;
      }
      await Net.put(`sichuan/rooms/${code}`, {
        meta: { host: save.uid, stage: Math.min(nextStage(), 50), theme: save.theme, status: 'waiting', round: 0, seed: 0, created: Net.TS, updated: Net.TS },
        players: { [save.uid]: playerObj() },
      });
      sysChat(code, `${save.nick} 님이 방을 만들었어요`);
      closeModal(); enterRoom(code);
    } catch (e) { toast('방을 만들지 못했어요. 인터넷 연결을 확인해 주세요.'); }
  }
  async function joinRoom(code) {
    if (!/^[A-Z0-9]{4}$/.test(code)) { toast('4자리 방 코드를 입력해 주세요'); return; }
    if (!save.nick) { await askNick(false); if (!save.nick) return; }
    try {
      await Net.syncTime(save.uid);
      const r = await Net.get(`sichuan/rooms/${code}`);
      if (!r || !r.meta) { toast('그런 방이 없어요'); return; }
      const alive = Object.entries(r.players || {}).filter(([id, p]) => id !== save.uid && Net.now() - (p.seen || 0) < 60000);
      if (alive.length >= 8) { toast('방이 꽉 찼어요 (최대 8명)'); return; }
      await Net.put(`sichuan/rooms/${code}/players/${save.uid}`, playerObj());
      if (!alive.length) await Net.patch(`sichuan/rooms/${code}/meta`, { host: save.uid, status: 'waiting' });
      sysChat(code, `${save.nick} 님이 들어왔어요`);
      closeModal(); enterRoom(code);
    } catch (e) { toast('입장하지 못했어요'); }
  }

  /* ---------- 친구랑: 방 ---------- */
  let room = null;
  function enterRoom(code) {
    leaveRoomLocal();
    room = { code, data: null, playedRound: null, unread: 0 };
    $('#roomCode').textContent = code;
    try { history.replaceState(null, '', `?room=${code}`); } catch (e) { /* 무시 */ }
    room.sub = Net.listen(`sichuan/rooms/${code}`, '', onRoom);
    room.chat1 = mountChat($('#roomChatBox'), code, '방 채팅');
    room.chat2 = mountChat($('#gameChatBox'), code, '채팅', (msg) => {
      if (window.innerWidth <= 860 && !$('#side').classList.contains('open')) {
        room.unread++; const b = $('#chatBadge'); b.textContent = room.unread; b.classList.add('on');
        toast(`💬 ${msg.name || ''}: ${msg.text}`.slice(0, 60));
      }
    });
    room.beat = setInterval(() => {
      Net.patch(`sichuan/rooms/${code}/players/${save.uid}`, { seen: Net.TS }).catch(() => {});
    }, 15000);
    show('room');
  }
  function leaveRoomLocal() {
    if (!room) return;
    room.sub && room.sub.close(); room.chat1 && room.chat1.close(); room.chat2 && room.chat2.close();
    clearInterval(room.beat);
    room = null;
    document.body.classList.remove('multi');
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* 무시 */ }
  }
  async function leaveRoom() {
    if (!room) return;
    const code = room.code, data = room.data;
    leaveRoomLocal();
    endGame();
    try {
      const others = Object.entries((data && data.players) || {}).filter(([id, p]) => id !== save.uid && Net.now() - (p.seen || 0) < 60000);
      await Net.del(`sichuan/rooms/${code}/players/${save.uid}`);
      if (!others.length) { await Net.del(`sichuan/rooms/${code}`); await Net.del(`sichuan/chat/${code}`); }
      else sysChat(code, `${save.nick} 님이 나갔어요`);
    } catch (e) { /* 무시 */ }
    goHome();
  }
  $('#leaveRoom').addEventListener('click', leaveRoom);
  $('#copyLink').addEventListener('click', async () => {
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    try { await navigator.clipboard.writeText(link); toast('초대 링크를 복사했어요!'); }
    catch (e) { openModal(`<h2>초대 링크</h2><input value="${esc(link)}" style="width:100%" onclick="this.select()"><div class="actions"><button class="btn" data-close>닫기</button></div>`); }
  });
  window.addEventListener('pagehide', () => {
    if (!room) return;
    try { fetch(`${Net.DB}/sichuan/rooms/${room.code}/players/${save.uid}.json`, { method: 'DELETE', keepalive: true }); } catch (e) { /* 무시 */ }
  });

  const isOnline = (p) => p && Net.now() - (p.seen || 0) < 60000;
  const amHost = () => room && room.data && room.data.meta && room.data.meta.host === save.uid;

  function onRoom(data) {
    if (!room) return;
    room.data = data;
    if (!data || !data.meta) { toast('방이 사라졌어요'); leaveRoomLocal(); endGame(); goHome(); return; }
    const meta = data.meta, players = data.players || {};
    if (!players[save.uid]) {
      // 연결이 끊겨 지워졌다면 다시 등록
      Net.put(`sichuan/rooms/${room.code}/players/${save.uid}`, playerObj()).catch(() => {});
    }
    // 방장이 나갔으면 가장 먼저 들어온 접속자가 방장을 이어받음
    if (!isOnline(players[meta.host])) {
      const alive = Object.entries(players).filter(([, p]) => isOnline(p)).sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0));
      if (alive.length && alive[0][0] === save.uid) Net.patch(`sichuan/rooms/${room.code}/meta`, { host: save.uid }).catch(() => {});
    }
    renderRoom();
    renderSidePlayers();
    // 새 라운드 시작
    if (meta.status === 'playing' && meta.round && room.playedRound !== meta.round) {
      room.playedRound = meta.round;
      const me = players[save.uid];
      if (!(me && me.round === meta.round && me.finished)) startMulti(meta);
    }
  }

  function renderRoom() {
    const data = room.data, meta = data.meta, players = data.players || {};
    const host = amHost();
    const st = Stages.list[(meta.stage || 1) - 1];
    const th = Tiles.byId[meta.theme] || Tiles.THEMES[0];
    const playing = meta.status === 'playing';
    $('#roomSettings').innerHTML = host ? `
      <label>스테이지<select id="rsStage">${Stages.list.map((s) => `<option value="${s.n}" ${s.n === meta.stage ? 'selected' : ''}>${s.n} · ${esc(s.shape)} (${s.cells.length}패)</option>`).join('')}<option value="0" ${meta.stage === 0 ? 'selected' : ''}>무작위 판</option></select></label>
      <label>테마<select id="rsTheme">${Tiles.THEMES.map((t) => `<option value="${t.id}" ${t.id === meta.theme ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <button class="btn primary big" id="rsStart">${playing ? '⟳ 새 라운드 시작' : '▶ 시작!'}</button>
      ${playing ? '<button class="btn" id="rsEnd">대기실로</button>' : ''}`
      : `<div>스테이지 <b>${meta.stage ? meta.stage + ' · ' + esc(st.shape) : '무작위 판'}</b> · 테마 <b>${esc(th.name)}</b></div>
         <div class="muted small" style="margin-left:auto">${playing ? '게임 진행 중이에요' : '방장이 시작하기를 기다리는 중…'}</div>
         ${playing && game && game.mode === 'multi' ? '<button class="btn primary" id="rsBack">게임으로 돌아가기</button>' : ''}`;
    if (host) {
      $('#rsStage').addEventListener('change', (e) => Net.patch(`sichuan/rooms/${room.code}/meta`, { stage: +e.target.value, updated: Net.TS }));
      $('#rsTheme').addEventListener('change', (e) => Net.patch(`sichuan/rooms/${room.code}/meta`, { theme: e.target.value, updated: Net.TS }));
      $('#rsStart').addEventListener('click', () => {
        Net.patch(`sichuan/rooms/${room.code}/meta`, { status: 'playing', round: (meta.round || 0) + 1, seed: (Math.random() * 2 ** 31) | 0, updated: Net.TS });
        sysChat(room.code, `🚩 라운드 ${(meta.round || 0) + 1} 시작! (${meta.stage ? '스테이지 ' + meta.stage : '무작위 판'})`);
      });
      const e = $('#rsEnd'); if (e) e.addEventListener('click', () => Net.patch(`sichuan/rooms/${room.code}/meta`, { status: 'waiting', updated: Net.TS }));
    } else {
      const b = $('#rsBack'); if (b) b.addEventListener('click', () => show('game'));
    }
    const list = Object.entries(players).sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0));
    $('#roomPlayers').innerHTML = list.map(([id, p]) => {
      const on = isOnline(p);
      let st2 = on ? '' : '연결 끊김';
      if (on && meta.round && p.round === meta.round) st2 = p.finished ? `🏁 ${fmtTime(p.time)}` : (playing ? `남은 패 ${p.remaining}` : '');
      return `<li class="${on ? '' : 'off'}"><span class="dot"></span><span>${esc(p.name)}${id === save.uid ? ' (나)' : ''}</span>${id === meta.host ? '<span class="tag">방장</span>' : ''}<span class="st">${st2}</span></li>`;
    }).join('');
  }

  function renderSidePlayers() {
    if (!room || !room.data) return;
    const meta = room.data.meta, players = room.data.players || {};
    const rows = Object.entries(players).filter(([, p]) => isOnline(p) || (p.round === meta.round && p.finished));
    const finished = rows.filter(([, p]) => p.round === meta.round && p.finished).sort((a, b) => a[1].time - b[1].time).map(([id]) => id);
    $('#sidePlayers').innerHTML = `<div class="small muted" style="margin-bottom:6px">라운드 ${meta.round || 0} 진행 상황</div>` + rows.map(([id, p]) => {
      const inRound = p.round === meta.round;
      const total = p.total || 1, rem = inRound ? p.remaining : total;
      const pct = inRound ? (p.finished ? 100 : Math.round(((total - rem) / total) * 100)) : 0;
      const place = finished.indexOf(id);
      return `<div class="prog ${id === save.uid ? 'me' : ''}"><div class="pn"><span>${place >= 0 ? ['🥇', '🥈', '🥉'][place] || '🏁' : ''} ${esc(p.name)}</span><span class="mono">${p.finished && inRound ? fmtTime(p.time) : (inRound ? rem + '패' : '대기')}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }).join('');
    if (game && game.mode === 'multi' && game.done) showMultiResult();
  }

  function startMulti(meta) {
    const st = meta.stage ? Stages.list[meta.stage - 1] : Stages.randomStage(meta.seed);
    buildGame(st, meta.seed, meta.theme, 'multi', `라운드 ${meta.round}<span class="hide-sm"> · ${meta.stage ? '스테이지 ' + meta.stage : '무작위 판'}</span>`);
    game.round = meta.round;
    Net.patch(`sichuan/rooms/${room.code}/players/${save.uid}`, { round: meta.round, remaining: game.total, total: game.total, finished: false, time: 0, seen: Net.TS }).catch(() => {});
    // 3, 2, 1 카운트다운
    const ov = $('#boardOverlay'); ov.classList.add('on'); $('#board').classList.add('paused');
    let c = 3;
    const tick = () => {
      if (!game || game.round !== meta.round) return;
      if (c > 0) { ov.innerHTML = `<div class="big">${c}</div>`; beep('pick'); c--; setTimeout(tick, 800); }
      else { ov.innerHTML = '<div class="big">시작!</div>'; $('#board').classList.remove('paused'); beep('match'); startClock(); setTimeout(() => ov.classList.remove('on'), 450); }
    };
    tick();
  }
  let progT = 0, progPending = null;
  function reportProgress() {
    if (!game || game.mode !== 'multi' || !room) return;
    const send = () => { progPending = null; progT = Date.now(); if (game && room) Net.patch(`sichuan/rooms/${room.code}/players/${save.uid}`, { remaining: game.board.tiles().length, round: game.round }).catch(() => {}); };
    if (Date.now() - progT > 500) send();
    else if (!progPending) progPending = setTimeout(send, 500);
  }
  async function multiFinish(ms) {
    clearTimeout(progPending); progPending = null;
    const meta = room.data.meta, players = room.data.players || {};
    const before = Object.values(players).filter((p) => p.round === game.round && p.finished).length;
    try {
      await Net.patch(`sichuan/rooms/${room.code}/players/${save.uid}`, { finished: true, time: ms, remaining: 0, round: game.round, seen: Net.TS });
      sysChat(room.code, `🏁 ${save.nick} 님 클리어! ${fmtTime(ms)} (${before + 1}등)`);
    } catch (e) { toast('기록을 보내지 못했어요'); }
    showMultiResult();
  }
  function showMultiResult() {
    if (!room || !room.data) return;
    const meta = room.data.meta, players = room.data.players || {};
    const done = Object.values(players).filter((p) => p.round === game.round && p.finished).sort((a, b) => a.time - b.time);
    const playing = Object.values(players).filter((p) => p.round === game.round && !p.finished && isOnline(p));
    const ov = $('#boardOverlay');
    ov.innerHTML = `<div style="background:rgba(0,0,0,.25);padding:20px 26px;border-radius:18px;min-width:260px">
      <div class="msg">🏁 라운드 ${game.round} 결과</div>
      <table class="rank-table" style="color:#fff;margin:10px 0">${done.map((p, i) => `<tr><td class="rk">${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${esc(p.name)}</td><td class="mono">${fmtTime(p.time)}</td></tr>`).join('')}
      ${playing.map((p) => `<tr><td class="rk">…</td><td>${esc(p.name)}</td><td class="mono">남은 ${p.remaining}패</td></tr>`).join('')}</table>
      ${meta.host === save.uid ? '<button class="btn primary" id="mrNew">⟳ 한 판 더</button> ' : ''}<button class="btn" id="mrRoom">대기실로</button></div>`;
    ov.classList.add('on');
    const n = $('#mrNew'); if (n) n.addEventListener('click', () => { show('room'); $('#rsStart') && $('#rsStart').click(); });
    $('#mrRoom').addEventListener('click', () => { endGame(); if (amHost()) Net.patch(`sichuan/rooms/${room.code}/meta`, { status: 'waiting', updated: Net.TS }); show('room'); });
  }
  $('#chatToggle').addEventListener('click', () => {
    const s = $('#side'); s.classList.toggle('open');
    if (s.classList.contains('open') && room) { room.unread = 0; $('#chatBadge').classList.remove('on'); room.chat2.focus(); }
  });

  /* ---------- 시작 ---------- */
  renderThemes();
  renderStages();
  const q = new URLSearchParams(location.search).get('room');
  if (q) setTimeout(() => joinRoom(q.toUpperCase()), 200);

})();
