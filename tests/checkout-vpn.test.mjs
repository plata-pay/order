import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.split('/* CHECKOUT BOOTSTRAP START */')[1].split('/* CHECKOUT BOOTSTRAP END */')[0].replace('\nbootCheckout();','\n');
const id='abcd-efgh-ijkl-mnop';
function setup(){
 const timers=new Map(),nodes=new Map(),events=[],calls=[];let n=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},classList:{add(){},remove(){}},hidden:false,disabled:false,addEventListener(type,fn){this[type]=fn;}});return nodes.get(id);};
 const e={URL,AbortController,Intl,Date,encodeURIComponent,document:{title:''},window:{location:{href:'https://plata-pay.github.io/order/'+id},history:{replaceState(){}}},$:node,phase:'idle',checkoutOrder:null,restoreCheckoutState:async()=>{},showSuccess(){events.push('paid');},openSheet:id=>events.push('open:'+id),closeSheet:id=>events.push('close:'+id),setTimeout(fn,delay){const key=++n;if(delay<=3000)queueMicrotask(fn);else timers.set(key,{fn,delay});return key;},clearTimeout:key=>timers.delete(key),fetch:(url,opts)=>new Promise((resolve,reject)=>{const c={url,opts,resolve,reject};calls.push(c);opts.signal?.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});})};
 vm.createContext(e);vm.runInContext(code+'\nglobalThis.boot=bootCheckout;',e);
 function respond(c,options={}){if(c.url.includes('?id='))c.resolve(Response.json(options.order||{id,amount:1,status:'pending'},{status:options.notfound?404:200}));else{const service=c.url.includes('plata-main.')?'plata-main':c.url.includes('shrill-')?'plata-crypto':'plata-evm-pay';c.resolve(Response.json({ok:true,service,configured:{ETH:true,BNB:true}},{status:options.failed?503:200}));}}
 return {e,events,timers,node,calls,respond};
}
let passed=0;
{
 const t=setup(),p=t.e.boot();assert.equal(t.calls.length,4);assert.ok(t.calls.every(c=>c.opts.cache==='no-store'));assert.equal(t.node('#page').style.display,'none');assert.equal(t.e.checkoutOrder,null);passed++;
 t.calls.slice(0,3).forEach(c=>t.respond(c));await new Promise(r=>setImmediate(r));assert.equal(t.node('#page').style.display,'none');passed++;
 t.respond(t.calls[3]);await p;assert.equal(t.e.checkoutOrder.id,id);assert.equal(t.node('#page').style.display,'');assert.ok(!t.events.includes('open:vpn-sheet'));assert.equal(t.timers.size,0);passed++;
}
{
 const t=setup(),p=t.e.boot();t.calls.forEach((c,i)=>t.respond(c,{failed:i===1}));await p;assert.equal(t.node('#page').style.display,'none');assert.equal(t.e.checkoutOrder,null);assert.equal(t.events.at(-1),'open:vpn-sheet');passed++;
 const retry=t.node('#vpn-refresh').click();assert.equal(t.events.at(-1),'close:vpn-sheet');assert.equal(t.node('#fullscreen-loading').hidden,false);assert.equal(t.calls.length,8);t.calls.slice(4).forEach(c=>t.respond(c));await retry;assert.equal(t.e.checkoutOrder.id,id);assert.equal(t.node('#page').style.display,'');passed++;
}
{
 const t=setup(),p=t.e.boot();t.calls.slice(0,3).forEach(c=>t.respond(c));[...t.timers.values()].find(x=>x.delay===7500).fn();await p;assert.equal(t.events.at(-1),'open:vpn-sheet');assert.ok(t.calls.every(c=>c.opts.signal.aborted));assert.equal(t.e.checkoutOrder,null);passed++;
}
{
 const t=setup(),p=t.e.boot();t.calls.forEach(c=>t.respond(c,{notfound:true}));await p;assert.equal(t.node('#checkout-error-code').hidden,false);assert.ok(!t.events.includes('open:vpn-sheet'));passed++;
}
{
 const t=setup();t.e.window.location.href='https://plata-pay.github.io/order/';const p=t.e.boot();assert.equal(t.calls.length,3);t.calls.forEach(c=>t.respond(c));await p;assert.equal(t.node('#checkout-error-code').hidden,false);assert.ok(!t.events.includes('open:vpn-sheet'));passed++;
}
{
 const t=setup(),old=t.e.boot(),fresh=t.e.boot();t.calls.slice(4).forEach(c=>t.respond(c));await Promise.all([old,fresh]);assert.equal(t.e.checkoutOrder.id,id);assert.ok(!t.events.includes('open:vpn-sheet'));passed++;
}
{
 const t=setup(),p=t.e.boot();t.calls.forEach(c=>t.respond(c,{order:{id,amount:1,status:'paid'}}));await p;assert.ok(t.events.includes('paid'));assert.ok(!t.events.includes('open:vpn-sheet'));passed++;
}
console.log(JSON.stringify({passed,parallel_readiness:true,partial_failure_blocks_checkout:true,deadline_aborts:true,in_place_retry:true,stale_run_ignored:true,missing_id_404:true}));
