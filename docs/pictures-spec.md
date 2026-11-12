# SPEC: Game pictures for SogoTable (from SogoAI, 2026-11-11)

Paste into: a SogoTable thread (the Claude that works in `C:\Users\Public\git\SogoTable` on SOGOAI).
Sibling of `docs/sfx-spec.md`. Adopted 2026-11-12; see the AREC revision in `docs/AREC.md` and the file list in
`docs/PICTURES.md`. MojoSOGO widened the scope the same night: "update the cards on last call all the graphics"
(every Last Orders pack, not just base).

## GOAL

Replace the weakest procedural SVG art with illustrated pictures where it pays off most (Last Orders portraits and
cards first), as small WebP files committed with the site. The SVG art stays as the fallback everywhere.

## WHAT ALREADY EXISTS IN SOGOTABLE (checked 2026-11-11)

- Four games have assets.js with picture slots; null = built-in SVG, a URL = use the file:
  - last-orders: portraits{characterId} (square bust; base:ansel, base:gorrum, base:tilly, base:zephyrine),
    cards{cardId} (square, ~78 ids like base:gorrum:headbutt), drinks{drinkId} (square), cardBack, drinkBack, tableBg
  - chinese-checkers: board (under the holes, fitted to the star), marble (transparent)
  - realmwright: tiles{typeId} (square, unrotated, exact edge layout), tileFeatureArt{kind}, meeple (transparent)
  - battleship: ships{id} (top-down, horizontal, bow right, transparent)
- Other games (hearts, yahtzee, mystic-wood, rtta ...) have no picture slots. Adding one = a placement decision first
  (docs/module-ownership.md), same null-fallback pattern.
- docs/AREC.md: run AREC and record "files allowed, SVG stays the fallback" before adding pictures (same as sounds).

## RULES

1. Pictures are made ONCE, offline, and committed. Phones never call the AI PC. Nothing is drawn during a game.
2. Do these: last-orders portraits, cards, drinks, cardBack, drinkBack, tableBg; chinese-checkers board.
   Skip these: marble, meeple, ships (need transparency, no cut-out route yet) and realmwright tiles (must match the
   rules' edge layout exactly; AI will not). Keep their SVG.
3. One style per game, written once in docs/PICTURES.md and appended to every prompt for that game.
4. Every file gets a line in docs/PICTURES.md: file, slot, model, prompt, seed, licence.

## HOW TO REQUEST (from SOGOAI itself; not reachable from the cloud or other PCs)

```
POST http://127.0.0.1:8793/generate?format=png
Content-Type: application/json
{ "owner": "sogotable", "priority": "maintenance", "model": "qwen-image21",
  "prompt": "...", "width": 1024, "height": 1024, "seed": 123 }
```

-> the PNG itself (drop ?format=png to get JSON {paths, seed, ...}; files also land in
`C:\AI\ComfyUI\output\sogoai\sogotable\`).

- No token: loopback only. Always name the model (defaults change).
- priority "maintenance" = lowest of all: waits until the GPU is idle, yields to games, Ember (VIP) and every real
  job. A 409 "PC not idle" or a Focus-mode 409 means try again later (wait 5 min, then retry). Client timeout 20 min.
- One request at a time. Ask for 3 seeds per slot and keep the best.
- Node helper on the PC: `C:\Users\Public\git\SogolAI\scripts\model-client.mjs` generateImage("sogotable", {...}).

## WHICH MODEL

- qwen-image21 (default): objects, boards, card backs, table, scenes, any picture with text. ~22 s warm, 1-2 min cold.
- wai-illustrious: anime / cartoon character portraits. The manager forces adult tags ("1 adult, mature"), so only for
  grown-up characters; add "negative": "nsfw, nude, suggestive" every time. Use booru-style tags in the prompt.
  Default 832x1216: send width 1024, height 1024 for square slots.
- Never character LoRAs or noobai-vpred (disqualified).

## STYLE (MojoSOGO's favourite; use it unless a game's doc picks another)

> "realistic graphic novel illustration, fine detailed ink linework with delicate cross-hatching, soft muted
> naturalistic coloring like watercolor and marker, realistic anatomy and expressive faces, clean simple background,
> high detail"

- Last Orders example (qwen-image21): "portrait bust of Gorrum, a burly half-orc tavern brawler with a broken tusk,
  grinning, holding a tankard, warm tavern light, centred face, square framing, " + STYLE
- Card art: "<card action> illustration, single clear subject, centred, no text, no border, " + STYLE
  (the game draws the frame and the words; ask for no text in the picture).

## FILE FORMAT (one command per file, ComfyUI's Python has Pillow)

```
C:\AI\ComfyUI\venv\Scripts\python.exe -c "from PIL import Image; Image.open('in.png').convert('RGB').resize((512,512), Image.LANCZOS).save('out.webp', quality=80, method=6)"
```

- WebP, quality 80. Sizes: portraits, cards, drinks 512x512 (target under 50 KB); cardBack, drinkBack 512x512;
  tableBg and chinese-checkers board 1024x1024 (under 150 KB). WebP plays in every current phone browser incl. Safari 14+.
- Generate at 1024x1024, then scale down. Keep the face or subject centred (portraits are cropped to a rounded square).

## WHERE FILES GO

- `src/sogotable/static/games/<game>/img/<slot-id>.webp` (ids with ":" become "-": base-gorrum.webp,
  base-gorrum-headbutt.webp), then in that game's assets.js:
  `portraits: { "base:gorrum": new URL("./img/base-gorrum.webp", import.meta.url).href, ... }`
- Check static/service-worker.js caches the new files so they work offline.
- Commit the WebP only; keep the 1024 PNG masters out of git (the manager's output folder already holds them).

## DONE CHECKLIST

- [ ] AREC in docs/AREC.md: picture files allowed, SVG stays the fallback
- [ ] docs/PICTURES.md: style line per game + one row per file (slot, model, prompt, seed, licence)
- [ ] Last Orders: 4 portraits, card art, drinks, cardBack, drinkBack, tableBg made and picked (3 seeds each)
- [ ] Chinese Checkers board made; holes still line up on top of it
- [ ] All files WebP, sizes as above; total added per game under ~3 MB
- [ ] assets.js keys set; missing ids still fall back to SVG; light and dark theme both look right
- [ ] npm test and npm run arch:audit pass; service worker caches the files
- [ ] Played on an iPhone and an Android phone

## BEST PRACTICE

Games ship pre-made, compressed art (WebP/AVIF at the size shown, lazy-loaded, cached) and never generate art on the
player's device. This spec matches that and keeps the SVG art as a zero-download fallback. Sources:
web.dev image performance https://web.dev/learn/performance/image-performance ;
WebP support https://caniuse.com/webp ; Qwen-Image licence https://huggingface.co/Qwen ;
MDN service worker caching https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching
