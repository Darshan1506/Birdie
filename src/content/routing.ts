// Decides what a spoken phrase means. Pure: no DOM, no chrome.*, so it is unit-tested directly.

export const plainOf = (s: string): string =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// Keyword intents: matched anywhere in what you say, so "can you like this one" works.
// Order matters: more specific first (read_messages before read, unlike before like).
export const INTENTS = [
  ["stop", /\b(stop|stopp|pause|quiet|enough|shut up|hold on|hang on)\b/],
  [
    "read_messages",
    /\b(read|check) (my )?(messages|dms|inbox)\b|\bany (new )?messages\b/,
  ],
  [
    "read_feed",
    /\b(read (my |the )?(feed|timeline|everything|all)|keep reading|read (them )?all|read continuously)\b/,
  ],
  [
    "read_replies",
    /\b(replies|comments|what are people saying|what do people say)\b/,
  ],
  [
    "research",
    /\b(explain|research|tell me more|more about|search more|whats (this|that|it) about|what is (this|that|it) about|what does (this|that|it) mean|whats going on|what is going on|context|who is (this|that))\b/,
  ],
  ["read", /\b(read|what does it say|what did (he|she|they) say)\b/],
  ["faster", /\b(faster|speed up|quicker)\b/],
  ["slower", /\b(slower|slow down)\b/],
  [
    "top",
    /\b(top of (the )?page|to the top|go to top|scroll to top|back to top)\b/,
  ],
  ["next", /\b(next|skip)\b/],
  ["previous", /\b(previous|last one|go up|back one|one back)\b/],
  ["unlike", /\b(unlike|remove (the )?like|undo (the )?like)\b/],
  ["like", /\b(like|love|heart)\b/],
  [
    "unrepost",
    /\b(undo (the )?(repost|retweet)|unrepost|unretweet|remove (the )?(repost|retweet))\b/,
  ],
  ["repost", /\b(repost|retweet|share)\b/],
  ["unbookmark", /\b(remove (the )?bookmark|unbookmark|unsave)\b/],
  ["bookmark", /\b(bookmark|save)\b/],
  ["unfollow", /\bunfollow\b/],
  ["follow", /\bfollow\b/],
  ["open_tweet", /\bopen (this|it|that|the tweet|the post|tweet|post)\b/],
  [
    "messages",
    /^(open |go to |show |check )?(my )?(messages|dms|inbox|chats)$/,
  ],
  ["lists", /^(open |go to |show )?(my )?lists$/],
  ["x_settings", /^(open |go to )?(x|twitter|account) settings$/],
  ["bookmarks", /^(open |go to |show )?(my )?(bookmarks|saved posts|saved)$/],
  ["explore", /^(open |go to |show )?(explore|trending|whats trending)$/],
  ["my_profile", /\bmy profile\b/],
  ["open_profile", /\bprofile\b/],
  ["notifications", /\bnotifications?\b/],
  ["home", /\bhome\b/],
  ["back", /\bgo back\b|^back$/],
  [
    "start_scroll",
    /\b(start|begin|continue|resume|keep going|go on|scroll|move|play)\b/,
  ],
  ["help", /\b(help|what can i say|commands)\b/],
  ["settings", /\bsettings\b/],
  ["hide_panel", /\bhide (the )?panel\b/],
  ["show_panel", /\bshow (the )?panel\b/],
] as const satisfies readonly (readonly [string, RegExp])[];

export type IntentName = (typeof INTENTS)[number][0] | "ai_on" | "ai_off";

const STOP = INTENTS[0][1];

// What the user dictated, as data. The dispatcher decides how to carry it out.
export type TextCommand =
  | { type: "reply" | "quote" | "post"; text: string }
  | { type: "search"; query: string }
  | { type: "dm"; name: string; text: string }
  | { type: "profile"; name: string };

export type Analysis =
  | { kind: "intent"; name: IntentName; plain: string }
  | { kind: "confirm"; yes: boolean; plain: string }
  | { kind: "wake" }
  | { kind: "text"; command: TextCommand }
  | { kind: "text_incomplete"; raw: string }
  | { kind: "brain"; raw: string; plain: string }
  | { kind: "none"; raw: string; plain: string };

const TEXT_TRIGGER =
  /^(?:(?:please|can you|could you|now|ok|okay|and|so)\s+)*(reply|quote|post|tweet|search|write|message|dm|send)\b/i;

