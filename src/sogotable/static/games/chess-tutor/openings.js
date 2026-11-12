// Chess Tutor — the opening repertoire (display + teaching content).
//
// Swappable content table: add, rename or rewrite openings here without
// touching the trainer logic. Every line is checked by the tests with chess.js
// (legal moves, a note on every move the student plays, no two different
// student answers to the same position).
//
// Shape:
//   side:   "w" | "b"  — the colour the student plays.
//   lines:  each a sequence of moves. A move is [san, note?, extras?].
//           A shared prefix only needs its notes once (the first line that
//           reaches a position owns its note).
//           extras.wrong: { [san]: "why that tempting move is a mistake here" }
//           extras.ok:    { [san]: "also fine, but this course plays …" }  (not an error)
//   weight: how often the practice defender picks this line at a branch
//           (rough popularity among club players). Deviations get lower weights.
//   kind:   "main" | "sideline" | "trap" — the trap lines punish a natural error.

export const OPENINGS = [
  {
    id: "italian",
    name: "Italian Game",
    eco: "C50–C54",
    side: "w",
    level: "Beginner",
    blurb: "Develop fast, aim the bishop at f7, then build a big centre with c3 and d4.",
    ideas: [
      "Knights and bishops out before the queen.",
      "The c4 bishop eyes f7, the weakest square near Black's king.",
      "c3 prepares d4 to grab the centre with two pawns.",
    ],
    lines: [
      {
        id: "giuoco-piano",
        name: "Giuoco Piano",
        weight: 50,
        kind: "main",
        moves: [
          ["e4", "Grabs the centre and opens lines for the queen and the light-squared bishop.", {
            ok: { d4: "Also a great first move, but this course starts with 1.e4." },
          }],
          ["e5", "Black stakes an equal claim in the centre."],
          ["Nf3", "Develops with a threat: the knight attacks the e5 pawn.", {
            wrong: {
              Qh5: "Bringing the queen out this early lets Black develop with tempo by attacking it (…Nc6, …Nf6, …g6).",
              Bc4: "Playable, but Nf3 first adds pressure on e5 and keeps options open.",
            },
          }],
          ["Nc6", "Black defends e5 while developing."],
          ["Bc4", "The 'Italian' bishop: develops and aims at f7.", {
            ok: { Bb5: "That is the Ruy Lopez, a great opening too. This course drills the Italian." },
            wrong: {
              Nxe5: "e5 is defended by the c6 knight, so Nxe5 Nxe5 just loses a knight for a pawn.",
            },
          }],
          ["Bc5", "Black mirrors: the bishop also eyes f2."],
          ["c3", "Prepares d4. The pawn on c3 will support a big centre.", {
            ok: { d3: "The slow Giuoco Pianissimo. Fine, but c3 + d4 is the classical plan here." },
          }],
          ["Nf6", "Black counter-attacks e4."],
          ["d4", "Strikes in the centre, hitting the c5 bishop's diagonal and the e5 pawn.", {
            wrong: { "O-O": "Castling is natural, but e4 is hanging after …Nxe4. d4 first keeps the initiative." },
          }],
          ["exd4", "Black takes; the e5 pawn was attacked twice."],
          ["cxd4", "Recaptures towards the centre: White now has pawns on d4 and e4.", {
            wrong: { e5: "e5 is a sharp alternative, but cxd4 builds the classical centre this course teaches." },
          }],
          ["Bb4+", "The bishop checks to get out of the pawn's attack."],
          ["Bd2", "Blocks the check calmly and offers a bishop trade.", {
            ok: { Nc3: "The sharp Møller Attack, fine for experts. Bd2 is the safe main line." },
          }],
          ["Bxd2+", "Black trades bishops."],
          ["Nbxd2", "Recaptures and develops a piece. White keeps the strong centre.", {
            wrong: { Qxd2: "Fine but less natural; Nbxd2 develops another piece and protects e4." },
          }],
        ],
      },
      {
        id: "two-knights",
        name: "Two Knights Defence",
        weight: 35,
        kind: "main",
        moves: [
          ["e4"], ["e5"], ["Nf3"], ["Nc6"], ["Bc4"],
          ["Nf6", "The Two Knights: Black attacks e4 instead of copying with …Bc5."],
          ["d3", "Calmly protects e4. White plays a slow, solid build-up.", {
            ok: { Ng5: "The sharp Fried Liver attack lines. This course plays the solid d3." },
            wrong: { Nc3: "Okay, but after …Nxe4! Nxe4 d5 Black gets the centre back with a fork trick." },
          }],
          ["Bc5", "Black develops the bishop to its best square."],
          ["c3", "Prepares d4 later and gives the bishop a retreat square on c2."],
          ["d6", "Black supports e5."],
          ["O-O", "King to safety before opening the centre."],
          ["O-O", "Black castles too."],
        ],
      },
      {
        id: "hungarian",
        name: "Hungarian Defence (…Be7)",
        weight: 10,
        kind: "sideline",
        moves: [
          ["e4"], ["e5"], ["Nf3"], ["Nc6"], ["Bc4"],
          ["Be7", "A passive but solid choice: Black avoids all sharp lines."],
          ["d4", "Against a passive set-up, grab the centre at once.", {
            ok: { "O-O": "Fine, but d4 immediately punishes the passive bishop." },
          }],
          ["d6", "Black holds e5."],
          ["d5", "Gains space and kicks the c6 knight.", {
            ok: { "O-O": "Also good. d5 is the most direct." },
          }],
          ["Nb8", "The knight has to retreat."],
          ["Bd3", "Puts the bishop behind the pawn chain and supports c4 next.", {
            ok: { "O-O": "Also fine." },
          }],
        ],
      },
      {
        id: "philidor",
        name: "Philidor Defence (2…d6)",
        weight: 10,
        kind: "sideline",
        moves: [
          ["e4"], ["e5"], ["Nf3"],
          ["d6", "Philidor: Black defends e5 with a pawn, but it shuts in the f8 bishop."],
          ["d4", "Challenge e5 right away while Black is cramped.", {
            ok: { Bc4: "Natural, but d4 is the most testing reply." },
          }],
          ["exd4", "Black gives up the centre."],
          ["Nxd4", "Recapture with the knight, which now sits in the centre.", {
            wrong: { Qxd4: "Possible, but …Nc6 attacks the queen and Black develops with tempo." },
          }],
          ["Nf6", "Black develops and hits e4."],
          ["Nc3", "Defends e4 and develops. White has a free, easy game.", {
            wrong: { e5: "Pushing e5 gives the pawn away after …dxe5." },
          }],
        ],
      },
    ],
  },

  {
    id: "ruy-lopez",
    name: "Ruy Lopez",
    eco: "C60–C99",
    side: "w",
    level: "Intermediate",
    blurb: "Pressure the knight that defends e5, castle, and build slowly with c3, d4 and h3.",
    ideas: [
      "The b5 bishop attacks the defender of e5.",
      "White castles early; the e1 rook supports the e4 pawn.",
      "The bishop retreats to b3 when kicked, still aiming at f7.",
    ],
    lines: [
      {
        id: "closed",
        name: "Closed Ruy Lopez",
        weight: 55,
        kind: "main",
        moves: [
          ["e4", "Grabs the centre and frees the bishop and queen."],
          ["e5", "Black claims the centre too."],
          ["Nf3", "Attacks e5 with development."],
          ["Nc6", "Defends e5."],
          ["Bb5", "Pins pressure on the c6 knight, which is the defender of e5.", {
            ok: { Bc4: "That is the Italian. This course drills the Ruy Lopez." },
          }],
          ["a6", "The Morphy Defence: Black asks the bishop what it wants."],
          ["Ba4", "Keeps the pin pressure. Taking on c6 is the Exchange variation, a different plan.", {
            ok: { Bxc6: "The Exchange Variation, a fine choice. This course retreats with Ba4." },
          }],
          ["Nf6", "Black develops and hits e4."],
          ["O-O", "King to safety. e4 looks loose but …Nxe4 runs into Re1 tricks.", {
            wrong: { Nc3: "Fine, but O-O is the main move and keeps c3 free for the pawn." },
          }],
          ["Be7", "Black gets ready to castle."],
          ["Re1", "Defends e4 with the rook, which also now looks down the e-file."],
          ["b5", "Black chases the bishop away."],
          ["Bb3", "The bishop retreats but keeps aiming at f7."],
          ["d6", "Black supports e5."],
          ["c3", "Prepares d4 and gives the b3 bishop a home on c2 later."],
          ["O-O", "Black castles."],
          ["h3", "Stops …Bg4 pinning the knight, so d4 can come next.", {
            ok: { d4: "Playable, but …Bg4 pressures d4. h3 first is the main line." },
          }],
        ],
      },
      {
        id: "berlin",
        name: "Berlin Defence",
        weight: 25,
        kind: "main",
        moves: [
          ["e4"], ["e5"], ["Nf3"], ["Nc6"], ["Bb5"],
          ["Nf6", "The Berlin: Black counter-attacks e4 at once."],
          ["O-O", "Castles and lets Black take on e4, because the e-file will open towards Black's king.", {
            wrong: { Nc3: "Fine but slow. O-O is the most testing." },
          }],
          ["Nxe4", "Black grabs the pawn."],
          ["d4", "Strikes back in the centre; the pawn will come back.", {
            ok: { Re1: "Also regains the pawn. d4 is the main line." },
          }],
          ["Nd6", "The knight retreats and hits the b5 bishop."],
          ["Bxc6", "Gives up the bishop to wreck Black's pawns."],
          ["dxc6", "Black takes towards the centre, opening the queen's diagonal."],
          ["dxe5", "Wins the pawn back and kicks the knight."],
          ["Nf5", "The knight's best square."],
          ["Qxd8+", "Trades queens: the famous 'Berlin endgame'. White has the healthier pawns."],
          ["Kxd8", "Black's king loses castling rights."],
        ],
      },
      {
        id: "steinitz",
        name: "Old Steinitz (3…d6)",
        weight: 10,
        kind: "sideline",
        moves: [
          ["e4"], ["e5"], ["Nf3"], ["Nc6"], ["Bb5"],
          ["d6", "Black props up e5 with a pawn, but it is passive."],
          ["d4", "Hit the centre at once.", {
            ok: { "O-O": "Solid too. d4 is most direct." },
          }],
          ["Bd7", "Black breaks the pin so the knight can defend."],
          ["Nc3", "Develops and adds pressure."],
          ["Nf6", "Black develops."],
          ["O-O", "Castles. White has more space and an easy game."],
        ],
      },
    ],
  },

  {
    id: "queens-gambit",
    name: "Queen's Gambit",
    eco: "D06–D69",
    side: "w",
    level: "Beginner",
    blurb: "Offer the c-pawn to pull Black's d-pawn away from the centre.",
    ideas: [
      "c4 attacks d5; if Black takes, White gets the centre with e4 or e3.",
      "It is not a real gambit: the c4 pawn usually comes back.",
      "Knights to c3 and f3, bishop to g5 pins the f6 knight.",
    ],
    lines: [
      {
        id: "qgd",
        name: "Queen's Gambit Declined",
        weight: 45,
        kind: "main",
        moves: [
          ["d4", "Grabs the centre; the d4 pawn is already protected by the queen."],
          ["d5", "Black meets it head on."],
          ["c4", "The gambit: hits d5 from the side.", {
            ok: { Nf3: "Fine, but c4 is the Queen's Gambit this course teaches.", Bf4: "That is the London System." },
          }],
          ["e6", "Declined: Black keeps a pawn on d5 with e6."],
          ["Nc3", "Adds a second attacker on d5."],
          ["Nf6", "Black defends d5 again."],
          ["Bg5", "Pins the f6 knight, a defender of d5.", {
            ok: { Nf3: "Also very good. Bg5 is the classical main line." },
          }],
          ["Be7", "Breaks the pin."],
          ["e3", "Opens the f1 bishop and solidly supports d4."],
          ["O-O", "Black castles."],
          ["Nf3", "Develops the last minor piece towards the centre."],
        ],
      },
      {
        id: "qga",
        name: "Queen's Gambit Accepted",
        weight: 25,
        kind: "main",
        moves: [
          ["d4"], ["d5"], ["c4"],
          ["dxc4", "Accepted: Black takes the pawn but gives up the centre."],
          ["e3", "Opens the bishop to win c4 back.", {
            ok: { Nf3: "Also good. e3 at once is simplest.", e4: "Ambitious and good, but e3 is the safe main line." },
            wrong: { Qa4: "Wins c4 back, but bringing the queen out early lets Black gain time." },
          }],
          ["Nf6", "Black develops."],
          ["Bxc4", "Pawn regained. White has a nice centre and quick development."],
          ["e6", "Black opens the f8 bishop."],
          ["Nf3", "Develops."],
          ["c5", "Black strikes at d4."],
          ["O-O", "King safety first."],
        ],
      },
      {
        id: "slav",
        name: "Slav Defence",
        weight: 25,
        kind: "main",
        moves: [
          ["d4"], ["d5"], ["c4"],
          ["c6", "The Slav: d5 is supported by c6, and the c8 bishop stays free."],
          ["Nf3", "Develops; keeps the c3 square flexible for a moment.", {
            ok: { Nc3: "Also fine." },
          }],
          ["Nf6", "Black develops."],
          ["Nc3", "Adds pressure on d5."],
          ["dxc4", "Now Black takes, hoping to hold the pawn with …b5."],
          ["a4", "Stops …b5, so the c4 pawn cannot be held.", {
            wrong: { e3: "After e3 Black can play …b5 and keep the pawn." },
          }],
          ["Bf5", "Black develops the bishop outside the pawn chain."],
          ["e3", "Opens the bishop to recapture c4."],
          ["e6", "Black supports the f5 bishop."],
          ["Bxc4", "Pawn back, smooth development."],
        ],
      },
      {
        id: "elephant-trap-white",
        name: "Avoid the Elephant Trap",
        weight: 5,
        kind: "trap",
        moves: [
          ["d4"], ["d5"], ["c4"], ["e6"], ["Nc3"], ["Nf6"], ["Bg5"],
          ["Nbd7", "Black develops… and sets a trap. The d5 pawn looks loose."],
          ["e3", "Keep developing. Nxd5?? or cxd5 + Nxd5?? lose to …Nxd5! Bxd8 Bb4+ and Black wins a piece.", {
            wrong: {
              cxd5: "Not a blunder yet, but after …exd5 do NOT grab d5 with the knight: …Nxd5! Bxd8 Bb4+ wins a piece.",
            },
          }],
          ["c6", "Black supports d5."],
          ["Nf3", "Calm development; White is comfortable."],
        ],
      },
    ],
  },

  {
    id: "london",
    name: "London System",
    eco: "D02, A46",
    side: "w",
    level: "Beginner",
    blurb: "One easy set-up against almost anything: d4, Bf4, e3, Nf3, c3, Bd3, Nbd2.",
    ideas: [
      "Get the dark-squared bishop out to f4 before e3 locks it in.",
      "Build the pyramid c3–d4–e3; it is very hard to break.",
      "The bishop retreats to g3 when attacked by …Nh5 or …Bd6.",
    ],
    lines: [
      {
        id: "vs-d5",
        name: "London vs …d5",
        weight: 50,
        kind: "main",
        moves: [
          ["d4", "Centre pawn; the base of the London set-up."],
          ["d5", "Black mirrors."],
          ["Bf4", "Gets the bishop out before e3 shuts it in.", {
            ok: { c4: "That is the Queen's Gambit. This course drills the London." },
          }],
          ["Nf6", "Black develops."],
          ["e3", "Supports d4 and opens the light bishop."],
          ["e6", "Black opens its own bishop."],
          ["Nf3", "Develops; supports d4 and e5."],
          ["c5", "Black strikes at d4, the usual plan."],
          ["c3", "The pyramid: d4 is now rock solid.", {
            wrong: { dxc5: "Gives up the centre and Black regains the pawn easily with …Bxc5." },
          }],
          ["Nc6", "Adds pressure on d4."],
          ["Nbd2", "Supports e4 and f3; keeps the c3 pawn chain intact."],
          ["Bd6", "Black offers to trade the London bishop."],
          ["Bg3", "Keeps the bishop; trading would help Black.", {
            ok: { Bxd6: "Fine but gives Black an easy game. Bg3 keeps pressure." },
          }],
          ["O-O", "Black castles."],
          ["Bd3", "Aims at h7. Castle next and White is set."],
        ],
      },
      {
        id: "vs-kid",
        name: "London vs King's Indian set-up",
        weight: 30,
        kind: "main",
        moves: [
          ["d4"],
          ["Nf6", "Black keeps options open."],
          ["Bf4", "Same plan whatever Black does."],
          ["g6", "Black will fianchetto the bishop to g7."],
          ["e3", "Supports d4."],
          ["Bg7", "The bishop aims down the long diagonal."],
          ["Nf3", "Develops."],
          ["O-O", "Black castles."],
          ["Be2", "Modest and safe; the bishop will not be hit by …e5 forks.", {
            ok: { Bd3: "Also played, but …d6 and …e5 can hit the d3 bishop with tempo. Be2 is simplest." },
          }],
          ["d6", "Black prepares …e5."],
          ["h3", "Gives the f4 bishop a retreat on h2 and stops …Ng4 or …Bg4.", {
            ok: { "O-O": "Fine too, but h3 first is the safe habit." },
          }],
        ],
      },
      {
        id: "vs-qb6",
        name: "London vs early …Qb6",
        weight: 20,
        kind: "sideline",
        moves: [
          ["d4"], ["d5"], ["Bf4"], ["Nf6"], ["e3"],
          ["c5", "Black hits d4 straight away."],
          ["c3", "The pyramid again."],
          ["Nc6", "More pressure on d4."],
          ["Nd2", "Supports the centre and keeps f3 for the other knight.", {
            ok: { Nf3: "Also natural." },
          }],
          ["Qb6", "Black's queen attacks b2."],
          ["Qb3", "Offers a queen trade so b2 stays safe.", {
            wrong: { b3: "Weakens c3 and the long diagonal; Qb3 is cleaner." },
          }],
        ],
      },
    ],
  },

  {
    id: "caro-kann",
    name: "Caro-Kann Defence",
    eco: "B12–B19",
    side: "b",
    level: "Beginner",
    blurb: "Prepare …d5 with …c6, develop the light bishop to f5, and get a rock-solid position.",
    ideas: [
      "…c6 supports …d5, so Black challenges e4 with a protected pawn.",
      "The c8 bishop comes out to f5 before …e6 shuts it in.",
      "Black accepts a little less space for a very solid pawn structure.",
    ],
    lines: [
      {
        id: "classical",
        name: "Classical (4…Bf5)",
        weight: 45,
        kind: "main",
        moves: [
          ["e4", "White grabs the centre."],
          ["c6", "Prepares …d5 with support.", {
            ok: { e5: "A fine reply, but this course plays the Caro-Kann." },
          }],
          ["d4", "White takes the full centre."],
          ["d5", "The point: challenge e4 at once."],
          ["Nc3", "White defends e4."],
          ["dxe4", "Black trades off the centre pawn."],
          ["Nxe4", "White recaptures."],
          ["Bf5", "Develops with tempo, hitting the e4 knight.", {
            ok: { Nd7: "The Karpov line, also excellent. This course plays …Bf5." },
          }],
          ["Ng3", "The knight retreats and hits the f5 bishop."],
          ["Bg6", "The bishop stays on the good diagonal."],
          ["h4", "White threatens h5 to trap or chase the bishop."],
          ["h6", "Gives the bishop the h7 square.", {
            wrong: { e6: "After h5 the bishop has to go back to h7 anyway, but …h6 first is cleaner." },
          }],
          ["Nf3", "White develops."],
          ["Nd7", "Stops Ne5 and prepares …Ngf6."],
          ["h5", "Gains space."],
          ["Bh7", "The bishop is safe here and still aims at White's queenside."],
        ],
      },
      {
        id: "advance",
        name: "Advance Variation",
        weight: 30,
        kind: "main",
        moves: [
          ["e4"], ["c6"], ["d4"], ["d5"],
          ["e5", "White gains space."],
          ["Bf5", "The bishop gets out before …e6.", {
            wrong: { e6: "Locks the c8 bishop behind its own pawns, the 'bad bishop' problem the Caro-Kann avoids." },
          }],
          ["Nf3", "White develops."],
          ["e6", "Now …e6 is fine because the bishop is already out."],
          ["Be2", "White develops calmly."],
          ["c5", "Strike at the base of White's pawn chain.", {
            ok: { Nd7: "Also good. …c5 is the most active plan." },
          }],
        ],
      },
      {
        id: "exchange",
        name: "Exchange Variation",
        weight: 20,
        kind: "main",
        moves: [
          ["e4"], ["c6"], ["d4"], ["d5"],
          ["exd5", "White trades in the centre."],
          ["cxd5", "Recapture with the c-pawn; Black has a solid centre pawn."],
          ["Bd3", "White eyes h7."],
          ["Nc6", "Develops and pressures d4."],
          ["c3", "White supports d4."],
          ["Nf6", "Develops."],
          ["Bf4", "White develops the dark bishop."],
          ["Bg4", "Pins and pressures the f3 square, which defends d4.", {
            ok: { g6: "Also solid. …Bg4 is the most active." },
          }],
        ],
      },
    ],
  },

  {
    id: "qgd-black",
    name: "Queen's Gambit Declined (Black)",
    eco: "D30–D69",
    side: "b",
    level: "Intermediate",
    blurb: "Hold d5 with …e6, develop, castle, and punish greedy grabs.",
    ideas: [
      "…e6 supports d5 so Black keeps a firm centre.",
      "…Be7 and …O-O come quickly; the c8 bishop is freed later.",
      "Watch for the Elephant Trap: grabbing d5 can lose White a piece.",
    ],
    lines: [
      {
        id: "orthodox",
        name: "Orthodox",
        weight: 50,
        kind: "main",
        moves: [
          ["d4", "White takes the centre."],
          ["d5", "Meet it head on."],
          ["c4", "The Queen's Gambit."],
          ["e6", "Declined: d5 stays protected.", {
            ok: { c6: "That is the Slav, also excellent. This course plays …e6." },
            wrong: { Nc6: "Blocks the c-pawn; after cxd5 Qxd5 Nc3 Black's queen is chased around." },
          }],
          ["Nc3", "More pressure on d5."],
          ["Nf6", "Another defender."],
          ["Bg5", "Pins the knight."],
          ["Nbd7", "Develops and sets the Elephant Trap: d5 looks loose, but grabbing it loses a piece.", {
            ok: { Be7: "The other main move, also excellent. This course plays …Nbd7." },
          }],
          ["e3", "White develops sensibly."],
          ["Be7", "Breaks the pin."],
          ["Nf3", "White develops."],
          ["O-O", "Castle early."],
          ["Rc1", "The rook eyes the c-file for later pressure."],
          ["c6", "Solidifies d5 and prepares to free the position.", {
            ok: { h6: "Also normal. …c6 is the classical way." },
          }],
          ["Bd3", "White develops the last piece."],
          ["dxc4", "Now trade on c4 so White's bishop has to spend a move recapturing."],
          ["Bxc4", "White recaptures."],
          ["Nd5", "Capablanca's freeing manoeuvre: trade pieces so Black's position gets room to breathe.", {
            wrong: { b5: "Weakens c6 and the queenside; …Nd5 is the clean freeing plan." },
          }],
        ],
      },
      {
        id: "exchange",
        name: "Exchange Variation",
        weight: 25,
        kind: "main",
        moves: [
          ["d4"], ["d5"], ["c4"], ["e6"], ["Nc3"], ["Nf6"],
          ["cxd5", "White releases the tension."],
          ["exd5", "Recapture with the e-pawn: the c8 bishop is now free.", {
            wrong: { Nxd5: "Gives up the centre; after e4 White takes over." },
          }],
          ["Bg5", "Pins again."],
          ["Be7", "Unpin."],
          ["e3", "White develops."],
          ["c6", "A solid chain; the queen can go to c7 or a5 later.", {
            ok: { "O-O": "Also fine." },
          }],
        ],
      },
      {
        id: "elephant-trap",
        name: "The Elephant Trap",
        weight: 15,
        kind: "trap",
        moves: [
          ["d4"], ["d5"], ["c4"], ["e6"], ["Nc3"], ["Nf6"], ["Bg5"],
          ["Nbd7"],
          ["cxd5", "White trades…"],
          ["exd5", "Recapture."],
          ["Nxd5", "White grabs d5, thinking the knight on f6 is pinned. It is not!"],
          ["Nxd5", "Take the knight! If Bxd8 then …Bb4+ wins back the queen with interest.", {
            wrong: { Be7: "Too timid. The pin is fake: …Nxd5! wins a piece." },
          }],
          ["Bxd8", "White takes the queen…"],
          ["Bb4+", "Check! White can only block with the queen."],
          ["Qd2", "Forced."],
          ["Bxd2+", "Take the queen back with check."],
          ["Kxd2", "White recaptures."],
          ["Kxd8", "Black has won a whole piece."],
        ],
      },
    ],
  },

  {
    id: "open-games-black",
    name: "1…e5 for Black",
    eco: "C20–C59",
    side: "b",
    level: "Beginner",
    blurb: "Meet 1.e4 with …e5, develop knights first, and stop the early-queen attacks.",
    ideas: [
      "Mirror White's centre pawn and develop knights before bishops.",
      "Every early queen attack can be stopped with a developing move.",
      "Castle quickly, then fight for d5.",
    ],
    lines: [
      {
        id: "vs-italian",
        name: "vs Italian",
        weight: 40,
        kind: "main",
        moves: [
          ["e4", "White opens."],
          ["e5", "Claim the centre."],
          ["Nf3", "Attacks e5."],
          ["Nc6", "Defend with development.", {
            wrong: { f6: "Weakens the king; after Nxe5! fxe5 Qh5+ White's attack is crushing." },
          }],
          ["Bc4", "The Italian bishop."],
          ["Bc5", "Mirror: develop to an active square.", {
            ok: { Nf6: "The Two Knights Defence, also good." },
          }],
          ["c3", "White prepares d4."],
          ["Nf6", "Hit e4 so White must deal with it."],
          ["d3", "White defends e4."],
          ["d6", "Support e5 and open the c8 bishop."],
          ["O-O", "White castles."],
          ["O-O", "Castle too. A balanced game."],
        ],
      },
      {
        id: "vs-scholars",
        name: "Stop Scholar's Mate",
        weight: 25,
        kind: "trap",
        moves: [
          ["e4"], ["e5"],
          ["Bc4", "White aims at f7 at once."],
          ["Nc6", "Develop."],
          ["Qh5", "Threatens Qxf7#, the Scholar's Mate!"],
          ["g6", "Blocks the queen's path to f7 and attacks the queen.", {
            wrong: {
              Nf6: "Natural, but loses: Qxf7 is checkmate.",
              Bc5: "Does not stop Qxf7#.",
            },
            ok: { Qe7: "Also defends f7, but blocks the bishop. …g6 is best." },
          }],
          ["Qf3", "The queen tries again, now on f7 from f3."],
          ["Nf6", "Blocks the f-file and develops. f7 is safe.", {
            wrong: { Bg7: "Qxf7 is checkmate! Block with …Nf6 first." },
          }],
          ["Ne2", "White develops."],
          ["Bg7", "Fianchetto the bishop, then castle. Black is better developed."],
        ],
      },
      {
        id: "vs-scotch",
        name: "vs Scotch",
        weight: 20,
        kind: "main",
        moves: [
          ["e4"], ["e5"], ["Nf3"], ["Nc6"],
          ["d4", "The Scotch: White opens the centre at once."],
          ["exd4", "Take: e5 cannot be held."],
          ["Nxd4", "White recaptures."],
          ["Nf6", "Develop and hit e4.", {
            ok: { Bc5: "The Classical Scotch, also good." },
          }],
          ["Nxc6", "White trades knights."],
          ["bxc6", "Recapture towards the centre."],
          ["e5", "White kicks the knight."],
          ["Qe7", "Pins the e5 pawn to the king, so the knight is safe for now."],
        ],
      },
      {
        id: "vs-ruy",
        name: "vs Ruy Lopez",
        weight: 25,
        kind: "main",
        moves: [
          ["e4"], ["e5"], ["Nf3"], ["Nc6"],
          ["Bb5", "The Ruy Lopez: pressure on the c6 knight."],
          ["a6", "Ask the bishop. Note Bxc6 dxc6 Nxe5? Qd4! wins the pawn back."],
          ["Ba4", "White keeps the bishop."],
          ["Nf6", "Develop and hit e4."],
          ["O-O", "White castles."],
          ["Be7", "Prepare to castle.", {
            ok: { Nxe4: "The Open Ruy Lopez, sharp but good." },
          }],
          ["Re1", "Defends e4."],
          ["b5", "Kick the bishop."],
          ["Bb3", "White retreats."],
          ["d6", "Support e5; castle next."],
        ],
      },
    ],
  },

  {
    id: "scandinavian",
    name: "Scandinavian Defence",
    eco: "B01",
    side: "b",
    level: "Beginner",
    blurb: "Hit e4 at once with …d5. Easy to learn, and White cannot steer you into their prep.",
    ideas: [
      "Black takes on d5 and accepts that the queen gets chased once.",
      "The queen goes to a5, safe and pinning the c3 knight.",
      "…Bf5, …e6 and …c6 build a solid 'Caro-Kann-like' structure.",
    ],
    lines: [
      {
        id: "main-qa5",
        name: "Main line …Qa5",
        weight: 60,
        kind: "main",
        moves: [
          ["e4", "White opens."],
          ["d5", "Challenge e4 immediately."],
          ["exd5", "White takes."],
          ["Qxd5", "Recapture with the queen.", {
            ok: { Nf6: "The Modern Scandinavian, a gambit-ish line. This course plays …Qxd5." },
          }],
          ["Nc3", "White develops with tempo on the queen."],
          ["Qa5", "Safe square, and it pins the c3 knight.", {
            wrong: { Qe5: "After Be2 or Qe2 the queen is a target in the middle; …Qa5 is safer." },
          }],
          ["d4", "White takes the centre."],
          ["Nf6", "Develop."],
          ["Nf3", "White develops."],
          ["Bf5", "Bishop out before …e6.", {
            ok: { c6: "Also fine." },
          }],
          ["Bc4", "White develops."],
          ["e6", "Solid; supports the f5 bishop."],
          ["Bd2", "Unpins the knight; threatens Nd5 ideas."],
          ["c6", "Gives the queen a retreat to c7 and covers d5."],
        ],
      },
      {
        id: "vs-nf3",
        name: "vs early Nf3",
        weight: 25,
        kind: "main",
        moves: [
          ["e4"], ["d5"], ["exd5"], ["Qxd5"],
          ["Nf3", "White develops but does not hit the queen."],
          ["Nf6", "Develop.", {
            ok: { Bg4: "Also fine." },
          }],
          ["d4", "White takes the centre."],
          ["Bf5", "Bishop out."],
          ["Nc3", "Now White hits the queen."],
          ["Qa5", "The usual square."],
        ],
      },
    ],
  },
];

// Display identity — rename or re-skin the tutor here.
export const TUTOR = {
  name: "Chess Tutor",
  icon: "♞",
  tagline: "Learn the opening moves, why they work, and drill them until they stick.",
  // Piece sprite inside vendor/cm-chessboard/assets/ (CC BY-SA 3.0, Wikimedia
  // "Standard" set by Colin M.L. Burnett). Swap the file to re-skin the pieces.
  pieceSet: "pieces/standard.svg",
  credits: "Rules by chess.js (BSD-2). Board by cm-chessboard (MIT). Pieces by Colin M.L. Burnett (CC BY-SA 3.0).",
};
