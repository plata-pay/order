import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../assets/payment-requests.js',import.meta.url),'utf8');
function setup(){let clock=100000,serial=0;const timers=new Map(),events={};const e={AbortController,Promise,Error,Object,Math,Date:{now:()=>clock},window:{addEventListener:(type,fn)=>events[type]=fn},setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,at:clock+Math.max(0,delay)});return id;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(e);vm.runInContext(source,e);const api=e.window.PlataPaymentRequests;
 const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
 async function advance(ms){const end=clock+ms;await flush();for(;;){const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;clock=due[1].at;timers.delete(due[0]);due[1].fn();await flush();}clock=end;await flush();}
 return {e,api,advance,timers,events,now:()=>clock};}
let passed=0;
{
 const t=setup(),calls=[];let done=false;const p=t.api.runChecks(async()=>{calls.push(t.now());return {status:'pending'};}).then(v=>{done=true;return v;});
 await t.advance(0);assert.deepEqual(calls,[100000]);assert.equal(await t.api.runChecks(async()=>{throw Error('duplicate');}),null);passed++;
 await t.advance(2499);assert.equal(calls.length,1);await t.advance(1);assert.deepEqual(calls,[100000,102500]);assert.equal(done,false);passed++;
 await t.advance(2499);assert.equal(done,false);await t.advance(1);assert.equal((await p).result.status,'pending');assert.equal(done,true);assert.equal(t.api.busy,false);assert.equal(t.timers.size,0);passed++;
}
{
 const t=setup();let signal,calls=0,late;const p=t.api.runChecks(s=>{signal=s;calls++;return new Promise(r=>late=r);});await t.advance(0);t.api.cancel();await t.advance(10000);assert.equal(await p,null);assert.equal(signal.aborted,true);assert.equal(calls,1);assert.equal(t.timers.size,0);late({status:'paid'});await t.advance(0);passed++;
 const next=t.api.begin(),p2=t.api.runChecks(async()=>({status:'pending'}));await t.advance(5000);assert.equal((await p2).result.status,'pending');assert.equal(t.api.active(next),true);passed++;
}
{
 const t=setup(),calls=[];const p=t.api.runChecks(async()=>{calls.push(t.now());return {status:'pending'};});await t.advance(0);t.api.cancel();await t.advance(5000);assert.equal(await p,null);assert.equal(calls.length,1);passed++;
}
{
 const t=setup();let calls=0;const p=t.api.runChecks(async()=>{calls++;throw Object.assign(Error('rate'),{status:429,retryAfter:60});});await t.advance(5000);assert.equal((await p).error.status,429);assert.equal(calls,1);const second=t.api.runChecks(async()=>{calls++;});await t.advance(5000);await second;assert.equal(calls,1);passed++;
}
{
 const t=setup();let live=0,max=0,calls=0;const p=t.api.runChecks(signal=>{calls++;live++;max=Math.max(max,live);return new Promise((_,reject)=>signal.addEventListener('abort',()=>{live--;reject(Error('timeout'));},{once:true}));});await t.advance(5000);assert.ok((await p).error);assert.equal(calls,2);assert.equal(max,1);assert.equal(live,0);assert.equal(t.timers.size,0);passed++;
}
{
 const t=setup();let calls=0;const p=t.api.runChecks(async()=>({status:++calls===1?'paid':'pending'}));await t.advance(5000);assert.equal((await p).result.status,'paid');assert.equal(calls,2);passed++;
 const controller=new AbortController();t.api.link(controller);t.events.pagehide();assert.equal(controller.signal.aborted,true);t.events.pageshow();assert.equal(t.api.active(t.api.capture()),true);passed++;
}
console.log(JSON.stringify({passed,five_second_cycle:true,two_checks:true,duplicate_clicks_blocked:true,cancel_aborts_and_clears_timers:true,no_late_paid_result:true,rate_backoff:true,no_overlap:true}));

// The actual handlers for ETH, GRAM, Keeper and CryptoBot use the same timed cycle and animation.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
for (const method of ['ethereum','gram','keeper','cryptobot']) {
 const t=setup(),nodes=new Map(),calls=[];
 const node=k=>{if(!nodes.has(k))nodes.set(k,{disabled:false,textContent:'Проверить',setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}});return nodes.get(k);};
 Object.assign(t.e,{$:node,selected:method,phase:'waiting',checkoutOrder:{id:'abcd-efgh-ijkl-mnop',status:'pending'},tonBusy:false,tonWaiting:false,tonSent:true,evmBusy:false,cryptoRequestBusy:false,evmQuote:{id:'abcd-efgh-ijkl-mnop',currency:method==='gram'?'GRAM':'ETH'},stopTonPolling(){},startTonPolling(){},notice(){},tonPaid(){throw Error('false paid');},showSuccess(){throw Error('false paid');},cryptoCheckInvoice:async signal=>{assert.equal(signal.aborted,false);calls.push(t.now());return 'active';}});
 t.e.window.PlataGramPayment={serverStatus:async(_id,{signal})=>{assert.equal(signal.aborted,false);calls.push(t.now());return 'pending';}};
 t.e.window.PlataEvmPayment={check:async(_id,_currency,_hash,{signal})=>{assert.equal(signal.aborted,false);calls.push(t.now());return {status:'pending'};}};
 const helper=html.split('/* PAYMENT CHECK CYCLE START */')[1].split('/* PAYMENT CHECK CYCLE END */')[0];
 const start=method==='keeper'?'async function checkTonPayment(':method==='cryptobot'?'async function beginVerification()':'async function checkEvmPayment(';
 const end=method==='keeper'?'\nasync function startTonPayment()':method==='cryptobot'?"\n$('#btn-go').addEventListener":'\nfunction closeQuickCheck()';
 const handler=html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
 vm.runInContext(helper+'\n'+handler,t.e);
 const name=method==='keeper'?'checkTonPayment':method==='cryptobot'?'beginVerification':'checkEvmPayment';
 const button=node(method==='keeper'||method==='cryptobot'?'#btn-check':'#btn-check-transfer');
 const p=t.e[name]();await t.advance(0);assert.equal(button.disabled,true);assert.ok(button.innerHTML.includes('dots-loader'));await t.e[name]();assert.equal(calls.length,1);
 await t.advance(2500);assert.equal(calls.length,2);assert.equal(button.disabled,true);await t.advance(2499);assert.equal(button.disabled,true);await t.advance(1);await p;assert.equal(button.disabled,false);assert.equal(button.textContent,'Проверить');
}
console.log(JSON.stringify({all_four_payment_handlers:true,animation_five_seconds:true,two_checks_per_click:true}));
