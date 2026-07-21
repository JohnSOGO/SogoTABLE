// Well, Now You Know — card/panel HTML builders, LIFTED VERBATIM from the
// developed prototype (AI/cah/preview.html, LIFT SEAM 2). Pure builders over
// projection card faces {blank,text,author,writein,pack} — no DOM, no state.
// Module glue only: exports added; code unchanged.

// Black prompt face. `fills` previews the local selection inside the gaps
// (submitter only). Prompts with no "_" are question-style: gaps render below.
export function wnykBlackCardHtml(esc, black, fills) {
  if (!black) return "";
  var filled = Array.isArray(fills) ? fills : [];
  var slot = 0;
  var html;
  if (black.text.indexOf("_") >= 0) {
    html = esc(black.text).replace(/\n/g, "<br />").replace(/_+/g, function () {
      var text = filled[slot];
      slot += 1;
      return text
        ? '<span class="wk-gap wk-filled">' + esc(text) + "</span>"
        : '<span class="wk-gap">&nbsp;</span>';
    });
  } else {
    html = esc(black.text);
    for (var i = 0; i < black.pick; i += 1) {
      var text = filled[i];
      html += "<br />" + (text
        ? '<span class="wk-gap wk-filled">' + esc(text) + "</span>"
        : '<span class="wk-gap">&nbsp;</span>');
    }
  }
  var tag = black.pick > 1 ? "PICK " + black.pick : "";
  return '<div class="wk-black">' + html + (tag ? '<span class="wk-black-tag">' + tag + "</span>" : "") +
    '<span class="wk-card-pack">' + esc(black.pack || "") + "</span></div>";
}

// One white card face. opts: {order, raised, blankLabel, rating, ratable, idx}
// The 👍/👎 rating badges are corner tap targets that never move or resize the
// card and never trigger select/raise (wiring stops propagation).
export function wnykWhiteCardHtml(esc, face, opts) {
  var o = opts || {};
  // Footer renders on every face (empty label kept) so heights stay uniform.
  var foot = function (face) {
    return '<span class="wk-card-foot"><span class="wk-card-pack">' + esc(face && face.pack || "") + "</span></span>";
  };
  if (!face) return '<div class="wk-card wk-blank"><span class="wk-card-body">🂠</span>' + foot(null) + "</div>";
  if (face.blank) {
    return '<div class="wk-card wk-blank" data-hand-idx="' + o.idx + '">' +
      '<span class="wk-card-body">✍️ Blank card — write your own</span>' +
      (o.raised ? '<span class="wk-order">' + (o.order || "✓") + "</span>" : "") +
      foot(face) + "</div>";
  }
  var author = face.author
    ? '<span class="wk-card-author">— written by ' + esc(face.author) + "</span>"
    : "";
  var order = o.raised ? '<span class="wk-order">' + (o.order || "✓") + "</span>" : "";
  var rate = "";
  if (o.ratable) {
    rate = '<span class="wk-rate">' +
      '<button type="button" class="wk-thumb" data-dump="' + esc(o.key) + '"' +
      (o.dumpDisabled ? " disabled" : "") +
      ' aria-label="Downvote and swap this card">👎</button>' +
      "</span>";
  }
  var handAttr = o.idx === undefined ? "" : ' data-hand-idx="' + o.idx + '"';
  return '<div class="wk-card' + (o.raised ? " wk-raised" : "") + '"' + handAttr + ">" +
    '<span class="wk-card-body">' + esc(face.text) + author + "</span>" +
    order + rate + foot(face) + "</div>";
}

// One inline fill chip for a completed sentence: the white card's text in the
// paper treatment; write-ins carry their attribution when revealed.
export function wnykFillChipHtml(esc, face, stripPeriod) {
  if (!face || !face.text) return '<span class="wk-gap">&nbsp;</span>';
  var text = stripPeriod ? String(face.text).replace(/\.\s*$/, "") : face.text;
  var author = face.writein && face.author
    ? '<span class="wk-fill-author"> ✍ ' + esc(face.author) + "</span>"
    : "";
  return '<span class="wk-fill">' + esc(text) + author + "</span>";
}

// The COMPLETED SENTENCE: prompt text with the submission's card(s)
// substituted into the blanks in played order (trailing periods drop when a
// card lands mid-sentence). Blankless question prompts use one convention:
// question, then the answer chip(s) beneath.
export function wnykSentenceInner(esc, black, cards) {
  if (!black) return "";
  var faces = Array.isArray(cards) ? cards : [];
  if (black.text.indexOf("_") >= 0) {
    var slot = 0;
    return esc(black.text).replace(/\n/g, "<br />").replace(/_+/g, function () {
      var face = faces[slot];
      slot += 1;
      return wnykFillChipHtml(esc, face, true);
    });
  }
  return esc(black.text) + "<br />" + faces.map(function (face) {
    return wnykFillChipHtml(esc, face, false);
  }).join(" ");
}

