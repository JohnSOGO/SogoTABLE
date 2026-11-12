// Chess Tutor — thin wrapper around the vendored cm-chessboard (MIT).
// The rest of the tutor talks to this API only, so the board library can be
// swapped without touching the drill screens.

import { Chessboard, COLOR, INPUT_EVENT_TYPE, BORDER_TYPE } from "../../vendor/cm-chessboard/src/Chessboard.js";
import { Markers, MARKER_TYPE } from "../../vendor/cm-chessboard/src/extensions/markers/Markers.js";
import { Arrows, ARROW_TYPE } from "../../vendor/cm-chessboard/src/extensions/arrows/Arrows.js";
import { TUTOR } from "./openings.js";

const ASSETS = "vendor/cm-chessboard/assets/";
let cssLoaded = false;

function loadBoardCss() {
  if (cssLoaded) return;
  cssLoaded = true;
  for (const file of ["chessboard.css", "extensions/markers/markers.css", "extensions/arrows/arrows.css"]) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = ASSETS + file;
    document.head.appendChild(link);
  }
}

const MARKS = { hint: MARKER_TYPE.circlePrimary, wrong: MARKER_TYPE.frameDanger, last: MARKER_TYPE.square };
const ARROWS = { book: ARROW_TYPE.success, defender: ARROW_TYPE.info, hint: ARROW_TYPE.warning, wrong: ARROW_TYPE.danger };

// onMove({from, to}) → true to accept the move (the board keeps the piece
// there), false to snap it back.
export function createBoard(element, { fen, side, onMove }) {
  loadBoardCss();
  const board = new Chessboard(element, {
    position: fen,
    orientation: side === "b" ? COLOR.black : COLOR.white,
    assetsUrl: ASSETS,
    style: { cssClass: "default", borderType: BORDER_TYPE.none, showCoordinates: true, pieces: { file: TUTOR.pieceSet }, animationDuration: 250 },
    extensions: [{ class: Markers, props: { autoMarkers: MARKER_TYPE.frame } }, { class: Arrows }],
  });
  const color = side === "b" ? COLOR.black : COLOR.white;
  const handler = (event) => {
    if (event.type === INPUT_EVENT_TYPE.moveInputStarted) {
      return Boolean(event.piece) && event.piece.charAt(0) === side;
    }
    if (event.type === INPUT_EVENT_TYPE.validateMoveInput) {
      return Boolean(onMove({ from: event.squareFrom, to: event.squareTo }));
    }
    return true;
  };
  return {
    setFen(nextFen, animate = true) {
      return board.setPosition(nextFen, animate);
    },
    enableInput() {
      if (!board.isMoveInputEnabled()) board.enableMoveInput(handler, color);
    },
    disableInput() {
      if (board.isMoveInputEnabled()) board.disableMoveInput();
    },
    mark(square, kind = "hint") {
      board.addMarker(MARKS[kind] || MARKS.hint, square);
    },
    arrow(from, to, kind = "book") {
      board.addArrow(ARROWS[kind] || ARROWS.book, from, to);
    },
    clearAnnotations() {
      board.removeMarkers();
      board.removeArrows();
    },
    destroy() {
      board.destroy();
    },
  };
}
