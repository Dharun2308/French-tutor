// Only run against the disposable fixture app on :8097 and browser on :9236.
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
const fixture = `(()=>{
const real=window.fetch.bind(window);window.auditSaves=0;window.auditFail=true;
const cards=[1,2].map(n=>({cardId:n,verbId:n,infinitive:n===1?'parler':'aimer',english:'to speak',group:'er',level:'A1',auxiliary:'avoir',tense:'present',tenseLabel:'Present',person:'je',pronoun:'je',form:n===1?'parle':'aime',isIrregular:false,repetitions:0,wrongCount:0,mnemonic:null,options:n===1?['parle','parles','parlons','parlez']:['aime','aimes','aimons','aimez']}));
const phrases=[1,2].map(n=>({id:n,category:'phrase',french:n===1?'Bonjour':'Merci',english:n===1?'Hello':'Thank you',notes:null,level:'A1',repetitions:0,wrongCount:0,mnemonic:null}));
window.fetch=async(url,opts)=>{const p=String(url);const json=(v,status=200)=>Promise.resolve(new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}}));
if(p.startsWith('/api/cards/next'))return json({cards});
if(p.startsWith('/api/phrases/next'))return json({phrases});
if(p==='/api/ai/sentence')return json({prompt_en:'I speak French.',formal:'Je parle français.',neutral:'Je parle français.',informal:'Je parle français.',notes:'Fixture'});
if(p==='/api/cards/review'||p==='/api/phrases/review'){window.auditSaves++;await new Promise(r=>setTimeout(r,250));return json(window.auditFail?{error:'Simulated save outage'}:{ok:true},window.auditFail?503:200);}
return real(url,opts);};})();`;
try {
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 const hook=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:fixture});
 for(const mode of ['flashcards','multiple-choice','drill','phrases','sentence']){
  await navigate('/practice/'+mode);await waitFor('document.body.innerText.includes("1 / 2") || document.body.innerText.includes("1/2")');
  if(mode==='flashcards'){await click('Reveal (Space)');await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'3',bubbles:true}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'3',bubbles:true}));");}
  if(mode==='multiple-choice')await click('parle');
  if(mode==='drill'){await type('parle');await click('Check');}
  if(mode==='phrases'){await click('Reveal (Space)');await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'3',bubbles:true}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'3',bubbles:true}));");}
  if(mode==='sentence')await click("Show answer");
  await waitFor('Boolean(document.querySelector("[role=alert]"))');
  assert.equal(await evaluate('window.auditSaves'),1,mode);
  assert.ok(await evaluate('document.body.innerText.includes("1 / 2") || document.body.innerText.includes("1/2")'),mode+' advanced on failed save');
  if(mode==='drill')assert.equal(await evaluate('document.querySelector("input").value'),'parle');
  await evaluate('window.auditFail=false');
  if(mode==='flashcards'||mode==='phrases')await click('Good');
  if(mode==='multiple-choice')await click('parle');
  if(mode==='drill')await click('Check');
  if(mode==='sentence')await click("Show answer");
  await waitFor('window.auditSaves === 2 && !document.querySelector("[role=alert]")');
  await new Promise(r=>setTimeout(r,350));
  console.log('PASS save failure/preservation/recovery:',mode);
 }
 await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:hook.identifier});
 await navigate('/topics/direct-objects'); await waitFor('Boolean(document.querySelector("input")) || document.body.innerText.includes("You wrote")');
 if (await evaluate('Boolean(document.querySelector("input"))')) { await type('Je la vois.');await click('Check'); } await waitFor('document.body.innerText.includes("You wrote")');
 await cdp('Page.reload');await waitFor('document.body.innerText.includes("You wrote")');assert.ok(await evaluate('document.body.innerText.includes("Je la vois.")'));
 console.log('PASS Topics actual local grade and persisted answer after reload');
 const paths=['/','/topics','/topics/language-transfer','/notes','/settings','/import','/library','/conversation','/weak','/weekly','/progress','/practice/focus','/practice/smart','/practice/items','/practice/listening','/practice/variations'];
 for(const theme of ['light','dark']){
  await evaluate(`localStorage.setItem('theme',${JSON.stringify(theme)})`);
  for(const path of paths){await navigate(path);await new Promise(r=>setTimeout(r,300));assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),theme+' overflow '+path);assert.ok(!await evaluate('document.body.innerText.includes("Application error")'),path);}
  const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/french-tutor-audit-20260909/phone-'+theme+'.png',Buffer.from(shot.data,'base64'));
 }
 console.log('PASS 16 pages in phone light/dark themes');
 await navigate('/topics/language-transfer');await waitFor('Boolean(document.querySelector("audio"))');
 await evaluate('document.querySelector("audio").play()');await waitFor('document.querySelector("audio").currentTime > 0');
 await evaluate('document.querySelector("audio").currentTime=60;document.querySelector("audio").playbackRate=1.25');await waitFor('document.querySelector("audio").currentTime >= 60');
 await evaluate('document.querySelector("audio").pause()');console.log('PASS real audio playback and seeking');
 await evaluate("(async()=>{for(let i=0;i<40;i++){const r=await fetch('/api/language-transfer/1');if(!r.ok)throw Error('Audio request failed');const reader=r.body.getReader();await reader.read();await reader.cancel();}})()");
 console.log('PASS 40 cancelled browser audio streams');
 assert.deepEqual(errors,[]);console.log('PASS no uncaught browser exceptions');
} finally {ws.close();await fetch('http://127.0.0.1:9236/json/close/'+tab.id);}