export function wnykSentenceHtml(esc, black, cards, cls) {
  return '<div class="wk-sentence' + (cls ? " " + cls : "") + '">' + wnykSentenceInner(esc, black, cards) + "</div>";
}

// Hero sentence + a single muted pack-provenance line — the whole reveal:
// black text and white text live in the sentence (write-in credit in the
// chip), so no card faces render beneath it.
export function wnykHeroSentenceHtml(esc, black, cards) {
  var packs = [];
  (cards || []).forEach(function (face) {
    if (face && face.pack && packs.indexOf(face.pack) < 0) packs.push(face.pack);
  });
  return '<div class="wk-sentence wk-sentence-hero">' + wnykSentenceInner(esc, black, cards) +
    '<span class="wk-card-foot"><span class="wk-card-pack">' + esc(packs.join(" · ")) + "</span></span></div>";
}

// One submission tile for the triage columns: just the white card face(s),
// stacked in played order (each carries its own pack footer) — the black
// prompt is pinned at the top of the judging screen, and the completed
// sentence belongs to the read-aloud stage and the reveal.
export function wnykSubmissionHtml(esc, sub, opts) {
  var o = opts || {};
  var cards = (sub.cards || []).map(function (face) { return wnykWhiteCardHtml(esc, face, {}); }).join("");
  var actions = "";
  if (o.isJudge) {
    var like = sub.liked
      ? '<button type="button" class="wk-like-on" data-act="unlike" data-sub="' + sub.id + '">💔 Unlike</button>'
      : '<button type="button" data-act="like" data-sub="' + sub.id + '">❤️ Like</button>';
    var promote = o.column === "final"
      ? '<button type="button" data-act="demote" data-sub="' + sub.id + '">⬇️ Back</button>'
      : '<button type="button" data-act="promote" data-sub="' + sub.id + '">🏆 Final</button>';
    actions = '<div class="wk-sub-actions">' + like + promote + "</div>";
  }
  return '<div class="wk-sub">' + cards + actions + "</div>";
}

// Seat strip: name + one status badge (⚖️ judge, ✅ submitted, ⏳ deciding),
// plus a vote-to-skip control when the 2-minute gate is open for that seat.
export function wnykSeatsHtml(esc, game, localMark, skipGates) {
  return '<div class="wk-seats">' + game.players.map(function (seat) {
    var badge = "";
    if (seat.is_judge) badge = "⚖️";
    else if (game.phase === "submitting") badge = seat.skipped ? "🚫" : seat.submitted ? "✅" : "⏳";
    var gate = skipGates && skipGates[seat.mark];
    var skip = gate
      ? '<button type="button" class="wk-skip" data-skip="' + esc(seat.mark) + '">Skip ' + gate.votes + "/" + gate.needed + "</button>"
      : "";
    return '<span class="wk-seat' + (seat.mark === localMark ? " wk-me" : "") + '">' +
      '<span class="wk-seat-name">' + esc(seat.name) + "</span>" +
      (badge ? '<span class="wk-badge">' + badge + "</span>" : "") + skip + "</span>";
  }).join("") + "</div>";
}

// Standings table, sorted by score (platform standard); likes feed Most Liked.
export function wnykStandingsHtml(esc, game) {
  var rows = game.players.slice().sort(function (a, b) { return b.score - a.score || b.likes - a.likes; });
  return '<table class="wk-stand"><thead><tr><th></th><th>🏆</th><th>❤️</th></tr></thead><tbody>' +
    rows.map(function (seat) {
      return "<tr><td class=\"wk-stand-name\">" + esc(seat.name) + "</td><td>" + seat.score + "</td><td>" + seat.likes + "</td></tr>";
    }).join("") + "</tbody></table>";
}

export function wnykHelpHtml() {
  return '<details class="wk-help wk-panel"><summary>How to play · credits</summary><div class="wk-help-body">' +
    "<div>The judge ⚖️ gets the black card first — reads it aloud,<br />👎 swaps a dud prompt, then Releases it.<br />Prompts are judged only by 👎s — they have to be played.<br />Commit opens after a 5-count so everyone hears it.</div>" +
    "<div>The judge sorts All → Favorite → Final.<br />Every ❤️ counts toward the Most Liked title.</div>" +
    "<div>Win 3 rounds (or get lucky) for a blank card:<br />write your own answer — it joins the family deck forever, with your name on it.</div>" +
    "<div>Playing a card is its up-vote — there is no 👍.<br />👎 a bad card (once per round): the vote is logged<br />and the card swaps for a fresh draw. No undo.</div>" +
    "<div>Ratings accumulate across games<br />and quietly retire the deck's worst cards.</div>" +
    '<div class="wk-credit">Based on Cards Against Humanity · CC BY-NC-SA 4.0</div>' +
    "</div></details>";
}
