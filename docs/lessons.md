# SogoTable — Lessons & Gotchas

Hard-won, cross-cutting lessons — the traps that cost real time, so the next
session (human or AI) doesn't re-pay for them. This is an **index**: each entry is
a one-line takeaway plus a pointer to the fuller rule in the owning doc. Keep the
*detail* next to the rule it reinforces (e.g. a CSS-scoping lesson lives in
`adding-a-game.md`); keep the *pointer* here so it's discoverable.

**Adding an entry:** a lesson earns a spot here when it (a) cost more than an hour,
(b) is not obvious from the code, and (c) will recur. One tight paragraph, newest
concerns first within a section. Put the how-to in the topic doc and link it.

---

## Working method (read first)

- **Treat MojoSOGO as an external agent — a peripheral outside the computer's reach.** Narrow
  capability surface (only a handful of things: read the live device screen, run a browser
  console on his phone, observe hardware, judge feel/aesthetics), but for those things he is
  the *only* agent that can act — the sandbox can't. So **delegate to him exactly like a
  subagent**: a precise, self-contained task with a result expected back — "paste the output
  of this one-liner," not "can you check…". Reserve him for what's genuinely outside the
  sandbox (don't burn him on things you can do yourself), and reach for him the moment you're
  blocked, not after a dozen blind guesses. The Mystic Wood popup saga ran for a dozen
  reasoned-not-measured "fixes" while the browser tool kept timing out; it collapsed in five
  minutes the instant he pasted a `getComputedStyle(modal).position` result (`fixed` at
  `[0,0]` — impossible from our own CSS, so it *had* to be an external rule). When your tools
  can't reach, he is the sensor/actuator that can — use him as one.
- **A subagent inherits your framing — point it at the bug, not your prior.** If you've
  already decided "it's probably X," a diagnostic agent prompted around X will thoroughly
  *confirm* X. Ask it to find *what's wrong*, name the full search surface (all files, not a
  subset), and let it contradict you. (The popup agent verified the popup's own CSS was
  correct — true and useless — because that's what the prompt scoped it to.)

## Building & porting a game

- **Port the developed UI verbatim — never regenerate it.** When a prototype exists in
  `AI/<game>/`, the shipped client MUST be that UI, lifted (CSS + render code), rewiring
  only the data-source and intent seams. A fresh "cleaner" re-implementation is a defect;
  it has shipped wrong-UI ports more than once. → `adding-a-game.md` Phase 0 (hard rule).
- **Scoping a lifted stylesheet under `.<game>-root` is NOT enough — reused generic class
  names still leak.** A bare shell rule bleeds every property your scoped rule doesn't
  explicitly set. `.cell{aspect-ratio:1;background:#fff}` (`styles-games.css`) squared
  Mystic Wood's board tiles; `.modal{position:fixed;inset:0}` (**`styles-roster.css`** —
  easy to miss) pinned its popup to the top-left. Fix: prefix your classes uniquely
  (`.mw-modal` not `.modal`) or reset the leaked layout props; grep **all**
  `src/sogotable/static/styles*.css`. → `adding-a-game.md` "Scope every CSS selector".
- **Diagnose live-DOM layout bugs from numbers, not guesses.** Have the user paste a
  `getBoundingClientRect()` + `getComputedStyle(el).position` one-liner from the browser
  console. An element reading `position:fixed` at `[0,0]` when your CSS never set it = a
  shell class collision. Turned a multi-day guessing loop into a five-minute find.
- **The `GAME_HANDLERS` dispatch row lives in `workers/games/handlers.js`** — one import +
  one row — **not** `workers/sogotable-api.js` (older docs said otherwise). The worker
  entry stays a router. → `adding-a-game.md` Phase 2.
- **`app.js` is at its top-level-`let` cap and near its line ceiling.** A custom-display
  host-start game joins the **shared** render branch (import + a few in-place identifier
  insertions); no new `let`, no bespoke `if`-block. View state (zoom/camera/selection)
  lives in the game module, never a shell global. → `architecture.test.js` CEILINGS.

## Rules / server state

- **Per-seat, not shared, for anything the client must read after its turn ends.** A single
  `game.last_roll` was clobbered by the bots that resolve in the *same* `makeMove` call
  after a human's turn passed, so the human never saw their own result. Key such data by
  seat mark (`game.results[mark]`). (Mystic Wood, 2026-07-07.)
- **Recycle quest-critical entities or a game can stall unwinnable.** Removing the Dragon
  when a non-George knight beats it, or deleting companions on a loss, made quests
  impossible → seeded games that never completed. Recycle into the deck instead. Found by
  a seeded full-game integration test — write one. (Mystic Wood.)

## Deploy & verify

- **Fixing "my change isn't showing" is usually deploy lag, not a bug.** Cloudflare Pages
  takes ~1–2 min to build after `git push`; testing immediately shows the *previous*
  version. The site footer prints the deployed `rev <hash>` — confirm it matches your
  latest commit before judging a fix. The service worker serves all `.js` **no-store**, so
  once a build is live you get fresh modules (hard-refresh to be safe).
- **Worker changes need `npm run deploy:brain` separately.** A push to `main` rebuilds the
  static client via Pages, but the Worker "brain" (anything under `workers/`, incl. a new
  `GAME_HANDLERS` row) only goes live with `deploy:brain`. → memory `worker-deploys-separately`.
