import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const controller=fs.readFileSync(root+'assets/tonconnect.js','utf8');
const html=fs.readFileSync(root+'index.html','utf8');
const manifest=JSON.parse(fs.readFileSync(root+'tonconnect-manifest.json'));
const provenance=JSON.parse(fs.readFileSync(root+'vendor/tonconnect-ui-provenance.json'));
const wallet={account:{chain:'-239',address:'0:'+'a'.repeat(64)}};
let passed=0;
assert.deepEqual(Object.keys(manifest).sort(),['iconUrl','name','url']);assert.equal(manifest.url,'https://plata-pay.github.io/order/');assert.equal(manifest.name,'Plata Pay');assert.equal(manifest.iconUrl,'https://plata-pay.github.io/order/assets/plata-icon-180.png');passed++;
const icon=fs.readFileSync(root+'assets/plata-icon-180.png');assert.equal(icon.readUInt32BE(16),180);assert.equal(icon.readUInt32BE(20),180);passed++;
const vendor=fs.readFileSync(root+'vendor/tonconnect-ui-5.0.1.min.js');assert.equal('sha384-'+createHash('sha384').update(vendor).digest('base64'),provenance.scriptIntegrity);assert.ok(controller.includes(provenance.scriptIntegrity));passed++;
assert.ok(!/\.signData\s*\(|\.signMessage\s*\(/.test(controller));assert.ok(controller.includes('return connector.sendTransaction(transaction,'));assert.ok(!/\/api\/orders\/status|merchant_token|ORDERS_ADMIN_TOKEN/.test(controller));passed++;
assert.ok(html.includes("if (selected === 'keeper') return startTonPayment();"));assert.ok(html.includes("tonPrepared = await window.PlataGramPayment.prepare("));passed++;
function environment({initial=null,scenario='connect',scriptError=false,mobile=false}={}){
 const state={scripts:[],uis:[],openCalls:0,disconnects:0,scenario,scriptError};
 class FakeUi {
  constructor(options){this.options=options;this.wallet=initial;this.connectionRestored=Promise.resolve(!!initial);this.status=[];this.modal=[];this.connector={sendTransaction:(transaction,options)=>{state.nativeTransaction=transaction;state.requestPosted=true;options.onRequestSent();return Promise.resolve({boc:'native-broadcast-only'});},connect:()=>{state.connectLinkCalls=(state.connectLinkCalls||0)+1;return 'https://app.tonkeeper.com/ton-connect?v=2&id='+ 'a'.repeat(64)+'&r='+encodeURIComponent(JSON.stringify({manifestUrl:manifest.url+'tonconnect-manifest.json',items:[{name:'ton_addr'}]}));}};state.uis.push(this);}
  async getWallets(){return [{appName:'tonkeeper',universalLink:'https://app.tonkeeper.com/ton-connect',bridgeUrl:'https://bridge.tonapi.io/bridge'}];}
  setConnectionNetwork(network){this.network=network;}
  onStatusChange(callback,error){this.status.push({callback,error});return ()=>{};}
  onSingleWalletModalStateChange(callback){this.modal.push(callback);callback({status:'closed',closeReason:'action-cancelled'});return ()=>{this.modal=this.modal.filter(c=>c!==callback);};}
  emit(value){this.wallet=value;for(const cb of [...this.status])cb.callback(value);}
  async openSingleWalletModal(name){assert.equal(name,'tonkeeper');state.openCalls++;for(const cb of [...this.modal])cb({status:'opened'});queueMicrotask(()=>{
   if(state.scenario==='cancel'){for(const cb of [...this.modal])cb({status:'closed',closeReason:'action-cancelled'});}
   else if(state.scenario==='error'){for(const cb of [...this.status])cb.error(new Error('private bridge error'));}
   else if(state.scenario==='testnet')this.emit({account:{...wallet.account,chain:'-3'}});
   else if(state.scenario==='invalid')this.emit({account:{...wallet.account,address:'<img src=x onerror=alert(1)>'}});
   else this.emit(wallet);
  });}
  openModal(){return this.openSingleWalletModal('tonkeeper');}
  onModalStateChange(callback){return this.onSingleWalletModalStateChange(callback);}
  closeModal(){return this.closeSingleWalletModal();}
  async sendTransaction(transaction,options){state.transaction=transaction;state.sendOptions=options;state.sendInvoked=true;return {boc:'wallet-broadcast-result'};}
  closeSingleWalletModal(){for(const cb of [...this.modal])cb({status:'closed',closeReason:'action-cancelled'});}
  async disconnect(){state.disconnects++;this.emit(null);}
 }
 const saved=new Map();const sandbox={window:{location:{assign(link){state.nativeOpened=link;assert.equal(state.requestPosted,true);}}},sessionStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)},AbortController,navigator:{userAgent:mobile?'Mozilla/5.0 Android':'Desktop'},URL,setTimeout,clearTimeout,document:{body:{append(node){state.dialog=node;}},createElement(tag){return {tag,style:{},events:{},addEventListener(name,callback){this.events[name]=callback;},append(...nodes){this.children=nodes;},showModal(){this.open=true;},close(){this.open=false;},remove(){}};},head:{append(script){state.scripts.push(script);queueMicrotask(()=>{
  if(state.scriptError)script.onerror();else{sandbox.window.TON_CONNECT_UI={TonConnectUI:FakeUi,THEME:{DARK:'DARK'}};script.onload();}
 });}}}};
 vm.createContext(sandbox);vm.runInContext(controller,sandbox);
 return {api:sandbox.window.PlataTonConnect,state};
}
{
 const {api,state}=environment();let latest=null;const unsubscribe=api.onChange(value=>{latest=value;});
 const a=api.connect(),b=api.connect();assert.equal(a,b);const connected=await a;assert.equal(connected.address,wallet.account.address);assert.equal(connected.network,'TON Mainnet');assert.ok(Object.isFrozen(connected));passed++;
 assert.equal(state.scripts.length,1);assert.equal(state.scripts[0].integrity,provenance.scriptIntegrity);assert.equal(state.scripts[0].referrerPolicy,'no-referrer');assert.equal(state.scripts[0].crossOrigin,'anonymous');passed++;
 assert.equal(state.uis[0].network,'-239');assert.equal(state.uis[0].options.analytics.mode,'off');assert.equal(state.uis[0].options.manifestUrl,'https://plata-pay.github.io/order/tonconnect-manifest.json');passed++;
 assert.equal((await api.connect()).address,wallet.account.address);assert.equal(state.openCalls,1);passed++;
 await api.disconnect();assert.equal(latest,null);assert.equal(state.disconnects,1);unsubscribe();passed++;
}
{
 const {api,state}=environment({initial:wallet});assert.equal((await api.connect()).address,wallet.account.address);assert.equal(state.openCalls,0);passed++;
}
{
 const {api,state}=environment({scenario:'cancel'});await assert.rejects(api.connect(),{name:'TonConnectionCancelled'});state.scenario='connect';assert.equal((await api.connect()).address,wallet.account.address);assert.equal(state.openCalls,2);assert.equal(state.uis[0].modal.length,0);passed++;
}
for(const scenario of ['testnet','invalid']){
 const {api,state}=environment({scenario});await assert.rejects(api.connect());assert.ok(state.disconnects>=1);passed++;
}
{
 const {api,state}=environment({initial:{account:{...wallet.account,chain:'-3'}}});await assert.rejects(api.connect());assert.equal(state.disconnects,1);passed++;
}
{
 const {api,state}=environment({scriptError:true});await assert.rejects(api.connect());state.scriptError=false;await api.connect();assert.equal(state.scripts.length,2);passed++;
}
{
 const {api}=environment({scenario:'error'});await assert.rejects(api.connect(),error=>!error.message.includes('private bridge error'));passed++;
}
{
 const {api,state}=environment();await api.connect();
 const tx={network:'-239',from:wallet.account.address,validUntil:Math.floor(Date.now()/1000)+120,messages:[{address:'UQ'+ 'A'.repeat(46),amount:'1000000',payload:'AAAA'}]};
 const sent=api.send(tx);assert.equal(state.sendInvoked,true);assert.equal(state.sendOptions.skipRedirectToWallet,'never');await sent;assert.equal(state.transaction.amount,undefined);assert.equal(state.transaction.messages[0].amount,'1000000');passed++;
 for(const change of [t=>t.network='-3',t=>t.from='0:'+ 'b'.repeat(64),t=>t.messages.push(t.messages[0]),t=>t.messages[0].stateInit='AAAA',t=>t.messages[0].amount='-1',t=>t.validUntil=1]){const bad=structuredClone(tx);change(bad);await assert.rejects(async()=>api.send(bad));passed++;}
}
{
 const {api,state}=environment({mobile:true});const pending=api.connect();await new Promise(setImmediate);
 assert.ok(state.dialog?.open);const anchor=state.dialog.children.find(n=>n.tag==='a');assert.equal(anchor.target,'_self');assert.ok(anchor.href.startsWith('tonkeeper-tc://?'));const link=new URL(anchor.href);assert.equal(link.searchParams.get('id'),'a'.repeat(64));assert.equal(JSON.parse(link.searchParams.get('r')).manifestUrl,manifest.url+'tonconnect-manifest.json');assert.equal(state.openCalls,0);passed++;
 state.uis[0].emit(wallet);assert.equal((await pending).address,wallet.account.address);assert.equal(state.dialog.open,false);passed++;
 const tx={network:'-239',from:wallet.account.address,validUntil:Math.floor(Date.now()/1000)+120,messages:[{address:'UQ'+'A'.repeat(46),amount:'1000000',payload:'AAAA'}]};await api.send(tx);assert.ok(state.nativeOpened.startsWith('tonkeeper-tc://?id='));assert.equal(state.nativeTransaction.messages[0].amount,'1000000');passed++;
}
{
 const {api,state}=environment({mobile:true});const pending=api.connect();await new Promise(setImmediate);state.dialog.children.find(n=>n.tag==='button').events.click();await assert.rejects(pending,{name:'TonConnectionCancelled'});assert.equal(state.dialog.open,false);passed++;
}
console.log(JSON.stringify({passed,manifest_and_icon:true,pinned_sdk_integrity:true,connect_cancel_restore_disconnect:true,mainnet_only:true,only_explicit_bounded_native_transfer:true,no_payment_status_mutations:true,real_wallet:false}));
