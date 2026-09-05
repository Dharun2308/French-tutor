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
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
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
  await writeFile(`/home/multi_mind/snap/chromium/common/shots/language-transfer-${name}.png`, Buffer.from(shot.data, "base64"));
}

try {
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await cdp("Page.navigate", { url: "http://127.0.0.1:8097/topics" });
  await waitFor("!!document.querySelector('a[href=\"/topics/language-transfer\"]')");
  await screenshot("topics-entry");
  await cdp("Page.navigate", { url: "http://127.0.0.1:8097/topics/language-transfer" });
  await waitFor("document.querySelector('audio')?.readyState > 0");
  await evaluate("localStorage.removeItem('french-tutor:language-transfer:v1')");
  await cdp("Page.reload");
  await waitFor("document.querySelector('audio')?.readyState > 0");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].filter(b => /Lesson [0-9]+/.test(b.innerText)).length"), 40);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b => b.innerText === 'Previous').disabled"), true);
  await evaluate("document.querySelector('audio').play()");
  await waitFor("document.querySelector('audio').currentTime > 0.2 && !document.querySelector('audio').paused");
  await evaluate("document.querySelector('audio').pause(); document.querySelector('audio').currentTime = 120");
  await waitFor("JSON.parse(localStorage.getItem('french-tutor:language-transfer:v1')).tracks[1].position >= 120");
  await evaluate("const speed = document.querySelector('select'); speed.value = '1.25'; speed.dispatchEvent(new Event('change', {bubbles:true}))");
  await waitFor("document.querySelector('audio').playbackRate === 1.25");
  await click("Next lesson");
  await waitFor("document.querySelector('audio')?.getAttribute('src') === '/api/language-transfer/2' && document.querySelector('audio').readyState > 0");
  assert.ok(await evaluate("document.querySelector('audio').currentTime < 1"));
  await click("Previous");
  await waitFor("document.querySelector('audio')?.getAttribute('src') === '/api/language-transfer/1' && document.querySelector('audio').currentTime >= 120");
  await cdp("Page.reload");
  await waitFor("document.querySelector('audio')?.currentTime >= 120");
  assert.equal(await evaluate("document.querySelector('audio').playbackRate"), 1.25);
  await screenshot("player-resumed");
  await evaluate("[...document.querySelectorAll('button')].find(b => /Lesson 40(?:\\s|$)/.test(b.innerText)).click()");
  await waitFor("document.querySelector('audio')?.getAttribute('src') === '/api/language-transfer/40' && document.querySelector('audio').readyState > 0");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b => b.innerText === 'Next lesson').disabled"), true);
  await evaluate("document.querySelector('audio').currentTime = document.querySelector('audio').duration - 0.2; document.querySelector('audio').play()");
  await waitFor("document.body.innerText.includes('1/40 listened')");
  await cdp("Page.reload");
  await waitFor("document.querySelector('audio')?.readyState > 0 && document.body.innerText.includes('1/40 listened')");
  assert.equal(await evaluate("document.querySelector('audio').getAttribute('src')"), '/api/language-transfer/40');
  assert.ok(await evaluate("document.querySelector('audio').currentTime < 1"));
  await screenshot("course-completion");
  console.log("Phone audio checks passed: Topics entry, 40 lessons, actual playback, seeking, speed, switch/resume, reload and completion persistence, last-lesson bounds and no horizontal overflow.");
} finally { ws.close(); }
