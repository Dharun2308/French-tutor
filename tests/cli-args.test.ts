import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claudeArgs,
  cliErrorSummary,
  codexArgs,
  CLAUDE_VARIADIC,
  CODEX_VARIADIC,
} from "../src/lib/ai/cli-args";

/** The prompt is last, and no variadic flag's value list runs into it. */
function assertPromptSafe(args: string[], prompt: string, variadic: string[]) {
  assert.equal(args[args.length - 1], prompt, "prompt must be the final argument");
  for (let i = 0; i < args.length - 1; i++) {
    if (!variadic.includes(args[i])) continue;
    // walk past this flag's values; the first thing after them must be another flag
    let j = i + 1;
    while (j < args.length && !args[j].startsWith("-")) j++;
    assert.ok(
      j < args.length - 1,
      `variadic ${args[i]} at ${i} would swallow the prompt (values run to the end)`
    );
  }
}

test("codex: prompt survives with images (the -i … variadic)", () => {
  const prompt = "System text\n\nUser text";
  const args = codexArgs({
    model: "gpt-5.6-terra", effort: "low", schemaPath: "/t/s.json", outPath: "/t/o.json",
    cwd: "/t", imagePaths: ["/u/1/0.jpg", "/u/1/1.jpg"], prompt,
  });
  assertPromptSafe(args, prompt, CODEX_VARIADIC);
  assert.equal(args[0], "exec");
  assert.deepEqual(args.slice(1, 5), ["-i", "/u/1/0.jpg", "-i", "/u/1/1.jpg"]);
  assert.ok(args.includes("--skip-git-repo-check"));
});

test("codex: text-only has no -i and still ends with the prompt", () => {
  const args = codexArgs({ model: "m", effort: "low", schemaPath: "s", outPath: "o", cwd: "c", imagePaths: [], prompt: "p" });
  assert.ok(!args.includes("-i"));
  assertPromptSafe(args, "p", CODEX_VARIADIC);
});

test("claude: --allowedTools never precedes the prompt directly", () => {
  const prompt = "Read the images…";
  const args = claudeArgs({ model: "sonnet", effort: "medium", jsonSchema: { type: "object" }, maxTurns: 4, prompt });
  assertPromptSafe(args, prompt, CLAUDE_VARIADIC);
  assert.equal(args[0], "-p");
  assert.ok(args.includes("--effort") && args[args.indexOf("--effort") + 1] === "medium");
});

test("the guard itself catches the original bug shape", () => {
  assert.throws(() => assertPromptSafe(["-p", "--allowedTools", "Read", "prompt"], "prompt", CLAUDE_VARIADIC));
  assert.throws(() => assertPromptSafe(["exec", "-m", "x", "-i", "a.png", "prompt"], "prompt", CODEX_VARIADIC));
});

test("CLI errors expose Claude's useful JSON result instead of the envelope", () => {
  const envelope = JSON.stringify({
    is_error: true,
    terminal_reason: "api_error",
    api_error_status: 429,
    result: "You've hit your session limit · resets 10pm (America/Denver)",
  });
  assert.equal(
    cliErrorSummary(`diagnostic on stderr\n${envelope}\n`),
    "You've hit your session limit · resets 10pm (America/Denver)"
  );
});

test("CLI errors continue to prefer Codex's final ERROR line", () => {
  assert.equal(
    cliErrorSummary("ERROR: transient token refresh\nnoise\nERROR: usage limit reached\n"),
    "usage limit reached"
  );
});
