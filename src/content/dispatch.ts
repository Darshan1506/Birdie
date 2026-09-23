// Carries out what analyze() decided: intents, dictated text, confirmations and the AI brain.
import type { BrainAction, ChatTurn } from "../shared/messages";
import { isError } from "../shared/messages";
import { runTask } from "./agent";
import { ask } from "./bg";
import { sleep } from "./dom";
import { goTo, nav, openProfileOf, readMessages, search } from "./nav";
import { ack, blip, idleStatus, setStatus, show, showHelp, ui, updateMode } from "./panel";
import { bookmark, follow, like, repost } from "./reactions";
import { readCurrent, readFeed, readReplies, researchCurrent } from "./reading";
import {
  KEEP_FEED,
  TALK_OVER_OK,
  analyze,
  plainOf,
  type Analysis,
  type IntentName,
  type TextCommand,
} from "./routing";
import { changeSpeed, startScroll, step, stopAll } from "./scroll";
import { shush, speak } from "./speech";
import { hasAI, isSmart, routeEnv, state } from "./state";
import {
  focusTweet,
  needTweet,
  openProfile,
  openTweet,
  tweetForAI,
  visibleTweets,
} from "./tweets";
import { prepare, prepareDM, send } from "./writing";

const HELP_ROWS = [
  ["Move", "scroll · stop · faster · slower · next · back"],
  ["Listen", "read · read my feed · read replies"],
  ["Understand", "explain · what's this about"],
  ["React", "like · repost · save · follow"],
  ["Write", "reply saying… · quote saying… · post saying…"],
  ["Go", "home · messages · bookmarks · explore · my profile · search for…"],
  ["Messages", "message Rahul saying… · read my messages"],
  ["People", "open Rahul's profile · follow"],
  ["Mode", "AI on · AI off"],
  ["AI mode", "ask anything · “mute this account” · “is this true?”"],
  ["Panel", "settings · hide panel · show panel"],
] as const;

function setAI(on: boolean): void {
  if (on && !hasAI()) {
    void speak("There's no AI key yet. Say open settings to add a free Groq key.");
    return;
  }
  void chrome.storage.local.set({ aiEnabled: on });
  state.settings.aiEnabled = on;
  updateMode();
  void speak(on ? "AI mode on." : "Basic mode. No AI, fixed commands only.");
}

const ACTIONS: Record<IntentName, () => unknown> = {
  start_scroll: startScroll,
  stop: stopAll,
  faster: () => changeSpeed(1.5),
  slower: () => changeSpeed(1 / 1.5),
  next: () => step(1),
  previous: () => step(-1),
  read: readCurrent,
  read_feed: readFeed,
  read_replies: readReplies,
  research: researchCurrent,
  like: () => like(true),
  unlike: () => like(false),
  repost: () => repost(true),
  unrepost: () => repost(false),
  bookmark: () => bookmark(true),
  unbookmark: () => bookmark(false),
  follow: () => follow(true),
  unfollow: () => follow(false),
  open_tweet: () => {
    const t = needTweet();
    if (t) openTweet(t);
  },
  open_profile: () => {
    const t = needTweet();
    if (t) openProfile(t);
  },
  home: () => nav("AppTabBar_Home_Link", "⌂ Home"),
  read_messages: readMessages,
  lists: () => goTo("/i/lists", "☰ Lists"),
  x_settings: () => goTo("/settings", "⚙ X settings"),
  messages: () => goTo("/messages", "✉ Messages"),
  bookmarks: () => goTo("/i/bookmarks", "🔖 Bookmarks"),
  explore: () => nav("AppTabBar_Explore_Link", "# Explore"),
  my_profile: () => nav("AppTabBar_Profile_Link", "👤 Profile"),
  notifications: () => nav("AppTabBar_Notifications_Link", "🔔 Notifications"),
  back: () => {
    state.scrolling = false;
    history.back();
    ack("← Back");
  },
  top: () => {
    state.scrolling = false;
    scrollTo({ top: 0, behavior: "smooth" });
    ack("↑ Top");
  },
  help: () => {
    showHelp(HELP_ROWS);
    ack("Commands on screen");
  },
  settings: () => void ask("openOptions", {}),
  hide_panel: () => ui.panel.classList.add("hidden"),
  show_panel: () => ui.panel.classList.remove("hidden"),
  ai_on: () => setAI(true),
  ai_off: () => setAI(false),
};

function runText(c: TextCommand): unknown {
  switch (c.type) {
    case "reply":
    case "quote":
    case "post":
      return prepare(c.type, c.text);
    case "search":
      return search(c.query);
    case "dm":
      return prepareDM(c.name, c.text);
    case "profile":
      return openProfileOf(c.name);
  }
}

// Runs one action, from a keyword intent or from the AI ("do" is untrusted text).
function runIntent(name: string, extra: BrainAction = { do: name }): unknown {
  if (state.feedMode && !KEEP_FEED.has(name as IntentName) && name !== "stop") {
    state.runId++;
    state.feedMode = false;
    shush();
  }
  if (state.pending && name !== "stop") {
    if (state.pending.kind === "agent") state.pending.resolve(false);
    state.pending = null;
  }
  const n = Number(extra.tweet);
  if (n > 1) {
    const target = visibleTweets()[n - 1];
    if (target) focusTweet(target);
  }
  switch (name) {
    case "reply":
    case "quote":
    case "post":
      return prepare(name, extra.text ?? "");
    case "search":
      return search(extra.query || extra.text || "");
    case "task":
      return runTask(extra.goal || extra.text || "");
  }
  if (Object.hasOwn(ACTIONS, name)) return ACTIONS[name as IntentName]();
  return ack("Didn't get that", false);
}

