# Voice Feed — Product Requirements Document

**Version:** 2.0.0 (`package.json` is the source; the build writes it into `manifest.json`)
**Owner:** personal project
**Status:** working; being improved with Claude Code
**Last updated:** September 2026

---

## 1. Summary

Voice Feed is a Chrome/Edge extension that lets one person use X (Twitter) completely hands-free. You talk; it scrolls, reads tweets aloud, explains them, likes, replies, sends DMs, and can operate any part of X's website. It runs in two modes: **Basic** (fixed voice commands, no AI) and **AI** (understands natural speech and can do any task). It must stay **free to run** for personal use.

## 2. Problem

Using X means constant scrolling, clicking and typing. The owner wants to browse, listen, react and message without touching the keyboard or mouse: for comfort, multitasking, and accessibility. Operating-system voice control (Windows Voice Access, macOS Voice Control) is generic and clumsy on X; it can't summarize a feed, explain a tweet, or write a reply.

## 3. Goals

1. **Zero hands** after one-time setup: every common X action works by voice.
2. **Two modes:** a useful Basic mode with no AI at all, and an AI mode that understands anything.
3. **Fast:** short commands feel instant; nothing waits on a network call unless it has to.
4. **Safe:** nothing is posted, sent, deleted, blocked or muted without the user saying yes.
5. **Free:** runs on free tiers (Groq, Gemini) or fully offline (Ollama). No server, no paid APIs required.
6. **Resilient:** if one AI fails, another takes over; if all fail, Basic commands still work.

## 4. Non-goals

- Not a product for others, not published to the Chrome Web Store (load unpacked is fine).
- No backend server, accounts, billing or analytics.
- No official X API (it's paid; the extension acts through the user's logged-in tab instead).
- No bulk automation: no auto-liking, mass following or mass DMs. One user command → one action or one task.
- No mobile support.

## 5. User and context

- **Single user**, on a laptop, logged into x.com in Chrome or Edge, usually wearing headphones.
- Accent: Indian English, sometimes Hinglish. Language setting `en-IN` should work well.
- Technical enough to load an unpacked extension and paste an API key; uses Claude Code to maintain it.

## 6. Modes

| | Basic mode | AI mode |
|---|---|---|
| Active when | `aiEnabled` is false, or no AI is configured | `aiEnabled` is true **and** at least one AI is configured |
| Understanding | Keyword/regex matching (`INTENTS`, `WITH_TEXT`) | Short clear commands → keywords; everything else → LLM |
| Tasks beyond the command list | Not available | Page agent loop (any X feature) |
| DMs | Fixed script (`dmFlow`) | Page agent |
| Data sent to an AI | None | Transcript, on-screen tweets, recent conversation |
| Switch | Say "AI on" / "AI off", or settings checkbox | same |

**Requirement:** the panel always shows a badge, `AI` or `Basic`. If AI mode fails at runtime (network, rate limit, all providers down), the phrase is re-routed as a Basic command (`analyze(raw, true)`); if nothing matches, it says so and Basic commands keep working.

## 7. Functional requirements

### 7.1 Listening (speech-to-text)
- **FR-1** Starts listening automatically when x.com loads; no click needed. Mic permission is granted once per site.
- **FR-2** Uses the browser Web Speech API (`webkitSpeechRecognition`), continuous, with interim results. Auto-restarts on end; exponential backoff on errors.
- **FR-3** Acts on **interim** results for simple commands after a ~380 ms settle window (so "read" can become "read replies"). "Stop" acts immediately on the first interim match.
- **FR-4** Optional **Whisper** (Groq `whisper-large-v3-turbo`) re-transcribes utterances of ≥3 words in AI mode, using a rolling 20 s, 16 kHz mono buffer from `getUserMedia` (echo cancellation on). On any Whisper failure, fall back to the browser transcript.
- **FR-5** Shows live text in the panel ("Hearing: …") and the final text ("Heard: …").
- **FR-6** Clear, human error messages for `not-allowed`, `network`, `audio-capture`, `language-not-supported`.
- **FR-7** Optional **wake word** (default "hey feed"). "Stop", and yes/no while something is waiting, work without it.

