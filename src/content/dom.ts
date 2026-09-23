// Small DOM helpers shared by the content modules.

export const $ = <T extends HTMLElement = HTMLElement>(
  sel: string,
  root: ParentNode = document,
): T | null => root.querySelector<T>(sel);
export const $$ = <T extends HTMLElement = HTMLElement>(
  sel: string,
  root: ParentNode = document,
): T[] => [...root.querySelectorAll<T>(sel)];

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

// Polls until a selector (or a finder function) yields an element; null on timeout.
export function waitFor<T extends HTMLElement = HTMLElement>(
  find: string | (() => T | null | undefined),
  timeout = 5000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    (function poll() {
      const el = typeof find === "function" ? find() : $<T>(find);
      if (el) return resolve(el);
      if (Date.now() - t0 > timeout) return resolve(null);
      setTimeout(poll, 80);
    })();
  });
}
export async function waitUntil(cond: () => boolean, timeout = 5000): Promise<boolean> {
  return (await waitFor(() => (cond() ? document.body : null), timeout)) !== null;
}

export function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (
    r.width < 2 ||
    r.height < 2 ||
    r.bottom < 0 ||
    r.top > innerHeight ||
    r.right < 0 ||
    r.left > innerWidth
  )
    return false;
  const st = getComputedStyle(el);
  return st.visibility !== "hidden" && st.display !== "none" && st.opacity !== "0";
}

// Type into X's editors with execCommand so their React state registers the text.
export async function typeInto(
  el: HTMLElement,
  text: string,
  clear: boolean,
): Promise<void> {
  el.scrollIntoView({ block: "center" });
  el.focus();
  el.click();
  await sleep(120);
  if (clear) document.execCommand("selectAll", false);
  const ok = document.execCommand("insertText", false, text);
  if (!ok && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(
      el,
      (clear ? "" : el.value) + text,
    );
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export function pressKey(key: string): void {
  const el = document.activeElement || document.body;
  const code = ({ Enter: 13, Escape: 27, Tab: 9 } as Record<string, number>)[key] ?? 0;
  for (const type of ["keydown", "keypress", "keyup"]) {
    el.dispatchEvent(
      new KeyboardEvent(type, {
        key,
        code: key,
        keyCode: code,
        which: code,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
}
