// Chess Tutor: course data, drill engine, mistake explanations, spaced
// repetition and session planning — all browser-free.
import assert from "node:assert/strict";
import test from "node:test";
import { OPENINGS } from "../../src/sogotable/static/games/chess-tutor/openings.js";
import { buildCourse, bookMoves, cardKey, positionKey } from "../../src/sogotable/static/games/chess-tutor/course.js";
import {
  createDrill, submitMove, playDefenderMove, chooseDefenderMove, expectedMove, isStudentTurn, takeHint, explainMistake,
} from "../../src/sogotable/static/games/chess-tutor/rules.js";
import { gradeCard, newCard, BOX_INTERVALS, MAX_BOX, lineState } from "../../src/sogotable/static/games/chess-tutor/scheduler.js";
import { dueLines, nextNewLine, lineCardKeys, weaknessFor } from "../../src/sogotable/static/games/chess-tutor/session.js";
import { emptyProgress, recordDrill, normalizeProgress, streak } from "../../src/sogotable/static/games/chess-tutor/progress.js";
import { Chess } from "../../src/sogotable/static/vendor/chessjs/chess.js";

const { openings, errors } = buildCourse(OPENINGS);
const byId = (id) => openings.find((o) => o.id === id);
const HOUR = 3600 * 1000;

// Play a whole line correctly; returns the finished drill.
function playLine(opening, lineId, mode = "review") {
  let drill = createDrill(opening, { mode, lineId });
  let guard = 0;
  while (!drill.done && guard++ < 200) {
    if (isStudentTurn(drill)) {
      const { drill: next, outcome } = submitMove(opening, drill, { san: expectedMove(opening, drill).san });
      assert.equal(outcome.kind, "correct");
      drill = next;
    } else {
      drill = playDefenderMove(opening, drill, () => 0).drill;
    }
  }
  return drill;
}

test("chess tutor: every authored line is legal, annotated and unambiguous", () => {
  assert.deepEqual(errors, []);
  assert.ok(openings.length >= 8);
  for (const o of openings) {
    assert.ok(["w", "b"].includes(o.side), o.id);
    assert.ok(o.lines.length >= 2, `${o.id} needs at least a main line and a deviation`);
    for (const line of o.lines) {
      for (const ply of line.plies.filter((p) => p.student)) assert.ok(ply.note, `${o.id}/${line.id} ${ply.san} has a note`);
    }
  }
});

test("chess tutor: curated wrong/ok moves are legal alternatives in their position", () => {
  for (const o of openings) {
    for (const line of o.lines) {
      for (const ply of line.plies) {
        for (const san of [...Object.keys(ply.wrong), ...Object.keys(ply.ok)]) {
          const chess = new Chess(ply.fenBefore);
          assert.doesNotThrow(() => chess.move(san), `${o.id}/${line.id}: "${san}" is not legal before ${ply.san}`);
          assert.notEqual(new Chess(ply.fenBefore).move(san).san, ply.san, `${o.id}: ${san} duplicates the book move`);
        }
      }
    }
  }
});

test("chess tutor: every line can be drilled start to finish", () => {
  for (const o of openings) {
    for (const line of o.lines) {
      const drill = playLine(o, line.id);
      assert.equal(drill.done, true);
      assert.equal(drill.history.length, line.plies.length, `${o.id}/${line.id}`);
      assert.equal(drill.mistakes, 0);
      assert.ok(Object.values(drill.grades).every((g) => g === "correct"));
    }
  }
});

test("chess tutor: wrong move is rejected, explained, graded wrong and must be corrected", () => {
  const italian = byId("italian");
  let drill = createDrill(italian, { mode: "review", lineId: "giuoco-piano" });
  drill = submitMove(italian, drill, { from: "e2", to: "e4" }).drill;
  drill = playDefenderMove(italian, drill, () => 0).drill;
  const before = drill.fen;
  const { drill: after, outcome } = submitMove(italian, drill, { san: "Qh5" });
  assert.equal(outcome.kind, "wrong");
  assert.equal(outcome.book.san, "Nf3");
  assert.match(outcome.reasons[0], /queen out this early/);
  assert.equal(after.fen, before, "board does not advance on a mistake");
  assert.equal(after.grades[cardKey("italian", before)], "wrong");
  // The correct move afterwards keeps the "wrong" grade for this drill.
  const fixed = submitMove(italian, after, { san: "Nf3" });
  assert.equal(fixed.outcome.kind, "correct");
  assert.equal(fixed.drill.grades[cardKey("italian", before)], "wrong");
});

