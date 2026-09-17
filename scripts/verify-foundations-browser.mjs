// Run after prepare-foundations-browser.ts, against the disposable app on :8097.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const output = process.env.FOUNDATIONS_BROWSER_OUTPUT || "/tmp/french-tutor-foundations-easy-20260916";
await mkdir(output, { recursive: true, mode: 0o700 });
const tab = await (await fetch("http://127.0.0.1:9236/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0;
const pending = new Map(), errors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  if (!message.id) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) request.reject(Error(message.error.message)); else request.resolve(message.result);
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw Error(`Timeout: ${expression}\n${await evaluate("document.body.innerText")}`);
}
async function click(text) {
  const button = `[...document.querySelectorAll('button')].find(b => b.innerText.includes(${JSON.stringify(text)}) && !b.disabled)`;
  await waitFor(`Boolean(${button})`); await evaluate(`${button}.click()`);
}
async function type(text) {
  await waitFor(`Boolean(document.querySelector('#foundations-answer:not(:disabled)'))`);
  await evaluate(`(() => { const input = document.querySelector('#foundations-answer'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}
async function state() { return evaluate(`fetch('/api/foundations-session').then(r => r.json()).then(r => r.session)`); }
async function screenshot(name) {
  const shot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(`${output}/${name}.png`, Buffer.from(shot.data, "base64"));
}
try {
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp("Page.navigate", { url: "http://127.0.0.1:8097/practice/phrases" });
  if (process.env.FOUNDATIONS_UPGRADE_ONLY === "1") {
    await waitFor(`Boolean(document.querySelector('#foundations-answer:not(:disabled)'))`);
    assert.ok(await evaluate(`document.body.innerText.includes('Easy words and short phrases')`));
    assert.ok(!await evaluate(`document.body.innerText.includes('bought shoes online')`));
    const upgraded = await state();
    assert.equal(upgraded.status, "active");
    assert.ok(upgraded.question.fallback, "Disabled fixture providers use a short original expression");
    assert.ok(upgraded.question.prompt.split(/\s+/).length <= 24);
    await cdp("Page.reload");
    await waitFor(`Boolean(document.querySelector('#foundations-answer:not(:disabled)'))`);
    assert.equal((await state()).id, upgraded.id, "The upgraded round resumes without starting over again");
    assert.deepEqual(errors, []);
    await screenshot("foundations-upgraded-phone");
    console.log("PASS actual old-round replacement and reload into beginner practice.");
  } else {
  await type("De pain chaud.");
  await cdp("Page.reload");
  await waitFor(`document.querySelector('#foundations-answer')?.value === 'De pain chaud.'`);
  await evaluate(`(() => {
    const real = window.fetch.bind(window); window.failAnswer = true; window.lostRating = false; window.ratingRequests = 0;
    window.fetch = async (url, opts) => {
      if (String(url) === '/api/foundations-session' && opts?.method === 'POST') {
        const action = JSON.parse(opts.body).action;
        if (action === 'answer' && window.failAnswer) return new Response(JSON.stringify({error:'Simulated connection failure'}), {status:503});
        if (action === 'rate') {
          window.ratingRequests++;
          if (window.lostRating) { window.lostRating = false; await real(url, opts); return new Response(JSON.stringify({error:'Simulated lost response after save'}), {status:503}); }
        }
      }
      return real(url, opts);
    };
  })()`);
  await click("Check answer"); await waitFor(`Boolean(document.querySelector('[role=alert]'))`);
  assert.equal(await evaluate(`document.querySelector('#foundations-answer').value`), "De pain chaud.");
  assert.equal((await state()).completed, 0);
  await evaluate("window.failAnswer = false"); await click("Check answer");
  await waitFor(`document.body.innerText.includes('How well did you recall')`);
  assert.equal((await state()).question.feedback.rating, null);
  await cdp("Page.reload"); await waitFor(`document.body.innerText.includes('Your answer: De pain chaud.')`);
  for (const width of [390, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390 });
    for (const theme of ["light", "dark"]) {
      await evaluate(`localStorage.setItem('theme', ${JSON.stringify(theme)})`); await cdp("Page.reload");
      await waitFor(`document.body.innerText.includes('How well did you recall')`);
      assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
      for (const label of ["Again", "Hard", "Good", "Easy"]) assert.ok(await evaluate(`[...document.querySelectorAll('button')].some(b => b.innerText.startsWith(${JSON.stringify(label)}) && !b.disabled)`));
      await screenshot(`foundations-feedback-${width}-${theme}`);
    }
  }
  // Lose a response AFTER the server commits, then retry the same rating from the old screen.
  await evaluate(`(() => {
    const real = window.fetch.bind(window); window.lostRating = true; window.ratingRequests = 0;
    window.fetch = async (url, opts) => {
      if (String(url) === '/api/foundations-session' && opts?.method === 'POST' && JSON.parse(opts.body).action === 'rate') {
        window.ratingRequests++;
        if (window.lostRating) { window.lostRating = false; await real(url, opts); return new Response(JSON.stringify({error:'Simulated lost response after save'}), {status:503}); }
      }
      return real(url, opts);
    };
  })()`);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', {key:'1', bubbles:true})); window.dispatchEvent(new KeyboardEvent('keydown', {key:'1', bubbles:true}));`);
  await waitFor(`Boolean(document.querySelector('[role=alert]'))`);
  assert.equal(await evaluate("window.ratingRequests"), 1);
  assert.equal((await state()).ratings[0], 1);
  await click("Again"); await waitFor(`document.body.innerText.includes('original expression') && Boolean(document.querySelector('#foundations-answer:not(:disabled)'))`);
  assert.equal((await state()).completed, 1);
  assert.equal((await state()).ratings[0], 1);
  assert.equal(await evaluate("window.ratingRequests"), 2);
  console.log("PASS draft and feedback reload, four manual ratings, phone/desktop light/dark, failed answers, double keys and committed-rating retry.");

  await type("du café"); await click("Check answer"); await waitFor(`document.body.innerText.includes('How well did you recall')`);
  await click("Hard"); await waitFor(`document.body.innerText.includes('A man.') && Boolean(document.querySelector('#foundations-answer:not(:disabled)'))`);
  await type("Je suis prêt."); await click("Check answer"); await waitFor(`document.body.innerText.includes('How well did you recall')`);
  assert.equal((await state()).question.feedback.grade.verdict, "CORRECT");
  await click("Good"); await waitFor(`document.body.innerText.includes('Recall again') && Boolean(document.querySelector('#foundations-answer:not(:disabled)'))`);
  assert.equal((await state()).question.prompt, "Translate: Some warm bread.");
  await type("Du pain chaud."); await click("Check answer"); await waitFor(`document.body.innerText.includes('How well did you recall')`);
  await click("Good"); await waitFor(`document.body.innerText.includes('Write in French: a coffee') && Boolean(document.querySelector('#foundations-answer:not(:disabled)'))`);
  await click("Reveal answer"); await waitFor(`document.body.innerText.includes('How well did you recall')`); await click("Good");
  await waitFor(`document.body.innerText.includes('A red car') && Boolean(document.querySelector('#foundations-answer:not(:disabled)'))`);
  await click("Reveal answer"); await waitFor(`document.body.innerText.includes('How well did you recall')`); await click("Easy");
  await waitFor(`document.body.innerText.includes('Round complete')`);
  const completed = await state();
  assert.deepEqual(completed.ratings, { 0: 1, 1: 1, 2: 1, 3: 1 });
  assert.equal(completed.followUps, 2); assert.equal(completed.recap.length, 2);
  await cdp("Page.reload"); await waitFor(`document.body.innerText.includes('Round complete')`);
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth")); await screenshot("foundations-complete-phone");
  assert.deepEqual(errors, []);
  console.log("PASS fallback, real local grading, exact missed-sentence recall, independent rating totals, saved completion, no uncaught browser errors.");
  }
} finally { ws.close(); await fetch(`http://127.0.0.1:9236/json/close/${tab.id}`); }
