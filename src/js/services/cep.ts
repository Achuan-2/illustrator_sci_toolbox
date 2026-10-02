export function openExternal(event: MouseEvent): void {
  const link = event.currentTarget as HTMLAnchorElement;
  if (!window.cep?.util) return;
  event.preventDefault();
  window.cep.util.openURLInDefaultBrowser(link.href);
}
