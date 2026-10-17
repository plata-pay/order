import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),persist=html.split('/* CHECKOUT PERSISTENCE START */')[1].split('/* CHECKOUT PERSISTENCE END */')[0];
const id='abcd-efgh-ijkl-mnop',data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
function setup(){const nodes=new Map(),events=[];const node=k=>{if(!nodes.has(k))nodes.set(k,{open:false,hidden:true,value:'',addEventListener(){},click(){events.push('qr');}});return nodes.get(k);};
 const e={localStorage:storage,Date,URLSearchParams,window:{addEventListener(){},PlataGramPayment:{restore:()=>({quote:{quote_id:'same-quote',valid_until:Date.now()/1000+600}}),prepare:async()=>{events.push('prepare');return {quote:{quote_id:'same-quote'}};}},PlataEvmPayment:{restore:(_id,_currency,q)=>q}},$:node,checkoutOrder:{id,amount:1,status:'pending'},selected:'',detail:'',phase:'idle',evmQuote:null,tonQuote:null,tonSent:false,tonPrepared:null,cryptoInvoice:null,previousSheet:null,currencyOptions:{cryptobot:[['USDT','Tether']],keeper:[['GRAM','Gram']]},selectMethod(m){e.selected=m;e.detail='';e.persist();},renderDetail(){},showPaymentSheet(){events.push('cryptobot');node('#action-sheet').open=true;},showTonWaiting(){events.push('keeper');node('#wallet-wait-sheet').open=true;},showEvmTransfer(){events.push('transfer');node('#transfer-sheet').open=true;},restoreCryptoInvoice:()=>({id:123,ticker:'USDT',ticket:'signed'})};
 vm.createContext(e);vm.runInContext(persist+'\nglobalThis.persist=persistCheckoutState;globalThis.restore=restoreCheckoutState;',e);return {e,node,events};}
