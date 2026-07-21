// Regenerates workers/games/wnyk/decks.js from the raw JSON Against Humanity
// dataset (AI/cah/data/cah-all-compact.json — gitignored; re-download from
// https://github.com/crhallberg/json-against-humanity if missing).
// Usage: node scripts/build-wnyk-decks.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = JSON.parse(
  readFileSync(join(root, "AI", "cah", "data", "cah-all-compact.json"), "utf8"),
);

const PACKS = {
  classic: "CAH Base Set",
  family: "CAH: Family Edition (Free Print & Play Public Beta)",
};

// Short card-face provenance labels, shown centered at the bottom of every
// card face (MojoSOGO, 2026-07-20). Custom/write-in cards get "House Deck"
// in the engine; these cover the generated decks.
const PACK_LABELS = { classic: "Base Set", family: "Family Edition" };
const KIDS_LABEL = "SOGO Kids";

// Curation blocklist (MojoSOGO, 2026-07-20): cards in the source packs that
// don't belong at a kids' table — heavy themes (divorce, alcohol, religion-as-
// punchline, disease) plus public-beta cruft that is clearly not a real CAH
// print card (typos, community insertions). Removing a card SHIFTS the deck
// indexes behind it, which invalidates "family:<i>" rating keys — acceptable
// while the game is unregistered with zero live ratings; once live, curate via
// the card-ratings removal path instead of this list.
const BLOCKED = new Set([
  "The divorce.",
  "Beer.",
  "Getting drunk.",
  "Completely drunk organizers.",
  "Jesus's death.",
  "Getting skin cancer after 5 minutes at Takapuna beach",
  "Comign back from the dead.",
  // 2026-07-20 typo/cruft sweep — family-pack community cruft (adult content,
  // NZ in-jokes, internet slang) that a mass-market family print deck never shipped:
  "Before I attend your sleepover, I must inform you: toys vore me, and I don't care for sweets. I prefer _.",
  "you'd look good in a  pearl necklace",
  "Boogie-boarding down Huka Falls",
  "Going to Hobbiton for your hairy foot fetish",
  "love's quick pants",
  "Richi McCaw; the PM we want, but will never deserve",
  "the government's secret stockpile of confiscated marijuana",
  "Turning 70 and still being fuckable.",
  "Waterboarding a Muslim.",
  "The Rwandan Genocide.",
  "The underrepresentation of African-American dancers at Blues events.",
  // Base Set fragments that lost their leading blank in transcription (the real
  // cards "_. Betcha can't have just one!" / "_. It's a trap!" remain):
  "Betcha can't have just one!",
  "It's a trap!",
]);

