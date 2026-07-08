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
- **But this external agent is "a raccoon with a flamethrower" — powerful reach, zero patience
  for ambiguity, so be PRECISE and give a DETAILED, numbered procedure.** A vague ask gets a
  vague or wrong result (or collateral damage). Spell it out foolproof: exactly where to go
  (which screen/menu/button), exactly what to type or paste **verbatim** (a complete,
  self-contained one-liner — no "…" to fill in, no assumed setup), exactly what to send back,
  and any "do NOT click X" guardrails. Assume nothing about environment or prior steps.
  Number the steps. One unambiguous task per turn.
- **Calibrate to his tooling literacy — MojoSOGO does NOT live in DevTools/F12/console.** Prefer
  point-and-click capture: **right-click the element → Inspect** selects it and shows its exact
  path in the breadcrumb (that's how he handed over the `html > … > div.modal` that cracked the
  bug); right-click → Copy → "Copy selector"/"Copy element" also works. If a console one-liner is
  genuinely required, walk him in every step: press **F12** (or right-click → Inspect), click the
  **Console** tab, paste this exact line, press **Enter**, copy the line it prints back. Never
  assume he knows "the F12 stuff."
- **Pin the RIGHT object.** When you're both saying "the popup"/"the tile," make sure it's the same
  element — there may be several `.modal`s or a stale one. Have him right-click → Inspect the
  specific thing and send the breadcrumb path, or give a selector to confirm, before acting on it.
- **He'd rather help than watch you burn an hour and credits guessing — so delegate early.** Reaching
  for the external agent is the *preferred* fast path when tools can't reach, not a last resort. A
  60-second copy-paste from him beats 60 minutes of blind iteration.
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
- **A module-scoped "already-seen" flag reset on remount replays stale modals and can hide
  live pending state → softlock.** Mystic Wood's `seenRoll` (suppresses re-popping a dice
  result) reset to 0 on every fresh client mount; a mobile reload *while an encounter was
  pending* replayed the last combat's dice (still in `results[me]`) instead of the live
  encounter, and closing it didn't re-render — a dead "Waiting…" turn (room 6JCP). Fixes,
  defence in depth: (1) seed the flag from current state on mount so nothing stale replays;
  (2) re-render when a transient modal closes so pending state resurfaces; (3) keep a
  resolve control in the persistent UI so a *pending server state can never be a UI dead
  end*. Peeking was a red herring — it can't mutate server state. (Mystic Wood, 2026-07-07.)

## Deploy & verify

- **Fixing "my change isn't showing" is usually deploy lag, not a bug.** Cloudflare Pages
  takes ~1–2 min to build after `git push`; testing immediately shows the *previous*
  version. The site footer prints the deployed `rev <hash>` — confirm it matches your
  latest commit before judging a fix. The service worker serves all `.js` **no-store**, so
  once a build is live you get fresh modules (hard-refresh to be safe).
- **Worker changes need `npm run deploy:brain` separately.** A push to `main` rebuilds the
  static client via Pages, but the Worker "brain" (anything under `workers/`, incl. a new
  `GAME_HANDLERS` row) only goes live with `deploy:brain`. → memory `worker-deploys-separately`.
