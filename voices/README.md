# Voice lines (requests to SogoAI)

`voice-lines.json` lists the spoken lines SogoTable asks SogoAI to record, one entry per line:
`{ "id", "character", "text" }`.

- `id` is the file name stem, the game id with `:` turned into `-`. For example, `base-gorrum-headbutt` maps to card
  `base:gorrum:headbutt`. `base-<who>-win|lose|bluff|last-orders` are the key event lines.
- Each line is 2 to 7 words and takes 3 s or less to speak.
- Engines and voices are matched to the approved samples in
  `\\192.168.0.123\share\AI_Crossroads\SogoTable\voices\parler-last-orders\3s\`:
  Gorrum and Zephyrine use Kokoro, Tilly and Ansel use Parler.
- Delivery format is WAV, at most 3 s of speech plus 0.5 s of silence, one file per id.
- When the files arrive, they go into `src/sogotable/static/games/last-orders/voice/` and are listed in `VOICE_IDS`
  (see `docs/voices.md`).
