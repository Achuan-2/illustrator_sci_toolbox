/** CEP can keep a collapsed panel loaded while document.hidden stays false. */
export function isPanelVisible(): boolean {
  if (document.hidden) return false;
  try {
    const visible = window.__adobe_cep__?.invokeSync?.('isWindowVisible', '');
    return visible !== false && visible !== 'false';
  } catch {
    // Browser previews and older adapters can fall back to DOM visibility.
    return true;
  }
}

export function openExternal(event: MouseEvent): void {
  const link = event.currentTarget as HTMLAnchorElement;
  if (!window.cep?.util) return;
  event.preventDefault();
  window.cep.util.openURLInDefaultBrowser(link.href);
}