// Transcription-typo fixes (2026-07-20 sweep): exact original text → corrected
// text, applied in place so deck indexes don't shift. Fixes that land on an
// already-correct duplicate are collapsed by the dedupe below.
const FIXES = new Map([
  // Base Set white — misspellings
  ["Fitting all your blongings into a seabag.", "Fitting all your belongings into a seabag."], // blongings
  ["Lokking for your Dad's porn stash", "Looking for your Dad's porn stash."], // Lokking + missing period
  ["Letting Gemma collins squirt on your face", "Letting Gemma Collins squirt on your face."], // lowercase surname + period
  ["Mensturation porn", "Menstruation porn."], // Mensturation + period
  ["Mr. Froto's ring", "Mr. Frodo's ring."], // Froto + period
  ["Self-folding lundry.", "Self-folding laundry."], // lundry
  ["The entire Mormon Tabernacle Chior.", "The entire Mormon Tabernacle Choir."], // Chior (dedupes)
  ["reputation,\nreputation,\nreputation", "Reputation, reputation, reputation."], // transcription formatting
  ["Tongueing a balloon knot arsehole", "Tonguing a balloon knot arsehole."], // Tongueing + period
  ["The Donald Trump Seal of Approval.™", "The Donald Trump Seal of Approval™."], // period/™ order
  ["Daddies Brown Sauce", "Daddies® Brown Sauce."], // worse transcription of the ® card (dedupes)
  // Base Set white — capitalization/period inconsistent with the deck's own convention
  ["a slightly used tampon", "A slightly used tampon."],
  ["all pants are half off today", "All pants are half off today."],
  ["hermaphroditical Italian pictures", "Hermaphroditical Italian pictures."],
  ["intolerably vivid dreams", "Intolerably vivid dreams."],
  ["multiple personality disorder", "Multiple personality disorder."],
  ["my vintage trucker hat collection", "My vintage trucker hat collection."],
  ["the heat of a luxurious bed", "The heat of a luxurious bed."],
  ["Actually giving a shit", "Actually giving a shit."],
  ["Blood fisting", "Blood fisting."],
  ["Flying saucers", "Flying saucers."],
  ["Grassroots support", "Grassroots support."],
  ["Hillary Clinton's favorite nipple clamps", "Hillary Clinton's favorite nipple clamps."],
  ["Kegel Balls", "Kegel balls."],
  ["Mean people", "Mean people."], // also present in family
  ["Mild racism and extreme homophobia", "Mild racism and extreme homophobia."],
  ["Not covering your mouth when you sneeze", "Not covering your mouth when you sneeze."],
  ["One rude motherfucker", "One rude motherfucker."],
  ["Poor personal hygiene", "Poor personal hygiene."],
  ["Powerful allergies", "Powerful allergies."],
  ["Racist Christmas Present", "Racist Christmas present."],
  ["Roofied Punch", "Roofied punch."],
  ["Sanctimommies", "Sanctimommies."],
  ["Screaming Orgasm", "Screaming Orgasm."],
  ["Stephen Hawking", "Stephen Hawking."],
  ["Tiny terrorists", "Tiny terrorists."],
  // Base Set black
  ["Next on Sky Sports: The World Champsion of _.", "Next on Sky Sports: The World Championship of _."], // Champsion (entry duplicated; dedupes)
  ["This season at Steppenwolf, Samuel Beckett's classic existential play: Waitng for _.", "This season at Steppenwolf, Samuel Beckett's classic existential play: Waiting for _."], // Waitng
  ["This season at the old Vic, Samuel Beckett's classic existential play: Waitng for _.", "This season at the Old Vic, Samuel Beckett's classic existential play: Waiting for _."], // Waitng + Old Vic
  ["When I am a billionare, I shall erect a 20-meter statue to commemorate _.", "When I am a billionaire, I shall erect a 20-meter statue to commemorate _."], // billionare
  ["When I am a billionare, I shall erect a 20-metre statue to commemorate _.", "When I am a billionaire, I shall erect a 20-metre statue to commemorate _."],
  ["When I am a billionare, I shall erect a 50-foot statue to commemorate _.", "When I am a billionaire, I shall erect a 50-foot statue to commemorate _."],
  ["Your security clearance has been suspended beause of your shameful past involving _.", "Your security clearance has been suspended because of your shameful past involving _."], // beause
  ["In a world ravaged by _ our only solace is _.", "In a world ravaged by _, our only solace is _."], // missing comma (dedupes)
  // Family Edition white
  ["A big, and I mean BIG turle.", "A big, and I mean BIG turtle."], // turle
  ["A dollw that pees real pee!", "A doll that pees real pee!"], // dollw
  ["Debating cartoon logic", "Debating cartoon logic."],
  ["Drinkig a whole bottle of ranch.", "Drinking a whole bottle of ranch."], // Drinkig
  ["Farting Antelopes", "Farting antelopes."],
  ["Getting scalded in the fave with hot beans.", "Getting scalded in the face with hot beans."], // fave
  ["Getting struck in the toilet.", "Getting stuck in the toilet."], // struck
  ["Girly drinks", "Girly drinks."],
  ["Going ballistic", "Going ballistic."],
  ["Kisisng mom on the lips.", "Kissing mom on the lips."], // Kisisng
  ["Mayonaise.", "Mayonnaise."], // Mayonaise
  ["One tought mama.", "One tough mama."], // tought
  ["Polka dot underwear", "Polka dot underwear."],
  ["Shoplifiting.", "Shoplifting."], // Shoplifiting
  ["The loose skin at the joing of the elbow known as \"the weenus.\"", "The loose skin at the joint of the elbow known as \"the weenus.\""], // joing
  ["The sweet honking or Karen's bassoon.", "The sweet honking of Karen's bassoon."], // or→of
  ["Think, nasty burps.", "Thick, nasty burps."], // Think→Thick
  ["Thousands of lasagna", "Thousands of lasagna."],
  ["Trekkies", "Trekkies."],
  ["Urban legends", "Urban legends."],
  ["Your fce.", "Your face."], // fce
  // Family Edition black
  ["Alright, which one of you little terds is responsible for _?!", "Alright, which one of you little turds is responsible for _?!"], // terds
  ["Attention students. This is Principal Butthead. Please remember that we do not alow _ in the hallway. Thank you.", "Attention students. This is Principal Butthead. Please remember that we do not allow _ in the hallway. Thank you."], // alow
  ["Hey guys. I just want to tell all my followers who are struggling wit _: it DOES get better.", "Hey guys. I just want to tell all my followers who are struggling with _: it DOES get better."], // wit
  ["New from Mattel! It's BUNGO: The Game of _.\"", "New from Mattel! It's BUNGO: The Game of _."], // stray unopened quote
  ["Oh Dark Lord, we show out devotion with a humble offering of _!", "Oh Dark Lord, we show our devotion with a humble offering of _!"], // out→our
  ["Thanks for watching! IF you want to seee more vids of _, smash that subscribe.", "Thanks for watching! If you want to see more vids of _, smash that subscribe."], // IF/seee
  ["When i pooped, what came out?", "When I pooped, what came out?"], // lowercase I
]);
const fixText = (t) => (FIXES.has(t) ? FIXES.get(t) : t);

