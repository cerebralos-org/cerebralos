'use strict';
// OAuth 同意画面（/authorize）の操作。CSP が form-action 'none' なので、フォーム送信ではなく fetch で決定を送り、
// 返ってきた redirectTo（接続元アプリ）へ移動する。
(function () {
  const root = document.getElementById('consent');
  if (!root) return;
  const msg = document.getElementById('consent-msg');
  const btnOk = document.getElementById('approve');
  const btnNo = document.getElementById('deny');

  async function send(decision) {
    btnOk.disabled = btnNo.disabled = true;
    msg.classList.remove('err');
    msg.textContent = decision === 'approve' ? '許可しています…' : '断っています…';
    const fd = new FormData();
    fd.set('handle', root.dataset.handle);
    fd.set('decision', decision);
    if (decision === 'approve' && document.getElementById('perm-write').checked) fd.set('write', '1');
    try {
      const res = await fetch('/authorize', { method: 'POST', body: fd, credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.redirectTo) throw new Error((data && data.error) || String(res.status));
      msg.textContent = decision === 'approve' ? '許可しました。元のアプリに戻ります…' : '接続を断りました。元のアプリに戻ります…';
      window.location.href = data.redirectTo;
    } catch (e) {
      msg.classList.add('err');
      msg.textContent = '処理できませんでした（有効期限切れかもしれません）。接続元のアプリからやり直してください。';
      btnOk.disabled = btnNo.disabled = false;
    }
  }
  btnOk.addEventListener('click', () => send('approve'));
  btnNo.addEventListener('click', () => send('deny'));
})();
