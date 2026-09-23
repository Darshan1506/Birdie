// Every AI network call lives here, so API keys never leave the background worker.
import {
  DEFAULTS,
  isConfigured,
  type Provider,
  type Settings,
} from "../shared/settings";
import type { Source } from "../shared/messages";

export interface LLMRequest {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  search?: boolean; // let the model search the web, where the provider supports it
  deep?: boolean; // use the slower, smarter Claude model
  json?: boolean; // ask for a JSON object
}
export interface LLMResult {
  text: string;
  lastText?: string; // Claude with web search: the final answer block
  sources: Source[];
  via?: Provider;
}

const REQUEST_TIMEOUT_MS = 30_000;

export const getSettings = (): Promise<Settings> =>
  chrome.storage.local.get(DEFAULTS) as Promise<Settings>;

// A hung provider must not block the fallback chain, so every call has a deadline.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError")
      throw new Error("The AI took too long to answer.");
    throw err;
  }
}

// Provider responses are untyped JSON from third parties; callers pick out what they need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJSON(res: Response): Promise<any> {
  const text = await res.text();
  let data: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    if (res.status === 429)
      throw new Error("Free limit reached for now. Wait a minute and try again.");
    if (res.status === 403 && /ollama|localhost|127\.0\.0\.1/i.test(res.url))
      throw new Error(
        "Ollama blocked the request. See the README: set OLLAMA_ORIGINS.",
      );
    const msg =
      data?.error?.message || data?.error || text.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

async function pickGroqModel(key: string): Promise<string> {
  const res = await fetchWithTimeout("https://api.groq.com/openai/v1/models", {
    headers: { authorization: `Bearer ${key}` },
  });
  const ids: string[] = ((await readJSON(res)).data || []).map(
    (m: { id: string }) => m.id,
  );
  const usable = ids.filter(
    (id) => !/whisper|guard|tts|orpheus|prompt-guard|compound|safeguard/i.test(id),
  );
  const prefs = [/gpt-oss-120b/, /gpt-oss-20b/, /kimi/i, /llama-4/i, /qwen/i, /llama/i];
  for (const p of prefs) {
    const hit = usable.find((id) => p.test(id));
    if (hit) return hit;
  }
  if (usable[0]) return usable[0];
  throw new Error("No usable Groq model found.");
}

async function callGroq(s: Settings, r: LLMRequest): Promise<LLMResult> {
  const ask = async (model: string, extras: Record<string, unknown>) => {
    const res = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${s.groqKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: Math.max(r.maxTokens ?? 1000, 2048),
          temperature: 0.6,
          ...extras,
          ...(r.json ? { response_format: { type: "json_object" } } : {}),
          messages: [{ role: "system", content: r.system }, ...r.messages],
        }),
      },
    );
    return readJSON(res);
  };
  const extrasFor = (m: string) =>
    /gpt-oss/.test(m) ? { reasoning_effort: "low" } : {};
  let model = s.groqModel || DEFAULTS.groqModel;
  let data;
  try {
    data = await ask(model, extrasFor(model));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/reasoning/i.test(message)) {
      data = await ask(model, {}); // model doesn't take reasoning settings
    } else if (
      /does not exist|decommissioned|not found|no access|deprecated/i.test(message)
    ) {
      // Groq retired the model: pick a current one automatically and remember it.
      model = await pickGroqModel(s.groqKey);
      await chrome.storage.local.set({ groqModel: model });
      data = await ask(model, extrasFor(model));
    } else throw e;
  }
  return { text: (data.choices?.[0]?.message?.content || "").trim(), sources: [] };
}

async function callGemini(s: Settings, r: LLMRequest): Promise<LLMResult> {
  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: r.system }] },
    contents: r.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: { maxOutputTokens: Math.max(r.maxTokens ?? 1000, 2048) },
  };
  if (r.search) body.tools = [{ google_search: {} }];
  const model = encodeURIComponent(s.geminiModel || DEFAULTS.geminiModel);
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": s.geminiKey },
      body: JSON.stringify(body),
    },
  );
  const data = await readJSON(res);
  const cand = data.candidates?.[0];
  const text = ((cand?.content?.parts || []) as { text?: string; thought?: boolean }[])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join("")
    .trim();
  const sources: Source[] = (
    (cand?.groundingMetadata?.groundingChunks || []) as {
      web?: { uri: string; title?: string };
    }[]
  )
    .map((c) => c.web)
    .filter((w): w is { uri: string; title?: string } => !!w)
    .map((w) => ({ url: w.uri, title: w.title || w.uri }));
  return { text, sources: sources.slice(0, 5) };
}

