// Sogo superuser (admin) identity + passcode gate, extracted from the shell.
// "Sogo"/"MojoSOGO" is the only passcode-protected account; every other player
// moves between devices with a plain confirm. This controller owns recognising
// the admin by name, the verify/ensure/has passcode flow (held in sessionStorage,
// optionally remembered in localStorage — see storage.js), and the forget-admin
// sign-out. It reaches the shell only for the device's selected player and to
// re-render the admin affordances, via wireSuperuser(ctx).
import { api } from "../api-client.js";
import { confirmAction, promptForPasscode } from "./prompts.js";
import { playConfirm } from "../sound.js";
import {
  readSogoSuperuserPasscode,
  storeSogoSuperuserPasscode,
  forgetSogoSuperuserPasscode,
} from "../storage.js";

let ctx = {
  deviceSelectedPlayer: () => null,
  renderAdminActions: () => {},
  renderPlayers: () => {},
};

export function wireSuperuser(context) {
  ctx = { ...ctx, ...context };
}

export function isSogoSuperuser(player) {
  const name = String(player && player.name || "").trim().toLowerCase();
  return name === "sogo" || name === "mojosogo";
}

export function isSogoSuperuserSelected() {
  return isSogoSuperuser(ctx.deviceSelectedPlayer()) && hasSogoSuperuserPasscode();
}

export function hasSogoSuperuserPasscode() {
  return Boolean(readSogoSuperuserPasscode());
}

export async function verifySogoSuperuserPasscode(player) {
  if (hasSogoSuperuserPasscode()) return true;
  const { value: passcode, remember } = await promptForPasscode("Enter Sogo passcode", { showRemember: true });
  if (!passcode) {
    forgetSogoSuperuserPasscode();
    return false;
  }
  try {
    await api("/api/superuser/verify", { requester_id: player.id, passcode });
    storeSogoSuperuserPasscode(passcode, remember);
    return true;
  } catch (error) {
    forgetSogoSuperuserPasscode();
    alert(error.message);
    return false;
  }
}

export async function ensureSogoSuperuserPasscode(player) {
  const existing = readSogoSuperuserPasscode();
  if (existing) return existing;
  const verified = await verifySogoSuperuserPasscode(player);
  return verified ? readSogoSuperuserPasscode() : "";
}

// Sign out of Sogo admin on this device: drop the session passcode and any
// "remember me on this phone" copy, then re-render the admin affordances away.
export async function forgetSogoAdmin() {
  if (!hasSogoSuperuserPasscode()) return;
  const confirmed = await confirmAction("Forget Sogo admin?", "Sign out of Sogo admin on this phone and forget the passcode (including a remembered one)?");
  if (!confirmed) return;
  forgetSogoSuperuserPasscode();
  ctx.renderAdminActions();
  ctx.renderPlayers();
  playConfirm();
}
