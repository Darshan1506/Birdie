// Shared mutable state for the content script. One object, so every module sees the same values.
import { PUBLIC_DEFAULTS, type PublicSettings } from "../shared/settings";
import type { RouteEnv } from "./routing";

// Something waiting for a spoken yes/no.
export type Pending =
  | { kind: "reply" | "quote"; text: string; tweet: HTMLElement }
  | { kind: "post"; text: string }
  | { kind: "dm"; name: string; text: string }
  | { kind: "agent"; resolve: (ok: boolean) => void };

export const state = {
  settings: { ...PUBLIC_DEFAULTS } as PublicSettings,
  aiConfigured: false, // reported by the background; the page never sees the keys
  hasGroq: false,

  micBlocked: false,
  scrolling: false,
  speed: 2,
  carry: 0,
  feedMode: false,
  feedSkip: 0,
  runId: 0, // bumps on stop so reading loops, research and agent tasks bail out

  speaking: false,
  speakingPlain: "", // what it's saying right now, to ignore its own echo
  lastSpeechEnd: 0,

  pending: null as Pending | null,
  focused: null as HTMLElement | null,
  highlighted: null as HTMLElement | null,
  lastTyped: "",
};

// Smart if any AI is set up (the others act as automatic backups).
export const hasAI = (): boolean =>
  state.settings.provider === "ollama" || state.aiConfigured;
// AI mode = the switch is on AND an AI is set up. Otherwise it runs in basic mode.
export const isSmart = (): boolean => state.settings.aiEnabled !== false && hasAI();

export const routeEnv = (): RouteEnv => ({
  smart: isSmart(),
  hasPending: state.pending !== null,
  wakeWordEnabled: state.settings.wakeWordEnabled,
  wakeWord: state.settings.wakeWord,
});
