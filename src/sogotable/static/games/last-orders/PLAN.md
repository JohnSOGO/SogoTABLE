# 🍻 Last Orders — design + wire contract

An ORIGINAL tavern-brawl card game for SogoTable. It uses the familiar
"drinking-and-brawling card game" family of mechanics (two tracks that meet,
gold, an action each turn, buying drinks for rivals, a shared drink deck,
reactions, gambling rounds, last one standing wins). Its name, characters,
card names, card text and art are SogoTable's own. Do not copy any existing
game's characters, card names, card text, art or expansions.

Opaque game id: `618a2d361857` (`GAME_IDS.lastOrders`). Directory: `last-orders`.

## 1. Rules (player-facing summary)

Every patron has three numbers:

| Rule id | Display name | Start | Meaning |
|---|---|---|---|
| `grit` | Grit | 20 | how much punishment you can take |
| `buzz` | Buzz | 0 | how drunk you are |
| `gold` | Coins | 10 | your purse |

You are **out** the moment any of these happens (checked after every resolution):

- `buzz >= grit` → **passed out** (`out: "passed_out"`)
- `grit <= 0` → **knocked out** (`out: "knocked_out"`)
- `gold <= 0` → **broke**, thrown out (`out: "broke"`)

Last patron still in the game wins. If the last players all go out in the same
resolution, the one with the most coins wins (then highest `grit - buzz`, then seat order).

### Turn (classic order around the table)

1. **Discard & draw** (`phase: "discard"`) — discard 0–3 cards, then draw back to your hand size (7).
2. **Action** (`phase: "action"`) — play at most ONE action card (some say "free" or grant another action), or skip.
3. **Order a round** (`phase: "order"`) — pick another patron; the top drink of the drink deck goes face down onto their drink line. You may first add one **spike** card from your hand to it (e.g. "make it a double").
4. **Drink** (`phase: "drink"`) — flip the top drink of YOUR line (an empty line means the barkeep pours you one off the deck) and drink it.

Then play passes to the next patron who is still in.

### Reaction windows (timed, anyone can respond)

Every action, drink, or gamble play opens a **reaction window** of
`options.react_seconds` (default 8). While it is open, anyone allowed to may
play a reaction card on top. Each new card restarts the clock. When the clock
runs out, or everyone eligible has tapped **Pass**, the stack resolves top
down (last played resolves first). A **negate** cancels the card under it, so a
negate can itself be negated.

You may not respond to your own card on top of the stack.

### Gambling rounds

An action with `{op:"gamble"}` starts a gambling round. Everyone still in pays
an ante (`1` coin, `2` during some events) into the pot and the player who
started it **leads**. A gamble window opens. Any gambler except the leader may
play a **gamble** card (take the lead, or raise: everyone in pays more and you
lead). Gamble cards can be answered with reactions like any other card. When a
gamble window closes with nobody taking over, the leader wins the pot.

### Closing time (keeps games finite)

From table round 8 every drink gets +1 buzz, +2 from round 12, +3 from 16.
Formula: `escalation = max(0, floor((round - 4) / 4))`. (`round` counts full
trips around the table, starting at 1.)

## 2. Card data (server, `workers/games/last-orders/`)

All rules data is plain JSON-like objects. Display text lives on the client
(§4). Ids are namespaced `<pack>:<character>:<card>` or `<pack>:drink:<x>` or
`<pack>:event:<x>` and are permanent once shipped.

### CardDef (hand cards)

```js
{
  id: "base:gorrum:headbutt",
  kind: "action" | "reaction" | "gamble" | "spike",
  copies: 2,                 // copies in that character's deck
  target: "opponent" | "none",   // action / reaction (redirect) target picked at play time
  effects: [Effect, ...],
  // action only:
  free: true,                // does not use up your one action
  unstoppable: true,         // cannot be negated (use sparingly)
  // reaction only:
  answers: ["action", "drink", "gamble", "reaction"],  // kinds of TOP stack item it can be played on
  needs: "targeted" | "any", // targeted = the top item's target must be you
}
```

### Effect vocabulary (the engine implements exactly these)

`who` is relative to the card's player: `"self"`, `"target"`, `"others"` (everyone else still in), `"all"` (everyone still in).

