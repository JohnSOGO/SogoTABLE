# Sound files

Every recorded sound file shipped with SogoTable. Decision and rules: `docs/audio.md` (AREC revision 2026-11-12). Source spec: `docs/sfx-spec.md`.

Every file cue falls back to its synth cue (muted device, no `<audio>`, or the file can't start). UI ticks (click, confirm, cancel, turn, invalid move) are synth-only.

## How files are made

1. Pick a source clip. Check CC0 packs (Kenney) first, and generate with Stable Audio Open on SogoAI only for gaps.
2. Trim silence at both ends, convert to mono, 44.1 kHz, MP3 96 kbps, and peak-normalise to -1.5 dBFS:
   ```sh
   ffmpeg -i in.ogg -af "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse" -ac 1 -ar 44100 t.wav
   # read max_volume, then apply gain = -1.5 - max_volume
   ffmpeg -i t.wav -af volumedetect -f null -
   ffmpeg -i t.wav -af "volume=<gain>dB" -c:a libmp3lame -b:a 96k cue.mp3
   ```
   Peak normalisation is used instead of the spec's `loudnorm`, because these clips are mostly under 0.4 s. That's shorter than the EBU R128 gating block, so `loudnorm` reads them as silence and over-boosts them into clipping.
3. Map the file in `src/sogotable/static/sound-files.js` (global cues), or in the game's `assets.js` `ASSETS.sounds` (per-game cues). Only map files that are committed.
4. Add a row below.

Win/lose jingles were chosen by melodic direction (rising for win, falling for lose) and should be confirmed by ear.

Playback level: global file cues play at 0.35 (`cue()` in `sound.js`), and per-game cues use their `sfx.js` level. Both are scaled by the 5-step volume control. Tune by ear on a phone speaker at level 2.

## Files

| File | Cue | Source | Licence |
| --- | --- | --- | --- |
| `static/sounds/dice-roll.mp3` | global `diceRoll` (10,000, Yahtzee) | Kenney Casino Audio 1.1, `dice-throw-1.ogg` | CC0 |
| `static/sounds/bank.mp3` | global `bank` (10,000 bank, Hearts round end) | Kenney Casino Audio 1.1, `chips-stack-3.ogg` | CC0 |
| `static/sounds/card-deal.mp3` | global `cardDeal` (Hearts deal and pass) | Kenney Casino Audio 1.1, `card-fan-1.ogg` | CC0 |
| `static/sounds/card-play.mp3` | global `cardPlay` (Hearts) | Kenney Casino Audio 1.1, `card-place-1.ogg` | CC0 |
| `static/sounds/trick-take.mp3` | global `trickTake` (Hearts) | Kenney Casino Audio 1.1, `card-shove-1.ogg` | CC0 |
| `static/games/last-orders/sounds/play.mp3` | Last Orders `play` | Kenney Casino Audio 1.1, `card-place-2.ogg` | CC0 |
| `static/games/last-orders/sounds/coins.mp3` | Last Orders `coins` | Kenney Casino Audio 1.1, `chips-handle-1.ogg` | CC0 |
| `static/sounds/win.mp3` | global `win` | Kenney Music Jingles, `Steel jingles/jingles_STEEL02.ogg` | CC0 |
| `static/sounds/lose.mp3` | global `lose` | Kenney Music Jingles, `Pizzicato jingles/jingles_PIZZI01.ogg` | CC0 |
| `static/sounds/room-created.mp3` | global `roomCreated` | Kenney Interface Sounds, `confirmation_001.ogg` | CC0 |
| `static/sounds/invite.mp3` | global `invite` | Kenney Interface Sounds, `glass_001.ogg` | CC0 |
| `static/sounds/player-joined.mp3` | global `playerJoined` | Kenney Impact Sounds, `impactWood_light_000` + `_002` 170 ms apart (two knocks) | CC0 |
| `static/games/battleship/sounds/fire.mp3` | Battleship `fire` | Kenney Sci-fi Sounds, `lowFrequency_explosion_001.ogg` | CC0 |
| `static/games/battleship/sounds/hit.mp3` | Battleship `hit` | Kenney Sci-fi Sounds, `explosionCrunch_002.ogg` | CC0 |
| `static/sounds/farkle.mp3` | global `farkle` (10,000) | Stable Audio Open 1.0 via SogoAI `/v1/audio/sfx`, 1.0 s, seed 102: "short comic deflating trombone wah, cartoon fail sound, clean, close, dry" | Stability AI Community License |
| `static/sounds/hearts-broken.mp3` | global `heartsBroken` (Hearts) | Stable Audio Open 1.0 via SogoAI `/v1/audio/sfx`, 1.2 s, seed 100: "glass heart cracking, light shatter, magical sparkle tail, clean, close" | Stability AI Community License |
| `static/sounds/queen-spades.mp3` | global `queenSpades` (Hearts) | Stable Audio Open 1.0 via SogoAI `/v1/audio/sfx`, 1.5 s, seed 103: "ominous low gong hit with dark reverb tail" | Stability AI Community License |
| `static/sounds/moon-shot.mp3` | global `moonShot` (Hearts) | Stable Audio Open 1.0 via SogoAI `/v1/audio/sfx`, 2.5 s, seed 103: "triumphant short brass fanfare, orchestral, bright" | Stability AI Community License |
| `static/sounds/mystic-horn.mp3` | global `mysticHorn` (Mystic Wood) | Stable Audio Open 1.0 via SogoAI `/v1/audio/sfx`, 2.0 s, seed 102: "ancient hunting horn call in a misty forest, long and hollow" | Stability AI Community License |
| `static/games/battleship/sounds/miss.mp3` | Battleship `miss` | Stable Audio Open 1.0 via SogoAI `/v1/audio/sfx`, 1.2 s, seed 101: "cannonball splashing into the sea, water splash, clean, close, dry" | Stability AI Community License |
| `static/games/battleship/sounds/sunk.mp3` | Battleship `sunk` | Stable Audio Open 1.0 via SogoAI `/v1/audio/sfx`, 3.0 s, seed 100: "steel ship hull groaning and sinking, bubbles rising underwater" | Stability AI Community License |
| `static/games/battleship/sounds/incoming.mp3` | Battleship `incoming` | Stable Audio Open 1.0 via SogoAI `/v1/audio/sfx`, 1.2 s, seed 101: "artillery shell whistle falling, descending pitch, clean, dry" | Stability AI Community License |

All Kenney packs (Casino Audio, Interface Sounds, Impact Sounds, Sci-fi Sounds, Music Jingles) are CC0 (credit welcome but not required): Kenney Vleugels, https://kenney.nl.

## Still synth (no file yet)

- Kept synth on purpose: `scorePick` (also Mazewright loot), UI ticks, Chinese Checkers and Realmwright cues (already tuned for their art).

## Generated sounds (Stable Audio Open)

Made once, offline, on SogoAI through its model manager (`POST http://127.0.0.1:8793/v1/audio/sfx`, run on that PC, never from the game). Each cue had 4 takes (seeds 100-103), and the take numbers and all WAVs are in `C:\Users\Public\kenney-audio\sao\<cue>\` on SogoAI. To re-make one, post the same prompt, length and seed.

Picking (2026-11-12) was done by measurement, not by ear: takes with clipped (full-scale) samples or a hard start were rejected, then the most tonal take was preferred for musical cues. Swap in another take if one sounds wrong on a phone. Licence: Stability AI Community License (free below $1M annual revenue). Credit: sounds generated with Stable Audio Open 1.0 by Stability AI.

Service worker: MP3s use the network-first runtime cache in `static/service-worker.js`, so each file is cached after its first play and works offline from then on. They are not precached.
| `static/sounds/card-deal.mp3`, `trick-take.mp3`, `win.mp3` (shared, no new files) | Tracklayers `draw`, `tickets`, `win` via `games/tracklayers/assets.js` | as above | CC0 |

## Reviewing sounds and pictures (Asset Review)

The Sogo admin's lobby has an **Admin → 🎧 Asset Review** screen (`static/admin/asset-review/`, loaded only when opened). For each sound cue it plays the shipped file, every alternate Stable Audio Open take, and the synth fallback, and "In game" plays the cue through the game's own code at game volume. It draws the waveform and shows length, peak, RMS level, size, clipped samples and leading silence against the targets above. A/B compare, "Match loudness", filters by kind, game and status, keyboard shortcuts (press `?`) and a progress count are built in. Pictures from every game's `assets.js` are listed too, shown full size and at in-game card size on light, dark or felt.

Approving opens the next unreviewed asset automatically. Each verdict (approved / rejected / not reviewed, a note, the picked take, and a "regenerate with my note" flag) is saved by the Worker under `data.asset_reviews` (`workers/asset-reviews.js`, Sogo passcode on every route). Read them with `npm run assetreviews -- <passcode>` or the screen's Markdown/JSON export. The app never changes a shipped file: swapping in a picked take or regenerating is done afterwards from the export, and the row above is updated.

Alternate takes: all four seeds of each generated cue are in `static/sounds/takes/<global|game>/<cue>/seed-<n>.mp3`, converted with the same steps as the shipped files and listed in `admin/asset-review/takes.js`. Only this screen loads them; they are not precached.

