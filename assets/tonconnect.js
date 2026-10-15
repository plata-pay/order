/* Plata Pay: wallet connection only. No signing, transfers, or payment status writes. */
(() => {
  'use strict';
  const MANIFEST = 'https://plata-pay.github.io/order/tonconnect-manifest.json';
  const SDK_URL = 'https://plata-pay.github.io/order/vendor/tonconnect-ui-5.0.1.min.js';
  const SDK_INTEGRITY = 'sha384-QZvMrS6g6/TQyHjoc44P3RG1Kzfqnwen5A/EZ0LaQZKP8hvNY2stUmyFB5QDIKmp';
  const listeners = new Set();
  let libraryPromise = null, uiPromise = null, ui = null, connectionPromise = null;
  function accountOf(wallet) {
    if (!wallet) return null;
    if (wallet.account?.chain !== '-239') throw new Error('Выберите основную сеть TON в Tonkeeper');
    if (!/^(?:0|-1):[a-fA-F0-9]{64}$/.test(wallet.account.address || '')) throw new Error('Кошелёк вернул некорректный адрес');
    return Object.freeze({address:wallet.account.address, network:'TON Mainnet'});
  }
  function emit(account, error = null) {
    for (const listener of listeners) { try { listener(account, error); } catch (_) {} }
  }
  function loadLibrary() {
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let timer;
      function failed() { clearTimeout(timer); script.remove(); libraryPromise = null; reject(new Error('Не удалось загрузить TON Connect. Повторите подключение.')); }
      script.src = SDK_URL;
      script.integrity = SDK_INTEGRITY;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => {
        clearTimeout(timer);
        if (typeof window.TON_CONNECT_UI?.TonConnectUI !== 'function') return failed();
        resolve(window.TON_CONNECT_UI);
      };
      script.onerror = failed;
      timer = setTimeout(failed, 20000);
      document.head.append(script);
    });
    return libraryPromise;
  }
  function deadline(promise, ms, message) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
  }
  async function getUi() {
    if (!uiPromise) {
      uiPromise = loadLibrary().then(sdk => {
        ui = new sdk.TonConnectUI({manifestUrl:MANIFEST, language:'ru', uiPreferences:{theme:sdk.THEME.DARK}, analytics:{mode:'off'}});
        ui.setConnectionNetwork('-239');
        ui.onStatusChange(wallet => {
          try { emit(accountOf(wallet)); }
          catch (error) { emit(null, error); void ui.disconnect().catch(() => {}); }
        }, () => emit(null, new Error('Tonkeeper отклонил подключение. Повторите попытку.')));
        return ui;
      }).catch(error => { uiPromise = null; throw error; });
    }
    return uiPromise;
  }
  async function connectOnce() {
    const connector = await getUi();
    await deadline(connector.connectionRestored, 25000, 'Восстановление соединения заняло слишком много времени. Повторите попытку.');
    if (connector.wallet) {
      try { return accountOf(connector.wallet); }
      catch (error) { await connector.disconnect(); throw error; }
    }
    return new Promise((resolve, reject) => {
      let settled = false, opened = false, timer, unsubscribeModal = () => {};
      function finish(error, account) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        listeners.delete(changed);
        unsubscribeModal();
        connector.closeSingleWalletModal();
        if (error) reject(error); else resolve(account);
      }
      function changed(account, error) { if (error) finish(error); else if (account) finish(null, account); }
      listeners.add(changed);
      unsubscribeModal = connector.onSingleWalletModalStateChange(state => {
        if (state.status === 'opened') opened = true;
        if (opened && state.status === 'closed' && state.closeReason === 'action-cancelled') {
          const error = new Error('Подключение отменено'); error.name = 'TonConnectionCancelled'; finish(error);
        }
      });
      timer = setTimeout(() => finish(new Error('Время подключения истекло. Повторите попытку.')), 180000);
      connector.openSingleWalletModal('tonkeeper').catch(() => finish(new Error('Не удалось открыть Tonkeeper. Повторите попытку.')));
    });
  }
  window.PlataTonConnect = Object.freeze({
    connect() {
      if (!connectionPromise) connectionPromise = connectOnce().finally(() => { connectionPromise = null; });
      return connectionPromise;
    },
    async disconnect() { if (ui) await ui.disconnect(); },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  });
})();
