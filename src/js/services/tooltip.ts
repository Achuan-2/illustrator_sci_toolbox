import type { Action } from 'svelte/action';

let nextId = 0;
let closeActive: (() => void) | undefined;

/** Attach an explanation without adding a control or changing the layout. */
export const tooltip: Action<HTMLElement, string | undefined> = (
  node,
  text
) => {
  const id = `sci-tooltip-${++nextId}`;
  let popup: HTMLDivElement | undefined;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  function close() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    openTimer = closeTimer = undefined;
    popup?.remove();
    popup = undefined;
    const descriptions = (node.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((value) => value && value !== id);
    if (descriptions.length)
      node.setAttribute('aria-describedby', descriptions.join(' '));
    else node.removeAttribute('aria-describedby');
    if (closeActive === close) closeActive = undefined;
  }

  function position() {
    if (!popup) return;
    const anchor = node.getBoundingClientRect();
    const bounds = popup.getBoundingClientRect();
    const below = anchor.bottom + 6;
    popup.style.left = `${Math.max(
      8,
      Math.min(
        anchor.left + anchor.width / 2 - bounds.width / 2,
        window.innerWidth - bounds.width - 8
      )
    )}px`;
    popup.style.top = `${Math.max(
      8,
      Math.min(
        below + bounds.height <= window.innerHeight - 8
          ? below
          : anchor.top - bounds.height - 6,
        window.innerHeight - bounds.height - 8
      )
    )}px`;
  }

  function enter() {
    clearTimeout(closeTimer);
    clearTimeout(openTimer);
    if (!text || popup) return;
    openTimer = setTimeout(() => {
      openTimer = undefined;
      if (!text || !node.isConnected) return;
      closeActive?.();
      popup = document.createElement('div');
      popup.id = id;
      popup.className = 'sci-tooltip';
      popup.setAttribute('role', 'tooltip');
      popup.textContent = text;
      popup.addEventListener('mouseenter', enter);
      popup.addEventListener('mouseleave', leave);
      document.body.appendChild(popup);
      const previous = node.getAttribute('aria-describedby');
      node.setAttribute(
        'aria-describedby',
        previous ? `${previous} ${id}` : id
      );
      closeActive = close;
      position();
    }, 600);
  }

  function leave() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    // Keep the explanation reachable for selecting and copying its text.
    closeTimer = setTimeout(close, 180);
  }

  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (popup) event.stopPropagation();
    close();
  }

  node.addEventListener('mouseenter', enter);
  node.addEventListener('mouseleave', leave);
  node.addEventListener('click', close);
  document.addEventListener('keydown', escape, true);
  document.addEventListener('click', close);
  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', position);
  window.addEventListener('hashchange', close);

  return {
    update(value) {
      text = value;
      if (!text) close();
      else if (popup) {
        popup.textContent = text;
        position();
      }
    },
    destroy() {
      close();
      node.removeEventListener('mouseenter', enter);
      node.removeEventListener('mouseleave', leave);
      node.removeEventListener('click', close);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('hashchange', close);
    }
  };
};