interface WithText {
  re: RegExp;
  build: (m: RegExpMatchArray) => TextCommand;
  basicOnly?: boolean; // in AI mode the agent handles it better
}
const WITH_TEXT: WithText[] = [
  {
    re: /\breply(?:ing)?\W+(?:saying|that says|say|by saying|with the words)\W+(.+)$/i,
    build: (m) => ({ type: "reply", text: m[1] }),
  },
  {
    re: /\bquote(?: this| it| tweet)?\W+(?:saying|that says|say)\W+(.+)$/i,
    build: (m) => ({ type: "quote", text: m[1] }),
  },
  {
    re: /\b(?:post|tweet)\W+(?:saying|that says|say)\W+(.+)$/i,
    build: (m) => ({ type: "post", text: m[1] }),
  },
  {
    re: /\bsearch(?: for| x for| twitter for)?\W+(?!more\b)(.+)$/i,
    build: (m) => ({ type: "search", query: m[1] }),
  },
  {
    re: /\b(?:send\s+(?:a\s+)?(?:dm|message|direct message)\s+to|message|dm)\s+(.+?)\W+(?:saying|that says|say)\W+(.+)$/i,
    build: (m) => ({ type: "dm", name: m[1], text: m[2] }),
    basicOnly: true,
  },
];

const MODE_OFF =
  /\b(ai off|turn off (the )?ai|disable (the )?ai|basic mode|switch to basic|no ai|without ai)\b/;
const MODE_ON =
  /\b(ai on|turn on (the )?ai|enable (the )?ai|smart mode|ai mode|switch to (smart|ai))\b/;
const PROFILE_OF =
  /^(?:open|go to|show(?: me)?)\s+(?!my\b|the\b|this\b|their\b|his\b|her\b)(.+?)(?:'s|’s|s)?\s+profile$/i;
const CONFIRM_YES = /\b(send|yes|yeah|post it|do it|confirm)\b/;
const CONFIRM_NO = /\b(cancel|no|nope|dont|delete|never mind)\b/;
const NOT_SIMPLE =
  /\b(dont|not|never|isnt|wasnt|why|what|who|how|is|does|did|should|would|could)\b/;

// What can run while it is speaking, and what keeps feed mode going.
export const TALK_OVER_OK: ReadonlySet<IntentName> = new Set([
  "stop", "next", "previous", "like", "unlike", "bookmark", "repost",
  "research", "read_replies", "faster", "slower",
]);
export const KEEP_FEED: ReadonlySet<IntentName> = new Set([
  "next", "previous", "like", "unlike", "bookmark", "unbookmark", "repost",
]);

export interface RouteEnv {
  smart: boolean; // AI mode is active
  hasPending: boolean; // a reply/DM/agent action is waiting for yes/no
  wakeWordEnabled: boolean;
  wakeWord: string;
}

function stripWake(
  raw: string,
  plain: string,
  env: RouteEnv,
): { raw: string; plain: string } | null {
  if (!env.wakeWordEnabled) return { raw, plain };
  const wake = plainOf(env.wakeWord);
  const at = plain.indexOf(wake);
  if (at < 0) return null;
  const words = wake.split(" ").length;
  const rawWords = raw.trim().split(/\s+/);
  const skip = plain.slice(0, at).split(" ").filter(Boolean).length + words;
  return {
    raw: rawWords.slice(skip).join(" ").replace(/^\W+/, ""),
    plain: plain.slice(at + wake.length).trim(),
  };
}

// Returns what the phrase means, or null if it should be ignored.
export function analyze(
  transcript: string,
  env: RouteEnv,
  forceBasic = false,
): Analysis | null {
  const smart = !forceBasic && env.smart;
  let raw = transcript.trim();
  let plain = plainOf(raw);
  if (!plain) return null;

  // Stop works instantly, without the wake word, unless you're dictating text.
  if (!TEXT_TRIGGER.test(raw) && STOP.test(plain))
    return { kind: "intent", name: "stop", plain };

  if (env.hasPending) {
    if (CONFIRM_YES.test(plain)) return { kind: "confirm", yes: true, plain };
    if (CONFIRM_NO.test(plain)) return { kind: "confirm", yes: false, plain };
  }

  const w = stripWake(raw, plain, env);
  if (!w) return null;
  ({ raw, plain } = w);
  if (!plain) return { kind: "wake" };

  if (MODE_OFF.test(plain)) return { kind: "intent", name: "ai_off", plain };
  if (MODE_ON.test(plain)) return { kind: "intent", name: "ai_on", plain };
  const prof = raw.replace(/[.?!]+$/, "").match(PROFILE_OF);
  if (prof) return { kind: "text", command: { type: "profile", name: prof[1] } };

  if (TEXT_TRIGGER.test(raw)) {
    for (const { re, build, basicOnly } of WITH_TEXT) {
      if (basicOnly && smart) continue;
      const m = raw.match(re);
      if (m) return { kind: "text", command: build(m) };
    }
    return smart ? { kind: "brain", raw, plain } : { kind: "text_incomplete", raw };
  }

  // In AI mode only short, plain phrases skip the AI ("like", "next", "go home").
  const simple = plain.split(" ").length <= 3 && !NOT_SIMPLE.test(plain);
  if (!smart || simple) {
    for (const [name, re] of INTENTS)
      if (re.test(plain)) return { kind: "intent", name, plain };
  }
  if (smart) return { kind: "brain", raw, plain };
  return { kind: "none", raw, plain };
}
