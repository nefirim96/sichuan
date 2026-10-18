/* Firebase Realtime Database: REST + 실시간 스트리밍(SSE). SDK 없이 동작 */
(function () {
  'use strict';
  const DB = 'https://arcade-hub-bad24-default-rtdb.firebaseio.com';
  const url = (path, q) => `${DB}/${path}.json${q || ''}`;

  async function req(method, path, body, q) {
    const opt = { method, headers: {} };
    if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
    const r = await fetch(url(path, q), opt);
    if (!r.ok) throw new Error(`Firebase ${method} ${path} → ${r.status}`);
    return r.json();
  }
  const get = (p, q) => req('GET', p, undefined, q);
  const put = (p, v) => req('PUT', p, v);
  const patch = (p, v) => req('PATCH', p, v);
  const post = (p, v) => req('POST', p, v);
  const del = (p) => req('DELETE', p);
  const TS = { '.sv': 'timestamp' };

  function setAt(root, path, data) {
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) return data;
    if (root === null || typeof root !== 'object') root = {};
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (node[parts[i]] === null || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (data === null) delete node[last]; else node[last] = data;
    return root;
  }

  // 경로를 실시간으로 구독. onChange(전체 값) 호출
  function listen(path, q, onChange) {
    let root = null, es = null, closed = false, retry = null;
    const open = () => {
      if (closed) return;
      es = new EventSource(url(path, q));
      es.addEventListener('put', (e) => { const d = JSON.parse(e.data); root = setAt(root, d.path, d.data); onChange(root); });
      es.addEventListener('patch', (e) => {
        const d = JSON.parse(e.data);
        for (const k of Object.keys(d.data || {})) root = setAt(root, d.path + '/' + k, d.data[k]);
        onChange(root);
      });
      es.addEventListener('cancel', () => { es.close(); });
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED && !closed) { clearTimeout(retry); retry = setTimeout(open, 3000); }
      };
    };
    open();
    return { close() { closed = true; clearTimeout(retry); if (es) es.close(); } };
  }

  // 서버 시간과 내 컴퓨터 시간 차이 (접속 상태 판정용)
  let offset = 0;
  async function syncTime(uid) {
    try {
      const t0 = Date.now();
      const v = await put(`sichuan/_time/${uid}`, TS);
      const t1 = Date.now();
      if (typeof v === 'number') offset = v - (t0 + t1) / 2;
    } catch (e) { /* 무시 */ }
  }
  const now = () => Date.now() + offset;

  window.Net = { DB, get, put, patch, post, del, listen, TS, syncTime, now };
})();
