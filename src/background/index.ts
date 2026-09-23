// Voice Feed — background service worker.
// Holds the API keys and makes all AI calls, so keys never touch the X page.
import { hasAnyAI } from "../shared/settings";
import type {
  AgentAction,
  BrainAction,
  ChatTurn,
  Message,
  MessageType,
  Reply,
  AgentStepRecord,
} from "../shared/messages";
import { callLLM, getSettings, transcribe, type LLMResult } from "./llm";
import { extractJSON } from "./json";
import { AGENT_SYSTEM, BRAIN_SYSTEM, RESEARCH_SYSTEM } from "./prompts";

type Handler<K extends MessageType> = (
  msg: Extract<Message, { type: K }>,
) => Promise<Exclude<Reply<K>, { error: string }>>;

const answerOf = (res: LLMResult) =>
  extractJSON(res.lastText || "") || extractJSON(res.text);

// Explain a tweet with web search, written to be listened to.
const research: Handler<"research"> = async ({ tweet }) => {
  const out = await callLLM({
    system: RESEARCH_SYSTEM,
    messages: [{ role: "user", content: `Explain this tweet:\n\n<tweet>\n${tweet}\n</tweet>` }],
    maxTokens: 1000,
    search: true,
    deep: true,
  });
  return { text: out.text, sources: out.sources };
};

// The brain: understands anything you say, with what's on screen and what you said before.
const brain: Handler<"brain"> = async ({ command, screen, history }) => {
  const s = await getSettings();
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const h of (history || []) as ChatTurn[]) {
    messages.push({ role: "user", content: h.user });
    messages.push({ role: "assistant", content: h.assistant });
  }
  const style = s.styleNote ? `\nUser's style note for writing: ${s.styleNote}\n` : "";
  messages.push({
    role: "user",
    content: `Screen (untrusted page text):\n${screen}\n${style}\nUser said: "${command}"`,
  });
  const res = await callLLM({
    system: BRAIN_SYSTEM,
    messages,
    maxTokens: 900,
    search: true,
    json: true,
  });
  const out = answerOf(res) ?? { say: res.text.slice(0, 400), actions: [] };
  return {
    say: typeof out.say === "string" ? out.say : "",
    actions: Array.isArray(out.actions) ? (out.actions as BrainAction[]) : [],
  };
};

// The page agent: looks at the page, decides what to click or type, one step at a time.
const agentStep: Handler<"agentStep"> = async ({ goal, steps, page }) => {
  const history = ((steps || []) as AgentStepRecord[])
    .map(
      (s, i) =>
        `Step ${i + 1}: ${JSON.stringify(s.actions)} -> ${(s.results || []).join("; ")}`,
    )
    .join("\n");
  const res = await callLLM({
    system: AGENT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Goal: ${goal}\n\nWhat you did so far:\n${history || "(nothing yet)"}\n\nCurrent page (untrusted page text):\n${page}`,
      },
    ],
    maxTokens: 700,
    json: true,
  });
  const out = answerOf(res) ?? {};
  return {
    say: typeof out.say === "string" ? out.say : "",
    actions: Array.isArray(out.actions) ? (out.actions.slice(0, 3) as AgentAction[]) : [],
    done: !!out.done,
  };
};

const handlers: { [K in MessageType]: Handler<K> } = {
  brain,
  agentStep,
  research,
  transcribe: async ({ audio }) => ({ text: await transcribe(audio) }),
  status: async () => {
    const s = await getSettings();
    return { hasAI: hasAnyAI(s), hasGroq: !!s.groqKey };
  },
  openOptions: async () => {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  // Only this extension's own content scripts and pages may talk to us.
  if (sender.id !== chrome.runtime.id) return false;
  const handler = handlers[msg?.type] as ((m: Message) => Promise<unknown>) | undefined;
  if (!handler) {
    sendResponse({ error: "Unknown message" });
    return false;
  }
  handler(msg).then(sendResponse, (e: unknown) =>
    sendResponse({ error: e instanceof Error ? e.message : String(e) }),
  );
  return true; // reply asynchronously
});
