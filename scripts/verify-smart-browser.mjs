// Run only against the disposable Smart fixture app on :8097 and Chromium on :9236.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const tab = await (await fetch('http://127.0.0.1:9236/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0; const pending=new Map(); const errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(!m.id)return;const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);};
function cdp(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function waitFor(expression){const end=Date.now()+15000;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout '+expression+'\n'+await evaluate('document.body.innerText'));}
async function click(text){const e=`[...document.querySelectorAll('button')].find(b=>b.innerText.includes(${JSON.stringify(text)})&&!b.disabled)`;await waitFor(`Boolean(${e})`);await evaluate(`${e}.click()`);}
async function navigate(path){await cdp('Page.navigate',{url:'http://127.0.0.1:8097'+path});await waitFor('document.readyState === "complete"');}
async function type(text){await waitFor('Boolean(document.querySelector("input:not([type=checkbox]), textarea"))');await evaluate(`(()=>{const e=document.querySelector('input:not([type=checkbox]), textarea');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}

async function screenshot(name) {
 const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
 await writeFile('/tmp/french-tutor-smart-20260909/'+name+'.png',Buffer.from(shot.data,'base64'));
}
try {
 await cdp('Page.enable'); await cdp('Runtime.enable');
 for(const width of [390,1280]) {
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:900,deviceScaleFactor:1,mobile:width===390});
  for(const theme of ['light','dark']) {
   await navigate('/'); await evaluate(`localStorage.setItem('theme',${JSON.stringify(theme)})`); await cdp('Page.reload');
   await waitFor('document.body.innerText.includes("Practice now")');
   const links=await evaluate(`(()=>{const section=[...document.querySelectorAll('section')].find(s=>s.querySelector('h2')?.textContent==='Practice now');return [...section.querySelectorAll('a')].map(a=>({href:a.getAttribute('href'),text:a.innerText,y:a.getBoundingClientRect().y,x:a.getBoundingClientRect().x}));})()`);
   assert.deepEqual(links.map(a=>a.href),['/practice/focus','/practice/smart','/topics','/practice/listening','/conversation','/practice/variations']);
   for(let i=0;i<6;i+=2){assert.equal(links[i].y,links[i+1].y);assert.ok(links[i].x<links[i+1].x);}
   assert.ok(links[0].y<links[2].y&&links[2].y<links[4].y);
   assert.equal(await evaluate('document.body.innerText.includes("This week\'s phrases")'),false);
   assert.equal(await evaluate('document.body.innerText.includes("Start 10-minute focus")'),false);
   assert.equal(await evaluate(`document.querySelectorAll('a[href="/practice/smart"]').length`),1);
   assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
   await screenshot('dashboard-'+width+'-'+theme);
  }
 }
 console.log('PASS requested dashboard rows, removed duplicates, phone/desktop light/dark layouts.');
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await navigate('/practice/smart'); await waitFor('Boolean(document.querySelector("#smart-answer"))');
 assert.ok(await evaluate('document.body.innerText.includes("Original card")'));
 await type('Je suis prêt'); await cdp('Page.reload');
 await waitFor('document.querySelector("#smart-answer")?.value === "Je suis prêt"');
 await evaluate(`(()=>{const real=window.fetch.bind(window);window.failSmart=true;window.smartSaves=0;window.fetch=async(url,opts)=>{if(String(url)==='/api/smart-session'&&opts?.method==='POST'&&JSON.parse(opts.body).action==='answer'){window.smartSaves++;if(window.failSmart)return new Response(JSON.stringify({error:'Simulated save outage'}),{status:503,headers:{'content-type':'application/json'}});}return real(url,opts);};})()`);
 await click('Check answer'); await waitFor('Boolean(document.querySelector("[role=alert]"))');
 assert.equal(await evaluate('document.querySelector("#smart-answer").value'),'Je suis prêt');
 await evaluate('window.failSmart=false');
 await click('Check answer'); await waitFor('document.body.innerText.includes("Review saved.")');
 assert.equal(await evaluate('window.smartSaves'),2);
 await cdp('Page.reload'); await waitFor('document.body.innerText.includes("Your answer: Je suis prêt")');
 assert.ok(await evaluate('document.body.innerText.includes("Review saved.")'));
 console.log('PASS draft/feedback resume and failed-save recovery.');
 await click('Next exercise'); await waitFor('Boolean(document.querySelector("#smart-answer"))');
 await type('Elle est heureux'); await click('Check answer');
 await waitFor('document.body.innerText.includes("Check your recall")');
 assert.ok(!await evaluate('document.body.innerText.includes("Review saved.")'));
 await screenshot('smart-manual-phone');
 await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'1',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'1',bubbles:true}));"); await waitFor('document.body.innerText.includes("Review saved.")');
 await click('Next exercise'); await waitFor('Boolean(document.querySelector("#smart-answer"))');
 await type('Nous avons une voiture'); await click('Check answer'); await waitFor('document.body.innerText.includes("Review saved.")');
 await click('Next exercise'); await waitFor('Boolean(document.querySelector("#smart-answer"))');
 assert.ok(await evaluate('document.body.innerText.includes("Follow-up")'));
 await type('Elle est heureuse'); await click('Check answer'); await waitFor('document.body.innerText.includes("Follow-up saved")');
 await click('Finish session'); await waitFor('document.body.innerText.includes("Session complete")');
 assert.ok(await evaluate('document.body.innerText.includes("2 of 3 first attempts recalled successfully. 1 follow-up practiced")'));
 assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
 await screenshot('smart-complete-phone');
 await cdp('Page.reload'); await waitFor('document.body.innerText.includes("Session complete")');
 console.log('PASS offline self-rating, adaptive follow-up, independent scoring and saved completion.');
 assert.deepEqual(errors,[]); console.log('PASS no uncaught browser exceptions.');
} finally { ws.close(); await fetch('http://127.0.0.1:9236/json/close/'+tab.id); }