### 7.2 Command routing (`analyze()`)
Order of precedence:
1. **Stop** anywhere in the phrase (unless the phrase is dictation, e.g. "reply saying stop it").
2. **Confirmation** (send/yes/cancel/no) — only while `pending` is set.
3. **Wake word** stripping (if enabled).
4. **Mode switch** ("AI on/off", "basic mode", "smart mode").
5. **Profile of a named person** ("open Rahul's profile").
6. **Dictation commands** (`TEXT_TRIGGER` + `WITH_TEXT`): reply/quote/post saying…, search for…, and (Basic only) message NAME saying….
7. **Keyword intents** (`INTENTS`, order matters: specific before general). In AI mode only for phrases of ≤3 words without negation or question words.
8. AI mode → **brain**. Basic mode → "Not a command".

### 7.3 Command list (both modes)
| Group | Say | Intent / handler |
|---|---|---|
| Move | stop · scroll/keep going · faster · slower · next/skip · previous · top | `stop`, `start_scroll`, `faster`, `slower`, `next`, `previous`, `top` |
| Listen | read this · read my feed · read replies | `read`, `read_feed`, `read_replies` |
| Understand | explain / what's this about | `research` (needs AI) |
| React | like · unlike · repost · undo repost · save · unsave · follow · unfollow | `like`… `unfollow` |
| Write | reply saying … · quote saying … · post saying … | `prepare(kind, text)` → confirm → `send()` |
| Messages | message NAME saying … · read my messages · open messages | `prepareDM`, `read_messages`, `messages` |
| Go | home · explore · notifications · bookmarks · my lists · my profile · open NAME's profile · open profile · open this · search for … · X settings · go back | `home`, `explore`, … `openProfileOf` |
| Panel | help · settings · hide panel · show panel · AI on · AI off | `help`, `settings`, … `ai_on`, `ai_off` |

### 7.4 Feed mode ("read my feed")
- Reads tweets one after another, scrolling each into view and outlining it.
- While reading: "next" skips, "previous" goes back, "like/save/repost" act on the current tweet **without** stopping; any other command ends feed mode. Max 60 tweets per run; loads more by scrolling.

### 7.5 Writing with confirmation
- Reply/quote/post: reads the text back ("Reply: … Send?") and sets `pending`. "Send/yes" posts; "cancel/no" drops it. Any other command cancels the pending item.
- Posting uses X's own compose UI (`typeAndSend`), text inserted via `document.execCommand("insertText")` so X registers it.

### 7.6 AI brain (AI mode)
- **Input:** the phrase, a screen snapshot (page type, state, up to 5 visible tweets numbered from the highlighted one), last 8 turns of history (stored in `sessionStorage`), optional user style note.
- **Output contract (JSON only):**
  ```json
  {"say": "spoken reply or empty", "actions": [{"do": "<action>", "tweet": 1, "text": "...", "query": "...", "goal": "..."}]}
  ```
- **Allowed `do` values:** every intent in 7.3 plus `reply`/`quote`/`post` (need `text`), `search` (needs `query`), `task` (needs `goal`).
- Must understand meaning, not keywords ("I don't like this" is not a like), resolve references ("follow him") from history, and ignore speech not addressed to it (`{"say":"","actions":[]}`).
- Uses web search when the provider supports it (Gemini, Claude). Groq/Ollama get a note that they have no web access and must say when unsure.

### 7.7 Page agent (AI mode, `task`)
Loop, max **12 rounds**, max **3 actions per round**:
1. **Look:** `describePage()` → URL, visible text (≤2500 chars), up to 100 visible interactive elements as `[id] role "label" -> href`. If a dialog is open, only its elements.
2. **Think:** `agentStep()` → `{"say","actions","done"}`. Actions: `{"click":id}`, `{"type":id,"text","clear"}`, `{"press":"Enter|Escape|Tab"}`, `{"go":"/path"}`, `{"scroll":"down|up"}`, `{"wait":ms}`.
3. **Act:** `doAgentAction()`.
4. **Record** results into the task history; repeat until `done: true`.
- Task state is saved in `sessionStorage` and resumed after an unexpected reload (if < 2 minutes old).
- Navigation must not reload the page: `spaNav()` clicks a matching link or uses `history.pushState` + `popstate`.

