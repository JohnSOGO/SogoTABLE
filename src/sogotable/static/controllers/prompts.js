// Confirm / info / passcode modal prompts, extracted from the app shell. Self-
// contained: it owns its two pending-resolver globals and wires its own DOM
// controls. The shell imports confirmAction/showInfoPrompt/promptForPasscode and
// calls wirePromptControls() once during init.
import { playConfirm, playCancel } from "../sound.js";

let pendingConfirmAction = null;
let pendingPasscodePrompt = null;

function confirmAction(title, message) {
  const prompt = document.getElementById("confirmPrompt");
  prompt.classList.remove("info-prompt");
  configureConfirmPromptButtons("Yes", "No", false);
  document.getElementById("confirmPromptTitle").textContent = title;
  document.getElementById("confirmPromptText").textContent = message;
  prompt.classList.remove("hidden");
  return new Promise((resolve) => {
    pendingConfirmAction = resolve;
  });
}

function showInfoPrompt(title, message) {
  const prompt = document.getElementById("confirmPrompt");
  prompt.classList.add("info-prompt");
  configureConfirmPromptButtons("OK", "", true);
  document.getElementById("confirmPromptTitle").textContent = title;
  document.getElementById("confirmPromptText").textContent = message;
  prompt.classList.remove("hidden");
  return new Promise((resolve) => {
    pendingConfirmAction = resolve;
  });
}

function configureConfirmPromptButtons(yesText, noText, hideNo) {
  const yes = document.getElementById("confirmYes");
  const no = document.getElementById("confirmNo");
  yes.textContent = yesText;
  no.textContent = noText;
  no.classList.toggle("hidden", Boolean(hideNo));
}

function resolveConfirmPrompt(confirmed) {
  const prompt = document.getElementById("confirmPrompt");
  prompt.classList.add("hidden");
  prompt.classList.remove("info-prompt");
  if (confirmed) playConfirm();
  else playCancel();
  if (!pendingConfirmAction) return;
  const resolve = pendingConfirmAction;
  pendingConfirmAction = null;
  resolve(confirmed);
}

// A numeric-keypad replacement for window.prompt for the (digits-only) passcode:
// a password input with inputmode="numeric" opens the number pad on touch
// devices. Resolves to the entered string, or null if cancelled.
function promptForPasscode(title = "Enter passcode") {
  const prompt = document.getElementById("passcodePrompt");
  const input = document.getElementById("passcodeInput");
  document.getElementById("passcodePromptTitle").textContent = title;
  input.value = "";
  prompt.classList.remove("hidden");
  setTimeout(() => input.focus(), 0);
  return new Promise((resolve) => {
    pendingPasscodePrompt = resolve;
  });
}

function resolvePasscodePrompt(value) {
  document.getElementById("passcodePrompt").classList.add("hidden");
  if (!pendingPasscodePrompt) return;
  const resolve = pendingPasscodePrompt;
  pendingPasscodePrompt = null;
  if (value === null) playCancel();
  else playConfirm();
  resolve(value);
}

function submitPasscodePrompt() {
  resolvePasscodePrompt((document.getElementById("passcodeInput").value || "").trim());
}

function cancelPasscodePrompt() {
  resolvePasscodePrompt(null);
}

function closePasscodePromptOnBackdrop(event) {
  if (event.target.id === "passcodePrompt") cancelPasscodePrompt();
}

function onPasscodeInputKey(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    submitPasscodePrompt();
  } else if (event.key === "Escape") {
    event.preventDefault();
    cancelPasscodePrompt();
  }
}

function closeConfirmPromptOnBackdrop(event) {
  if (event.target.id !== "confirmPrompt") return;
  if (event.currentTarget && event.currentTarget.classList.contains("info-prompt")) return;
  resolveConfirmPrompt(false);
}

// Attach the confirm/passcode modal handlers (was inline in the shell's init).
export function wirePromptControls() {
  document.getElementById("confirmYes").addEventListener("click", () => resolveConfirmPrompt(true));
  document.getElementById("confirmNo").addEventListener("click", () => resolveConfirmPrompt(false));
  document.getElementById("confirmPrompt").addEventListener("click", closeConfirmPromptOnBackdrop);
  document.getElementById("passcodeSubmit").addEventListener("click", submitPasscodePrompt);
  document.getElementById("passcodeCancel").addEventListener("click", cancelPasscodePrompt);
  document.getElementById("passcodePrompt").addEventListener("click", closePasscodePromptOnBackdrop);
  document.getElementById("passcodeInput").addEventListener("keydown", onPasscodeInputKey);
}

export { confirmAction, showInfoPrompt, promptForPasscode };
