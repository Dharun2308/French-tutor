// Run only with an isolated test app on :8097 and a disposable Chrome on :9236.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const tabs = await (await fetch("http://127.0.0.1:9236/json")).json();
const ws = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
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
async function waitFor(expression, timeout = 180000) {
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
  await writeFile(`/home/multi_mind/snap/chromium/common/shots/topics-${name}.png`, Buffer.from(shot.data, "base64"));
}
try {
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await cdp("Page.navigate", { url: "http://127.0.0.1:8097/" });
  await waitFor("document.querySelector('a[href=\"/topics\"]') !== null");
  assert.equal(await evaluate("document.body.innerText.includes('Woven into your Focus')"), false);
  await screenshot("dashboard");
  await cdp("Page.navigate", { url: "http://127.0.0.1:8097/topics" });
  await waitFor("document.body.innerText.includes('Definite articles')");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  await screenshot("list");
  await cdp("Page.navigate", { url: "http://127.0.0.1:8097/topics/direct-objects" });
  await waitFor("document.body.innerText.includes('Learn this topic')");
  await screenshot("detail");
  await click("Learn this topic");
  await waitFor("document.body.innerText.includes('I understand · start practice')");
  await screenshot("theory");
  await click("I understand · start practice");
  await waitFor("document.querySelector('input[placeholder=\"Your answer…\"]') !== null");
  await screenshot("question");
  await evaluate(`(() => { const input = document.querySelector('input[placeholder="Your answer…"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Je regarde lui.'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("Check");
  await waitFor("document.body.innerText.includes('You wrote')");
  assert.equal(await evaluate("document.body.innerText.includes('Je regarde lui.')"), true);
  await screenshot("feedback");
  await cdp("Page.reload");
  await waitFor("document.body.innerText.includes('You wrote')");
  assert.equal(await evaluate("document.body.innerText.includes('Je regarde lui.')"), true);
  await click("Practice a similar question");
  await waitFor("document.body.innerText.includes('Quick follow-up') && !document.body.innerText.includes('You wrote')");
  await click("Reveal");
  await waitFor("document.body.innerText.includes('You wrote')");
  await screenshot("reveal");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  console.log("Phone browser checks passed: dashboard entry, topics, theory, question, typing, grading, submitted answer, reload persistence, follow-up and reveal.");
} finally {
  ws.close();
}
