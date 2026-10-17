(() => {
 'use strict';
 const BASE='https://plata-evm-pay.dpl-payments.workers.dev';
 const messages={'ETH recipient is not configured':'Адрес получателя ETH ещё не настроен','BNB recipient is not configured':'Адрес получателя BNB ещё не настроен','Exchange rate unavailable':'Не удалось получить курс. Повторите попытку.','RPC service unavailable':'Сеть временно недоступна. Повторите проверку.','Order expired':'Срок оплаты истёк','Wait before checking again':'Подождите 5 секунд перед следующей проверкой','Payment not prepared':'Сначала создайте платёж','Transaction already belongs to another order':'Этот перевод уже использован для другого счёта'};
 async function request(path,body){const control=new AbortController(),timer=setTimeout(()=>control.abort(),25000);try{
  const res=await fetch(BASE+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:control.signal,cache:'no-store',redirect:'error'});
  const value=await res.json();if(!res.ok)throw new Error(messages[value.error]||(res.status===429?'Лимит проверок. Повторите позже.':'Не удалось выполнить запрос. Повторите попытку.'));
  return value;
 }catch(e){if(e.name==='AbortError')throw new Error('Сеть не ответила вовремя. Повторите проверку.');throw e;}finally{clearTimeout(timer);}}
 function validateQuote(q,id,currency){
   const chain=currency==='ETH'?1:currency==='BNB'?56:0;
   if(!q||q.id!==id||q.currency!==currency||q.chain_id!==chain||!/^0x[a-f0-9]{40}$/.test(q.recipient||'')||!(/^[1-9]\d{0,29}$/).test(q.wei||'')||!(/^\d+\.\d{18}$/).test(q.amount||'')||q.payment_uri!=='ethereum:'+q.recipient+'@'+chain+'?value='+q.wei||BigInt(q.amount.replace('.',''))!==BigInt(q.wei))throw new Error('Некорректные реквизиты платежа');
 }
 window.PlataEvmPayment=Object.freeze({
  async quote(id,currency){const result=await request('/api/quote',{id,currency});if(result.status==='paid')return result;validateQuote(result.quote,id,currency);return result;},
  restore(id,currency,value,rubles){try{validateQuote(value,id,currency);if(value.rub_amount!==rubles||!Number.isSafeInteger(value.valid_until)||value.valid_until<=Date.now()/1000)return null;return value;}catch{return null;}},
  check(id,currency,tx_hash=''){if(tx_hash&&!/^0x[a-f0-9]{64}$/i.test(tx_hash))return Promise.reject(new Error('Укажите корректный хеш транзакции'));return request('/api/check',{id,currency,...(tx_hash?{tx_hash}:{})});},
  qr(uri){
   let valid=/^ethereum:0x[a-f0-9]{40}@(1|56)\?value=[1-9]\d{0,29}$/.test(uri);
   if(!valid){try{const u=new URL(uri);valid=u.protocol==='ton:'&&u.hostname==='transfer'&&/^\/[A-Za-z0-9_-]{48}$/.test(u.pathname)&&/^[1-9]\d{0,18}$/.test(u.searchParams.get('amount')||'')&&/^plata:[a-z0-9]{4}(?:-[a-z0-9]{4}){3}:[a-f0-9]{32}$/.test(u.searchParams.get('text')||'')&&/^\d{10}$/.test(u.searchParams.get('exp')||'')&&[...u.searchParams.keys()].every(k=>['amount','text','exp'].includes(k));}catch{}}
   if(typeof window.qrcode!=='function'||!valid)throw new Error('Не удалось сформировать QR-код');const qr=window.qrcode(0,'M');qr.addData(uri);qr.make();return qr.createDataURL(6,4);
  }
 });
})();
