// Typed wrapper for talking to the background worker. Never throws: failures come back as {error}.
import type { Message, MessageType, Reply } from "../shared/messages";

export async function ask<K extends MessageType>(
  type: K,
  payload: Omit<Extract<Message, { type: K }>, "type">,
): Promise<Reply<K>> {
  try {
    const res = (await chrome.runtime.sendMessage({ type, ...payload })) as
      | Reply<K>
      | undefined;
    return res ?? { error: "The extension didn't answer. Try reloading the page." };
  } catch {
    // Happens when the extension was reloaded or updated while this page stayed open.
    return { error: "Lost connection to the extension. Reload this page." };
  }
}
