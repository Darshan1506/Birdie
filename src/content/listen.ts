// Listening: Web Speech recognition, acting on partial speech, and the Whisper second opinion.
import { isError } from "../shared/messages";
import { ask } from "./bg";
import { act } from "./dispatch";
import { earIsRunning, grabAudio, wavBase64 } from "./ear";
import { bounceBars, idleStatus, setStatus, show, ui } from "./panel";
import { analyze, plainOf, type Analysis } from "./routing";
import { routeEnv, state } from "./state";

// Recognition errors that deserve a human explanation.
const MIC_HELP =
  "Microphone blocked. Click the mic icon at the right end of the address bar, choose Allow, then reload.";
const ERROR_HELP: Record<string, string> = {
  "not-allowed": MIC_HELP,
  "service-not-allowed": MIC_HELP,
  network:
    "Can't reach Google's speech service. Check the internet, turn off any VPN, and use Chrome or Edge.",
  "audio-capture":
    "No microphone found. Plug it in, then pick it at chrome://settings/content/microphone.",
  "language-not-supported": "This language isn't supported. Change it in settings.",
};

const SETTLE_MS = 380; // wait a beat in case more words are coming ("read" → "read replies")
const MAX_RESTART_DELAY_MS = 5000;

let rec: SpeechRecognition | null = null;
let restartDelay = 250;
const handled = new Set<number>(); // result indexes already acted on
const latestText = new Map<number, string>();
const firstHeard = new Map<number, number>();
let settleTimer: ReturnType<typeof setTimeout> | undefined;
let settleIndex = -1;

const analyzeNow = (text: string, forceBasic = false) =>
  analyze(text, routeEnv(), forceBasic);

function shouldWhisper(a: Analysis | null, text: string): boolean {
  return (
    state.settings.aiEnabled !== false &&
    state.settings.whisper &&
    state.hasGroq &&
    earIsRunning() &&
    !!a &&
    ["brain", "text", "text_incomplete", "none"].includes(a.kind) &&
    plainOf(text).split(" ").length >= 3
  );
}

async function whisperThen(a: Analysis | null, audio: Float32Array): Promise<void> {
  setStatus("Listening closely…");
  const res = await ask("transcribe", { audio: wavBase64(audio) });
  const better = isError(res) ? "" : res.text.trim();
  idleStatus();
  if (better.split(/\s+/).length >= 2) {
    ui.heard.textContent = `“${better}”`;
    if (act(analyzeNow(better), true)) return;
  }
  act(a, true);
}

// Acts on partial speech so commands fire the moment you say them,
// instead of waiting for the browser to decide you've finished talking.
function onPartial(i: number, text: string): void {
  if (handled.has(i)) return;
  const a = analyzeNow(text);
  if (!a) return;
  if (a.kind === "intent" && a.name === "stop") {
    handled.add(i);
    clearTimeout(settleTimer);
    act(a, false);
    return;
  }
  if (a.kind === "intent" || a.kind === "confirm") {
    clearTimeout(settleTimer);
    settleIndex = i;
    settleTimer = setTimeout(() => {
      if (handled.has(i)) return;
      const latest = analyzeNow(latestText.get(i) || text);
      if (
        latest &&
        (latest.kind === "intent" || latest.kind === "confirm") &&
        act(latest, false)
      )
        handled.add(i);
    }, SETTLE_MS);
  }
}

function onFinal(i: number, text: string): void {
  if (settleIndex === i) clearTimeout(settleTimer);
  if (handled.has(i)) return;
  handled.add(i);
  const a = analyzeNow(text);
  if (shouldWhisper(a, text)) {
    const began = firstHeard.get(i) ?? performance.now() - 4000;
    const seconds = Math.min(18, (performance.now() - began) / 1000 + 1.5);
    void whisperThen(a, grabAudio(seconds));
    return;
  }
  act(a, true);
}

export function setRecognitionLang(lang: string): void {
  if (!rec) return;
  rec.lang = lang;
  rec.stop(); // onend restarts it with the new language
}

export function startListening(): void {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return setStatus("No speech recognition here. Use Chrome or Edge.");
  const r = new SR();
  rec = r;
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.lang = state.settings.lang;
  r.onresult = (e) => {
    bounceBars();
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript;
      latestText.set(i, text);
      if (!firstHeard.has(i)) firstHeard.set(i, performance.now());
      ui.heard.textContent = `“${text.trim()}”`;
      if (e.results[i].isFinal) onFinal(i, text);
      else onPartial(i, text);
    }
  };
  r.onstart = () => {
    state.micBlocked = false;
    restartDelay = 250;
    handled.clear();
    latestText.clear();
    firstHeard.clear();
    idleStatus();
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      state.micBlocked = true;
      setStatus("Microphone blocked");
    } else if (e.error !== "no-speech" && e.error !== "aborted") {
      restartDelay = Math.min(restartDelay * 2, MAX_RESTART_DELAY_MS);
      setStatus("Problem: " + e.error);
    }
    const why = ERROR_HELP[e.error];
    if (why) show(why);
  };
  r.onend = () => {
    if (state.micBlocked) return;
    setTimeout(() => {
      try {
        r.start();
      } catch {
        /* already running */
      }
    }, restartDelay);
  };
  try {
    r.start();
  } catch {
    /* ignore */
  }
}
