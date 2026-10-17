import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code='//'+html.split('// Native GRAM payments:')[1].split('// EVM native transfers:')[0];
function setup(){
 let clock=Date.now(),serial=0,status='pending',saved=null,success=0,openError=false,deferred=null;
 const timers=new Map(),nodes=new Map(),events=[],handlers={};
 const quote={recipient:'UQ'+'A'.repeat(46),nano_amount:'8000000',comment:'plata:abcd-efgh-ijkl-mnop:'+'a'.repeat(32),quote_id:'a'.repeat(32),order_id:'abcd-efgh-ijkl-mnop',valid_until:Math.floor(clock/1000)+1200};
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',open:false,classList:{add(){},remove(){}},addEventListener(type,fn){this[type]=fn;},setAttribute(){},removeAttribute(){}});return nodes.get(id);};
 const e={URLSearchParams,window:{addEventListener(){}},document:{hidden:false,addEventListener:(type,fn)=>handlers[type]=fn},Date:{now:()=>clock},AbortController,console,$:node,selected:'keeper',phase:'idle',checkoutOrder:{id:quote.order_id,status:'pending'},sheetIds:['loading-sheet','action-sheet','wallet-wait-sheet'],clearFlow(){},openSheet:id=>{node('#'+id).open=true;events.push('open:'+id);},closeSheet:id=>node('#'+id).open=false,notice:text=>events.push('notice:'+text),showPaymentSheet(){node('#action-sheet').open=true;node('#btn-check').hidden=false;},showSuccess(){success++;e.phase='success';},reset(){e.phase='idle';node('#wallet-wait-sheet').open=false;},setTimeout(fn,delay){timers.set(++serial,{fn,at:clock+delay});return serial;},clearTimeout:id=>timers.delete(id)};
 e.window.PlataGramPayment={async quote(){events.push('quote');return {...quote};},async prepare(){events.push('prepare');return {quote:{...quote}};},open(){events.push('wallet');if(openError)throw new Error('Cannot open wallet');},save(id,value){saved=value;},restore(){return saved;},async serverStatus(){events.push('check');return deferred?await deferred:status;}};
 e.window.PlataEvmPayment={qr(uri){const u=new URL(uri);assert.equal(u.searchParams.get('amount'),quote.nano_amount);assert.equal(u.searchParams.get('text'),quote.comment);return 'data:image/gif;base64,qr';}};
 e.window.PlataTonConnect={onChange(){},connect(){throw new Error('Connection is not required');}};
 vm.createContext(e);vm.runInContext(code+'\nglobalThis.api={startTonPayment,sendTonPayment,closeTonWaiting};',e);
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 async function advance(ms){const end=clock+ms;for(;;){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;clock=due[1].at;timers.delete(due[0]);due[1].fn();await flush();}clock=end;await flush();}
 return {e,node,events,handlers,advance,flush,success:()=>success,setStatus:v=>status=v,setError:()=>openError=true,defer:p=>deferred=p};
}
let passed=0;
{
 const t=setup();await t.e.api.startTonPayment();assert.ok(t.events.includes('prepare'));assert.equal(t.node('#wallet-wait-sheet').open,true);assert.equal(t.events.filter(x=>x==='wallet').length,1);passed++;
 const opening=t.e.api.sendTonPayment();assert.equal(t.events.filter(x=>x==='wallet').length,1);await opening;assert.equal(t.node('#action-sheet').open,false);assert.equal(t.node('#wallet-wait-sheet').open,true);assert.equal(t.success(),0);passed++;
 await t.e.api.sendTonPayment();assert.equal(t.events.filter(x=>x==='wallet').length,1);passed++;
 await t.advance(4999);assert.equal(t.events.filter(x=>x==='check').length,0);await t.advance(1);assert.equal(t.events.filter(x=>x==='check').length,1);await t.advance(5000);assert.equal(t.events.filter(x=>x==='check').length,2);passed++;
 t.e.api.closeTonWaiting();const before=t.events.filter(x=>x==='check').length;await t.advance(15000);assert.equal(t.events.filter(x=>x==='check').length,before);assert.equal(t.e.phase,'idle');passed++;
 await t.e.api.startTonPayment();await t.e.api.sendTonPayment();assert.equal(t.events.filter(x=>x==='wallet').length,2);t.setStatus('paid');await t.advance(5000);assert.equal(t.success(),1);assert.equal(t.e.checkoutOrder.status,'paid');const paidCount=t.events.filter(x=>x==='check').length;await t.advance(15000);assert.equal(t.events.filter(x=>x==='check').length,paidCount);passed++;
}
{
 const t=setup();t.setError();await t.e.api.startTonPayment();assert.equal(t.node('#wallet-wait-sheet').open,true);assert.ok(t.events.some(x=>x.startsWith('notice:')));t.e.api.closeTonWaiting();await t.advance(15000);assert.ok(!t.events.includes('check'));passed++;
}
{
 const t=setup();await t.e.api.startTonPayment();await t.e.api.sendTonPayment();t.e.document.hidden=true;t.handlers.visibilitychange();await t.advance(10000);assert.ok(!t.events.includes('check'));t.e.document.hidden=false;t.handlers.visibilitychange();await t.advance(5000);assert.equal(t.events.filter(x=>x==='check').length,1);t.e.api.closeTonWaiting();passed++;
}
{
 const t=setup();let resolve;t.defer(new Promise(r=>resolve=r));await t.e.api.startTonPayment();await t.e.api.sendTonPayment();await t.advance(5000);t.e.api.closeTonWaiting();resolve('paid');await t.flush();assert.equal(t.success(),0);assert.equal(t.e.checkoutOrder.status,'pending');passed++;
}
{
 const t=setup();await t.e.api.startTonPayment();t.node('#wallet-wait-retry').click();assert.equal(t.events.filter(x=>x==='wallet').length,2);await t.advance(5000);assert.equal(t.events.filter(x=>x==='check').length,1);passed++;
 t.node('#wallet-wait-qr').click();assert.equal(t.node('#keeper-qr').hidden,false);assert.equal(t.node('#keeper-pending').hidden,true);assert.equal(t.node('#keeper-qr-image').src,'data:image/gif;base64,qr');passed++;
 t.node('#wallet-wait-back').click();assert.equal(t.node('#keeper-qr').hidden,true);assert.equal(t.node('#keeper-pending').hidden,false);t.node('#wallet-wait-back').click();assert.equal(t.e.phase,'idle');passed++;
}
{
 const t=setup(),frames=[];t.e.requestAnimationFrame=fn=>frames.push(fn);const opening=t.e.api.startTonPayment();await t.flush();assert.equal(frames.length,1);frames.shift()();t.e.api.closeTonWaiting();frames.shift()();await opening;assert.equal(t.events.filter(x=>x==='wallet').length,0);passed++;
}
console.log(JSON.stringify({passed,automatic_handoff_after_quote:true,direct_wallet_handoff:true,one_check_per_five_seconds:true,duplicate_handoff_blocked:true,close_and_background_stop_polling:true,stale_paid_response_ignored:true,real_wallet:false}));
