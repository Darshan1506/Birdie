# Voice Feed

Use X (Twitter) completely hands-free. Scroll, listen to your feed, ask questions about tweets, like, reply, send DMs, and do anything else X can do, just by talking. Free to run.

## Setup (one time, about 5 minutes)

1. **Use Microsoft Edge** (recommended) or Chrome. Edge has much more natural voices.
2. Put this folder somewhere permanent, like Documents, and build it once: run `npm install`, then `npm run build`. (Or unzip a prebuilt `voice-feed.zip`.)
3. Open `edge://extensions` (or `chrome://extensions`), turn on **Developer mode**, click **Load unpacked**, and choose the **`dist`** folder.
4. Get a free Groq key: go to **console.groq.com/keys**, sign up with your email, click **Create API Key**, and copy it. No card needed.
5. Open x.com and allow the microphone when asked. Say **"open settings"**, paste the Groq key, and pick a voice with "Natural" in its name.
6. Refresh x.com. Put on headphones. Say **"What's on my feed?"**

Optional: add a free Gemini key as a backup (it can also search the web), and install Ollama as an offline backup. If your main AI is busy or down, it switches automatically.

## Two modes: AI and Basic

The badge on the panel shows which mode you're in. Switch any time by saying **"AI on"** or **"AI off"**, or in settings.

| | Basic mode | AI mode |
|---|---|---|
| Needs | Nothing | A free Groq key (or Gemini/Ollama) |
| How you talk | Fixed commands | Anything, in your own words |
| Speed | Instant | Instant for short commands, about a second for the rest |
| Sends your words to an AI | No | Yes |
| Answers questions, writes replies for you | No | Yes |
| Does any task on X | Only the commands below | Yes |

If AI mode fails (no internet, free limit reached), it automatically tries the basic command instead.

## How to use it

Just talk. The small panel at the bottom-left shows what it heard and what it's doing. The blue outline marks the tweet it's working with.

**Works in both modes:**
- **Move:** stop · scroll · faster · slower · next · previous · top
- **Listen:** read this · read my feed · read replies
- **React:** like · repost · save · follow (and unlike, undo repost, unsave, unfollow)
- **Write:** reply saying … · quote saying … · post saying …
- **Messages:** message Rahul saying … · read my messages · open messages
- **Go:** home · explore · notifications · bookmarks · my lists · my profile · open Rahul's profile · search for … · X settings
- **Other:** help · settings · hide panel · AI on · AI off

**Only in AI mode, in your own words:**
- "What's on my feed?" / "Is this true?" / "Who is this guy?"
- "Tell her I loved the thread" (writes the reply for you)
- "Mute this account" / "Change my bio to …" / anything else X can do
- "I don't like this, skip" (understands meaning, not just keywords)

**Read my feed** reads tweets one after another like a podcast. Say "next" to skip, "like" to like the one playing, "stop" to end.

**Safety:** before anything that sends, posts, deletes, blocks, mutes or saves, it tells you exactly what it's about to do and waits for **yes** or **no**. **Stop** works instantly at any time.

## Settings worth knowing

- **Sharper hearing (Whisper):** on by default when you have a Groq key. Longer sentences get re-checked by a better speech model, which helps with Indian accents and Hinglish. Set the language to English (India) for best results.
- **How you write:** describe your style ("casual, short, some Hinglish") and replies will sound like you.
- **Wake word:** turn it on if people talk around you. Then commands start with "Hey feed". Stop, yes, and no always work without it.
- **I use headphones:** lets you interrupt while it's talking.

## Troubleshooting

| Problem | Fix |
|---|---|
| No panel on x.com | Check the extension is on, then refresh x.com |
| "Microphone blocked" | Click the mic icon in the address bar → Allow → refresh |
| Panel says Listening but nothing happens | Pick the right mic at `chrome://settings/content/microphone` (or `edge://settings/content/microphone`); unmute the laptop mic |
| "Problem: network" | Turn off VPN. Use Chrome or Edge, not Brave |
| "Free limit reached" | Wait a minute, or add a Gemini key as backup |
| Says "Basic" but you want AI | Say "AI on". If it asks for a key, say "open settings" and add a free Groq key |
| A command stops working | X changed its page. Note what the panel says and patch the selectors in `src/content/` (see PRD §10), then `npm run build` |

## Updating

Keep a copy of the working folder before replacing it. To update: replace the files, click **↻** on Voice Feed in the extensions page, and refresh x.com. Your settings and keys stay saved.

## Privacy

Speech recognition in the browser sends audio to Google (Chrome) or Microsoft (Edge). With Whisper on, longer sentences are also sent to Groq. Tweets on screen and what you say go to the AI you chose. Free tiers may use requests to improve their models, so don't dictate anything sensitive. Keys are stored only in your browser.

## Fair use

Every action is one you ask for, one at a time, like clicking yourself. Don't turn it into a bulk liker, follower or DMer; X treats that as spam and may lock your account.

## Files

Written in TypeScript; `npm run build` bundles it into `dist/`, the folder you load in the browser.

- `src/content/`: runs on x.com; listening (`listen.ts`), command routing (`routing.ts`), actions, the task agent (`agent.ts`), safety rules (`safety.ts`), the panel
- `src/background/`: all AI calls (`llm.ts`), prompts, backups between providers, Whisper
- `src/options/`: settings page code; `static/options.html` and `static/manifest.json` are copied into `dist/`
- `src/shared/`: settings defaults and the message types shared by all of the above
- `PRD.md`: full product spec (requirements, architecture, safety rules, selectors, roadmap)
- `CLAUDE.md`: instructions Claude Code reads automatically
- `tests/`: routing, safety, settings and AI-chain tests; run `npm install` once, then `npm run check`
- Development: `npm run watch` rebuilds on every save; press ↻ on the extension after a rebuild

## Building with Claude Code

Open this folder in Claude Code. It reads `CLAUDE.md` automatically, which points it to `PRD.md`. Try asking it to work through the roadmap in PRD section 13, for example: "Implement roadmap item 1 from the PRD."

MIT License.
# Birdie
