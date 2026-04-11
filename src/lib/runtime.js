export function isDesktopApp() {
  return typeof window !== "undefined" && Boolean(window.studybridgeDesktop?.getRuntimeConfig);
}
