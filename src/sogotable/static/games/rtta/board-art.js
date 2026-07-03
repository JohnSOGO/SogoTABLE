// Roll Through the Ages — board artwork + static page shell (pure presentation).
//
// Extracted from board.js when it crossed the god-file line cap: the SVG
// builders for monuments/cities (shaped worker-box clusters over silhouettes),
// the worker-box fill ordering, and the static MARKUP template. Nothing in here
// touches game state — board.js passes data in and wires all behavior.

// A single worker box (rect + hidden ⚒️ revealed when filled) at x/y, size u.
function wbox(x, y, u) {
  return '<g class="wbox"><rect x="' + x + '" y="' + y + '" width="' + u + '" height="' + u + '" rx="2"/>' +
    '<text x="' + (x + u / 2) + '" y="' + (y + u / 2) + '" font-size="' + (u * 0.78).toFixed(1) + '">⚒️</text></g>';
}

// Rows of worker boxes centered on cx; shape = boxes per row, top→bottom.
function clusterRects(shape, cx, topY, u, g) {
  const pitch = u + g; let out = "";
  shape.forEach((n, r) => { const rowW = n * u + (n - 1) * g, x0 = cx - rowW / 2, y = topY + r * pitch; for (let i = 0; i < n; i++) out += wbox(x0 + i * pitch, y, u); });
  return out;
}

function buildMonSVG(m) {
  const u = 16, g = 3, scale = 0.85, cx = m.vb[0] / 2;
  return '<svg class="monsvg" viewBox="0 0 ' + m.vb[0] + " " + m.vb[1] + '" width="' + Math.round(m.vb[0] * scale) + '" height="' + Math.round(m.vb[1] * scale) + '">' +
    m.art + clusterRects(m.shape, cx, m.boxTop, u, g) + "</svg>";
}

function cityShape(n) { const rows = []; if (n % 2 === 1) rows.push(1); for (let i = 0; i < Math.floor(n / 2); i++) rows.push(2); return rows; }

// A city as a little building whose worker boxes cluster at its base; the die
// above the roof lights up once the city is built (an extra die each turn).
export function buildCitySVG(cost, i) {
  const W = 48, H = 72, scale = 0.6 + i * 0.07, cx = 24;
  const dieFs = (15 / scale).toFixed(1);
  let art = '<polygon class="art" points="4,22 44,22 24,6"/><rect class="art" x="6" y="22" width="36" height="46" rx="2"/>' +
    '<text class="citydie" x="24" y="6" font-size="' + dieFs + '" text-anchor="middle" dominant-baseline="central">🎲</text>';
  let boxes = "";
  if (cost != null) { const u = 11, g = 2, pitch = u + g, bottomY = 64, shape = cityShape(cost); boxes = clusterRects(shape, cx, bottomY - (shape.length * pitch - g), u, g); }
  return '<svg class="citysvg" viewBox="0 0 ' + W + " " + H + '" width="' + Math.round(W * scale) + '" height="' + Math.round(H * scale) + '">' + art + boxes + "</svg>";
}

// A monument tile: silhouette SVG + first-builder VP badge + name.
export function monTile(m) {
  const el = document.createElement("div");
  el.className = "mon" + (m.wide ? " wide" : "") + (m.tall ? " tall" : "");
  el.dataset.name = m.name;
  el.innerHTML = buildMonSVG(m) + '<div class="mon-foot"><span class="mscore">' + m.first + '</span><span class="mname">' + m.name + "</span></div>";
  return el;
}

// Worker boxes fill bottom row first, left to right within a row.
export function wboxOrder(a, b) {
  const ra = a.querySelector("rect"), rb = b.querySelector("rect");
  const dy = (+rb.getAttribute("y")) - (+ra.getAttribute("y"));
  return dy !== 0 ? dy : (+ra.getAttribute("x")) - (+rb.getAttribute("x"));
}

// Split n same-size monument tiles into one or two centered rows.
export function splitRows(n) { if (n <= 3) return [n]; const top = Math.floor(n / 2); return [top, n - top]; }

// Static page shell (ids kept from the prototype, queried within `root`).
export const MARKUP = `
  <div class="app-header">
    <nav class="tabs" id="tabs">
      <button class="active" data-page="dice">1 Roll</button>
      <button data-page="build">2 Build</button>
      <button data-page="dev">3 Dev</button>
      <button data-page="goods">4 Discard</button>
    </nav>
    <div class="tipstrip" id="tipStrip"></div>
  </div>
  <main class="window" id="window">
    <section class="page active" id="page-dice">
      <div class="tray" id="tray"></div>
      <div class="goods-cash" id="leadRow"></div>
      <div class="tally oneline"><div class="tally-grid">
        <div class="stat"><span class="icon">🌾</span><span class="meta"><b class="val" id="tFood">0</b><span class="nm">Food</span></span></div>
        <div class="stat"><span class="icon">⚒️</span><span class="meta"><b class="val" id="tWork">0</b><span class="nm">Work</span></span></div>
        <div class="stat"><span class="icon">📦</span><span class="meta"><b class="val" id="tGood">0</b><span class="nm">Goods</span></span></div>
        <div class="stat"><span class="icon">🪙</span><span class="meta"><b class="val" id="tCoin">0</b><span class="nm">Coins</span></span></div>
        <div class="stat danger"><span class="icon">💀</span><span class="meta"><b class="val" id="tSkull">0</b><span class="nm">Skull</span></span></div>
      </div></div>
      <div class="block foodctl"><h3>Food <small>max 15 · feeds 1 per die</small></h3><div class="boxrow" id="foodRoll"></div></div>
      <div class="block"><h3>Points lost <small>1 box per point lost</small></h3><div id="disBoxes"></div></div>
      <div class="block"><h3>Disaster results <small>from skulls</small></h3><div class="dis" id="disList"></div></div>
    </section>
    <section class="page" id="page-build">
      <div class="block workers-panel"><h3>Workers to spend <small>from this roll</small></h3><div class="big-stat">⚒️ <span id="tWorkBuild">0</span></div><div class="goods-cash" id="engRow"></div></div>
      <div class="block"><h3>Cities <small>start with 3 · build with workers</small></h3><div id="cityRow"></div></div>
      <div class="block" id="monBlock"><h3>Monuments <small id="monPlayers"></small></h3>
        <div id="monArea"></div>
      </div>
    </section>
    <section class="page" id="page-dev">
      <div class="power" id="powerStrip">
        <div class="pcell"><span class="picon">🪙</span><span class="pmeta"><b class="pval" id="pCoins">0</b><span class="plabel">Coins</span></span></div>
        <div class="pcell"><span class="picon">📦</span><span class="pmeta"><b class="pval" id="pGoods">0</b><span class="plabel">Goods</span></span></div>
        <div class="pcell total"><span class="picon">💰</span><span class="pmeta"><b class="pval" id="pTotal">0</b><span class="plabel">Power</span></span></div>
      </div>
      <div class="goods-cash" id="goodsCash"></div>
      <div class="block" id="devBlock"><h3>Developments <small>tap cost to buy · dim = can't afford</small></h3></div>
    </section>
    <section class="page" id="page-goods">
      <div class="block goods" id="goodsBlock"><h3>Goods <small>coin value by quantity · keep 6 total</small></h3></div>
      <div class="block"><h3>Standings <small>round <span id="roundNum">1</span></small></h3><div id="sharedScore"></div></div>
      <p class="rtta-status" id="rttaStatus">Finish your turn, then submit.</p>
      <button class="rtta-submit" id="submitBtn" type="button">✓ Submit turn</button>
    </section>
  </main>
`;
