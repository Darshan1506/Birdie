// Finding, outlining and describing tweets on the page.
import { $, $$ } from "./dom";
import { ack } from "./panel";
import { state } from "./state";

const HEADER_OFFSET = 60; // X's sticky header
export const tweets = (): HTMLElement[] => $$('article[data-testid="tweet"]');

// The tweet you're "on": the one you focused if still visible, else the first one below the header.
export function currentTweet(): HTMLElement | null {
  if (state.focused && document.contains(state.focused)) {
    const r = state.focused.getBoundingClientRect();
    if (r.bottom > HEADER_OFFSET && r.top < innerHeight) return state.focused;
  }
  state.focused = null;
  return (
    tweets().find((t) => t.getBoundingClientRect().bottom > HEADER_OFFSET + 90) || null
  );
}

export function highlight(t: HTMLElement | null): void {
  if (state.highlighted && state.highlighted !== t) state.highlighted.style.outline = "";
  if (t) {
    t.style.outline = "2px solid #1d9bf0";
    t.style.outlineOffset = "-2px";
  }
  state.highlighted = t;
}

export interface TweetInfo {
  name: string;
  handle: string;
  text: string;
}
export function tweetInfo(t: HTMLElement): TweetInfo {
  const parts = ($('[data-testid="User-Name"]', t)?.innerText || "").split("\n");
  return {
    name: parts[0] || "Someone",
    handle: parts.find((p) => p.startsWith("@")) || "",
    text: $('[data-testid="tweetText"]', t)?.innerText?.trim() || "",
  };
}
export function tweetForAI(t: HTMLElement): string {
  const i = tweetInfo(t);
  return `${i.name} (${i.handle}): ${i.text || "(no text, probably an image or video)"}`;
}

// The current tweet, highlighted, or a "no tweet" badge and null.
export function needTweet(): HTMLElement | null {
  const t = currentTweet();
  if (!t) ack("No tweet on screen", false);
  else highlight(t);
  return t;
}

export function focusTweet(t: HTMLElement): void {
  state.focused = t;
  highlight(t);
  scrollBy({ top: t.getBoundingClientRect().top - HEADER_OFFSET, behavior: "smooth" });
}

// The current tweet and the next few, numbered for the AI.
export function visibleTweets(): HTMLElement[] {
  const list = tweets();
  const cur = currentTweet();
  const i = cur ? list.indexOf(cur) : 0;
  return list.slice(Math.max(0, i), Math.max(0, i) + 5);
}

export function openTweet(t: HTMLElement): boolean {
  const link = $("time", t)?.closest("a");
  link?.click();
  return !!link;
}
export function openProfile(t: HTMLElement): boolean {
  const link = $('[data-testid="User-Name"] a[href^="/"]', t);
  link?.click();
  return !!link;
}

export { HEADER_OFFSET };