| op | fields | meaning |
|---|---|---|
| `grit` | `who, n` | change grit by n (negative = damage; damage gets the player's `damage_bonus`) |
| `buzz` | `who, n` | change buzz by n (floor 0) |
| `gold` | `who, n` | gain/lose coins to/from the bank (floor 0) |
| `steal` | `n` | target pays you up to n coins |
| `collect` | `n` | every other patron pays you up to n coins |
| `draw` | `who, n` | draw n cards |
| `order` | `n` | n extra drinks from the drink deck onto the TARGET's line |
| `gamble` | — | start a gambling round led by you (action only) |
| `extra_action` | — | you may play one more action this turn |
| `negate` | — | reaction: cancel the item directly beneath |
| `redirect` | — | reaction: the item beneath now targets the reaction's chosen `target` instead (only items that have a target) |
| `reflect` | — | reaction: the item beneath now targets the player who played it |
| `soften` | `n` | reaction: reduce the grit damage AND buzz the item beneath would deal to its target by n each |
| `take_lead` | — | gamble: you lead the gamble |
| `raise` | `n` | gamble: everyone in the gamble pays n more coins into the pot, and you lead |

Spike cards carry effects with `who: "target"` meaning the drinker; they are
attached to the drink when ordered and resolve with it.

### DrinkDef

```js
{ id: "base:drink:house-ale", copies: 6, effects: [{ op: "buzz", who: "target", n: 1 }],
  chaser: true,       // after it resolves, the drinker flips another drink off the deck and drinks that too
  house: true,        // everyone still in drinks it (each its own resolution, drinker first)
  unrefusable: true,  // reactions cannot negate it
}
```

In drinks, `who: "target"` is the drinker. `grit` effects heal (n>0) or hurt.

### CharacterDef

```js
{ id: "base:gorrum", pack: "base", deck: [CardDef...],
  trait: { start_grit, start_gold, start_buzz, hand_size, drink_buzz_mod, damage_bonus, pot_bonus, draw_bonus } }
```

Trait fields are all optional numbers (deltas from the defaults; `drink_buzz_mod`
applies to every drink's buzz for that character, floor 0; `damage_bonus` adds to grit
damage your actions deal; `pot_bonus` coins from the bank when you win a gamble;
`draw_bonus` extra cards you may discard and redraw in your discard step).

### EventDef (Rowdy Nights deck, optional)

At the start of every table round (when play returns to the first seat) one
event flips and lasts for that round.

```js
{ id: "rowdy:event:bard-night", copies: 1,
  mods: { drink_buzz: 1, ante: 1, damage: 1 },   // all optional numeric deltas for the round
  on_flip: [Effect...] }                         // resolved once, actor = nobody, who: "all"
```

### Packs (`PACKS` in `workers/games/last-orders/packs.js`)

```js
{ id: "base", characters: [...], drinks: [...], events: [] }
```

Base: 4 characters + the base drink deck. Expansions (host toggles): `harbor`,
`frost`, `masquerade`, `clockwork` (each 2 characters + a few drinks), `rowdy`
(event deck only). Turning a pack on adds its characters to the pick list and
its drinks/events to the shared decks.

## 3. Server state + actions

`game.phase`: `"pick"` (everyone chooses a character at once) → `"play"` → status `"complete"`.

```js
game = {
  game_id, status, phase: "pick" | "play", options, seat_order, step, round, move_count,
  players: { P1: { is_bot, level, character, grit, buzz, gold, hand: [{uid, id}], deck: [...], discard: [...],
                   line: [{ drink, spikes: [...] }], out: null | "passed_out" | "knocked_out" | "broke", out_order, pick_done } },
  turn: { mark, phase: "discard" | "action" | "order" | "drink", actions_left, act_at },
  reaction: null | { kind: "react" | "gamble", stack: [Item], closes_at, passed: [marks], plans: { [botMark]: { at, uid, target } | { at, pass: true } } },
  gamble: null | { leader, pot, in: [marks] },
  drink_deck, drink_discard, event_deck, event, events: [], skip_votes, winner, results,
}
Item = { uid, by, kind: "action" | "drink" | "gamble" | "reaction" | "spike", card, target, spikes, canceled, soften }
```

`game.step` bumps on every visible change. Every client action is stamped with
the `step` it was built against; a mismatched stamp is **rejected loudly**
("The table moved on — try again."). Unstamped is accepted (deploy safety).

| Action | Who | Payload |
|---|---|---|
| `PICK` | anyone, phase pick | `{ character }` |
| `DISCARD` | turn player, discard phase | `{ uids: [≤3] }` |
| `PLAY` | turn player (action/order phase) or anyone eligible in a window | `{ uid, target? }` |
| `END_ACTION` | turn player, action phase, no window | `{}` |
| `ORDER` | turn player, order phase | `{ target, spike? }` (spike = a hand uid) |
| `PASS` | anyone eligible in a window | `{}` |
| `TICK` | any seated human | `{}` — releases due bots / expired windows; throws "Nothing is due yet." when nothing is |
| `SKIP_PLAYER` | humans | `{ target }` — unanimous vote: the stuck turn player is auto-played by the bot brain for this turn |

All carry `step`. The Worker has no timers: the projection carries
`next_due_at` (earliest of window close and bot step times) + `server_now`; a
seated human's phone sends `TICK` when it passes (Realmwright `bot-tick.js`
pattern, staggered by human seat index).

