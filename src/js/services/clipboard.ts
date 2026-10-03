/** CEP 8 has no Clipboard API. Keep a copy-command fallback for its CEF engine
 * and for denied modern clipboard permissions, restoring focus and selection.
 */
export async function copyTextToClipboard(
  text: string,
  doc: Document = document,
  browser: Pick<Navigator, 'clipboard'> = navigator
): Promise<void> {
  try {
    if (browser.clipboard?.writeText) {
      await browser.clipboard.writeText(text);
      return;
    }
  } catch {
    // file:// CEP panels can reject the modern API even when it exists.
  }
  const active = doc.activeElement as HTMLElement | null;
  const selection = doc.getSelection();
  const ranges: Range[] = [];
  for (let i = 0; selection && i < selection.rangeCount; i++)
    ranges.push(selection.getRangeAt(i).cloneRange());
  const input = doc.createElement('textarea');
  input.value = text;
  input.readOnly = true;
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  doc.body.appendChild(input);
  let copied = false;
  try {
    input.focus();
    input.select();
    copied = typeof doc.execCommand === 'function' && doc.execCommand('copy');
  } finally {
    input.remove();
    active?.focus();
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
  if (!copied) throw new Error('Clipboard copy failed');
}
