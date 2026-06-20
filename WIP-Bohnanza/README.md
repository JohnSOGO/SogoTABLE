# Bohnanza Work Area

This folder holds planning notes, milestone tracking, and architecture review
notes for the Bohnanza-style card game.

The actual code workspace is:

```text
src/sogotable/static/games/bohnanza/
```

Use this folder for:

- milestones
- AREC notes
- implementation checkpoints

Current assumptions for the local lab:

- one player per device
- hidden information stays on that device only
- each player gets a number for sorting and display
- public knowledge should be compact enough to handle seven players without turning the screen into a wall of text
- the first playable loop stays in turn order for now, even though the long-term goal is rounds without turns and simultaneous ask/bid behavior

Use the `src/sogotable/static/games/bohnanza/` folder for the real game code.
