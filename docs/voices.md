# Voices (spoken play callouts)

Decided 2026-11-13 at MojoSOGO's request ("I need a voice voicing the card they play… a different voice per character… their portraits when voicing"). First user: Last Orders.

## How it works

- When another patron plays or answers with a card, `games/last-orders/callout.js` shows a banner (their portrait, "Buddy · Zephyrine Quill plays Sparkle Dart on you", card art, rules text) and `voice.js` says the card's name in that patron's voice. A card aimed at me plays the `attacked` sting first (`sfx.js`).
- Two ⚙ settings, per device, both on by default: **Play callouts** and **Voices**. Voices also follow the global sound button (mute and volume).
- The server holds every played card on the table for at least `SHOW_MS` (2.2 s, `workers/games/last-orders/rules.js`) whenever a human is watching, and bot steps are slower, so the banner and voice land before the card resolves. All-bot tables with nobody watching still resolve instantly.

## Voice sources, best first

1. **Pre-generated clips** (industry standard for game VO): one MP3 per card in `games/last-orders/voice/`, listed in `assets.js` `VOICE_IDS`. Made once on SogoAI with Kokoro (open-source, fixed voices). The game never calls TTS at runtime.
2. **Browser speechSynthesis** fallback for any card without a clip: each patron gets a gender-matched system voice plus their own pitch and rate (`voice.js` `VOICE_PROFILES`).

## Patron voices (Kokoro ids)

| Patron | Kokoro voice | Speed |
| --- | --- | --- |
| Gorrum Ironmug | am_onyx | 0.88 |
| Tilly Fenwhistle | af_sky | 1.12 |
| Brother Ansel | bm_george | 0.90 |
| Zephyrine Quill | bf_isabella | 1.00 |
| Captain Marrow | bm_lewis | 0.92 |
| Nessa Tidewhistle | af_nicole | 0.95 |
| Hrolga Anvilbrew | bf_alice | 0.95 |
| Sable Ninefrost | af_river | 1.05 |
| Lord Verrin | bm_daniel | 0.90 |
| Bim Bolliwog | am_puck | 1.15 |
| Sprocket Fizzlewick | af_jessica | 1.15 |
| Brassbell | am_echo | 0.90 |

`voice.js` is the source of truth; a test keeps every patron on a distinct voice.

## Requested from SogoAI (2026-11-13)

MojoSOGO chose this route: SogoAI records the lines, and SogoTable does not generate audio itself. The request is
`voices/voice-lines.json`. It covers 80 lines: the 64 base-pack cards (Gorrum, Tilly, Ansel, Zephyrine) plus win,
lose, bluff and last-orders lines for each of them.

- Engines were picked from the approved samples: Gorrum and Zephyrine use Kokoro, Tilly and Ansel use Parler.
- It was posted as one Crossroads Board ticket to `sogoai`.
- When the WAVs arrive, copy them into `games/last-orders/voice/`, list them in `VOICE_IDS`, and teach `voice.js` the
  event lines.

## Making clips ourselves (fallback script, not the chosen route)

1. Run a Kokoro server with an OpenAI-compatible endpoint (for example Kokoro-FastAPI on `127.0.0.1:8880`, `POST /v1/audio/speech`).
2. From the repo: `node scripts/voices/last-orders-voices.mjs --url http://127.0.0.1:8880` (add `--only base:gorrum` to try one patron, `--force` to redo).
3. The script writes `voice/<pack>-<who>-<card>.mp3` and rewrites `VOICE_IDS`. Listen, commit, and log the batch in `docs/SOUNDS.md` (Kokoro-82M weights are Apache-2.0).
