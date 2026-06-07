# MojoTable Name Decision

This document records the incoming naming decision from `AI/MojoTable_Name_Decision.md`.

## Decision

The proposed product name is **MojoTable**.

`SogoGAMES` was a useful placeholder, but it was too generic. It described games in a broad sense without clearly communicating the actual product idea: a simple shared turn-based tabletop for family and friends.

`MojoTable` is stronger because it connects the product to the `MojoSOGO` identity while giving the app a clear mental model: people sit down at a table, join a game, take turns, and play together.

## Why MojoTable Works

### It Fits The Product

The product is not meant to be a giant arcade platform or a random mobile game collection.

The goal is:

- Simple games
- Board-game-style play
- Turn-based multiplayer
- Mobile-friendly interaction
- Family and friend play
- Quick sessions while waiting at restaurants, hanging out, or killing time together

A table is where board games happen. That word carries the right physical metaphor.

Instead of forcing users to understand abstract software terms like `session`, `lobby`, or `instance`, the app can use a familiar tabletop model:

- Create a table.
- Invite someone to the table.
- Return to the table.
- Play at the table.

## Product Vocabulary

Use **table** as the primary user-facing concept.

Preferred terms:

- `Create Table`
- `Join Table`
- `Return to Table`
- `Invite Player`
- `Leave Table`
- `Current Table`
- `Open Tables`
- `Your Turn`
- `Waiting for Player`
- `Table Full`
- `Table Closed`

Avoid overusing:

- `Lobby`
- `Room`
- `Session`
- `Instance`
- `Matchmaking`

Those terms may remain in internal code where useful, but user-facing copy should prefer the tabletop metaphor.

## Multi-Game Fit

The first game is Super Tic Tac Toe, but the product name should support more games later:

- Super Tic Tac Toe
- Checkers-style games
- Word games
- Card-inspired games
- Dice games
- Simple strategy games
- Family party games
- Async turn-based games

The product should be named after the shared play space, not after one game.

## Brand Pattern

Suggested branding:

- Product name: **MojoTable**
- Creator line: **by MojoSOGO**
- Welcome text: **Welcome to MojoTable**
- Optional tagline: **Board-style games for people at the same table, or miles apart.**

## Mental Model

The app should not be built around a separate game-lobby concept.

The table is the shared game space.

When a player creates a table, they are creating the playable space. A second player may join, accept an invite, or return later. The table persists as the shared location of the active game.

The clean flow should feel like:

1. Pick player.
2. Choose game.
3. Create table or join table.
4. Play.

If a game is already active, the player should see:

- `Return to Table`

Not:

- `Rejoin Room`
- `Continue Session`
- `Enter Lobby`
- `Restore Match`

## Implementation Status

The current codebase was recently renamed from `SogoGAMES` to `SogoTable`.

This document records a stronger proposed naming direction: **MojoTable**. Future implementation should treat a full `SogoTable` to `MojoTable` rename as a deliberate product rename, including:

- visible app branding
- PWA manifest names
- documentation
- Cloudflare Pages/project metadata if desired
- local storage namespace migration
- package/module naming only if the user explicitly wants code paths renamed again

Do not partially rename user-facing copy without updating the rest of the product surface.
