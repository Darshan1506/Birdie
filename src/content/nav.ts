// Moving around X without ever reloading the page (so listening and tasks keep running).
import { $, $$, isVisible, waitFor } from "./dom";
import { ack } from "./panel";
import { speak } from "./speech";
import { state } from "./state";

// Click a matching link if one is on screen, else push the URL into X's router.
export function spaNav(path: string): void {
  if (!path.startsWith("/")) path = "/" + path;
  const link = $$<HTMLAnchorElement>(`a[href="${CSS.escape(path)}"]`).find(
    (a) => a.getBoundingClientRect().width > 0,
  );
  if (link) return link.click();
  history.pushState({}, "", path);
  dispatchEvent(new PopStateEvent("popstate", { state: {} }));
}

// Go to a page by name, e.g. a shortcut nav link plus a badge.
export function nav(testid: string, label: string): void {
  const a = $(`[data-testid="${testid}"]`);
  state.scrolling = false;
  a?.click();
  ack(a ? label : "Not found", !!a);
}
export function goTo(path: string, label: string): void {
  state.scrolling = false;
  spaNav(path);
  ack(label);
}

export function search(q: string): void {
  state.scrolling = false;
  q = q.replace(/[.?!]+$/, "").trim();
  ack("🔎 " + q.slice(0, 24));
  spaNav(`/search?q=${encodeURIComponent(q)}&src=typed_query`);
}

export const cleanName = (name: string): string =>
  name.replace(/^@/, "").replace(/[.,!?]+$/, "").trim();

export async function openProfileOf(rawName: string): Promise<void> {
  state.scrolling = false;
  const name = cleanName(rawName);
  ack("👤 " + name.slice(0, 20));
  spaNav(`/search?q=${encodeURIComponent(name)}&f=user`);
  const cell = await waitFor(
    () => $$('[data-testid="UserCell"]').find(isVisible),
    6000,
  );
  const link = cell && $('a[href^="/"]', cell);
  if (link) link.click();
  else void speak(`I couldn't find ${name}.`);
}

export async function readMessages(): Promise<void> {
  state.scrolling = false;
  spaNav("/messages");
  const list = await waitFor(() => {
    const c = $$('[data-testid="conversation"]');
    return c.length ? c[0] : null;
  }, 6000);
  if (!list) return speak("I couldn't read the message list.");
  const items = $$('[data-testid="conversation"]')
    .slice(0, 5)
    .map((cv) => {
      const parts = cv.innerText
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);
      return `${parts[0]}: ${parts.at(-1)}`;
    });
  return speak("Your latest messages. " + items.join(". "));
}
