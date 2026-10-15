/* Plata Pay TON Connect: explicit, bounded native-GRAM transfers; no status writes. */
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
  const mobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  let connectedMobileSession = null;
  function mobileSession(account) {
    try { const saved = connectedMobileSession || JSON.parse(sessionStorage.getItem('plata_tonkeeper_session') || 'null'); return saved?.address === account.address && /^[a-f0-9]{64}$/i.test(saved.id) ? saved.id : null; } catch (_) { return null; }
  }
  function rememberMobileSession(account, id) { connectedMobileSession = {address:account.address,id}; try { sessionStorage.setItem('plata_tonkeeper_session', JSON.stringify({address:account.address,id})); } catch (_) {} }
  function mobileApproval(connector, transaction, session) {
    const link = 'tonkeeper-tc://?id=' + session + '&ret=back';
    const control = new AbortController();
    const dialog = document.createElement('dialog');
    dialog.style.cssText = 'border:1px solid #303030;border-radius:24px;background:#181818;color:#fff;padding:26px;width:min(360px,calc(100vw - 48px));font:16px system-ui;text-align:center';
    const title = document.createElement('h2'); title.textContent = 'Подтвердите перевод'; title.style.cssText = 'font-size:22px;margin:0 0 20px';
    const open = document.createElement('a'); open.href = link; open.target = '_self'; open.textContent = 'Открыть Tonkeeper'; open.style.cssText = 'display:block;background:#35ed83;color:#101812;padding:15px;border-radius:14px;font-weight:700;text-decoration:none';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Вернуться к платежу'; close.style.cssText = 'margin:16px 0 0;background:none;border:0;color:#aaa;padding:8px;font:inherit';
    const cancel = event => { event?.preventDefault(); control.abort(); };
    close.addEventListener('click',cancel); dialog.addEventListener('cancel',cancel); dialog.append(title,open,close);
    // The callback runs only after the encrypted request is handed to the bridge.
    const timer = setTimeout(() => control.abort(),180000);
    return connector.connector.sendTransaction(transaction, {signal:control.signal,onRequestSent:() => {
      document.body.append(dialog); dialog.showModal();
      window.location.assign(link);
    }}).finally(() => { clearTimeout(timer); dialog.close(); dialog.remove(); });
  }
  function nativeConnectLink(link) {
    const value = new URL(link);
    if (value.origin !== 'https://app.tonkeeper.com' || value.pathname !== '/ton-connect' || !/^[a-f0-9]{64}$/i.test(value.searchParams.get('id') || '') || value.searchParams.get('v') !== '2' || !value.searchParams.get('r')) throw new Error('Некорректная ссылка подключения Tonkeeper');
    const request = JSON.parse(value.searchParams.get('r'));
    if (request.manifestUrl !== MANIFEST) throw new Error('Некорректный манифест подключения');
    return 'tonkeeper-tc://' + value.search;
  }
  async function mobileConnect(connector) {
    const wallets = await connector.getWallets();
    const wallet = wallets.find(item => item.appName === 'tonkeeper' && item.universalLink === 'https://app.tonkeeper.com/ton-connect' && item.bridgeUrl === 'https://bridge.tonapi.io/bridge');
    if (!wallet) throw new Error('Tonkeeper недоступен в списке TON Connect');
    return new Promise((resolve, reject) => {
      const dialog = document.createElement('dialog');
      dialog.style.cssText = 'border:1px solid #303030;border-radius:24px;background:#181818;color:#fff;padding:26px;width:min(360px,calc(100vw - 48px));font:16px system-ui;text-align:center;box-shadow:0 20px 80px #0009';
      const title = document.createElement('h2'); title.textContent = 'Подключить Tonkeeper'; title.style.cssText = 'font-size:22px;margin:0 0 12px';
      const text = document.createElement('p'); text.textContent = 'Откройте кошелёк, подтвердите подключение и вернитесь сюда.'; text.style.cssText = 'color:#aaa;line-height:1.5;margin:0 0 22px';
      const open = document.createElement('a'); open.textContent = 'Открыть Tonkeeper'; open.target = '_self'; open.style.cssText = 'display:block;background:#35ed83;color:#101812;padding:15px;border-radius:14px;font-weight:700;text-decoration:none';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Отмена'; cancel.style.cssText = 'display:block;margin:16px auto 0;border:0;background:none;color:#aaa;font:inherit;padding:8px';
      let settled = false, timer;
      function finish(error, account) { if (settled) return; settled = true; clearTimeout(timer); listeners.delete(changed); dialog.close(); dialog.remove(); if (error) { reject(error); } else resolve(account); }
      let session = null;
      function changed(account, error) { if (error) finish(error); else if (account) { rememberMobileSession(account,session); finish(null, account); } }
      function cancelled(event) { event?.preventDefault(); const error = new Error('Подключение отменено'); error.name = 'TonConnectionCancelled'; finish(error); }
      cancel.addEventListener('click', cancelled); dialog.addEventListener('cancel', cancelled);
      listeners.add(changed);
      try {
        const link = connector.connector.connect({universalLink:wallet.universalLink,bridgeUrl:wallet.bridgeUrl});
        open.href = nativeConnectLink(link);
        session = new URL(link).searchParams.get('id');
        dialog.append(title,text,open,cancel); document.body.append(dialog); dialog.showModal();
        timer = setTimeout(() => finish(new Error('Время подключения истекло. Повторите попытку.')), 180000);
      } catch (error) { finish(error); }
    });
  }
  async function connectOnce() {
    const connector = await getUi();
    await deadline(connector.connectionRestored, 25000, 'Восстановление соединения заняло слишком много времени. Повторите попытку.');
    if (connector.wallet) {
      try {
        const account = accountOf(connector.wallet);
        if (!mobile() || window.tonkeeper?.tonconnect || mobileSession(account)) return account;
        await connector.disconnect();
      }
      catch (error) { await connector.disconnect(); throw error; }
    }
    if (mobile() && !window.tonkeeper?.tonconnect) return mobileConnect(connector);
    return new Promise((resolve, reject) => {
      let settled = false, opened = false, timer, unsubscribeModal = () => {};
      function finish(error, account) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        listeners.delete(changed);
        unsubscribeModal();
        connector.closeModal();
        if (error) reject(error); else resolve(account);
      }
      function changed(account, error) { if (error) finish(error); else if (account) finish(null, account); }
      listeners.add(changed);
      unsubscribeModal = connector.onModalStateChange(state => {
        if (state.status === 'opened') opened = true;
        if (opened && state.status === 'closed' && state.closeReason === 'action-cancelled') {
          const error = new Error('Подключение отменено'); error.name = 'TonConnectionCancelled'; finish(error);
        }
      });
      timer = setTimeout(() => finish(new Error('Время подключения истекло. Повторите попытку.')), 180000);
      connector.openModal().catch(() => finish(new Error('Не удалось открыть Tonkeeper. Повторите попытку.')));
    });
  }
  window.PlataTonConnect = Object.freeze({
    connect() {
      if (!connectionPromise) connectionPromise = connectOnce().finally(() => { connectionPromise = null; });
      return connectionPromise;
    },
    send(transaction) {
      const connector = ui;
      if (!connector) return Promise.reject(new Error('Сначала подключите кошелёк'));
      const account = accountOf(connector.wallet);
      if (!account) throw new Error('Сначала подключите кошелёк');
      const invalid = () => { const error = new Error('Некорректные параметры перевода'); error.name = 'TonTransferInvalid'; throw error; };
      if (!transaction || typeof transaction !== 'object' || Object.keys(transaction).some(k => !['validUntil','network','from','messages'].includes(k))) invalid();
      if (transaction.network !== '-239' || transaction.from !== account.address.toLowerCase() || !Number.isSafeInteger(transaction.validUntil) || transaction.validUntil <= Date.now()/1000 || transaction.validUntil > Date.now()/1000+181) invalid();
      if (!Array.isArray(transaction.messages) || transaction.messages.length !== 1) invalid();
      const message = transaction.messages[0];
      if (!message || Object.keys(message).some(k => !['address','amount','payload'].includes(k)) || !/^[A-Za-z0-9_-]{48}$/.test(message.address || '') || !/^[1-9][0-9]{0,18}$/.test(message.amount || '') || typeof message.payload !== 'string' || message.payload.length > 512 || !/^[A-Za-z0-9+/=]+$/.test(message.payload)) invalid();
      const session = mobile() && !window.tonkeeper?.tonconnect ? mobileSession(account) : null;
      if (session) return mobileApproval(connector, transaction, session);
      // SDK success means broadcast only. Our separate server checks the receipt.
      return connector.sendTransaction(transaction, {modals:['before'], notifications:['error'], returnStrategy:'back', skipRedirectToWallet:'never'});
    },
    async disconnect() { connectedMobileSession = null; try { sessionStorage.removeItem('plata_tonkeeper_session'); } catch (_) {} if (ui) await ui.disconnect(); },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  });
})();
