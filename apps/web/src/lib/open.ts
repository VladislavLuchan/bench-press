/**
 * Opens a listing in a separate browser window rather than a tab. On a tiling window
 * manager the new window lands next to the dashboard, which is easier to read side by side.
 * Must be called synchronously inside a user gesture (click or keydown).
 */
export function openInWindow(url: string): void {
  const width = Math.min(1280, Math.round(window.screen.availWidth * 0.6));
  const height = Math.round(window.screen.availHeight * 0.9);
  window.open(url, '_blank', `popup=yes,noopener,width=${width},height=${height}`);
}