// ---------- the brain ----------
function screenContext(): string {
  const path = location.pathname;
  const page = path.includes("/status/")
    ? "a tweet and its replies"
    : path.startsWith("/search")
      ? "search results"
      : path === "/home"
        ? "home feed"
        : "page " + path;
  const lines = visibleTweets().map((t, n) => `${n + 1}. ${tweetForAI(t).slice(0, 600)}`);
  const mode = state.feedMode ? "reading the feed aloud" : state.scrolling ? "auto-scrolling" : "paused";
  return `Viewing: ${page}. State: ${mode}.\n${lines.join("\n") || "(no tweets visible)"}`;
}

// The last few turns, so "follow him" can refer back. Survives page reloads for this tab.
const HISTORY_KEY = "voiceFeedHistory";
let chatHistory: ChatTurn[] = [];
try {
  chatHistory = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]") as ChatTurn[];
} catch {
  chatHistory = [];
}
function remember(user: string, assistant: string): void {
  chatHistory = [...chatHistory, { user, assistant }].slice(-10);
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory));
  } catch {
    /* optional */
  }
}

async function askBrain(raw: string): Promise<void> {
  if (state.feedMode) {
    state.runId++;
    state.feedMode = false;
  }
  shush();
  state.scrolling = false;
  const my = state.runId;
  blip(true);
  setStatus("Thinking…");
  show("…");
  const res = await ask("brain", {
    command: raw,
    screen: screenContext(),
    history: chatHistory.slice(-8),
  });
  if (state.runId !== my) return; // you said stop meanwhile
  idleStatus();
  if (isError(res)) {
    const basic = analyze(raw, routeEnv(), true);
    if (basic && (basic.kind === "intent" || basic.kind === "text")) {
      show("AI unavailable, so I used a basic command.");
      act(basic, true);
      return;
    }
    await speak(
      "The AI isn't available right now. Basic commands still work. " +
        (res.error === "NO_KEY" ? "" : res.error),
    );
    return;
  }
  remember(raw, JSON.stringify({ say: res.say, actions: res.actions }));
  if (!res.say && !res.actions.length) {
    show("");
    return ack("…", false);
  }
  let confirming = false;
  for (const a of res.actions) {
    if (state.runId !== my) return;
    if (["reply", "quote", "post", "task"].includes(a.do)) confirming = true;
    await runIntent(a.do, a);
    await sleep(150);
  }
  if (res.say && !confirming) await speak(res.say);
  else if (!res.say) show("");
}

// Something the keywords couldn't place: in AI mode, ask the brain if it sounds like a request.
function aiFallback(a: Extract<Analysis, { kind: "text_incomplete" | "none" }>): void {
  const looksLikeCommand =
    a.kind === "text_incomplete" ||
    /^(?:please |can you |could you )?(write|find|show|open|tell|what|who|why|how|go|take|give|make|check)\b/.test(
      plainOf(a.raw),
    );
  if (!isSmart() || !looksLikeCommand) {
    if (a.kind === "text_incomplete") void speak("Say reply saying, then your words.");
    else ack("Not a command", false);
    return;
  }
  void askBrain(a.raw);
}

// Acts on an Analysis. Returns true if it did something.
// isFinal is false for partial (interim) speech, which may only trigger instant intents.
export function act(a: Analysis | null, isFinal: boolean): boolean {
  if (!a) return false;
  if (a.kind === "intent" && a.name === "stop") {
    stopAll();
    return true;
  }
  if (
    a.kind === "confirm" &&
    !state.settings.talkOver &&
    (state.speaking || Date.now() - state.lastSpeechEnd < 500)
  )
    return false; // S-2: don't hear our own "Send?" as a yes
  if (state.speaking) {
    // While it's talking, ignore anything that's just its own voice coming back.
    if (!state.settings.talkOver) return false;
    if (a.kind === "intent" && !TALK_OVER_OK.has(a.name)) return false;
    if (a.kind !== "intent" && a.kind !== "confirm" && a.kind !== "brain") return false;
    const plain = "plain" in a ? a.plain : "";
    if (plain && plain.split(" ").length >= 3 && state.speakingPlain.includes(plain))
      return false; // echo
  }
  switch (a.kind) {
    case "confirm": {
      const p = state.pending;
      if (p?.kind === "agent") {
        state.pending = null;
        shush();
        if (!a.yes) ack("✕ Cancelled", false);
        p.resolve(a.yes);
        return true;
      }
      if (a.yes) void send();
      else {
        state.pending = null;
        shush();
        ack("✕ Cancelled");
        idleStatus();
      }
      return true;
    }
    case "wake":
      ack("Yes?");
      return true;
    case "intent":
      void runIntent(a.name);
      return true;
    case "text":
      if (!isFinal) return false;
      void runText(a.command);
      return true;
    case "brain":
      if (!isFinal) return false;
      void askBrain(a.raw);
      return true;
    case "text_incomplete":
    case "none":
      if (!isFinal) return false;
      aiFallback(a);
      return true;
  }
}