// Strict kid-deck pass (MojoSOGO directive 2026-07-20: "pull anything
// suspicious"; bar = a cautious parent at the table; when in doubt, pull).
// FAMILY DECK ONLY — the classic deck is adult by design and stays whole.
// Matched against post-FIXES text, after the global BLOCKED filter.
const KID_BLOCKED = new Set([
  // Sexual innuendo / adult-smirk double meanings (+ fluids, profanity):
  "Happy Endings.",
  "Tossed salads and scrambled eggs.",
  "Twig and berries.",
  "Balls. Big balls. Really big balls.",
  "Slapping that butt.",
  "Pubes held together in a little ponytail holder.",
  "Johnny Depp, dancing all sexy.",
  "Peeing into everyone's mouth.",
  "A huge bitch.",
  // Drugs / alcohol / smoking:
  "Cigarettes.",
  "Illegal drugs.",
  "Girly drinks.",
  // Heavy or dark played straight (death, crime, fascist imagery, nightmare):
  "Murdering.",
  "A dead body.",
  "Eating a baby.",
  "Screaming and screaming and never waking up.",
  "Burning books.",
  "Shoplifting.",
  // Occult-as-punchline cluster:
  "Satan.",
  "The Denver Satanic Gardens.",
  "Unleashing a hell demon that will destroy our world.",
  "Sacrificing Uncle Tim.",
  "Oh Dark Lord, we show our devotion with a humble offering of _!",
  // Targets real groups / requires adult context / unverifiable oddity:
  "Being adopted.",
  "Racism, sexism, and homophobia.",
  "Feminist men.",
  "Hey guys. I just want to tell all my followers who are struggling with _: it DOES get better.",
  "Chinese campaign clothing.",
]);
const kidBlocked = (key, text) => key === "family" && KID_BLOCKED.has(text);

