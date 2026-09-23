// Reading tweets aloud: one tweet, the whole feed, replies, and "explain this".
import { ask } from "./bg";
import { sleep, waitUntil } from "./dom";
import { isError } from "../shared/messages";
import { idleStatus, ack, setStatus, show } from "./panel";
import { speak } from "./speech";
import { hasAI, isSmart, state } from "./state";
import {
  HEADER_OFFSET,
  currentTweet,
  focusTweet,
  needTweet,
  openTweet,
  tweetForAI,
  tweetInfo,
  tweets,
} from "./tweets";

const MAX_FEED_TWEETS = 60;

function sayTweet(t: HTMLElement, prefix = ""): Promise<void> {
  const { name, text } = tweetInfo(t);
  return speak(
    text ? `${prefix}${name}: ${text}` : `${prefix}${name} posted an image or video.`,
  );
}

export async function readCurrent(): Promise<void> {
  state.scrolling = false;
  const t = needTweet();
  if (t) await sayTweet(t);
}

// Feed mode: reads one tweet after another, like a podcast of your timeline.
export async function readFeed(): Promise<void> {
  state.scrolling = false;
  const my = state.runId;
  state.feedMode = true;
  ack("🎧 Reading feed");
  let t = currentTweet();
  for (let n = 0; n < MAX_FEED_TWEETS && t && state.runId === my; n++) {
    focusTweet(t);
    idleStatus();
    await sleep(250);
    state.feedSkip = 0;
    await sayTweet(t);
    if (state.runId !== my) break;
    await sleep(250);
    const dir = state.feedSkip < 0 ? -1 : 1;
    let list = tweets();
    let next: HTMLElement | undefined = list[list.indexOf(t) + dir];
    if (!next && dir > 0) {
      scrollBy(0, innerHeight); // load more
      await sleep(1200);
      list = tweets();
      next =
        list[list.indexOf(t) + 1] ||
        list.find((x) => x.getBoundingClientRect().top > HEADER_OFFSET);
    }
    t = next ?? null;
  }
  if (state.runId === my) {
    state.feedMode = false;
    idleStatus();
  }
}

export async function readReplies(): Promise<void> {
  state.scrolling = false;
  const my = state.runId;
  if (!location.pathname.includes("/status/")) {
    const t = needTweet();
    if (!t) return;
    openTweet(t);
    await waitUntil(
      () => location.pathname.includes("/status/") && tweets().length > 1,
      6000,
    );
    await sleep(500);
  }
  const replies = tweets().slice(1, 5);
  if (!replies.length) return ack("No replies yet", false);
  for (const r of replies) {
    if (state.runId !== my) break;
    focusTweet(r);
    await sayTweet(r, "Reply from ");
  }
}

export async function researchCurrent(): Promise<void> {
  state.scrolling = false;
  const t = needTweet();
  if (!t) return;
  if (!isSmart())
    return speak(
      hasAI()
        ? "Explaining needs AI mode. Say AI on."
        : "Explaining needs an AI key. A free Groq key works. Say open settings to add one.",
    );
  const my = state.runId;
  ack("🔎 Researching");
  setStatus("Researching…");
  show("Looking this up…");
  const res = await ask("research", { tweet: tweetForAI(t) });
  if (state.runId !== my) return; // you said stop meanwhile
  idleStatus();
  if (isError(res)) return speak("That didn't work: " + res.error);
  show(res.text, res.sources);
  await speak(res.text, { display: false });
}
