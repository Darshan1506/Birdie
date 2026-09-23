// Auto-scroll, speed, stepping between tweets, and the instant "stop".
import { ack, idleStatus } from "./panel";
import { shush } from "./speech";
import { currentTweet, focusTweet, highlight, tweets } from "./tweets";
import { state } from "./state";

function tick(): void {
  if (!state.scrolling) return;
  state.carry += state.speed;
  const whole = Math.floor(state.carry);
  if (whole) {
    scrollBy(0, whole);
    state.carry -= whole;
  }
  requestAnimationFrame(tick);
}

function beginScrolling(): void {
  if (state.scrolling) return;
  state.scrolling = true;
  requestAnimationFrame(tick);
}

export function startScroll(): void {
  state.focused = null;
  beginScrolling();
  ack("▶ Scrolling");
  idleStatus();
}

// Cancels everything: scrolling, speech, feed mode, pending items, agent tasks, in-flight AI.
export function stopAll(): void {
  state.runId++;
  if (state.pending?.kind === "agent") {
    state.pending.resolve(false);
    state.pending = null;
  }
  state.feedMode = false;
  state.scrolling = false;
  shush();
  const t = currentTweet();
  if (t) highlight(t);
  ack("■ Stopped");
  idleStatus();
}

export function changeSpeed(factor: number): void {
  state.speed = Math.min(20, Math.max(0.5, state.speed * factor));
  beginScrolling();
  ack(factor > 1 ? "⏩ Faster" : "⏪ Slower");
  idleStatus();
}

export function step(dir: 1 | -1): void {
  if (state.feedMode) {
    state.feedSkip = dir; // the feed reader picks this up
    shush();
    return;
  }
  state.scrolling = false;
  const list = tweets();
  const cur = currentTweet();
  const i = Math.max(0, Math.min(list.length - 1, cur ? list.indexOf(cur) + dir : 0));
  const target = list[i];
  if (!target) return ack("No more loaded", false);
  focusTweet(target);
  ack(dir > 0 ? "↓ Next" : "↑ Previous");
  idleStatus();
}
