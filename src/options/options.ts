// Settings page. Every key in DEFAULTS must have an element with the same id in options.html.
import { DEFAULTS, type Settings } from "../shared/settings";

type FormEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const keys = Object.keys(DEFAULTS) as (keyof Settings)[];

function el<T extends HTMLElement = FormEl>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`options.html is missing #${id}`);
  return found as T;
}

// Blank required fields fall back to the defaults instead of saving an empty model name.
const REQUIRED_TEXT = [
  "model", "brainModel", "groqModel", "geminiModel", "ollamaModel", "ollamaUrl", "wakeWord",
] as const;

function read(): Settings {
  const out: Record<string, unknown> = {};
  for (const id of keys) {
    const input = el(id);
    if (input instanceof HTMLInputElement && input.type === "checkbox") out[id] = input.checked;
    else if (input instanceof HTMLInputElement && input.type === "range")
      out[id] = Number(input.value);
    else out[id] = input.value.trim();
  }
  for (const k of REQUIRED_TEXT) if (!out[k]) out[k] = DEFAULTS[k];
  return out as unknown as Settings;
}

function fill(s: Settings): void {
  for (const id of keys) {
    const input = el(id);
    if (input instanceof HTMLInputElement && input.type === "checkbox")
      input.checked = !!s[id];
    else input.value = String(s[id]);
  }
}

function showProvider(): void {
  const chosen = el("provider").value;
  for (const d of document.querySelectorAll<HTMLElement>("[data-for]"))
    d.classList.toggle("active", d.dataset.for === chosen);
}
function labels(): void {
  el("scrollSpeedVal").textContent = el("scrollSpeed").value;
  el("voiceRateVal").textContent = Number(el("voiceRate").value).toFixed(2) + "×";
}

async function save(): Promise<void> {
  await chrome.storage.local.set(read());
  el("saved").textContent = "Saved";
  setTimeout(() => (el("saved").textContent = ""), 1500);
}

function fillVoices(selected: string): void {
  const sel = el<HTMLSelectElement>("voiceName");
  const nice = (v: SpeechSynthesisVoice) => Number(/natural|online|neural/i.test(v.name));
  const voices = speechSynthesis
    .getVoices()
    .slice()
    .sort((a, b) => nice(b) - nice(a) || a.lang.localeCompare(b.lang));
  sel.length = 1; // keep "Automatic"
  for (const v of voices) {
    const o = document.createElement("option");
    o.value = v.name;
    o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  }
  sel.value = selected || "";
}

async function init(): Promise<void> {
  const s = (await chrome.storage.local.get(DEFAULTS)) as Settings;
  fillVoices(s.voiceName);
  fill(s);
  labels();
  showProvider();

  speechSynthesis.onvoiceschanged = async () =>
    fillVoices(((await chrome.storage.local.get(DEFAULTS)) as Settings).voiceName);
  el("tryVoice").addEventListener("click", () => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Here's the next tweet. Say like, next, or explain.");
    const v = speechSynthesis.getVoices().find((v) => v.name === el("voiceName").value);
    if (v) u.voice = v;
    u.rate = Number(el("voiceRate").value);
    speechSynthesis.speak(u);
  });
  el("provider").addEventListener("change", showProvider);
  for (const id of keys) el(id).addEventListener("change", () => void save());
  for (const id of ["scrollSpeed", "voiceRate"]) el(id).addEventListener("input", labels);
  el("save").addEventListener("click", () => void save());
}

void init();
