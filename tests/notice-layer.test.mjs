import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function promoteNotice()'),html.indexOf('function showPaymentSheet()'));
const frames=[],layer=[],classes=new Set(),observers=[];
let popover=false;
const notice={style:{},contains:node=>node===notice,classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(c,on){on?classes.add(c):classes.delete(c);}},matches:()=>popover,showPopover(){popover=true;layer.push('notice');},hidePopover(){popover=false;}};
const nodes={'#top-notice':notice,'#notice-text':{},'#notice-icon':{}};
class Observer{constructor(callback){observers.push(callback);}observe(){}}
const env={$:id=>nodes[id],document:{body:{},querySelectorAll:()=>[]},MutationObserver:Observer,requestAnimationFrame:callback=>(frames.push(callback),frames.length),setTimeout:()=>1,clearTimeout(){},noticeTimer:null};
vm.createContext(env);vm.runInContext(source+'\nglobalThis.showNotice=notice;',env);
env.showNotice('Ошибка кошелька',true);layer.push('new-dialog');
while(frames.length)frames.shift()();
assert.equal(layer.at(-1),'notice');assert.equal(nodes['#notice-text'].textContent,'Ошибка кошелька');assert.equal(classes.has('error'),true);
layer.push('wallet-dialog');observers[0]([{target:{}}]);while(frames.length)frames.shift()();assert.equal(layer.at(-1),'notice');
const before=frames.length;observers[0]([{target:notice}]);assert.equal(frames.length,before);
console.log(JSON.stringify({passed:3,notice_above_later_dialog:true,wallet_layer_changes_handled:true,no_observer_feedback_loop:true}));
