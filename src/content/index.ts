// Voice Feed — runs inside x.com. Listens, understands, acts, and talks back.
import { PUBLIC_DEFAULTS, isSecretKey, type PublicSettings } from "../shared/settings";
import { isError } from "../shared/messages";
import { savedTask, runTask } from "./agent";
import { ask } from "./bg";
import { startEar } from "./ear";
import { setRecognitionLang, startListening } from "./listen";
import { initPanel, show, updateMode } from "./panel";
import { hasAI, isSmart, state } from "./state";

declare global {
  interface Window {
    __voiceFeed?: boolean;
  }
}

// Which AI is set up is asked of the background, so this page never handles an API key.
async function refreshStatus(): Promise<void> {
  const res = await ask("status", {});
  if (isError(res)) return;
  state.aiConfigured = res.hasAI;
  state.hasGroq = res.hasGroq;
}

function greet(): void {
  if (!isSmart()) {
    show(
      hasAI()
        ? "Basic mode: AI is off. Say “AI on” to switch, or “help” for commands."
        : "Basic mode: fixed commands, no AI. Say “help” for the list, or add a free Groq key in settings for AI mode.",
    );
    return;
  }
  const { wakeWordEnabled, wakeWord } = state.settings;
  show(
    wakeWordEnabled
      ? `Say “${wakeWord}” and a command. Try “${wakeWord}, read my feed”.`
      : "Just talk to it. Try “what's on my feed?” or “is this true?”",
  );
}

async function boot(): Promise<void> {
  initPanel();
  const stored = (await chrome.storage.local.get(PUBLIC_DEFAULTS)) as PublicSettings;
  state.settings = stored;
  state.speed = Number(stored.scrollSpeed) || 2;
  await refreshStatus();
  startListening();
  void startEar();
  const task = savedTask();
  if (task && isSmart()) setTimeout(() => void runTask(task.goal, task), 1500);
  updateMode();
  greet();

  chrome.storage.onChanged.addListener((changes) => {
    let keysChanged = false;
    for (const [k, { newValue }] of Object.entries(changes)) {
      if (isSecretKey(k)) keysChanged = true; // note that something changed; never keep the value
      else (state.settings as unknown as Record<string, unknown>)[k] = newValue;
    }
    if (changes.scrollSpeed) state.speed = Number(state.settings.scrollSpeed) || 2;
    if (changes.lang) setRecognitionLang(state.settings.lang);
    void (async () => {
      if (keysChanged || changes.provider || changes.ollamaBackup) await refreshStatus();
      if (changes.whisper || keysChanged) void startEar();
      updateMode();
    })();
  });
}

if (!window.__voiceFeed) {
  window.__voiceFeed = true;
  void boot();
}
