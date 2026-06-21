# AI Difficulty Ladder

SogoTable uses a single recruitable AI ladder across the app. The current bot
roster is named as four tiers:

- Sprout - Novice
- Buddy - Casual
- Cipher - Strategist
- Overlord - Master

## Contract

- These names are the public recruitable labels shown in the bot picker.
- Bot identity stays in the opaque `bot_id`; the visible name can change.
- The current engines may still share behavior families, but the recruitable
  ladder gives the UI and docs a stable four-step vocabulary.
- Quoridor maps the four bot ids onto its own difficulty behavior levels, so
  the Quoridor rules doc should reference this ladder instead of repeating the
  names.

## Current Mapping

- `7c91a4e2b6d0` - Sprout - Novice
- `5e2c8a71d0f4` - Buddy - Casual
- `b64d20f19a8c` - Cipher - Strategist
- `0f8a3c9d1e72` - Overlord - Master

## Notes

- The recruitable names should stay stable unless the whole ladder changes.
- If a bot's behavior changes materially, update both this ladder and the game
  docs that depend on it.