### 7.8 AI providers
- **Groq** (default, free): `openai/gpt-oss-120b` via OpenAI-compatible chat completions; `reasoning_effort: "low"` for gpt-oss models. If Groq reports the model retired, call `/models`, pick the best available, save it, retry.
- **Gemini** (free, web search): `gemini-flash-latest`, `google_search` tool.
- **Ollama** (free, offline): `llama3.2` at `http://localhost:11434`.
- **Claude** (optional, paid): fast `brainModel`, deeper `model` for research.
- **Backup chain** (`callLLM`): main provider first, then others that are configured, in order groq → gemini → claude → ollama (Ollama only if enabled as backup). First non-empty answer wins.

### 7.9 Speaking back
- Browser `speechSynthesis`; auto-picks the most natural voice for the language (prefers names containing Natural/Neural/Online/Google) unless the user chose one.
- Speaks sentence by sentence (Chrome cuts long utterances).
- Simple actions don't speak; they play a short blip and show a badge (e.g. "♥ Liked").

### 7.10 Panel
Fixed bottom-left, Shadow DOM (isolated from X's CSS), light/dark aware. Shows: waveform (moves when hearing), status, mode badge, heard text, replies/answers, research sources, help grid, toast badges.

### 7.11 Settings (`options.html`)
All stored in `chrome.storage.local`. Saves on change.

| Key | Default | Meaning |
|---|---|---|
| `aiEnabled` | `true` | AI mode switch |
| `provider` | `"groq"` | main AI: groq / gemini / ollama / claude |
| `autoBackup` | `true` | use other configured AIs if main fails |
| `groqKey`, `groqModel` | `""`, `"openai/gpt-oss-120b"` | Groq |
| `whisper` | `true` | sharper hearing via Groq Whisper |
| `geminiKey`, `geminiModel` | `""`, `"gemini-flash-latest"` | Gemini |
| `ollamaBackup`, `ollamaUrl`, `ollamaModel` | `false`, `"http://localhost:11434"`, `"llama3.2"` | Ollama |
| `apiKey`, `brainModel`, `model` | `""`, `"claude-haiku-4-5-20251001"`, `"claude-sonnet-5"` | Claude |
| `styleNote` | `""` | how the user writes, for AI-written text |
| `wakeWordEnabled`, `wakeWord` | `false`, `"hey feed"` | wake word |
| `lang` | `"en-US"` | recognition + voice language |
| `talkOver` | `true` | allow commands while it's speaking (headphones) |
| `voiceName`, `voiceRate`, `scrollSpeed` | `""`, `1.15`, `2` | voice and speed |

## 8. Safety requirements (must never regress)

- **S-1** The confirmation gate lives in extension code (`needsConfirmation` / `pressNeedsConfirmation` in `src/content/safety.ts`, used by `doAgentAction`, and `pending` for reply/quote/post/DM). The AI cannot bypass it. Labels matching send/post/reply/tweet/delete/remove/block/report/follow/unfollow/repost/retweet/like/mute/log out/deactivate/pay/subscribe/buy/purchase/confirm/save/update/discard/leave require a spoken yes, and so does pressing Enter inside a text area or editable box (Enter sends a DM). Follow/repost/like are gated for the agent because tweet text is untrusted and could try to steer it; the direct voice commands "like", "follow" etc. are unaffected. Prompts also tell the model that page text is data, but the gate does not depend on that.
- **S-2** Without headphones (`talkOver` false), confirmations are ignored while it's speaking and for 500 ms after, so it can't hear its own "Send?" as a yes.
- **S-3** "Stop" cancels everything immediately: scrolling, speech, feed mode, pending items, agent tasks, and in-flight AI responses (via `runId`).
- **S-4** Agent limits: 12 rounds, 3 actions per round, x.com paths only for `go`.
- **S-5** API keys live only in `chrome.storage.local` and are used only in the background worker. The content script never requests them: it reads only `PUBLIC_DEFAULTS` keys and asks the background (`status` message) whether an AI is configured. Storage change events may still deliver a changed key to the page's isolated world; the content script discards those values.
- **S-6** No bulk actions, ever. Don't add loops that like/follow/DM multiple accounts.

## 9. Non-functional requirements

| Area | Requirement |
|---|---|
| Latency | Simple commands < 500 ms from end of word. "Stop" < 300 ms. AI answer typically 1–2 s (Groq). Agent round 1–3 s. |
| Cost | $0 with Groq/Gemini free tiers or Ollama. |
| Reliability | Survives X's SPA navigation; recognition auto-restarts; AI backup chain; Basic fallback. |
| Privacy | Basic mode sends nothing to an AI. Browser STT sends audio to Google (Chrome) or Microsoft (Edge). |
| Compatibility | Chrome and Edge, Manifest V3. Not Brave (speech recognition unsupported). |
| Code | Strict TypeScript, bundled by esbuild into `dist/` (the folder loaded in the browser). No frameworks, no runtime dependencies; dev dependencies only. |

## 10. Architecture

```
x.com tab                                         extension background (service worker)
┌─────────────────────────────────────┐          ┌─────────────────────────────────────┐
│ src/content/ → dist/content.js      │  chrome. │ src/background/ → dist/background.js│
│  listen (Web Speech, Whisper clip)  │ runtime. │  brain()      → callLLM()           │
│  analyze() → intent / text / brain  │ send-    │  agentStep()  → callLLM()           │
│  actions (click/type on X's DOM)    │ Message  │  research()   → callLLM(search)     │
│  agent loop (describePage → act)    │ ───────► │  transcribe() → Groq Whisper        │
│  speak (speechSynthesis) + panel    │ ◄─────── │  callLLM: provider chain + fallback │
└─────────────────────────────────────┘          └─────────────────────────────────────┘
                                                   src/options/ + static/options.html (settings)
```

### Files
| File | Role |
|---|---|
| `manifest.json` | MV3 manifest; content script on x.com/twitter.com; host permissions for AI APIs |
| `src/content/` | On the page. `routing.ts` (pure phrase → `Analysis`), `dispatch.ts` (acts on it, AI brain), `listen.ts`, `ear.ts` (Whisper capture), `speech.ts`, `panel.ts`, `tweets.ts`, `scroll.ts`, `reading.ts`, `reactions.ts`, `writing.ts`, `nav.ts`, `agent.ts`, `safety.ts`, `state.ts`, `index.ts` (boot) |
| `src/background/` | `llm.ts` (providers, fallback chain, timeouts, Whisper), `prompts.ts`, `json.ts`, `index.ts` (message handlers) |
| `src/shared/` | `settings.ts` (types + `DEFAULTS`, single source), `messages.ts` (typed message contracts) |
| `src/options/`, `static/` | Settings page code; `manifest.json` and `options.html` copied to `dist/` |
| `scripts/` | `build.mjs` (esbuild), `test.mjs`, `zip.mjs` |
| `tests/*.test.ts` | routing, safety, settings, background (fallback chain, timeouts) |
| `README.md` | User guide |

### Messages (content → background; typed in `src/shared/messages.ts`)
| `type` | Payload | Returns |
|---|---|---|
| `brain` | `command, screen, history` | `{say, actions}` |
| `agentStep` | `goal, steps, page` | `{say, actions, done}` |
| `research` | `tweet` | `{text, sources}` |
| `transcribe` | `audio` (base64 WAV) | `{text}` |
| `status` | — | `{hasAI, hasGroq}` (booleans only, never keys) |
| `openOptions` | — | `{ok}` |
Errors return `{error: "message"}`; `"NO_KEY"` means no AI configured.

### X page selectors (update here when X changes)
| Purpose | Selector |
|---|---|
| Tweet | `article[data-testid="tweet"]` |
| Tweet text / author | `[data-testid="tweetText"]`, `[data-testid="User-Name"]` |
| Tweet buttons | `like`, `unlike`, `retweet`, `unretweet`, `retweetConfirm`, `unretweetConfirm`, `bookmark`, `removeBookmark`, `reply` (all `data-testid`) |
| Compose | `SideNav_NewTweet_Button`, `tweetTextarea_0`, `tweetButton`, `tweetButtonInline` |
| Nav | `AppTabBar_Home_Link`, `AppTabBar_Explore_Link`, `AppTabBar_Notifications_Link`, `AppTabBar_Profile_Link` |
| Profile follow | `[data-testid="primaryColumn"] [data-testid="placementTracking"] [data-testid$="-follow"]` (and `-unfollow`), `confirmationSheetConfirm` |
| People search | `UserCell` |
| DMs (Basic script) | `/messages/compose`, `searchPeople`, `TypeaheadUser`/`typeaheadResult`/`[role="option"]`, `nextButton`, `dmComposerTextInput`, `dmComposerSendButton`, `conversation` |

Selectors are X's internal test IDs and can change without notice. Basic-mode features depend on them; the AI agent mostly doesn't (it reads labels).

## 11. Known limitations and risks

| Risk | Impact | Mitigation |
|---|---|---|
| X changes its HTML | Basic commands break | Selector table above; AI agent as fallback; route through one helper per feature |
| Free-tier limits (Groq ~30 req/min) | Pauses during long tasks | Backup chain; Basic fallback; agent max 12 rounds |
| Provider retires a model | AI errors | Groq auto-picks a current model; model names editable in settings |
| Echo (speaker → mic) | Self-triggering | Headphones; echo guard; `talkOver` setting |
| X automation rules | Account lock | One action per command; confirmations; no bulk features |
| AudioContext blocked until user gesture | Whisper unavailable | Silent fallback to browser STT; resumes on first click/key |
| Free tiers may train on data | Privacy | Basic mode; Ollama; documented in README |

## 12. Acceptance criteria (manual test checklist)

Run after any change, on x.com, with headphones:

- [ ] Panel appears, badge shows correct mode, bars move when speaking.
- [ ] "scroll" → "faster" → "stop": scroll starts, speeds up, stops in < 300 ms.
- [ ] "read this" reads the outlined tweet; "stop" cuts it off mid-sentence.
- [ ] "read my feed" → "next" → "like" → "stop": skips, likes the playing tweet, stops.
- [ ] "like" → "unlike" toggles the heart on the outlined tweet.
- [ ] "reply saying testing voice feed" → reads back → "cancel": nothing posted.
- [ ] "message NAME saying hi" (Basic) → reads back → "yes": DM delivered.
- [ ] "AI off" → badge Basic; "what is this about" → research needs AI message; "AI on" → badge AI.
- [ ] (AI) "what's on my feed?" → spoken summary of visible tweets.
- [ ] (AI) "I don't like this, skip" → skips, does not like.
- [ ] (AI) "send a DM to NAME saying hi" → agent completes, asks before Send.
- [ ] (AI) Invalid Groq key + valid Gemini key → still answers (backup).
- [ ] (AI) Disconnect internet → "like" still works; long sentence falls back or explains.
- [ ] `npm run check` passes (lint + tests).

## 13. Roadmap (suggested next work, in priority order)

1. **Selector resilience:** move all X selectors into one `SELECTORS` object in `src/content/`; each lookup tries a list of fallbacks (testid → aria-label → text). Add a "self-check" voice command that reports which selectors are missing on the current page.
2. ~~Split `content.js` into modules~~ — done in 2.0.0 (TypeScript modules; routing is unit-tested directly).
3. **Agent robustness:** detect no-progress rounds (same page twice), send the last error back to the model, and add a `back` action.
4. **Better Basic mode:** fuzzy matching for mis-heard words (e.g. Levenshtein ≤ 1 on command words), and "repeat" / "say that again".
5. **Hinglish support:** recognize common Hindi command words (e.g. "ruko" = stop, "aage" = next, "padho" = read) in Basic mode.
6. **Accessibility-tree reading** via `chrome.debugger` for the agent, as an option, for more reliable element labels.
7. **Voice replies preview:** show the drafted reply in the panel with word-level edits by voice ("change 'great' to 'amazing'").

## 14. Build and release (for Claude Code)

- Edit `src/`, then build. Load **`dist/`** unpacked in the browser:
  ```bash
  npm install        # once: TypeScript, esbuild, eslint
  npm run check      # typecheck + lint + tests + build
  npm run build      # bundle src/ into dist/ (npm run watch rebuilds on save)
  npm run zip        # optional: builds, then creates voice-feed.zip from dist/
  ```
- Reload: `chrome://extensions` (or `edge://extensions`) → ↻ on Voice Feed → refresh x.com.
- Bump `version` in `package.json` for each change set (the build copies it into the manifest); update `README.md` if user-facing behavior changes and this PRD if requirements change.
