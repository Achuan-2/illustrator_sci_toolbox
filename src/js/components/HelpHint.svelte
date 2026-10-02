<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '../i18n';

  let { id, text }: { id: string; text: string } = $props();
  let button: HTMLButtonElement;
  let popup: HTMLDivElement | undefined;
  let open = $state(false);
  let pinned = $state(false);
  let left = $state(8);
  let top = $state(8);
  let hovering = false;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const openEvent = 'sci:help-open';
  const hoverDelay = 600;

  function clearOpenTimer() {
    clearTimeout(openTimer);
    openTimer = undefined;
  }
  function clearCloseTimer() {
    clearTimeout(closeTimer);
    closeTimer = undefined;
  }
  function close() {
    clearOpenTimer();
    clearCloseTimer();
    open = false;
    pinned = false;
  }
  function show() {
    clearOpenTimer();
    clearCloseTimer();
    if (!open) window.dispatchEvent(new CustomEvent(openEvent, { detail: id }));
    open = true;
  }
  function enter() {
    hovering = true;
    clearCloseTimer();
    if (!open) {
      clearOpenTimer();
      openTimer = setTimeout(show, hoverDelay);
    }
  }
  function leave() {
    hovering = false;
    clearOpenTimer();
    if (!pinned && document.activeElement !== button) {
      // Allow moving from the icon into the popup to select or copy its text.
      clearCloseTimer();
      closeTimer = setTimeout(close, 180);
    }
  }
  function toggle() {
    if (pinned) close();
    else {
      show();
      pinned = true;
    }
  }
  function position() {
    if (!button || !popup || !open) return;
    const anchor = button.getBoundingClientRect();
    const bounds = popup.getBoundingClientRect();
    left = Math.max(
      8,
      Math.min(
        anchor.left + anchor.width / 2 - bounds.width / 2,
        window.innerWidth - bounds.width - 8
      )
    );
    const below = anchor.bottom + 6;
    top = Math.max(
      8,
      Math.min(
        below + bounds.height <= window.innerHeight - 8
          ? below
          : anchor.top - bounds.height - 6,
        window.innerHeight - bounds.height - 8
      )
    );
  }
  function portal(node: HTMLDivElement) {
    popup = node;
    // Scrollable CEP panels must not clip the explanation.
    document.body.appendChild(node);
    void tick().then(position);
    return {
      destroy() {
        popup = undefined;
        node.remove();
      }
    };
  }

  $effect(() => {
    text;
    if (open) void tick().then(position);
  });

  onMount(() => {
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!button.contains(target) && !popup?.contains(target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (open) event.stopPropagation();
        close();
      }
    };
    const another = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) close();
    };
    document.addEventListener('click', outside);
    document.addEventListener('keydown', escape, true);
    window.addEventListener(openEvent, another);
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    window.addEventListener('hashchange', close);
    return () => {
      clearOpenTimer();
      clearCloseTimer();
      document.removeEventListener('click', outside);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener(openEvent, another);
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('hashchange', close);
    };
  });
</script>

<button
  type="button"
  class="help-hint"
  class:open
  {id}
  bind:this={button}
  aria-label={$t('common.help')}
  aria-expanded={open}
  aria-controls={`${id}-content`}
  aria-describedby={open ? `${id}-content` : undefined}
  onmouseenter={enter}
  onmouseleave={leave}
  onfocus={show}
  onmousedown={(event) => event.stopPropagation()}
  onblur={() => {
    if (!hovering) leave();
  }}
  onclick={toggle}
>
  <svg
    width="18"
    height="18"
    viewBox="0 0 20 20"
    aria-hidden="true"
    focusable="false"
  >
    <circle
      cx="10"
      cy="10"
      r="8"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    />
    <circle cx="10" cy="6" r="1" fill="currentColor" />
    <path
      d="M10 9v5"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
    />
  </svg>
</button>
{#if open}
  <div
    use:portal
    class="help-popup"
    id={`${id}-content`}
    role="tooltip"
    style:left={`${left}px`}
    style:top={`${top}px`}
    onmouseenter={enter}
    onmouseleave={leave}
  >
    {text}
  </div>
{/if}

<style>
  .help-hint {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 22px;
    width: 22px;
    height: 22px;
    padding: 2px;
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    vertical-align: middle;
  }
  .help-hint:hover,
  .help-hint.open {
    color: var(--primary);
  }
  .help-hint:focus {
    outline: 1px solid var(--primary);
    border-radius: 50%;
  }
  .help-popup {
    position: fixed;
    z-index: 10000;
    width: 300px;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    box-sizing: border-box;
    overflow: auto;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-panel-2);
    color: var(--text);
    font:
      13px/1.6 Arial,
      sans-serif;
    font-weight: normal;
    white-space: pre-line;
    overflow-wrap: break-word;
    user-select: text;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
  }
</style>
