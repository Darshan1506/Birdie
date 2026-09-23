// The AI plumbing: JSON extraction, the provider fallback chain, timeouts and error reporting.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, type Settings } from "../src/shared/settings";
import { extractJSON } from "../src/background/json";
import { callLLM, fetchWithTimeout, providerChain, readJSON } from "../src/background/llm";

const g = globalThis as unknown as Record<string, unknown>;
let stored: Partial<Settings> = {};

function mockFetch(handler: (url: string) => Response) {
  g.fetch = async (url: string) => handler(String(url));
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const geminiOk = (text: string) =>
  json({ candidates: [{ content: { parts: [{ text }] } }] });

beforeEach(() => {
  stored = {};
  g.chrome = {
    storage: {
      local: { get: async () => ({ ...DEFAULTS, ...stored }), set: async () => {} },
    },
  };
});

const req = { system: "s", messages: [{ role: "user" as const, content: "hi" }] };

test("extractJSON copes with fences and surrounding prose", () => {
  assert.deepEqual(extractJSON('```json\n{"say":"hi","actions":[]}\n```'), {
    say: "hi",
    actions: [],
  });
  assert.deepEqual(extractJSON('Sure! {"a":1} hope that helps'), { a: 1 });
  assert.equal(extractJSON("no json here"), null);
  assert.equal(extractJSON("{broken"), null);
  assert.equal(extractJSON("[1,2]"), null);
});

test("providerChain: main first, backups only if enabled and configured", () => {
  const s = { ...DEFAULTS, groqKey: "a", geminiKey: "b", apiKey: "c" };
  assert.deepEqual(providerChain(s), ["groq", "gemini", "claude"]);
  assert.deepEqual(providerChain({ ...s, provider: "gemini" }), ["gemini", "groq", "claude"]);
  assert.deepEqual(providerChain({ ...s, autoBackup: false }), ["groq"]);
  assert.deepEqual(providerChain({ ...s, ollamaBackup: true }), [
    "groq", "gemini", "claude", "ollama",
  ]);
  assert.deepEqual(providerChain(DEFAULTS), []);
});

test("callLLM falls back to the next provider when the first fails", async () => {
  stored = { groqKey: "a", geminiKey: "b" };
  mockFetch((url) =>
    url.includes("groq.com") ? json({ error: { message: "boom" } }, 500) : geminiOk("from gemini"),
  );
  const out = await callLLM(req);
  assert.equal(out.text, "from gemini");
  assert.equal(out.via, "gemini");
});

test("callLLM reports the main provider's error when everything fails", async () => {
  stored = { groqKey: "a", geminiKey: "b" };
  mockFetch((url) =>
    url.includes("groq.com")
      ? json({ error: { message: "bad groq key" } }, 401)
      : json({ error: { message: "gemini down" } }, 500),
  );
  await assert.rejects(callLLM(req), /bad groq key/);
});

test("callLLM throws NO_KEY when nothing is configured", async () => {
  await assert.rejects(callLLM(req), /NO_KEY/);
});

test("an empty answer counts as a failure and moves on", async () => {
  stored = { groqKey: "a", geminiKey: "b" };
  mockFetch((url) =>
    url.includes("groq.com") ? json({ choices: [{ message: { content: "" } }] }) : geminiOk("ok"),
  );
  assert.equal((await callLLM(req)).via, "gemini");
});

test("a hung request times out instead of blocking forever", async () => {
  g.fetch = (_url: string, init: RequestInit) =>
    new Promise((_res, rej) =>
      init.signal?.addEventListener("abort", () => rej(init.signal?.reason)),
    );
  // Node unrefs AbortSignal.timeout timers, so keep the event loop alive while we wait.
  const keepAlive = setTimeout(() => {}, 1000);
  await assert.rejects(fetchWithTimeout("https://example.test", {}, 20), /too long/);
  clearTimeout(keepAlive);
});

test("readJSON gives friendly errors for rate limits", async () => {
  await assert.rejects(readJSON(json({}, 429)), /Free limit reached/);
});
