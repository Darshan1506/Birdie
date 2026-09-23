// Contracts between settings, the options page and the secret-key rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULTS,
  PUBLIC_DEFAULTS,
  SECRET_KEYS,
  hasAnyAI,
  isConfigured,
} from "../src/shared/settings";

test("every setting has a matching element id in options.html", () => {
  const html = readFileSync("static/options.html", "utf8");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const key of Object.keys(DEFAULTS)) assert.ok(ids.has(key), `options.html has no #${key}`);
});

test("the page-facing settings never include an API key", () => {
  for (const key of SECRET_KEYS) assert.equal(key in PUBLIC_DEFAULTS, false, key);
  assert.ok("provider" in PUBLIC_DEFAULTS);
});

test("provider configuration", () => {
  const none = { ...DEFAULTS };
  assert.equal(hasAnyAI(none), false);
  assert.equal(hasAnyAI({ ...none, groqKey: "k" }), true);
  assert.equal(hasAnyAI({ ...none, provider: "ollama" }), true);
  assert.equal(isConfigured("ollama", none), false);
  assert.equal(isConfigured("ollama", { ...none, ollamaBackup: true }), true);
  assert.equal(isConfigured("claude", { ...none, apiKey: "k" }), true);
});
