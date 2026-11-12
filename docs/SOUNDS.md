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

All Kenney packs (Casino Audio, Interface Sounds, Impact Sounds, Sci-fi Sounds, Music Jingles) are CC0 (credit welcome but not required): Kenney Vleugels, https://kenney.nl.

## Still synth (no file yet)

- No good Kenney match (no water or sinking sounds): Battleship `miss`, `sunk`, `incoming`.
- Need generation (Stable Audio Open on SogoAI): `farkle`, `heartsBroken`, `queenSpades`, `moonShot`, `mysticHorn`, plus the Battleship three above.
- Kept synth on purpose: `scorePick` (also Mazewright loot), UI ticks, Chinese Checkers and Realmwright cues (already tuned for their art).

Service worker: MP3s use the network-first runtime cache in `static/service-worker.js`, so each file is cached after its first play and works offline from then on. They are not precached.
