import { isDesktopApp } from "@/lib/runtime";

export async function loadDesktopAiRuntime() {
  if (!isDesktopApp()) return null;
  if (!window.studybridgeDesktop?.getRuntimeConfig) return null;

  try {
    return await window.studybridgeDesktop.getRuntimeConfig();
  } catch {
    return null;
  }
}

export function isDesktopAiUnavailable(runtime) {
  return Boolean(runtime) && [
    "disabled",
    "missing_key",
    "error",
    "awaiting_choice",
    "rate_limited",
    "missing_provider",
    "needs_auth",
  ].includes(runtime.status);
}

export function getDesktopAiNotice(runtime, t = (key, fallback = "") => fallback) {
  if (!runtime) return "";
  if (runtime.status === "missing_key") {
    return t("ai.missingKey", {}, "Add a cloud API key in Settings or download the local Gemma model.");
  }
  if (runtime.status === "error") {
    return runtime.error || t("ai.runtimeError", {}, "The local model runtime failed to start. Open Settings to try again.");
  }
  if (runtime.status === "disabled") {
    return t("ai.disabled", {}, "AI is disabled. Open Settings to download Gemma locally or add a cloud API key.");
  }
  if (runtime.status === "awaiting_choice") {
    return t("ai.awaitingChoice", {}, "Choose local Gemma or add a cloud API key in Settings to enable AI.");
  }
  if (runtime.status === "needs_auth") {
    return runtime.error || "Codex CLI is installed but not yet authorized. Open Settings and run Codex login.";
  }
  if (runtime.status === "rate_limited") {
    return runtime.error || t("ai.rateLimited", {}, "Cloud AI usage limit reached. Open Settings to review your budget or wait for the reset.");
  }
  if (runtime.status === "missing_provider") {
    return runtime.error || "Codex CLI is not installed or not available to StudyBridge. Open Settings to install Codex CLI, or switch back to Gemma or a cloud API key.";
  }
  return "";
}
