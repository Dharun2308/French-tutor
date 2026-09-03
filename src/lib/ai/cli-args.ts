// Argument builders for the CLI providers. Pure, so they can be unit-tested.
//
// Both CLIs have variadic flags (`codex exec -i <FILE>...`, `claude
// --allowedTools <tools...>`) that swallow whatever follows them. The prompt
// must therefore be the LAST argument and must never directly follow a
// variadic flag — a non-variadic flag has to sit in between. Getting this
// wrong fails silently with "No prompt provided" (see tests/cli-args.test.ts).

export const CODEX_VARIADIC = ["-i", "--image"];
export const CLAUDE_VARIADIC = ["--allowedTools", "--allowed-tools", "--disallowedTools"];

/**
 * Extract the message a person can act on from mixed CLI stdout/stderr.
 * Claude emits failures as a one-line JSON result (for example, a session
 * limit), while Codex usually ends stderr with an `ERROR:` line.
 */
export function cliErrorSummary(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^-+$/.test(line));

  const errorLines = lines.filter((line) => /^ERROR:\s*/i.test(line));
  if (errorLines.length > 0) {
    return errorLines[errorLines.length - 1].replace(/^ERROR:\s*/i, "");
  }

  // Claude's --output-format json envelope puts the useful error in `result`.
  // Parse individual lines because stderr may be prepended to stdout.
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const value = JSON.parse(lines[i]) as { result?: unknown; message?: unknown };
      if (typeof value.result === "string" && value.result.trim()) return value.result.trim();
      if (typeof value.message === "string" && value.message.trim()) return value.message.trim();
    } catch {
      // Not a JSON envelope; fall through to the regex/plain-text fallback.
    }
  }

  const match = /"(?:message|result)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  if (match) {
    try {
      return JSON.parse(`"${match[1]}"`) as string;
    } catch {
      return match[1];
    }
  }
  return lines[lines.length - 1] ?? "";
}

export function codexArgs(o: {
  model: string;
  effort: string;
  schemaPath: string;
  outPath: string;
  cwd: string;
  imagePaths: string[];
  prompt: string;
}): string[] {
  return [
    "exec",
    ...o.imagePaths.flatMap((p) => ["-i", p]),
    "-m", o.model,
    "-c", `model_reasoning_effort=${o.effort}`,
    "--output-schema", o.schemaPath,
    "-o", o.outPath,
    "-s", "read-only",
    "--skip-git-repo-check",
    "-C", o.cwd,
    o.prompt,
  ];
}

export function claudeArgs(o: {
  model: string;
  effort: string;
  jsonSchema: Record<string, unknown>;
  maxTurns: number;
  prompt: string;
}): string[] {
  return [
    "-p",
    "--allowedTools", "Read",
    "--output-format", "json",
    "--json-schema", JSON.stringify(o.jsonSchema),
    "--model", o.model,
    "--effort", o.effort,
    "--max-turns", String(o.maxTurns),
    "--no-session-persistence",
    o.prompt,
  ];
}
