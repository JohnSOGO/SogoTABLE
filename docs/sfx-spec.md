# Sound-effect files spec (from SogoAI)

Received from the SogoAI project on 2026-11-12 (written there 2026-11-11). Status and decisions: `docs/audio.md` (AREC) and `docs/SOUNDS.md` (every shipped file).

```text
SPEC: Game sound-effect files for SogoTable  (from SogoAI, 2026-11-11)

GOAL
Give the games real recorded-style sounds where the built-in synth sounds are weak (dice, cards, explosions,
fanfares), as small audio files shipped with the site. Keep the synth cues as the fallback and for tiny UI ticks.

WHAT ALREADY EXISTS IN SOGOTABLE (checked 2026-11-11)
- src/sogotable/static/sound.js owns mute, volume and the synth cues, plus playSoundFile(url, volume).
- battleship, chinese-checkers, last-orders and realmwright have assets.js with ASSETS.sounds = { cue: url|null };
  sfx.js plays the file if set, else the synth cue. So adding a file = drop it in the game folder + set one key.
- Global cues (playDiceRoll, playCardDeal, playWin ...) in sound.js have NO file override yet.
- docs/audio.md AREC said "procedural Web Audio only, no external assets". This spec changes that: run your AREC
  (docs/AREC.md) and record the new decision before adding files.

RULES
1. Sounds are made ONCE, offline, and committed. Phones never call the AI PC. No sound is generated during a game.
2. Check free CC0 packs first; generate only what they lack.
   - Kenney.nl (CC0, no attribution needed): "Casino Audio" (dice, cards, chips), "Interface Sounds",
     "Impact Sounds", "Sci-fi Sounds", "Music Jingles" (win/lose stingers). https://kenney.nl/assets/category:Audio
3. Keep UI ticks (click, confirm, cancel, turn, invalid move) as synth cues. They are under 0.1 s, already tuned,
   and cost no download.
4. Every file gets a line in docs/SOUNDS.md: file, cue, source (Kenney pack name or "Stable Audio Open, prompt, seed"),
   licence. Stable Audio Open output falls under the Stability AI Community License (free under $1M revenue); read its
   attribution clause before release.

GENERATING ON THE AI PC  (BLOCKED until MojoSOGO answers question SFX on the dashboard with SAO)
- Model: Stable Audio Open 1.0 in ComfyUI on SOGOAI, run by the SogoAI model manager. SogoTable never calls ComfyUI.
- Route (SogoAI builds it after SFX = SAO; not live yet):
    POST http://127.0.0.1:8793/v1/audio/sfx         (from SOGOAI itself)
    POST http://192.168.0.185:8797/v1/audio/sfx     (from another PC on the home network)
    body: { "app": "sogotable", "prompt": "...", "seconds": 1.5, "takes": 4, "seed": 123 }
    reply: { "files": [ { "path": "...wav", "seed": n } ... ] }  (WAV, 44.1 kHz stereo)
- No token: home-network callers only, same as the other manager routes. Owner "sogotable" runs at MAINTENANCE
  priority: it waits for idle GPU and yields to games, Ember and every real job. Expect minutes, not seconds.
- Until the route is live: post a board item to sogoai with the prompt list below, or use the Kenney packs only.

PROMPT LIST  (cue -> seconds -> prompt). Ask for 4 takes each.
  dice      diceRoll    1.2  "two wooden dice rolling and settling on a felt card table, close mic, dry, no music"
  dice      farkle      1.0  "short comic deflating trombone wah, cartoon fail sound, dry"
  dice      bank        0.8  "stack of poker chips clicking into a pile, close, dry"
  cards     cardDeal    0.5  "single playing card dealt and sliding onto a table, crisp, dry"
  cards     cardPlay    0.4  "playing card snapped down on a wooden table, sharp, dry"
  cards     trickTake   0.8  "small stack of playing cards swept together and picked up, dry"
  cards     shuffle     1.5  "deck of playing cards riffle shuffle and bridge, close mic, dry"
  hearts    heartsBroken 1.2 "glass heart cracking, light shatter, magical sparkle tail"
  hearts    queenSpades 1.5  "ominous low gong hit with dark reverb tail"
  hearts    moonShot    2.5  "triumphant short brass fanfare, orchestral, bright"
  battleship fire       1.2  "naval cannon firing, deep boom, shell whistling away"
  battleship incoming   1.2  "artillery shell whistle falling, descending pitch"
  battleship hit        1.5  "large explosion on a metal ship, crack and rolling boom, debris"
  battleship miss       1.2  "cannonball splashing into the sea, water splash"
  battleship sunk       3.0  "steel ship hull groaning and sinking, bubbles rising underwater"
  mystic    mysticHorn  2.0  "ancient hunting horn call in a misty forest, long and hollow"
  general   win         2.0  "short happy victory jingle, bright marimba and chimes, game show"
  general   lose        1.5  "short sad descending trombone, cartoon, gentle"
  general   roomCreated 0.8  "soft magical chime sparkle, positive"
  general   playerJoined 0.6 "wooden door knock twice, friendly"
Style for all: "clean, close, dry, no background music, no speech". Negative words are not supported; keep prompts
positive and specific. Add per-game cues (chinese-checkers, last-orders, realmwright) from their assets.js key lists.

PICKING THE BEST TAKE
- Listen on a phone speaker, not headphones. Pick the take that reads clearly at volume level 2 of 5.
- Reject takes with music, voices, a long tail, or a clipped start. If all 4 fail, change the prompt, not the seed.
- One person picks; record prompt + seed in docs/SOUNDS.md so it can be re-made.

FILE FORMAT  (one ffmpeg command per file, on any PC with ffmpeg)
  ffmpeg -i take.wav -af "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-18:TP=-1.5:LRA=7" -ac 1 -ar 44100 -c:a libmp3lame -b:a 96k cue.mp3
- MP3, mono, 44.1 kHz, 96 kbps: plays on every phone browser including iPhone Safari. Target under 40 KB per file.
- Trim silence both ends; loudness about -18 LUFS, true peak -1.5 dB, so cues sit at the same level as each other.
  Very short clips (<0.5 s) can fool loudnorm: check by ear against the synth cues and adjust volume in assets.js.

WHERE FILES GO
- Per-game cue: src/sogotable/static/games/<game>/sounds/<cue>.mp3, then in that game's assets.js:
    sounds: { hit: new URL("./sounds/hit.mp3", import.meta.url).href, ... }
- Global cues (dice, cards, win/lose): add an ASSETS-style override map to sound.js (placement decision first, per
  docs/module-ownership.md), files in src/sogotable/static/sounds/.
- Check the service worker (static/service-worker.js) caches the new files so they work offline.
- Keep the synth cue as the fallback in every case (playSoundFile returns false -> synth).

DONE CHECKLIST
[ ] AREC in docs/audio.md updated: files allowed, synth stays as fallback and for UI ticks
[ ] Kenney packs checked; each cue marked kenney / generate / keep-synth
[ ] (after SFX = SAO) missing cues generated through /v1/audio/sfx, best take picked on a phone
[ ] Files trimmed, normalised, MP3 mono 96k, each under ~40 KB
[ ] Files in the game folders; assets.js keys set; global override added to sound.js
[ ] docs/SOUNDS.md lists every file with source, prompt/seed and licence
[ ] Mute and all 5 volume levels still work; no sound plays on other players' phones (10,000 rule in docs/audio.md)
[ ] npm test and npm run arch:audit pass; service worker caches the files
[ ] Played on an iPhone and an Android phone

BEST PRACTICE
Games ship pre-made, compressed sound files and play them through the Web Audio API or <audio> after a user gesture;
they do not generate audio at runtime. This spec matches that, and keeps SogoTable's synth cues as a zero-download
fallback. Sources: MDN Web Audio best practices https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices ;
EBU R128 loudness https://tech.ebu.ch/publications/r128 ; Kenney CC0 audio https://kenney.nl/assets/category:Audio ;
Stable Audio Open https://huggingface.co/stabilityai/stable-audio-open-1.0
```
