/* 개발자 도구(F12)·우클릭·소스보기 차단 + 개발자 도구가 열리면 그 판은 랭킹 제외 */
(function () {
  'use strict';
  window.__guardTainted = false;

  // 단축키 차단: F12, Ctrl+Shift+I/J/C/K, Ctrl+U, Ctrl+S (맥: Cmd+Opt+I/J/C, Cmd+U)
  document.addEventListener('keydown', function (e) {
    const k = (e.key || '').toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'F12' ||
        (mod && (e.shiftKey || e.altKey) && ['i', 'j', 'c', 'k'].includes(k)) ||
        (mod && ['u', 's'].includes(k))) {
      e.preventDefault(); e.stopPropagation();
      return false;
    }
  }, true);

  // 우클릭, 드래그, 텍스트 선택 차단 (입력창은 허용)
  const isInput = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  document.addEventListener('contextmenu', (e) => { if (!isInput(e.target)) e.preventDefault(); });
  document.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => { if (!isInput(e.target)) e.preventDefault(); });

  // 개발자 도구 열림 감지 (데스크톱만, 창 크기 차이로 판단)
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  let warn = null;
  function check() {
    if (mobile) return;
    const open = window.outerWidth - window.innerWidth > 170 || window.outerHeight - window.innerHeight > 200;
    if (open) {
      window.__guardTainted = true;
      if (!warn) {
        warn = document.createElement('div');
        warn.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(20,30,25,.96);color:#fff;display:grid;place-items:center;text-align:center;font:20px "Jua",sans-serif;padding:20px';
        warn.innerHTML = '<div>🚫 개발자 도구가 감지됐어요<br><span style="font-size:15px;opacity:.75">개발자 도구를 닫아 주세요. 지금 진행 중인 판은 랭킹에 기록되지 않아요.</span></div>';
        document.body.appendChild(warn);
      }
    } else if (warn) { warn.remove(); warn = null; }
  }
  setInterval(check, 1000);
  window.addEventListener('resize', check);
})();
