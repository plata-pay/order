/* No merchant/admin credentials. The server is authoritative for quote and paid. */
(() => {
 'use strict';
 const BASE='https://plata-ton-pay.dpl-payments.workers.dev';
 const ID=/^[a-z0-9]{4}(?:-[a-z0-9]{4}){3}$/;
 const errors={
  'Payment recipient is not configured':'Адрес получателя ещё не настроен',
  'Exchange rate is unavailable':'Не удалось получить курс GRAM. Повторите попытку.',
  'Quote expired; refresh the amount before approving':'Курс обновился. Проверьте новую сумму перед оплатой.',
  'Order is no longer payable':'Срок действия заказа истёк',
  'The receiving wallet must be activated before accepting payments':'Кошелёк получателя ещё не активирован'
 };
 function quote(value,id){
  if(!value||value.order_id!==id||!/^[a-f0-9]{32}$/.test(value.quote_id||'')||value.network!=='-239'||!/^\d+[.]\d{9}$/.test(value.gram_amount||'')||!/^[1-9]\d{0,18}$/.test(value.nano_amount||'')||!/^[A-Za-z0-9_-]{48}$/.test(value.recipient||'')||!Number.isSafeInteger(value.valid_until))throw new Error('Сервер вернул некорректную котировку');
  return value;
 }
 async function request(path,body){
  const control=new AbortController(),timeout=setTimeout(()=>control.abort(),15000);
  try{
   const response=await fetch(BASE+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:control.signal});
   let result;try{result=await response.json();}catch{throw new Error('Сервис оплаты временно недоступен');}
   if(!response.ok){const error=new Error(errors[result?.error]||'Сервис оплаты временно недоступен. Повторите попытку.');error.status=response.status;throw error;}
   return result;
  }catch(error){if(error.name==='AbortError')throw new Error('Сервис оплаты не ответил вовремя');throw error;}finally{clearTimeout(timeout);}
 }
 window.PlataGramPayment=Object.freeze({
  async quote(id){if(!ID.test(id))throw new Error('Некорректный ID');const result=await request('/quote',{id});return result.status==='paid'?{status:'paid'}:quote(result.quote,id);},
  async prepare(id,quoteId,from){if(!ID.test(id)||!/^[a-f0-9]{32}$/.test(quoteId||''))throw new Error('Некорректная котировка');const result=await request('/prepare',{id,quote_id:quoteId,from});if(result.status==='paid')return {status:'paid'};quote(result.quote,id);if(result.quote.quote_id!==quoteId||result.transaction?.messages?.[0]?.amount!==result.quote.nano_amount||result.transaction?.messages?.[0]?.address!==result.quote.recipient)throw new Error('Параметры перевода не совпадают с котировкой');return result;},
  async status(id){if(!ID.test(id))throw new Error('Некорректный ID');const result=await request('/status?id='+encodeURIComponent(id));if(!['pending','confirming','paid','expired'].includes(result.status))throw new Error('Некорректный статус оплаты');return result.status;},
  save(id,value){try{if(value)sessionStorage.setItem('plata_gram_'+id,JSON.stringify(value));else sessionStorage.removeItem('plata_gram_'+id);}catch{}},
  restore(id){try{const value=JSON.parse(sessionStorage.getItem('plata_gram_'+id)||'null');if(value?.sent===true)return {sent:true,quote:quote(value.quote,id)};}catch{}return null;}
 });
})();
