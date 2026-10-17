import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.split('/* CHECKOUT BOOTSTRAP START */')[1].split('/* CHECKOUT BOOTSTRAP END */')[0].replace('\nbootCheckout();','\n');
function setup(){
 const timers=new Map(),nodes=new Map(),events=[];let count=0,resolve,reject;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},classList:{add(){}},hidden:false,disabled:false,addEventListener(type,fn){this[type]=fn;},remove(){}});return nodes.get(id);};
 const e={URL,AbortController,Intl,Date,encodeURIComponent,document:{title:''},window:{location:{href:'https://plata-pay.github.io/order/abcd-efgh-ijkl-mnop',reload(){events.push('reload');}},history:{replaceState(){}}},$:node,phase:'idle',checkoutOrder:null,showSuccess(){},openSheet:id=>events.push('open:'+id),closeSheet:id=>events.push('close:'+id),setTimeout(fn,delay){const id=++count;if(delay<=3000)queueMicrotask(fn);else timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),fetch:()=>new Promise((yes,no)=>{resolve=yes;reject=no;})};
 vm.createContext(e);vm.runInContext(code+'\nglobalThis.boot=bootCheckout;',e);
 return {e,events,timers,node,reply:v=>resolve(v),fail:()=>reject(new Error('Network failure'))};
}
let passed=0;
{
 const t=setup(),pending=t.e.boot();const prompt=[...t.timers.values()].find(x=>x.delay===7500);assert.ok(prompt);assert.ok(!t.events.includes('open:vpn-sheet'));prompt.fn();assert.ok(t.events.includes('open:vpn-sheet'));passed++;
 t.reply(Response.json({id:'abcd-efgh-ijkl-mnop',amount:1,status:'pending'}));await pending;assert.equal(t.events.at(-1),'close:vpn-sheet');assert.equal(t.timers.size,0);passed++;
 t.node('#vpn-refresh').click();assert.equal(t.events.at(-1),'reload');passed++;
}
{
 const t=setup(),pending=t.e.boot();t.reply(Response.json({error:'Not found'},{status:404}));await pending;assert.equal(t.node('#checkout-error-code').hidden,false);assert.equal(t.timers.size,0);assert.ok(!t.events.includes('open:vpn-sheet'));passed++;
}
{
 const t=setup(),pending=t.e.boot();t.fail();await pending;const prompt=[...t.timers.values()].find(x=>x.delay===7500);assert.ok(prompt);prompt.fn();assert.equal(t.events.at(-1),'open:vpn-sheet');passed++;
}
console.log(JSON.stringify({passed,vpn_after_7500ms:true,success_dismisses_help:true,not_found_stays_404:true,refresh_reloads_page:true}));
