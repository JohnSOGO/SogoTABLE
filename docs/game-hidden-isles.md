# 🗺️ Hidden Isles

An original team word-clue game. Two crews (🦜 Parrots and 🐬 Dolphins by
default) race across a sea chart of 25 words. Each crew's **Navigator** sees the
secret chart and gives a one-word clue plus a number; the rest of the crew taps
words. Find all your islands first, and don't wake the 🐙 Kraken.

- Registry id `aa6b6dee04ef` (never changes), aliases `hidden_isles`, `word_clues`.
- 4+ seats (two per crew). Bots can navigate or crew.
- Timing: turn-based by crew; inside a crew's turn, any crew member may tap
  (first tap the server receives wins — a live round, by design).

## How a game runs

1. **Crews (setup).** After the host starts, seats are split into crews
   alternately; the first of each crew is its Navigator. Anyone can switch crew,
   take the Navigator role, or shuffle. Anyone taps **Set sail** once both crews
   have a Navigator and at least one guesser. A rematch keeps the crews and
   passes the Navigator role to the next crew member.
2. **Deal.** 25 words. The starting crew (random) has 9 islands, the other 8,
   plus 7 sandbars and 1 Kraken.
3. **Clue.** The Navigator gives one word + 0–9 or unlimited. A clue may not be,
   contain, or sit inside any face-down word (plurals count). N allows N+1
   guesses; 0 or unlimited allow any number.
4. **Guess.** Own island: keep going. Sandbar: turn ends. Rival island: it counts
   for them and the turn ends. Kraken: the crew loses at once. Uncovering a
   crew's last island wins for that crew, whoever tapped it. The crew may end its
   turn after at least one guess.

## Helps (all optional, host lobby)

- **Word pack:** classic / easy (kid-friendly words) / mixed.
- **Clue ideas** (default off): the Navigator sees up to six safe suggestions.
- **Crew pointers** (default on): crew mates point at words before revealing;
  a first tap selects and points, a second tap reveals.

## Away players

If a clue or guess phase has been open for 90 s, any seated player may **nudge**:
a bot gives the missing clue, or the guessing crew's turn ends. Bots pace
themselves with think times (Navigator ~5–9 s, each guess ~2.5–4 s) released by
`BOT_TICK` from any seated client (the Realmwright pattern); an all-bot table
plays straight through.

## Bots

`workers/games/hidden-isles/ai.js`. The word list (`words.js`) gives every word
association tags; a bot Navigator picks a tag shared by its islands and by no
risky word (the Kraken is never allowed; levels 1–2 accept some risk and aim at
fewer words). Crew bots read any clue through the same tags plus
`TAG_ALIASES`, so they understand human clues that use common words. With human
crew mates, bot crew members only drop a pointer on their best guess.

## Architecture

- **Server rules:** `workers/games/hidden-isles/` — `words.js` (content),
  `clues.js` (clue normalising, legality, association), `ai.js`, `rules.js`
  (state, actions, projection). The chart key is masked per viewer: only
  Navigators see face-down keys until the game ends.
- **Client:** `src/sogotable/static/games/hidden-isles/` — `render.js` and its
  views, `branding.js` (every word), `assets.js` (palette, art and sound
  overrides), `art.js` (inline SVG), `lobby.js`, `sfx.js`, `bot-tick.js`,
  `styles.js`. Wire contract: `PLAN.md` in that folder.
- **Stats:** win-only for now; `winner` is the winning crew's Navigator (stats
  has no team concept yet — follow-up).

## Renaming and swapping assets

- **Rename:** edit `branding.js`, then `name` in `games/registry.js` and
  `hidden-isles/manifest.js` (kept equal by the architecture test).
- **Art and sound:** drop a file in the game folder and point the matching key in
  `assets.js` at it; `null` keeps the built-in SVG art and synth cues.
- **Words:** add entries to `words.js` with tags; the rules test checks that no
  tag collides with a board word.
