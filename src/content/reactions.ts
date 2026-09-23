// Like, repost, save and follow: one action on the current tweet per command.
import { $, waitFor, waitUntil } from "./dom";
import { ack } from "./panel";
import { needTweet, openProfile, tweetInfo } from "./tweets";

export function clickIn(t: HTMLElement, id: string): boolean {
  const btn = $(`[data-testid="${id}"]`, t);
  btn?.click();
  return !!btn;
}

export function like(on = true): void {
  const t = needTweet();
  if (!t) return;
  if (clickIn(t, on ? "like" : "unlike")) ack(on ? "♥ Liked" : "Unliked");
  else ack(on ? "Already liked" : "Not liked", false);
}

export async function repost(on = true): Promise<void> {
  const t = needTweet();
  if (!t) return;
  if (!clickIn(t, on ? "retweet" : "unretweet"))
    return ack(on ? "Already reposted" : "Not reposted", false);
  const c = await waitFor(
    `[data-testid="${on ? "retweetConfirm" : "unretweetConfirm"}"]`,
    3000,
  );
  c?.click();
  ack(c ? (on ? "🔁 Reposted" : "Repost removed") : "Repost failed", !!c);
}

export function bookmark(on = true): void {
  const t = needTweet();
  if (!t) return;
  if (clickIn(t, on ? "bookmark" : "removeBookmark")) ack(on ? "🔖 Saved" : "Unsaved");
  else ack(on ? "Already saved" : "Not saved", false);
}

const PROFILE_BTN = '[data-testid="primaryColumn"] [data-testid="placementTracking"]';

export async function follow(on = true): Promise<void> {
  const sel = `${PROFILE_BTN} [data-testid$="-${on ? "follow" : "unfollow"}"]`;
  let btn = $(sel);
  if (!btn) {
    // Not on a profile: open the current tweet's author first.
    const t = needTweet();
    if (!t) return;
    const { handle } = tweetInfo(t);
    openProfile(t);
    await waitUntil(
      () => location.pathname.toLowerCase() === "/" + handle.slice(1).toLowerCase(),
      5000,
    );
    btn = await waitFor(sel, 5000);
  }
  if (!btn) return ack(on ? "Already following" : "Not following", false);
  btn.click();
  if (!on) (await waitFor('[data-testid="confirmationSheetConfirm"]', 3000))?.click();
  ack(on ? "✓ Followed" : "Unfollowed");
}
