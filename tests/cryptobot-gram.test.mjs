import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.split('// CryptoBot integration:')[1].split('async function startCryptoPayment()')[0];
const id='abcd-efgh-ijkl-mnop',calls=[];
const sandbox={detail:'GRAM',checkoutOrder:{id,amount:1,status:'pending'},AbortController,setTimeout,clearTimeout,console,sessionStorage:{setItem(){},removeItem(){}},fetch:async (_url,options)=>{
 const body=JSON.parse(options.body);calls.push(body);
 return Response.json({ok:true,result:body.action==='create_invoice'?{invoice_id:123,bot_invoice_url:'https://t.me/CryptoBot?start=test',amount:'1.00',ticket:'server-signed-ticket',status:'active'}:{status:'active'}});
}};
vm.createContext(sandbox);vm.runInContext('//'+code+'\nglobalThis.api={cryptoCreateInvoice,cryptoCheckInvoice,setInvoice:value=>cryptoInvoice=value};',sandbox);
const invoice=await sandbox.api.cryptoCreateInvoice();assert.equal(calls[0].data.asset,'TON');assert.equal(invoice.ticker,'GRAM');assert.equal(calls[0].data.amount,'1.00');
sandbox.api.setInvoice(invoice);await sandbox.api.cryptoCheckInvoice();assert.equal(calls[1].data.asset,'TON');assert.equal(calls[1].data.ticket,'server-signed-ticket');assert.equal(invoice.ticker,'GRAM');
sandbox.detail='USDT';await sandbox.api.cryptoCreateInvoice();assert.equal(calls[2].data.asset,'USDT');
sandbox.detail='FAKE';await assert.rejects(()=>sandbox.api.cryptoCreateInvoice());assert.equal(calls.length,3);
console.log(JSON.stringify({passed:4,gram_display_preserved:true,provider_ton_on_create_and_check:true,other_assets_unchanged:true,unsupported_assets_blocked:true}));