test("chess tutor: illegal input and 'also fine' moves do not count as mistakes", () => {
  const italian = byId("italian");
  const drill = createDrill(italian, { mode: "review", lineId: "giuoco-piano" });
  assert.equal(submitMove(italian, drill, { from: "e2", to: "e5" }).outcome.kind, "illegal");
  const alt = submitMove(italian, drill, { san: "d4" });
  assert.equal(alt.outcome.kind, "alternative");
  assert.equal(alt.drill.mistakes, 0);
  assert.deepEqual(alt.drill.grades, {});
});

test("chess tutor: heuristics explain a hanging piece and an allowed mate", () => {
  const black = byId("open-games-black");
  let drill = createDrill(black, { mode: "review", lineId: "vs-scholars" });
  for (let i = 0; i < 5; i += 1) {
    drill = isStudentTurn(drill)
      ? submitMove(black, drill, { san: expectedMove(black, drill).san }).drill
      : playDefenderMove(black, drill, () => 0).drill;
  }
  assert.equal(drill.history.join(" "), "e4 e5 Bc4 Nc6 Qh5");
  const mate = submitMove(black, drill, { san: "d6" }).outcome;
  assert.ok(mate.reasons.some((r) => /checkmate: Qxf7#/.test(r)), mate.reasons.join(" | "));
  // A bishop dropped on a6 hangs to the knight.
  const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
  const move = new Chess(fen).move("Ba6");
  const { reasons } = explainMistake(fen, move, null);
  assert.ok(reasons.some((r) => /bishop on a6 would be left hanging/.test(r)), reasons.join(" | "));
});

test("chess tutor: learn mode records no grades; hints downgrade to 'hinted'", () => {
  const london = byId("london");
  const learned = playLine(london, "vs-d5", "learn");
  assert.deepEqual(learned.grades, {});
  let drill = createDrill(london, { mode: "quiz", lineId: "vs-d5" });
  drill = takeHint(drill);
  assert.equal(drill.hintLevel, 1);
  const res = submitMove(london, drill, { san: "d4" });
  assert.equal(res.outcome.grade, "hinted");
  assert.equal(res.drill.hintLevel, 0, "hint level resets after the move");
});

test("chess tutor: spar defender follows weights and weakness, and stays in book", () => {
  const caro = byId("caro-kann");
  let drill = createDrill(caro, { mode: "spar" });
  drill = playDefenderMove(caro, drill, () => 0).drill; // 1.e4
  drill = submitMove(caro, drill, { san: "c6" }).drill;
  drill = playDefenderMove(caro, drill, () => 0).drill; // 2.d4
  drill = submitMove(caro, drill, { san: "d5" }).drill;
  const options = bookMoves(caro, drill.fen).map((n) => n.san).sort();
  assert.deepEqual(options, ["Nc3", "e5", "exd5"]);
  assert.equal(chooseDefenderMove(caro, drill, () => 0).san, "Nc3");
  // Weighting the exchange line heavily makes it the pick for a mid roll.
  const weakness = (id) => (id === "exchange" ? 100 : 1);
  assert.equal(chooseDefenderMove(caro, drill, () => 0.5, weakness).san, "exd5");
  // Drive spar to the end with random rolls: always book, always finishes.
  for (let seed = 0; seed < 20; seed += 1) {
    let rolls = seed;
    const rng = () => ((rolls = (rolls * 9301 + 49297) % 233280) / 233280);
    let d = createDrill(caro, { mode: "spar" });
    let guard = 0;
    while (!d.done && guard++ < 100) {
      d = isStudentTurn(d) ? submitMove(caro, d, { san: expectedMove(caro, d).san }).drill : playDefenderMove(caro, d, rng).drill;
    }
    assert.equal(d.done, true);
    assert.equal(d.mistakes, 0);
    assert.ok(d.lineIds.length >= 1);
  }
});

test("chess tutor: Leitner scheduling — up on correct, reset on wrong, hold on hint, no early inflation", () => {
  const now = 1_000_000_000_000;
  let card = gradeCard(newCard(), "correct", now);
  assert.equal(card.box, 1);
  assert.equal(card.due, now + BOX_INTERVALS[1]);
  card = gradeCard(card, "correct", now + HOUR); // early: not due yet
  assert.equal(card.box, 1, "practising early does not inflate the schedule");
  card = gradeCard(card, "correct", now + 5 * HOUR);
  assert.equal(card.box, 2);
  const hinted = gradeCard(card, "hinted", card.due);
  assert.equal(hinted.box, 2);
  const failed = gradeCard(card, "wrong", now + 6 * HOUR);
  assert.equal(failed.box, 0);
  assert.equal(failed.lapses, 1);
  assert.equal(failed.due, now + 6 * HOUR);
  let top = { box: MAX_BOX, due: 0, reps: 9, lapses: 0, seen: 1 };
  top = gradeCard(top, "correct", now);
  assert.equal(top.box, MAX_BOX);
  assert.equal(gradeCard({ box: "junk", due: "x" }, "correct", now).box, 1, "corrupt cards are clamped");
});

test("chess tutor: session plan — new lines first by importance, due lines interleaved, retries", () => {
  const now = 2_000_000_000_000;
  let progress = emptyProgress();
  const italian = byId("italian");
  const qg = byId("queens-gambit");
  assert.equal(nextNewLine(italian, progress.cards, now).id, "giuoco-piano");
  progress = recordDrill(progress, playLine(italian, "giuoco-piano", "quiz"), now);
  progress = recordDrill(progress, playLine(qg, "qgd", "quiz"), now);
  assert.equal(nextNewLine(italian, progress.cards, now).id, "two-knights");
  assert.equal(lineState(lineCardKeys(italian, italian.lines[0]), progress.cards, now), "learning");
  assert.deepEqual(dueLines(openings, progress.cards, now), []);
  const later = now + 5 * HOUR;
  const due = dueLines(openings, progress.cards, later);
  assert.deepEqual(due.map((d) => d.openingId), ["italian", "queens-gambit"]);
  // Weak lines get a spar boost.
  assert.equal(weaknessFor(italian, progress.cards, now)("giuoco-piano"), 1);
  assert.equal(weaknessFor(italian, progress.cards, later)("giuoco-piano"), 3);
  assert.equal(progress.stats.perfect, 2);
  assert.equal(streak(progress, now), 1);
});

test("chess tutor: progress normalizes junk and keeps unknown help keys out", () => {
  const p = normalizeProgress({ cards: "nope", helps: { hints: false, evil: true }, stats: { days: [1, "2026-01-01"] } });
  assert.deepEqual(p.cards, {});
  assert.equal(p.helps.hints, false);
  assert.equal("evil" in p.helps, false);
  assert.deepEqual(p.stats.days, ["2026-01-01"]);
  assert.equal(positionKey("a b c d 0 1"), "a b c d");
});

test("chess tutor: watch mode speed — faster speed means shorter waits, saved speed is clamped", async () => {
  const { watchDelay, WATCH_SPEEDS } = await import("../../src/sogotable/static/games/chess-tutor/watch-view.js");
  assert.ok(watchDelay(4) < watchDelay(1) && watchDelay(1) < watchDelay(0.25));
  assert.ok(watchDelay(1, "a long explanation ".repeat(5)) > watchDelay(1, ""), "long notes get reading time");
  assert.equal(watchDelay(99), watchDelay(1), "unknown speeds fall back to 1×");
  assert.ok(WATCH_SPEEDS.includes(1));
  assert.equal(normalizeProgress({ watchSpeed: 2 }).watchSpeed, 2);
  assert.equal(normalizeProgress({ watchSpeed: 50 }).watchSpeed, 1);
  assert.equal(emptyProgress().watchSpeed, 1);
});
