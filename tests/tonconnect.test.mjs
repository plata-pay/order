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
assert.ok(!/\.sendTransaction\s*\(|\.signData\s*\(|\.signMessage\s*\(/.test(controller));assert.ok(!/\/api\/orders\/status|merchant_token|ORDERS_ADMIN_TOKEN/.test(controller));passed++;
assert.ok(html.includes("if (selected === 'keeper') return startTonConnection();"));assert.ok(html.includes("$('#tc-hash').textContent = tonAccount ? tonAccount.address"));passed++;
function environment({initial=null,scenario='connect',scriptError=false}={}){
 const state={scripts:[],uis:[],openCalls:0,disconnects:0,scenario,scriptError};
 class FakeUi {
  constructor(options){this.options=options;this.wallet=initial;this.connectionRestored=Promise.resolve(!!initial);this.status=[];this.modal=[];state.uis.push(this);}
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
  closeSingleWalletModal(){for(const cb of [...this.modal])cb({status:'closed',closeReason:'action-cancelled'});}
  async disconnect(){state.disconnects++;this.emit(null);}
 }
 const sandbox={window:{},setTimeout,clearTimeout,document:{createElement(){return {remove(){}};},head:{append(script){state.scripts.push(script);queueMicrotask(()=>{
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
console.log(JSON.stringify({passed,manifest_and_icon:true,pinned_sdk_integrity:true,connect_cancel_restore_disconnect:true,mainnet_only:true,no_signing_or_transfers:true,no_payment_status_mutations:true,real_wallet:false}));
