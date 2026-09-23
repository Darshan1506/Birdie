// The page agent: does anything on X, step by step, by looking at the page and acting on it.
// Limits (PRD S-4): 12 rounds, 3 actions per round, x.com paths only. Risky steps need a spoken yes.
import type { AgentAction, AgentStepRecord } from "../shared/messages";
import { isError } from "../shared/messages";
import { ask } from "./bg";
import { $, $$, isVisible, pressKey, sleep, typeInto } from "./dom";
import { spaNav } from "./nav";
import { ack, idleStatus, setStatus, show } from "./panel";
import { needsConfirmation, pressNeedsConfirmation } from "./safety";
import { speak } from "./speech";
import { state } from "./state";

const MAX_ROUNDS = 12;
const RESUME_WINDOW_MS = 120_000;
const TASK_KEY = "voiceFeedTask";

const CLICKABLE =
  'a[href], button, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], ' +
  '[role="switch"], [role="checkbox"], [role="radio"], input:not([type="hidden"]), textarea, select, ' +
  '[contenteditable="true"], [role="textbox"], [role="combobox"]';

// Numbered elements from the last describePage(); the model refers to them by id.
let agentEls: HTMLElement[] = [];

function labelOf(el: HTMLElement): string {
  let label =
    el.getAttribute("aria-label") ||
    el.innerText ||
    el.getAttribute("placeholder") ||
    el.getAttribute("title") ||
    el.getAttribute("alt") ||
    "";
  label = label.replace(/\s+/g, " ").trim().slice(0, 80);
  const testid = el.getAttribute("data-testid");
  if (!label && testid) label = testid;
  if ("value" in el && el.value && el.tagName !== "BUTTON")
    label += ` (contains: "${String((el as HTMLInputElement).value).slice(0, 40)}")`;
  return label;
}

function roleOf(el: HTMLElement): string {
  const r = el.getAttribute("role");
  if (r) return r;
  if (el.isContentEditable) return "textbox";
  const t = el.tagName.toLowerCase();
  if (t === "a") return "link";
  if (t === "input") return `input:${(el as HTMLInputElement).type || "text"}`;
  return t;
}

// A text snapshot of the page for the model: URL, visible text, numbered interactive elements.
function describePage(): string {
  const dialogs = $$('[role="dialog"]').filter(isVisible);
  const root: ParentNode = dialogs.at(-1) || document;
  agentEls = [];
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>(CLICKABLE)) {
    if (!isVisible(el)) continue;
    const label = labelOf(el);
    if (!label) continue;
    const role = roleOf(el);
    const href = el.getAttribute("href");
    const key = `${role}|${label}|${href || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    agentEls.push(el);
    lines.push(
      `[${agentEls.length}] ${role} "${label}"${href?.startsWith("/") ? ` -> ${href}` : ""}`,
    );
    if (agentEls.length >= 100) break;
  }
  const textRoot =
    dialogs.at(-1) || $('[data-testid="primaryColumn"]') || $("main") || document.body;
  const text = (textRoot.innerText || "").replace(/\n{2,}/g, "\n").slice(0, 2500);
  const dialogNote = dialogs.length
    ? "A popup/dialog is open (elements below are inside it).\n"
    : "";
  return (
    `URL: ${location.pathname}${location.search}\n${dialogNote}` +
    `Visible text:\n${text}\n\nElements:\n${lines.join("\n") || "(none)"}`
  );
}

// Asks out loud and waits for yes/no. "stop" or any other command resolves it false.
function confirmAgent(label: string): Promise<boolean> {
  return new Promise((resolve) => {
    state.pending = { kind: "agent", resolve };
    const what = state.lastTyped ? `${label}: ${state.lastTyped}` : label;
    void speak(`About to press ${what}. Should I?`);
    idleStatus();
  });
}

const CANCELLED = "CANCELLED";

async function doAgentAction(a: AgentAction): Promise<string> {
  if (a.go) {
    spaNav(String(a.go));
    await sleep(1200);
    return `went to ${a.go}`;
  }
  if (a.scroll) {
    scrollBy({ top: (a.scroll === "up" ? -1 : 1) * innerHeight * 0.8, behavior: "smooth" });
    await sleep(700);
    return `scrolled ${a.scroll}`;
  }
  if (a.wait) {
    await sleep(Math.min(Number(a.wait) || 800, 3000));
    return "waited";
  }
  if (a.press) {
    const key = String(a.press);
    const active = document.activeElement as HTMLElement | null;
    const field = { tag: active?.tagName.toLowerCase() ?? "", editable: !!active?.isContentEditable };
    if (pressNeedsConfirmation(key, field) && !(await confirmAgent("Enter")))
      return CANCELLED;
    pressKey(key);
    return `pressed ${key}`;
  }
  const id = a.click ?? a.type;
  const el = agentEls[Number(id) - 1];
  if (!el || !el.isConnected) return `element [${id}] not found`;
  const label = labelOf(el);
  if (a.click != null) {
    if (needsConfirmation(label) && !(await confirmAgent(label))) return CANCELLED;
    el.scrollIntoView({ block: "center" });
    el.click();
    return `clicked [${id}] "${label}"`;
  }
  const text = String(a.text ?? "");
  await typeInto(el, text, !!a.clear);
  state.lastTyped = text;
  return `typed "${text.slice(0, 60)}" into [${id}]`;
}

interface Task {
  goal: string;
  steps: AgentStepRecord[];
  t: number;
}

function saveTask(task: Task): void {
  try {
    sessionStorage.setItem(TASK_KEY, JSON.stringify(task));
  } catch {
    /* optional */
  }
}
function endTask(): void {
  try {
    sessionStorage.removeItem(TASK_KEY);
  } catch {
    /* optional */
  }
  state.lastTyped = "";
  idleStatus();
}

// A task interrupted by an unexpected reload can carry on if it is recent.
export function savedTask(): Task | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(TASK_KEY) || "null") as Task | null;
    if (t && Date.now() - t.t < RESUME_WINDOW_MS) return t;
    sessionStorage.removeItem(TASK_KEY);
  } catch {
    /* ignore */
  }
  return null;
}

export async function runTask(goal: string, resume: Task | null = null): Promise<void> {
  if (!goal) return ack("What should I do?", false);
  const my = state.runId;
  state.feedMode = false;
  state.scrolling = false;
  const task: Task = resume ?? { goal, steps: [], t: Date.now() };
  state.lastTyped = "";
  ack("🤖 On it");
  show(`Working on: ${task.goal}`);
  for (let i = task.steps.length; i < MAX_ROUNDS; i++) {
    if (state.runId !== my) return endTask();
    setStatus(`Working… step ${i + 1}`);
    saveTask(task);
    await sleep(600);
    const res = await ask("agentStep", {
      goal: task.goal,
      steps: task.steps,
      page: describePage(),
    });
    if (state.runId !== my) return endTask();
    if (isError(res)) {
      endTask();
      return speak("That didn't work: " + res.error);
    }
    const results: string[] = [];
    for (const a of res.actions) {
      if (state.runId !== my) return endTask();
      const r = await doAgentAction(a);
      results.push(r);
      if (r === CANCELLED) {
        endTask();
        return ack("✕ Cancelled", false);
      }
      await sleep(600);
    }
    if (!res.actions.length) results.push("no action taken");
    task.steps.push({ actions: res.actions, results });
    if (res.done) {
      endTask();
      return res.say ? speak(res.say) : ack("✓ Done");
    }
  }
  endTask();
  return speak("I couldn't finish that one. Try saying it a different way.");
}
