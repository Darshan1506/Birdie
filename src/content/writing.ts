// Writing on X: replies, quotes, posts and Basic-mode DMs. Everything is read back and
// confirmed by voice before it is sent (PRD §8, S-1).
import { $, $$, isVisible, sleep, typeInto, waitFor } from "./dom";
import { cleanName, spaNav } from "./nav";
import { ack, idleStatus } from "./panel";
import { clickIn } from "./reactions";
import { shush, speak } from "./speech";
import { isSmart, state } from "./state";
import { needTweet } from "./tweets";

export function prepare(kind: "reply" | "quote" | "post", rawText: string): void {
  state.scrolling = false;
  const text = (rawText || "").trim();
  if (!text) {
    void speak(`Say ${kind} saying, then your words.`);
    return;
  }
  if (kind === "post") state.pending = { kind, text };
  else {
    const tweet = needTweet();
    if (!tweet) return;
    state.pending = { kind, text, tweet };
  }
  const verb = { reply: "Reply", quote: "Quote", post: "Post" }[kind];
  void speak(`${verb}: ${text}. Send?`);
  idleStatus();
}

export function prepareDM(rawName: string, rawText: string): void {
  state.scrolling = false;
  const name = cleanName(rawName);
  const text = (rawText || "").trim();
  if (!name || !text) {
    void speak("Say: message, then the name, then saying, then your words.");
    return;
  }
  state.pending = { kind: "dm", name, text };
  void speak(`Message to ${name}: ${text}. Send?`);
  idleStatus();
}

async function typeAndSend(text: string): Promise<boolean> {
  const box = await waitFor(
    '[role="dialog"] [data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_0"]',
    5000,
  );
  if (!box) return false;
  box.focus();
  await sleep(150);
  document.execCommand("insertText", false, text);
  const btn = await waitFor(() => {
    const b =
      $('[role="dialog"] [data-testid="tweetButton"]') ||
      $('[data-testid="tweetButton"]') ||
      $('[data-testid="tweetButtonInline"]');
    return b && b.getAttribute("aria-disabled") !== "true" ? b : null;
  }, 4000);
  if (!btn) return false;
  btn.click();
  return true;
}

const inDialog = (sel: string) => $$(`[role="dialog"] ${sel}`).filter(isVisible);

// Basic mode DMs: a fixed script, no AI.
async function dmFlow(name: string, text: string): Promise<boolean> {
  spaNav("/messages/compose");
  const box = await waitFor(
    () => inDialog('input[data-testid="searchPeople"], input')[0],
    6000,
  );
  if (!box) return false;
  await typeInto(box, name, true);
  const person = await waitFor(
    () =>
      inDialog(
        '[data-testid="TypeaheadUser"], [data-testid="typeaheadResult"], [role="option"]',
      )[0],
    6000,
  );
  if (!person) return false;
  person.click();
  await sleep(500);
  const nextBtn = await waitFor(() => {
    const b =
      inDialog('[data-testid="nextButton"]')[0] ||
      inDialog('button, [role="button"]').find((x) => /^next$/i.test(x.innerText.trim()));
    return b && b.getAttribute("aria-disabled") !== "true" ? b : null;
  }, 3000);
  nextBtn?.click();
  const input = await waitFor(
    () =>
      $('[data-testid="dmComposerTextInput"]') ||
      $$('[role="textbox"][contenteditable="true"], textarea').find(
        (e) =>
          isVisible(e) &&
          /message/i.test(e.getAttribute("aria-label") || e.getAttribute("placeholder") || ""),
      ),
    7000,
  );
  if (!input) return false;
  await typeInto(input, text, false);
  const sendBtn = await waitFor(() => {
    const b =
      $<HTMLButtonElement>('[data-testid="dmComposerSendButton"]') ||
      $$<HTMLButtonElement>('button, [role="button"]').find(
        (x) =>
          isVisible(x) &&
          /^send$/i.test((x.getAttribute("aria-label") || x.innerText || "").trim()),
      );
    return b && b.getAttribute("aria-disabled") !== "true" && !b.disabled ? b : null;
  }, 4000);
  if (!sendBtn) return false;
  sendBtn.click();
  return true;
}

// Called when the user says yes to a pending reply, quote, post or DM.
export async function send(): Promise<void> {
  const p = state.pending;
  state.pending = null;
  if (!p || p.kind === "agent") return;
  shush();
  if (p.kind === "dm") {
    if (await dmFlow(p.name, p.text)) ack("✉ Sent");
    else
      void speak(
        isSmart()
          ? "I couldn't do that one. Try saying it again."
          : "I couldn't send that in basic mode. X may have changed its message screen. Try again with AI on.",
      );
    return idleStatus();
  }
  if (p.kind !== "post" && !p.tweet.isConnected)
    return void speak("That tweet scrolled away. Try again.");

  let ok = false;
  if (p.kind === "reply") ok = clickIn(p.tweet, "reply") && (await typeAndSend(p.text));
  else if (p.kind === "quote") {
    if (clickIn(p.tweet, "retweet")) {
      const item = await waitFor(() =>
        $$('[role="menuitem"]').find((m) => /quote/i.test(m.innerText)),
        3000,
      );
      item?.click();
      ok = !!item && (await typeAndSend(p.text));
    }
  } else {
    const compose = $('[data-testid="SideNav_NewTweet_Button"]');
    compose?.click();
    ok = !!compose && (await typeAndSend(p.text));
  }
  if (ok) ack("✓ Sent");
  else void speak("Something went wrong. Check the screen before trying again.");
  idleStatus();
}
