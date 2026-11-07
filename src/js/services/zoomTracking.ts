import type { CepAdapter } from './bridge';
import { startBackgroundPolling } from './backgroundPolling';

const namespace = 'com.adobe.illustrator.events.';
const notifiers = [
  'AI Art Selection Changed Notifier',
  'AI Command Notifier: After Undo',
  'AI Command Notifier: After Redo'
];

/** Use Adobe's optional AIHostAdapter; older installations check selection only. */
export function startZoomTracking(
  cep: CepAdapter,
  check: (invalidate: boolean) => Promise<unknown>
) {
  let disposed = false;
  let running = false;
  let pending = false;
  let invalidate = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fallback: ReturnType<typeof startBackgroundPolling> | undefined;
  let native = false;

  function request(refresh = false, delay = 60) {
    if (disposed) return;
    invalidate ||= refresh;
    pending = true;
    if (running || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delay);
  }

  async function flush() {
    if (disposed || running) return;
    running = true;
    pending = false;
    const refresh = invalidate;
    invalidate = false;
    try {
      if ((await check(refresh)) === 'RETRY') {
        invalidate ||= refresh;
        pending = true;
      }
    } catch (error) {
      console.error('Zoom selection check failed', error);
    } finally {
      running = false;
      if (pending) request(false, 120);
    }
  }

  function dispatch(type: string, data = '') {
    cep.dispatchEvent?.({
      type: namespace + type,
      scope: 'APPLICATION',
      appId: 'ILST',
      data
    });
  }
  const onNativeEvent = (event: unknown) => {
    const data = (event as { data?: unknown })?.data;
    if (typeof data !== 'string') return;
    // The adapter wraps its XML payload in CDATA on some CEP versions.
    const xml = data.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1');
    const id = new DOMParser()
      .parseFromString(xml, 'text/xml')
      .documentElement?.getAttribute('id');
    if (id && notifiers.includes(id)) request(false, 0);
  };
  const onReady = () => {
    if (disposed || native) return;
    native = true;
    fallback?.dispose();
    fallback = undefined;
    for (const notifier of notifiers) dispatch('AddEventListener', notifier);
    request(false, 0); // Read-only baseline for an existing selection.
  };

  // No initial document discovery or geometry synchronization, even when an
  // opened document already has selected artwork. The fallback is read-only
  // until a previously observed related object changes.
  fallback = startBackgroundPolling(async () => {
    if (!running && timer === undefined) await flush();
  });
  if (cep.addEventListener && cep.removeEventListener && cep.dispatchEvent) {
    cep.addEventListener(namespace + 'CppEvent', onNativeEvent);
    cep.addEventListener(namespace + 'PingResponseEvent', onReady);
    dispatch('PingRequestEvent');
  }
  return {
    refresh() {
      request(true, 0);
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      fallback?.dispose();
      cep.removeEventListener?.(namespace + 'CppEvent', onNativeEvent);
      cep.removeEventListener?.(namespace + 'PingResponseEvent', onReady);
      if (native)
        for (const notifier of notifiers)
          dispatch('RemoveEventListener', notifier);
    }
  };
}
