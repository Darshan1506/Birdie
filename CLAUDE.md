# CLAUDE.md

Voice Feed is a Chrome/Edge (Manifest V3) extension for hands-free use of X (Twitter). Strict TypeScript, bundled by esbuild into `dist/`. No runtime dependencies.

**Read `PRD.md` before making changes.** It is the source of truth for behavior, modes, safety rules, message contracts, settings keys and X selectors.

## Commands

```bash
npm install        # once (TypeScript, esbuild, eslint, tsx)
npm run check      # typecheck + lint + tests + build — must pass before you finish
npm test           # tests only
npm run build      # src/ -> dist/ (the folder you load in the browser)
npm run watch      # rebuild on save
npm run zip        # build, then package voice-feed.zip
```

Manual testing happens in the browser: `chrome://extensions` → Developer mode → Load unpacked → choose **`dist/`** → ↻ after each build → refresh x.com. Use the checklist in PRD §12.

## Layout

- `src/content/` — runs on x.com. `routing.ts` (pure: phrase → `Analysis`), `dispatch.ts` (acts on it; AI brain), `listen.ts`, `ear.ts` (Whisper capture), `speech.ts`, `panel.ts`, `tweets.ts`, `scroll.ts`, `reading.ts`, `reactions.ts`, `writing.ts`, `nav.ts`, `agent.ts` (page agent), `safety.ts` (confirmation rules), `state.ts`, `index.ts` (boot).
- `src/background/` — all AI calls: `llm.ts` (providers, fallback chain, timeouts, Whisper), `prompts.ts`, `index.ts` (message handlers). Keys are used only here.
- `src/shared/` — `settings.ts` (types + `DEFAULTS`, the single source) and `messages.ts` (typed content↔background contract).
- `src/options/options.ts` + `static/options.html` — settings; every key in `DEFAULTS` must have a matching element `id` (a test enforces it).
- `static/manifest.json` — copied to `dist/`; its `version` is overwritten from `package.json` by the build.
- `tests/*.test.ts` — run with tsx via `scripts/test.mjs`. `routing.ts` and `safety.ts` are pure and imported directly.

## Rules

1. **Never weaken the safety rules in PRD §8.** Keep the confirmation gate (`safety.ts`) and the `pending` confirm flow in code (not in prompts); keep "stop" instant and able to cancel everything; never add bulk actions.
2. **Both modes must keep working.** Anything new that uses AI must check `isSmart()` and have sensible Basic-mode behavior (a fallback or a clear spoken message).
3. **API keys stay in the background.** The content script must not make AI network calls and must not request `groqKey`/`geminiKey`/`apiKey` (use `PUBLIC_DEFAULTS` and the `status` message).
4. **Keep `INTENTS` order meaningful**: specific patterns before general ones (`read_messages` before `read`, `unlike` before `like`). Add a test in `tests/routing.test.ts` for every new command or routing change.
5. **Navigation must not reload the page.** Use `spaNav()`, never `location.assign` or `location.href =`. Never name a variable `history` (it shadows `window.history`).
6. **Type into X with `typeInto()`** (uses `execCommand("insertText")`) so X's editors register the text.
7. **Keep spoken text short and natural.** Prefer `ack()` (blip + badge) over speaking for simple actions.
8. **New content↔background message:** add it to the `Contract` in `src/shared/messages.ts` and a handler in `src/background/index.ts`; the compiler then enforces both sides. Document it in PRD §10.
9. When adding a setting: add it to `Settings` and `DEFAULTS` in `src/shared/settings.ts` (once), add the form field in `static/options.html`, and document it in PRD §7.11. API keys must also be listed in `SECRET_KEYS`.
10. When X selectors change, update them in code and in the selector table in PRD §10.
11. Bump `version` in `package.json` (the build copies it into the manifest), and update `README.md` for user-facing changes.

## Style

- Strict TypeScript: no `any` without a comment explaining why; validate untrusted data (AI output, page text) at the boundary.
- 2-space indent, double quotes, semicolons.
- Small named functions; comments explain *why*, not *what*.
- One place for shared state (`state.ts`); modules import functions, not each other's private variables.
- No frameworks or new runtime dependencies without a strong reason.