async function callOllama(s: Settings, r: LLMRequest): Promise<LLMResult> {
  const base = (s.ollamaUrl || DEFAULTS.ollamaUrl).replace(/\/$/, "");
  const res = await fetchWithTimeout(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: s.ollamaModel || DEFAULTS.ollamaModel,
      stream: false,
      ...(r.json ? { format: "json" } : {}),
      messages: [{ role: "system", content: r.system }, ...r.messages],
    }),
  }).catch((e: unknown) => {
    if (e instanceof Error && /too long/.test(e.message)) throw e;
    throw new Error("Can't reach Ollama. Is it running?");
  });
  const data = await readJSON(res);
  return { text: (data.message?.content || "").trim(), sources: [] };
}

async function callClaude(s: Settings, r: LLMRequest): Promise<LLMResult> {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": s.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: r.deep ? s.model || DEFAULTS.model : s.brainModel || DEFAULTS.brainModel,
      max_tokens: r.maxTokens ?? 1000,
      system: r.system,
      messages: r.messages,
      ...(r.search
        ? {
            tools: [
              { type: "web_search_20250305", name: "web_search", max_uses: r.deep ? 3 : 2 },
            ],
          }
        : {}),
    }),
  });
  const data = await readJSON(res);
  const blocks = ((data.content || []) as {
    type: string;
    text: string;
    citations?: { url?: string; title?: string }[];
  }[]).filter((b) => b.type === "text");
  const sources: Source[] = [];
  for (const b of blocks)
    for (const c of b.citations || [])
      if (c.url && !sources.some((x) => x.url === c.url))
        sources.push({ url: c.url, title: c.title || c.url });
  // With web search the final answer is in the last text blocks.
  return {
    text: blocks.map((b) => b.text).join("").trim(),
    lastText: blocks.at(-1)?.text || "",
    sources: sources.slice(0, 5),
  };
}

const PROVIDERS: Record<Provider, (s: Settings, r: LLMRequest) => Promise<LLMResult>> = {
  groq: callGroq,
  gemini: callGemini,
  ollama: callOllama,
  claude: callClaude,
};

const NO_WEB_NOTE =
  "\n\nNote: you have no web access right now. Answer from what you know, and say plainly when you're unsure or when something may be too recent for you to know.";

const ORDER: Provider[] = ["groq", "gemini", "claude", "ollama"];

// Main provider first, then any other configured one, so a busy or broken AI never stops you.
export function providerChain(s: Settings): Provider[] {
  const rest = s.autoBackup ? ORDER.filter((n) => n !== s.provider) : [];
  return [s.provider, ...rest].filter((n) => isConfigured(n, s));
}

export async function callLLM(req: LLMRequest): Promise<LLMResult> {
  const s = await getSettings();
  const chain = providerChain(s);
  if (!chain.length) throw new Error("NO_KEY");
  let firstErr: unknown = null;
  for (const name of chain) {
    // Providers without web search: tell the model, so it doesn't pretend to have searched.
    const noWeb = req.search && (name === "groq" || name === "ollama");
    try {
      const out = await PROVIDERS[name](s, {
        ...req,
        system: noWeb ? req.system + NO_WEB_NOTE : req.system,
      });
      if (!out.text) throw new Error("empty reply");
      return { ...out, via: name };
    } catch (err) {
      // Report the main provider's failure: it's the one the user configured.
      firstErr ??= err;
    }
  }
  throw firstErr;
}

// Whisper on Groq: more accurate speech-to-text, especially for Indian accents and Hinglish.
export async function transcribe(audioBase64: string): Promise<string> {
  const s = await getSettings();
  if (!s.groqKey) throw new Error("NO_KEY");
  const bin = Uint8Array.from(atob(audioBase64), (ch) => ch.charCodeAt(0));
  const form = new FormData();
  form.append("file", new Blob([bin], { type: "audio/wav" }), "speech.wav");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "json");
  form.append("temperature", "0");
  const lang = (s.lang || "en-US").split("-")[0];
  if (lang) form.append("language", lang);
  form.append(
    "prompt",
    "Voice commands for X (Twitter): like, reply saying, send a DM to, follow, bookmark.",
  );
  const res = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    { method: "POST", headers: { authorization: `Bearer ${s.groqKey}` }, body: form },
  );
  const data = await readJSON(res);
  return (data.text || "").trim();
}
