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
    "missing_model",
    "starting",
    "downloading-model",
    "needs_auth",
  ].includes(runtime.status);
}
