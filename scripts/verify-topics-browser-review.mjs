// Run only with an isolated test app on :8097 and a disposable Chrome on :9236.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const tab = await (await fetch("http://127.0.0.1:9236/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
};
function cdp(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    const error = await evaluate("document.querySelector('[role=alert]')?.innerText");
    if (error) throw new Error(error);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out: ${expression}`);
}
async function click(label) {
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.innerText === ${JSON.stringify(label)} && !b.disabled)`);
  assert.equal(await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.innerText === ${JSON.stringify(label)}); button.click(); return true; })()`), true);
}
async function screenshot(name) {
  const shot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(`/home/multi_mind/snap/chromium/common/shots/topics-fixes-${name}.png`, Buffer.from(shot.data, "base64"));
}
async function typeAnswer(text) {
  await evaluate(`(() => { const input = document.querySelector('input[placeholder="Your answer…"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}
async function navigate(path, expected) {
  await cdp("Page.navigate", { url: `http://127.0.0.1:8097${path}` });
  await waitFor(`document.body.innerText.includes(${JSON.stringify(expected)})`);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
}
try {
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await navigate("/topics/communication-1", "Where does the pronoun go?");
  await screenshot("theory");
  await navigate("/topics/direct-objects", "Hints and reveals count as assisted answers");
  await typeAnswer("Je la vois.");
  await click("Check");
  await waitFor("document.body.innerText.includes('You wrote')");
  assert.equal(await evaluate("document.body.innerText.includes('Je la vois.')"), true);
  await cdp("Page.reload");
  await waitFor("document.body.innerText.includes('You wrote')");
  await click("Continue");
  await waitFor("!!document.querySelector('input[placeholder=\"Your answer…\"]')");
  await typeAnswer("My exact ungraded answer");
  await click("Check");
  await waitFor("document.body.innerText.includes('Possible answer · not graded')");
  assert.equal(await evaluate("document.body.innerText.includes('My exact ungraded answer')"), true);
  await screenshot("outage");
  await click("Continue");
  await waitFor("!!document.querySelector('input[placeholder=\"Your answer…\"]')");
  assert.equal(await evaluate("document.body.innerText.includes('Quick follow-up')"), false);
  await click("Hint");
  await waitFor("document.body.innerText.includes('Put the pronoun before the verb.')");
  await click("Reveal");
  await waitFor("document.body.innerText.includes('You wrote')");
  await screenshot("reveal");
  await navigate("/topics/present", "Short rule refresh");
  assert.equal(await evaluate("document.querySelector('details').open"), true);
  await evaluate("document.querySelector('details summary').click()");
  await typeAnswer("Je la vois.");
  await click("Check");
  await waitFor("document.body.innerText.includes('You wrote')");
  await evaluate("document.querySelector('details summary').click()");
  await click("Continue");
  await waitFor("!!document.querySelector('input[placeholder=\"Your answer…\"]')");
  assert.equal(await evaluate("document.querySelector('details').open"), true, "User-expanded refresh stays open after render");
  await navigate("/topics/mixed", "Hints and reveals count as assisted answers");
  await typeAnswer("Je la vois.");
  await click("Check");
  await waitFor("document.body.innerText.includes('You wrote')");
  assert.ok(await evaluate("document.querySelector('.font-medium.text-xs, .text-xs.font-medium')?.textContent"));
  await screenshot("mixed-feedback");
  // Force a stale-tab response once; verify the recovery control reloads saved state.
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `const originalFetch = window.fetch; let conflictOnce = true; window.fetch = async (...args) => { if (conflictOnce && args[0] === '/api/topics/session' && args[1]?.method === 'POST') { conflictOnce = false; return new Response(JSON.stringify({error:'Session changed in another tab. Reload to continue.'}), {status:409,headers:{'content-type':'application/json'}}); } return originalFetch(...args); };` });
  await navigate("/topics/direct-objects", "You wrote");
  await click("End this session");
  await evaluate("new Promise(r => setTimeout(r, 300))");
  assert.equal(await evaluate("document.body.innerText.includes('Reload saved session')"), true);
  await screenshot("conflict");
  await click("Reload saved session");
  await waitFor("!document.querySelector('[role=alert]')");
  // Simulate empty lessons and a failed optional Smart personal queue.
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `const savedFetch = window.fetch; window.fetch = async (...args) => { if (String(args[0]).startsWith('/api/items/session')) return new Response('{}',{status:500}); const response = await savedFetch(...args); if (String(args[0]).startsWith('/api/stats')) { const data = await response.json(); data.learningItemsTotal = 0; return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}}); } return response; };` });
  await navigate("/", "Start with your lesson notes");
  assert.equal(await evaluate("!!document.querySelector('a[href=\"/topics\"]')"), true);
  await screenshot("empty-dashboard");
  await navigate("/practice/smart", "Smart session");
  await waitFor("!!document.querySelector('input') || document.body.innerText.includes('Nothing due')");
  assert.equal(await evaluate("document.body.innerText.includes('Could not load your lesson phrases')"), false);
  await screenshot("smart-fallback");
  console.log("Phone regression checks passed: theory, exact grade/reload, outage/continue, hints/reveal, refresh toggle, mixed feedback, 409 recovery, empty dashboard, Smart optional-fetch failure.");
} finally { ws.close(); }
