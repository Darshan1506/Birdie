// Safety rules for the page agent (PRD §8). Kept pure so they can be tested.
// The AI can never bypass these: they run in extension code, not in a prompt.

// Buttons whose label matches need a spoken "yes" before the agent may click them.
const RISKY =
  /\b(send|post|reply|tweet|delete|remove|block|report|unfollow|follow|repost|retweet|mute|log ?out|sign out|deactivate|pay|subscribe|buy|purchase|confirm|save|update|discard|leave)\b/i;
// X's like button reads "Like" or "1,234 Likes. Like". Match only that, not "Liked by …".
const LIKE_BUTTON = /(^|\.\s*)like$/i;

export function needsConfirmation(label: string): boolean {
  const l = label.trim();
  return RISKY.test(l) || LIKE_BUTTON.test(l);
}

export interface FocusedField {
  tag: string; // lower-case tag name
  editable: boolean; // contenteditable
}

// Enter sends a DM and submits many forms, so pressing it in a text area needs the same
// confirmation as clicking a Send button. Single-line inputs (search boxes) are fine.
export function pressNeedsConfirmation(key: string, field: FocusedField): boolean {
  if (key !== "Enter") return false;
  return field.editable || field.tag === "textarea";
}
