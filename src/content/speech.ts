// Speaking back with the browser's speechSynthesis.
import { idleStatus, show } from "./panel";
import { plainOf } from "./routing";
import { state } from "./state";

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const { voiceName, lang } = state.settings;
  if (voiceName) {
    const v = voices.find((v) => v.name === voiceName);
    if (v) return v;
  }
  const exact = voices.filter((v) => v.lang === lang);
  const pool = exact.length
    ? exact
    : voices.filter((v) => v.lang?.startsWith(lang.split("-")[0]));
  return (
    pool.find((v) => /natural|neural/i.test(v.name)) ||
    pool.find((v) => /online/i.test(v.name)) ||
    pool.find((v) => /google/i.test(v.name)) ||
    pool[0] ||
    null
  );
}

let speakResolve: (() => void) | null = null;

// Speaks sentence by sentence (Chrome cuts long utterances). Resolves when done or cut off.
export function speak(text: string, { display = true } = {}): Promise<void> {
  if (display) show(text);
  shush();
  const chunks = (text.match(/[^.!?\n]+[.!?]*/g) || [text])
    .map((c) => c.trim())
    .filter(Boolean);
  if (!chunks.length) return Promise.resolve();
  state.speaking = true;
  state.speakingPlain = plainOf(text);
  idleStatus();
  const voice = pickVoice();
  return new Promise((resolve) => {
    speakResolve = () => {
      speakResolve = null;
      state.speaking = false;
      state.lastSpeechEnd = Date.now();
      state.speakingPlain = "";
      idleStatus();
      resolve();
    };
    // Brief delay: cancel() and speak() in the same tick drops the first utterance in Chrome.
    setTimeout(() => {
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.rate = state.settings.voiceRate;
        u.lang = state.settings.lang;
        if (voice) u.voice = voice;
        if (i === chunks.length - 1) u.onend = u.onerror = () => speakResolve?.();
        speechSynthesis.speak(u);
      });
    }, 40);
  });
}

export function shush(): void {
  speechSynthesis.cancel();
  speakResolve?.();
}
