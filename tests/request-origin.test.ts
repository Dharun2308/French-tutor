import assert from "node:assert/strict";
import { test } from "node:test";
import { allowsRequestOrigin } from "../src/lib/request-origin";

const request = (headers: Record<string, string>, method = "POST") =>
  new Request("http://127.0.0.1:8095/api/settings", { method, headers });

test("browser mutations require this app's origin, including the private phone proxy", () => {
  assert.equal(allowsRequestOrigin(request({ origin: "http://127.0.0.1:8095" })), true);
  assert.equal(allowsRequestOrigin(request({ origin: "https://tutor.example", "x-forwarded-host": "tutor.example" })), true);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(allowsRequestOrigin(request({ origin: "https://unrelated.example", "content-type": "text/plain" }, method)), false);
    assert.equal(allowsRequestOrigin(request({ "sec-fetch-site": "cross-site" }, method)), false);
    assert.equal(allowsRequestOrigin(request({ origin: "null" }, method)), false);
    assert.equal(allowsRequestOrigin(request({ origin: "http://127.0.0.1:8096" }, method)), false);
  }
});

test("local workers and read-only requests continue to work", () => {
  assert.equal(allowsRequestOrigin(request({})), true);
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(allowsRequestOrigin(request({ origin: "https://unrelated.example" }, method)), true);
  }
});
