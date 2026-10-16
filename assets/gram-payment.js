/* Browser reads public Toncenter. Main independently verifies every paid receipt. */
(() => {
 'use strict';
 const MAIN='https://plata-main.dpl-payments.workers.dev/api/ton';
 const READER='https://plata-order-reader.dpl-payments.workers.dev/';
 const INDEX='https://toncenter.com/api/v3/';
 const ID=/^[a-z0-9]{4}(?:-[a-z0-9]{4}){3}$/;
 const quotes=new Map(),candidates=new Map();
 const errors={'Exchange rate is unavailable':'Не удалось получить курс GRAM. Повторите попытку.','Order is no longer payable':'Срок действия заказа истёк','The receiving wallet must be activated before accepting payments':'Кошелёк получателя ещё не активирован'};
 const raw=value=>typeof value==='string'&&/^(?:0|-1):[a-f0-9]{64}$/i.test(value)?value.toLowerCase():null;
 function hash(value){if(typeof value!=='string')return null;if(/^[a-f0-9]{64}$/i.test(value))return value.toLowerCase();try{const s=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return s.length===32?Array.from(s,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(''):null;}catch{return null;}}
 function quote(value,id){
  if(!value||value.order_id!==id||!/^[a-f0-9]{32}$/.test(value.quote_id||'')||value.network!=='-239'||!/^\d+[.]\d{9}$/.test(value.gram_amount||'')||!/^[1-9]\d{0,18}$/.test(value.nano_amount||'')||!/^[A-Za-z0-9_-]{48}$/.test(value.recipient||'')||!raw(value.raw_recipient)||!Number.isSafeInteger(value.valid_until)||!Number.isSafeInteger(value.created_at)||!/^[a-f0-9]{64}$/.test(value.body_hash||'')||typeof value.ticket!=='string'||value.ticket.length>3000||typeof value.payload!=='string'||value.payload.length>512)throw new Error('Некорректные параметры платежа');
  return value;
 }
 async function request(url,body,signal){
  const control=new AbortController(),timeout=setTimeout(()=>control.abort(),12000);
  const abort=()=>control.abort();
  if(signal?.aborted)control.abort();else signal?.addEventListener('abort',abort,{once:true});
  try{
   const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',redirect:'error',signal:control.signal});
   const text=await response.text();if(text.length>512*1024)throw new Error('Слишком большой ответ сервиса');
   let result;try{result=JSON.parse(text);}catch{throw new Error('Сервис временно недоступен');}
   if(!response.ok){const error=new Error(errors[result?.error]||(response.status===429?'Лимит запросов. Подождите немного.':'Сервис временно недоступен. Повторите попытку.'));error.status=response.status;throw error;}
   return result;
  }catch(error){if(error.name==='AbortError')throw new Error('Сервис не ответил вовремя');throw error;}finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
 }
 function receipt(tx,q){try{
  const msg=tx.in_msg,d=tx.description;
  return tx.emulated===false&&Number.isSafeInteger(tx.mc_block_seqno)&&tx.mc_block_seqno>0&&(tx.finality===undefined||tx.finality==='finalized')&&d?.aborted===false&&d.destroyed!==true&&d.compute_ph?.success===true&&(!d.action||d.action.success===true)&&msg?.bounced===false&&!!raw(msg.source)&&raw(tx.account)===q.raw_recipient&&raw(msg.destination)===q.raw_recipient&&/^\d+$/.test(String(msg.value))&&BigInt(msg.value)>=BigInt(q.nano_amount)&&/^\d+$/.test(String(d.credit_ph?.credit))&&BigInt(d.credit_ph.credit)>=BigInt(q.nano_amount)&&hash(msg.message_content?.hash)===q.body_hash&&Number.isSafeInteger(tx.now)&&tx.now>=q.created_at-30&&tx.now<=q.valid_until+90&&!!hash(tx.hash);
 }catch{return false;}}
 function paymentUrl(q){
  // A fixed wallet destination; no URI or payment fields supplied by a visitor.
  const query=new URLSearchParams({amount:q.nano_amount,bin:q.payload,exp:String(q.valid_until)});
  if(/Android/i.test(navigator.userAgent||'')){const fallback='https://app.tonkeeper.com/transfer/'+q.recipient+'?'+query;return 'intent://transfer/'+q.recipient+'?'+query+'#Intent;scheme=tonkeeper;package=com.ton_keeper;S.browser_fallback_url='+encodeURIComponent(fallback)+';end';}
  return 'tonkeeper://transfer/'+q.recipient+'?'+query;
 }
 window.PlataGramPayment=Object.freeze({
  async quote(id){if(!ID.test(id))throw new Error('Некорректный ID');const result=await request(MAIN+'/quote',{id});if(result.status==='paid')return result;const q=quote(result.quote,id);quotes.set(id,q);candidates.delete(id);return q;},
  async prepare(id,quoteId){const q=quotes.get(id);if(!q||q.quote_id!==quoteId||q.valid_until<=Date.now()/1000+15)throw Object.assign(new Error('Курс истёк'),{status:409});return {quote:q,url:paymentUrl(q)};},
  open(id,quoteId){const q=quotes.get(id);if(!q||q.quote_id!==quoteId||q.valid_until<=Date.now()/1000)throw new Error('Обновите параметры платежа');window.location.assign(paymentUrl(q));},
  async status(id,{signal}={}){
   if(!ID.test(id))throw new Error('Некорректный ID');const order=await request(READER+'?id='+id,undefined,signal).catch(error=>{if(error.status===404)return {status:'expired'};throw error;});
   if(order.status==='paid')return 'paid';const q=quotes.get(id);if(!q)return order.status;
   let candidate=candidates.get(id);
   if(!candidate){
    const found=await request(INDEX+'messages?destination='+encodeURIComponent(q.raw_recipient)+'&body_hash='+q.body_hash+'&direction=in&start_utime='+Math.max(0,q.created_at-30)+'&end_utime='+(q.valid_until+90)+'&limit=20',undefined,signal);
    if(!Array.isArray(found.messages))throw new Error('Некорректный ответ Toncenter');
    const message=found.messages.find(msg=>{try{return msg.bounced===false&&raw(msg.destination)===q.raw_recipient&&hash(msg.message_content?.hash)===q.body_hash&&/^\d+$/.test(String(msg.value))&&BigInt(msg.value)>=BigInt(q.nano_amount)&&!!hash(msg.in_msg_tx_hash);}catch{return false;}});
    candidate=message&&hash(message.in_msg_tx_hash);if(candidate)candidates.set(id,candidate);return order.status;
   }
   const indexed=await request(INDEX+'transactions?account='+encodeURIComponent(q.raw_recipient)+'&hash='+candidate+'&limit=1',undefined,signal);
   const tx=Array.isArray(indexed.transactions)?indexed.transactions.find(t=>hash(t.hash)===candidate):null;
   if(!tx||!receipt(tx,q)){if(tx&&tx.emulated===false&&tx.mc_block_seqno>0)candidates.delete(id);return order.status;}
   const confirmed=await request(MAIN+'/confirm',{id,ticket:q.ticket,hash:candidate},signal);
   return confirmed.status==='paid'?'paid':'confirming';
  },
  save(id,value){if(value?.quote)quotes.set(id,quote(value.quote,id));try{if(value)sessionStorage.setItem('plata_gram_browser_'+id,JSON.stringify(value));else sessionStorage.removeItem('plata_gram_browser_'+id);}catch{}},
  restore(id){try{const saved=JSON.parse(sessionStorage.getItem('plata_gram_browser_'+id)||'null');if(saved?.sent===true){const q=quote(saved.quote,id);quotes.set(id,q);return {sent:true,quote:q};}}catch{}return null;}
 });
})();
