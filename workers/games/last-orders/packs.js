// Last Orders pack registry: every pack's rules data, keyed by pack id (base first).
import { BASE_PACK } from "./packs/base.js";
import { HARBOR_PACK } from "./packs/harbor.js";
import { FROST_PACK } from "./packs/frost.js";
import { MASQUERADE_PACK } from "./packs/masquerade.js";
import { CLOCKWORK_PACK } from "./packs/clockwork.js";
import { ROWDY_PACK } from "./packs/rowdy.js";

export const PACKS = {
  base: BASE_PACK,
  harbor: HARBOR_PACK,
  frost: FROST_PACK,
  masquerade: MASQUERADE_PACK,
  clockwork: CLOCKWORK_PACK,
  rowdy: ROWDY_PACK,
};

export const PACK_IDS = Object.keys(PACKS);
