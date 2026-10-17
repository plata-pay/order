/* Payment lifecycle cancellation and one bounded, non-overlapping verification cycle. */
(() => {
 'use strict';
 let scope = new AbortController(), batch = null, blockedUntil = 0;
 const abortError = () => Object.assign(new Error('Операция отменена'),{name:'AbortError'});
 function active(token) { return token === scope && !token.signal.aborted; }
 function cancel() { scope.abort(); batch = null; }
 function begin() { cancel(); scope = new AbortController(); return scope; }
 function link(controller,signal) {
  const parent = scope.signal, abort = () => controller.abort();
  for (const source of [parent,signal]) { if (source?.aborted) abort(); else source?.addEventListener('abort',abort,{once:true}); }
  return () => { parent.removeEventListener('abort',abort); signal?.removeEventListener('abort',abort); };
 }
 function wait(ms,signal) {
  return new Promise((resolve,reject) => {
   if (signal.aborted) return reject(abortError());
   const done = () => { signal.removeEventListener('abort',abort); resolve(); };
   const timer = setTimeout(done,Math.max(0,ms));
   const abort = () => { clearTimeout(timer); signal.removeEventListener('abort',abort); reject(abortError()); };
   signal.addEventListener('abort',abort,{once:true});
  });
 }
 async function attempt(task,token) {
  const controller = new AbortController(), release = link(controller);
  let timer,stop;
  try {
   if (!active(token)) throw abortError();
   return await Promise.race([
    Promise.resolve().then(() => { if (!active(token)) throw abortError(); return task(controller.signal); }),
    new Promise((_,reject) => {
     stop = () => reject(abortError()); controller.signal.addEventListener('abort',stop,{once:true});
     timer = setTimeout(() => { reject(new Error('Сервис не ответил вовремя')); controller.abort(); },2200);
    })
   ]);
  } finally { clearTimeout(timer); controller.signal.removeEventListener('abort',stop); release(); controller.abort(); }
 }
 async function runChecks(task) {
  if (batch || scope.signal.aborted) return null;
  const token = scope, current = {}; batch = current;
  const started = Date.now(); let result = null, error = null;
  try {
   for (const offset of [0,2500]) {
    await wait(started+offset-Date.now(),token.signal);
    if (!active(token)) return null;
    if (Date.now() < blockedUntil) { error = Object.assign(new Error('Лимит проверок. Повторите позже.'),{status:429}); break; }
    try {
     const response = await attempt(task,token);
     if (!active(token)) return null;
     if (response?.status === 'paid' || result?.status !== 'paid') result = response;
     error = null;
    } catch (failure) {
     if (!active(token)) return null;
     error = failure;
     if (failure.status === 429) { blockedUntil = Date.now()+Math.max(5000,Math.min(300000,(failure.retryAfter||60)*1000)); break; }
    }
   }
   await wait(started+5000-Date.now(),token.signal);
   return active(token) ? {result,error} : null;
  } catch (failure) { if (!active(token)) return null; throw failure; }
  finally { if (batch === current) batch = null; }
 }
 window.PlataPaymentRequests = Object.freeze({begin,cancel,capture:()=>scope,active,link,runChecks,get busy(){return !!batch;}});
 window.addEventListener('pagehide',cancel);
 window.addEventListener('pageshow',()=>{if(scope.signal.aborted)begin();});
})();
