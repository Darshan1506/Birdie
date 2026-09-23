// The floating panel (Shadow DOM, so X's CSS can't touch it), plus instant feedback: blip and badge.
import type { Source } from "../shared/messages";
import { isSmart, state } from "./state";

const PANEL_HTML = `
  <style>
    :host { all: initial; }
    .panel {
      --bg:#ffffff; --ink:#1b2330; --muted:#5c6878; --line:#d9dee6; --signal:#0a7cff; --warn:#c2410c; --soft:#eef4ff;
      position: fixed; left: 16px; bottom: 16px; z-index: 2147483647;
      width: 310px; max-height: 62vh; display: flex; flex-direction: column;
      background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 14px;
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 6px 24px rgba(15,25,40,.14); overflow: hidden;
    }
    @media (prefers-color-scheme: dark) {
      .panel { --bg:#16202b; --ink:#e7ecf2; --muted:#9aa6b4; --line:#2c3a48; --signal:#4da3ff; --warn:#fb923c; --soft:#1d2d40; }
    }
    .panel.hidden { display: none; }
    .head { display:flex; align-items:center; gap:10px; padding:10px 12px; border-bottom:1px solid var(--line); position:relative; }
    .wave { display:flex; align-items:center; gap:3px; height:18px; }
    .wave i { width:3px; height:6px; border-radius:2px; background:var(--muted); transition: height .08s; }
    .on .wave i { background: var(--signal); }
    .blocked .wave i { background: var(--warn); }
    .status { font-weight: 600; flex: 1; }
    .mode { font-size:11px; font-weight:600; padding:1px 8px; border-radius:999px; border:1px solid var(--line); color:var(--muted); }
    .mode.ai { color: var(--signal); border-color: var(--signal); }
    .toast { position:absolute; right:10px; top:8px; padding:3px 10px; border-radius:999px; background:var(--signal);
             color:#fff; font-weight:700; font-size:13px; opacity:0; transform: translateY(-4px); transition: opacity .15s, transform .15s; }
    .toast.show { opacity:1; transform:none; }
    .toast.miss { background: var(--muted); }
    .body { padding:10px 12px; overflow-y:auto; }
    .heard { color:var(--muted); font-size:13px; min-height:1.4em; }
    .said { margin-top:6px; white-space:pre-wrap; }
    .said:empty { display:none; }
    .sources { margin:8px 0 0; padding:0; list-style:none; font-size:12.5px; }
    .sources a { color:var(--signal); text-decoration:none; }
    .sources li { margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .help { margin-top:8px; display:grid; grid-template-columns:auto 1fr; gap:4px 10px; font-size:13px; }
    .help:empty { display:none; }
    .help b { font-weight:600; color: var(--muted); }
  </style>
  <div class="panel">
    <div class="head">
      <div class="wave"><i></i><i></i><i></i><i></i><i></i></div>
      <span class="status">Starting…</span>
      <span class="mode"></span>
      <span class="toast"></span>
    </div>
    <div class="body">
      <div class="heard"></div>
      <div class="said"></div>
      <ul class="sources"></ul>
      <div class="help"></div>
    </div>
  </div>`;

interface Ui {
  panel: HTMLElement;
  bars: HTMLElement[];
  status: HTMLElement;
  toast: HTMLElement;
  heard: HTMLElement;
  said: HTMLElement;
  sources: HTMLElement;
  help: HTMLElement;
  mode: HTMLElement;
}
// Filled in by initPanel(). Creating the panel is deferred so that importing this module
// has no side effects (a second injection of the script must not add a second panel).
export const ui = {} as Ui;

export function initPanel(): void {
  const host = document.createElement("div");
  host.id = "voice-feed-host";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = PANEL_HTML;
  document.documentElement.appendChild(host);

  const part = (sel: string): HTMLElement => {
    const el = shadow.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`Voice Feed panel is missing ${sel}`);
    return el;
  };
  Object.assign(ui, {
    panel: part(".panel"),
    bars: [...shadow.querySelectorAll<HTMLElement>(".wave i")],
    status: part(".status"),
    toast: part(".toast"),
    heard: part(".heard"),
    said: part(".said"),
    sources: part(".sources"),
    help: part(".help"),
    mode: part(".mode"),
  });
}

export function updateMode(): void {
  const smart = isSmart();
  ui.mode.textContent = smart ? "AI" : "Basic";
  ui.mode.classList.toggle("ai", smart);
  ui.mode.title = smart
    ? "AI mode: understands anything"
    : "Basic mode: fixed commands, no AI";
}

export function setStatus(text: string): void {
  ui.status.textContent = text;
  ui.panel.classList.toggle("on", !state.micBlocked);
  ui.panel.classList.toggle("blocked", state.micBlocked);
}
export function idleStatus(): void {
  if (state.micBlocked) return;
  setStatus(
    state.feedMode
      ? "Reading your feed"
      : state.scrolling
        ? "Scrolling"
        : state.pending
          ? "Say send or cancel"
          : state.speaking
            ? "Speaking"
            : "Listening",
  );
}

export function show(text: string, sources: Source[] = []): void {
  ui.help.replaceChildren();
  ui.said.textContent = text;
  ui.sources.replaceChildren();
  for (const s of sources) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = s.title;
    li.appendChild(a);
    ui.sources.appendChild(li);
  }
}

export function showHelp(rows: readonly (readonly [string, string])[]): void {
  ui.said.textContent = "";
  ui.sources.replaceChildren();
  ui.help.replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const b = document.createElement("b");
      b.textContent = k;
      const span = document.createElement("span");
      span.textContent = v;
      return [b, span];
    }),
  );
}

export function bounceBars(): void {
  ui.bars.forEach((b, i) => {
    b.style.height = `${8 + Math.random() * 10}px`;
    setTimeout(() => (b.style.height = "6px"), 140 + i * 30);
  });
}

// ---------- instant feedback: a blip and a badge instead of talking ----------
let actx: AudioContext | null = null;
export function blip(ok = true): void {
  try {
    actx ??= new AudioContext();
    if (actx.state === "suspended") void actx.resume();
    const t = actx.currentTime;
    const notes = ok ? [880, 1320] : [300];
    notes.forEach((f, i) => {
      const o = actx!.createOscillator();
      const g = actx!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.07 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.12);
      o.connect(g).connect(actx!.destination);
      o.start(t + i * 0.07);
      o.stop(t + i * 0.07 + 0.13);
    });
  } catch {
    /* sound is optional */
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function ack(label: string, ok = true): void {
  blip(ok);
  ui.toast.textContent = label;
  ui.toast.classList.toggle("miss", !ok);
  ui.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 1400);
}