const decks = {};
for (const [key, packName] of Object.entries(PACKS)) {
  const pack = raw.packs.find((p) => p.name === packName);
  if (!pack) throw new Error(`pack not found in dataset: ${packName}`);
  const label = PACK_LABELS[key];
  decks[key] = {
    white: [
      ...new Set(
        pack.white
          .map((i) => raw.white[i])
          .filter((t) => !BLOCKED.has(t))
          .map(fixText),
      ),
    ]
      .filter((t) => !kidBlocked(key, t))
      .map((t) => ({ text: t, pack: label })),
    black: [],
  };
  const seenBlack = new Set();
  for (const i of pack.black) {
    const b = raw.black[i];
    if (b.pick < 1 || b.pick > 3 || BLOCKED.has(b.text)) continue;
    const text = fixText(b.text);
    if (kidBlocked(key, text)) continue;
    if (seenBlack.has(text)) continue; // exact-dupe transcriptions in the dataset
    seenBlack.add(text);
    decks[key].black.push({ text, pick: b.pick, pack: label });
  }
}

// The SOGO Kids Pack (original SogoTable content, committed in the game subtree)
// extends the family deck. APPEND ONLY, after the CAH cards: card-rating keys are
// "family:<index>", so earlier indexes must never shift between regenerations.
const kidsPack = JSON.parse(
  readFileSync(join(root, "workers", "games", "wnyk", "sogo-kids-pack.json"), "utf8"),
);
const familyWhite = new Set(decks.family.white.map((c) => c.text));
decks.family.white.push(
  ...kidsPack.white
    .filter((t) => !familyWhite.has(t))
    .map((t) => ({ text: t, pack: KIDS_LABEL })),
);
const familyBlack = new Set(decks.family.black.map((b) => b.text));
decks.family.black.push(
  ...kidsPack.black
    .filter((b) => b.pick >= 1 && b.pick <= 3 && !familyBlack.has(b.text))
    .map((b) => ({ text: b.text, pick: b.pick, pack: KIDS_LABEL })),
);

const lines = [];
lines.push("// GENERATED by scripts/build-wnyk-decks.mjs — DO NOT EDIT BY HAND.");
lines.push("// Card text from Cards Against Humanity (cardsagainsthumanity.com),");
lines.push("// CC BY-NC-SA 4.0, via JSON Against Humanity (github.com/crhallberg/json-against-humanity).");
lines.push("// UI OBLIGATION: the game's help/about screen must credit Cards Against");
lines.push("// Humanity and note the CC BY-NC-SA 4.0 license when the frontend ships.");
lines.push("// Server-only deck data for Well, Now You Know: the worker deals");
lines.push("// authoritatively and projections carry dealt card text, so the client");
lines.push("// never needs (and must never get) a deck copy.");
lines.push("export const WNYK_DECKS = Object.freeze({");
for (const [key, deck] of Object.entries(decks)) {
  lines.push(`  ${key}: Object.freeze({`);
  lines.push("    white: Object.freeze([");
  for (const card of deck.white) {
    lines.push(
      `      Object.freeze({ text: ${JSON.stringify(card.text)}, pack: ${JSON.stringify(card.pack)} }),`,
    );
  }
  lines.push("    ]),");
  lines.push("    black: Object.freeze([");
  for (const card of deck.black) {
    lines.push(
      `      Object.freeze({ text: ${JSON.stringify(card.text)}, pick: ${card.pick}, pack: ${JSON.stringify(card.pack)} }),`,
    );
  }
  lines.push("    ]),");
  lines.push("  }),");
}
lines.push("});");
lines.push("");
lines.push("export const WNYK_DECK_KEYS = Object.freeze(Object.keys(WNYK_DECKS));");
lines.push("");

const out = join(root, "workers", "games", "wnyk", "decks.js");
writeFileSync(out, lines.join("\n"), "utf8");
for (const [key, deck] of Object.entries(decks)) {
  console.log(`${key}: white ${deck.white.length}, black ${deck.black.length}`);
}
console.log(`wrote ${out}: ${lines.length} lines`);