Bots run inside the rules module through the human path. Every bot gets a plan
(react or pass) with its own think time whenever a window opens or changes, so
whether a bot will react is never visible early.

## 4. Projection (`lastOrdersToDictForViewer`)

```js
{
  game_id, status, phase, step, round, options, server_now, next_due_at,
  seat_order, winner, results,
  characters: [{ id, pack, trait }],        // pick list for the enabled packs
  players: [{ mark, is_bot, level, character, grit, buzz, gold, out, out_order,
              hand_count, deck_count, line_count, picked }],
  turn: { mark, phase, actions_left },
  reaction: null | { kind, closes_at, stack: [{ uid, by, kind, card, target, canceled, soften }], passed: [marks], eligible: [marks] },
  gamble: null | { leader, pot, in },
  event: null | eventId,
  drink_deck_count, last_drink: { drink, spikes, by, target } | null,
  me: { mark, hand: [{ uid, id }], playable: [uid], targets: { [uid]: [marks] }, can_pass, discard_max },
  defs: { [cardOrDrinkOrEventId]: def },     // every def the viewer can see right now (hand, stack, last drink, event, picks)
  skip_votes, events: [{ seq, type, ... }],
}
```

`me.playable` and `me.targets` are computed on the server: the UI NEVER decides
legality, it only highlights what the server says.

Event types (for animation): `pick`, `turn`, `discard`, `play`, `react`,
`negated`, `resolve`, `grit`, `buzz`, `gold`, `order`, `drink`, `gamble_start`,
`gamble_lead`, `gamble_win`, `out`, `event_flip`, `win`, `skip`.

## 5. Client (`src/sogotable/static/games/last-orders/`)

- `branding.js` — every user-facing word (game name, stat names, phase names, buttons).
- `content.js` — display table: `CHARACTERS[id] = { name, title, blurb, palette }`, `CARDS[id] = { name, flavor, text? }`, `DRINKS[id]`, `EVENTS[id]`, `PACKS[id] = { name, blurb }`. If `text` is omitted the UI builds rules text from the projected def via `describe.js`.
- `assets.js` — swappable art/sound overrides (null = procedural SVG / synth).
- `art.js` — original procedural SVG portraits, card frames, drink art.
- `render.js` + helpers, `lobby.js` (options), `tick.js`, `sfx.js`, `fx.js`, `styles.js`.

### Host options

| key | values | default |
|---|---|---|
| `react_seconds` | 5, 8, 12, 20 | 8 |
| `expansions` | any of harbor, frost, masquerade, clockwork, rowdy | [] |
| `closing_time` | true/false | true |
| `random_characters` | true/false | false |
| `show_playable` | true/false (glow on playable cards) | true |

Every help is optional: the playable glow (host), and per-device toggles for
card tips, the rules primer, and auto-pass when you hold nothing playable.
