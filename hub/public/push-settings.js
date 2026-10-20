(() => {
  const el = (id) => document.getElementById(id);
  const status = (message) => { el('push-status').textContent = message; };
  const names = ['approval', 'done', 'failed', 'artifact', 'dream'];
  let registration, subscription, config, saved = false;
  const fields = () => Object.fromEntries(names.map((k) => [k, el('push-form').elements[k].checked]));
  const showPrefs = (prefs) => names.forEach((k) => { el('push-form').elements[k].checked = prefs[k]; });
  function controls(busy = false) {
    el('push-enable').disabled = busy || !registration || !config?.configured || saved;
    el('push-disable').disabled = busy || !subscription;
    el('push-options').disabled = busy || !saved;
  }
  async function api(method = 'GET', body) {
    const res = await fetch('/api/push', { method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    if (res.redirected || res.status === 401 || !res.headers.get('Content-Type')?.includes('application/json')) throw new Error('hub を再読み込みしてログインしてください');
    const data = await res.json();
    if (!res.ok) { const error = new Error(data.error || '通知設定を保存できませんでした'); error.status = res.status; throw error; }
    return data;
  }
  function sameKey(sub, key) {
    const raw = sub.options.applicationServerKey;
    if (!raw) return false;
    return btoa(String.fromCharCode(...new Uint8Array(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === key;
  }
  el('push-enable').addEventListener('click', async () => {
    controls(true);
    try {
      // Permission prompt is directly attached to the user gesture (required by iOS).
      if (await Notification.requestPermission() !== 'granted') throw new Error('通知が許可されていません。端末・ブラウザの設定を確認してください');
      if (subscription && !sameKey(subscription, config.publicKey)) {
        await api('DELETE', { endpoint: subscription.endpoint });
        await subscription.unsubscribe(); subscription = null;
      }
      if (!subscription) {
        const key = Uint8Array.from(atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      const result = await api('POST', { ...subscription.toJSON(), preferences: fields() });
      showPrefs(result.preferences); saved = true; status('この端末の通知は有効です');
    } catch (e) { status(e.message); }
    finally { controls(); }
  });
  el('push-disable').addEventListener('click', async () => {
    controls(true);
    try {
      // Remove server-side first so a failed API request remains recoverable.
      await api('DELETE', { endpoint: subscription.endpoint }); saved = false;
      if (!await subscription.unsubscribe()) throw new Error('サーバー通知は停止しました。端末の解除は再度お試しください');
      subscription = null; status('この端末の通知を解除しました');
    } catch (e) { status(e.message); }
    finally { controls(); }
  });
  el('push-form').addEventListener('submit', async (event) => {
    event.preventDefault(); controls(true);
    try {
      await api('PATCH', { endpoint: subscription.endpoint, preferences: fields() });
      status('通知の種類を保存しました');
    } catch (e) { status(e.message); }
    finally { controls(); }
  });
  (async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      status('この環境では通知を利用できません。iOS はホーム画面に追加して開いてください'); return;
    }
    try {
      config = await api();
      const registered = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('通知の準備が完了しません。再ログイン後に再読み込みしてください')), 10000))]);
      registration = registered;
      subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        try {
          const data = await api('PATCH', { endpoint: subscription.endpoint });
          showPrefs(data.preferences); saved = sameKey(subscription, config.publicKey) && Notification.permission === 'granted';
        } catch (e) { if (e.status !== 404) throw e; }
      }
      status(!config.configured ? '管理者による通知用の鍵設定が必要です' : saved ? 'この端末の通知は有効です' : '通知を有効にすると、この端末で更新を受け取れます');
    } catch (e) { status(e.message); }
    finally { controls(); }
  })();
})();
