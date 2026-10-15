import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code='//'+html.split('// Native GRAM payments:')[1].split('// CryptoBot integration:')[0];
let passed=0;
const id='abcd-efgh-ijkl-mnop';
const baseQuote={quote_id:'a'.repeat(32),order_id:id,rub_amount:'1.00',gram_amount:'0.008682063',nano_amount:'8682063',recipient:'UQ'+'A'.repeat(46),network:'-239',valid_until:Math.floor(Date.now()/1000)+180};
function setup({quoteFailure=false,sendFailure=null,expired=false}={}){
 const nodes=new Map(),events=[];let status='pending',successes=0,stored=null;
 const $=key=>{if(!nodes.has(key))nodes.set(key,{hidden:false,disabled:false,textContent:''});return nodes.get(key);};
 const sandbox={window:{},Date,console,$,selected:'keeper',phase:'idle',checkoutOrder:{id,amount:1,status:'pending'},sheetIds:['loading-sheet'],clearFlow(){},openSheet(){},closeSheet(){},notice(text){events.push('notice:'+text);},showPaymentSheet(){},showSuccess(){successes++;sandbox.phase='success';},later(callback){sandbox.scheduled=callback;}};
 let generation=0;
 sandbox.window.PlataGramPayment={async quote(){events.push('quote');if(quoteFailure)throw new Error('Адрес получателя ещё не настроен');return {...baseQuote,quote_id:(generation++?'b':'a').repeat(32)};},async prepare(){events.push('prepare');if(expired){expired=false;throw Object.assign(new Error('expired'),{status:409});}return {quote:{...baseQuote,quote_id:(generation>1?'b':'a').repeat(32)},transaction:{from:'0:'+'a'.repeat(64),messages:[{amount:baseQuote.nano_amount}]}};},async status(){events.push('status');return status;},save(_id,value){stored=value;},restore(){return stored;}};
 sandbox.window.PlataTonConnect={async connect(){events.push('connect');return {address:'0:'+'a'.repeat(64)};},async send(){events.push('send');if(sendFailure)throw sendFailure;return {boc:'broadcast-only'};},onChange(){}};
 vm.createContext(sandbox);vm.runInContext(code+'\nglobalThis.api={startTonPayment,sendTonPayment,checkTonPayment,getSent:()=>tonSent,expireQuote:()=>{tonQuote.valid_until=1;}};',sandbox);
 return {sandbox,events,nodes,setStatus:v=>status=v,getSuccesses:()=>successes};
}
{
 const {sandbox,events,setStatus,getSuccesses}=setup();await sandbox.api.startTonPayment();assert.deepEqual(events.slice(0,2),['quote','connect']);assert.equal(sandbox.phase,'waiting');passed++;
 const sending=sandbox.api.sendTonPayment();assert.equal(events.filter(e=>e==='send').length,1,'Wallet send must start in the click task, before any await');await sending;assert.equal(events.filter(e=>e==='send').length,1);assert.equal(sandbox.checkoutOrder.status,'pending');assert.equal(getSuccesses(),0);assert.equal(sandbox.api.getSent(),true);passed++;
 await sandbox.api.sendTonPayment();assert.equal(events.filter(e=>e==='send').length,1);passed++;
 setStatus('confirming');await sandbox.api.checkTonPayment();assert.equal(getSuccesses(),0);passed++;
 setStatus('paid');await sandbox.api.checkTonPayment();assert.equal(getSuccesses(),1);assert.equal(sandbox.checkoutOrder.status,'paid');passed++;
}
{
 const {sandbox,events}=setup({quoteFailure:true});await sandbox.api.startTonPayment();assert.ok(!events.includes('connect'));assert.equal(sandbox.phase,'idle');passed++;
}
{
 const {sandbox,events}=setup({expired:true});await sandbox.api.startTonPayment();await sandbox.api.startTonPayment();assert.equal(events.filter(e=>e==='send').length,0);assert.equal(events.filter(e=>e==='quote').length,2);assert.equal(sandbox.api.getSent(),false);passed++;
}
{
 const {sandbox}=setup({sendFailure:Object.assign(new Error('reject'),{name:'UserRejectsError'})});await sandbox.api.startTonPayment();await sandbox.api.sendTonPayment();assert.equal(sandbox.api.getSent(),false);assert.equal(sandbox.checkoutOrder.status,'pending');passed++;
}
{
 const {sandbox,events}=setup({sendFailure:new Error('network vanished')});await sandbox.api.startTonPayment();await sandbox.api.sendTonPayment();assert.equal(sandbox.api.getSent(),true);await sandbox.api.sendTonPayment();assert.equal(events.filter(e=>e==='send').length,1);assert.equal(sandbox.checkoutOrder.status,'pending');passed++;
}
{
 const {sandbox,events}=setup();await sandbox.api.startTonPayment();sandbox.api.expireQuote();await sandbox.api.sendTonPayment();assert.equal(events.filter(e=>e==='send').length,0);assert.equal(events.filter(e=>e==='quote').length,2);passed++;
 await sandbox.api.sendTonPayment();assert.equal(events.filter(e=>e==='send').length,1);passed++;
}
console.log(JSON.stringify({passed,quote_before_wallet:true,no_paid_from_wallet_broadcast:true,no_automatic_resend:true,refreshed_quote_requires_new_click:true,missing_recipient_blocks_transfer:true,real_wallet:false}));
