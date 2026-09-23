/**
 * Opens a listing in a separate browser window rather than a tab. On a tiling window
 * manager the new window lands next to the dashboard, which is easier to read side by side.
 * Must be called synchronously inside a user gesture (click or keydown).
 *
 * Returns the window handle so callers can notice when it closes. `noopener` would make
 * window.open return null, so the page's link back to the dashboard is cut by hand instead.
 */
export function openInWindow(url: string): Window | null {
  const width = Math.min(1280, Math.round(window.screen.availWidth * 0.6));
  const height = Math.round(window.screen.availHeight * 0.9);
  const popup = window.open(url, '_blank', `popup=yes,width=${width},height=${height}`);
  if (popup) popup.opener = null;
  return popup;
}