let passed=0;
{
 const t=setup();t.e.selected='ethereum';t.e.phase='waiting';t.e.evmQuote={id,currency:'ETH',recipient:'same-address',amount:'same-amount'};t.node('#email').value='mail@example.test';t.node('#evm-tx-hash').value='0x'+'a'.repeat(64);t.e.persist('transfer-sheet');
 const fresh=setup();await fresh.e.restore();assert.equal(fresh.e.selected,'ethereum');assert.equal(fresh.e.phase,'waiting');assert.equal(fresh.e.evmQuote.amount,'same-amount');assert.equal(fresh.node('#email').value,'mail@example.test');assert.equal(fresh.node('#evm-tx-hash').value,'0x'+'a'.repeat(64));assert.deepEqual(fresh.events,['transfer']);passed++;
}
{
 const t=setup();t.e.selected='keeper';t.e.detail='GRAM';t.e.phase='waiting';t.node('#keeper-qr').hidden=false;t.e.persist('wallet-wait-sheet');const before=data.get('plata_checkout_v1_'+id);const fresh=setup();await fresh.e.restore();assert.equal(fresh.e.phase,'waiting');assert.equal(fresh.e.tonQuote.quote_id,'same-quote');assert.deepEqual(fresh.events,['prepare','keeper','qr']);assert.equal(data.get('plata_checkout_v1_'+id),before,'restore must not overwrite its snapshot via selectMethod');passed++;
}
{
 const t=setup();t.e.selected='cryptobot';t.e.detail='USDT';t.e.phase='waiting';t.e.persist('action-sheet');const fresh=setup();await fresh.e.restore();assert.equal(fresh.e.cryptoInvoice.id,123);assert.equal(fresh.e.detail,'USDT');assert.deepEqual(fresh.events,['cryptobot']);passed++;
}
{
 const t=setup();t.e.checkoutOrder={id:'aaaa-bbbb-cccc-dddd',amount:1,status:'pending'};await t.e.restore();assert.equal(t.e.selected,'');assert.equal(t.events.length,0);passed++;
 const paid=setup();paid.e.checkoutOrder.status='paid';await paid.e.restore();assert.equal(paid.events.length,0);passed++;
}
{
 const s=JSON.parse(data.get('plata_checkout_v1_'+id));s.savedAt=Date.now()-86400001;data.set('plata_checkout_v1_'+id,JSON.stringify(s));const t=setup();await t.e.restore();assert.equal(t.events.length,0);passed++;
 data.set('plata_checkout_v1_'+id,'{broken');await t.e.restore();assert.equal(t.events.length,0);passed++;
}
// Real confirmation handlers must pause polling, preserve the payment on return and only reset after confirmation.
{
 const nodes=new Map(),events=[];const node=k=>{if(!nodes.has(k))nodes.set(k,{open:false,addEventListener(type,fn){this[type]=fn;},getBoundingClientRect(){return {left:10,right:100,top:10,bottom:100};}});return nodes.get(k);};
 const e={$:node,phase:'waiting',previousSheet:null,stopTonPolling(){events.push('stop');},startTonPolling(){events.push('resume');},openSheet:k=>{node('#'+k).open=true;events.push('open:'+k);},closeSheet:k=>node('#'+k).open=false,reset(){events.push('reset');e.phase='idle';},notice(){}};
 const code=html.slice(html.indexOf('function openConfirmation(origin)'),html.indexOf("$('#back').addEventListener('click', reset)"));
 vm.createContext(e);vm.runInContext(code,e);const listener=html.split("$('#wallet-wait-sheet').addEventListener('click',")[1].split('\n')[0];vm.runInContext("$('#wallet-wait-sheet').addEventListener('click',"+listener,e);
 node('#wallet-wait-sheet').click({target:node('#wallet-wait-sheet'),clientX:0,clientY:0});assert.equal(node('#confirm-sheet').open,true);assert.ok(events.includes('stop'));assert.ok(!events.includes('reset'));node('#btn-back-op').click();assert.equal(node('#wallet-wait-sheet').open,true);assert.ok(events.includes('resume'));passed++;
 e.openConfirmation('wallet-wait-sheet');node('#btn-cancel-op').click();assert.equal(events.filter(v=>v==='reset').length,1);passed++;
}
console.log(JSON.stringify({passed,storage_survives_new_page:true,keeper_restores_without_navigation:true,only_authoritative_pending_orders_restored:true,keeper_cancel_requires_confirmation:true}));
// GRAM cache and signed receipt ticket survive a fresh JS runtime and old sessions migrate once.
{
 const client=fs.readFileSync(new URL('../assets/gram-payment.js',import.meta.url),'utf8');
 const sessionData=new Map(),session={getItem:k=>sessionData.get(k)??null,setItem:(k,v)=>sessionData.set(k,v),removeItem:k=>sessionData.delete(k)};
 const q={order_id:id,quote_id:'a'.repeat(32),network:'-239',gram_amount:'0.008000000',nano_amount:'8000000',recipient:'UQ'+'A'.repeat(46),raw_recipient:'0:'+'a'.repeat(64),created_at:Math.floor(Date.now()/1000),valid_until:Math.floor(Date.now()/1000)+600,body_hash:'b'.repeat(64),ticket:'server-encrypted-ticket',payload:'payload',comment:'plata:'+id+':'+'a'.repeat(32)};
 function clientApi(){const env={window:{},localStorage:storage,sessionStorage:session,URLSearchParams,Date};vm.createContext(env);vm.runInContext(client,env);return env.window.PlataGramPayment;}
 clientApi().save(id,{sent:true,quote:q});assert.equal(clientApi().restore(id).quote.ticket,q.ticket);assert.ok(data.has('plata_gram_history_'+id));
 data.delete('plata_gram_browser_'+id);sessionData.set('plata_gram_browser_'+id,JSON.stringify({sent:true,quote:q}));assert.equal(clientApi().restore(id).quote.quote_id,q.quote_id);assert.ok(!sessionData.has('plata_gram_browser_'+id));clientApi().save(id,null);assert.equal(clientApi().restore(id),null);
 console.log(JSON.stringify({gram_persistent_storage:true,session_migration:true,paid_cache_cleared:true}));
}
