/** Leave host idle time after each completed request, including slow CEP calls. */
export function startBackgroundPolling(
  task: () => Promise<unknown>,
  interval = 400
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let disposed = false;
  let refreshRequested = false;

  function schedule(delay: number) {
    timer = setTimeout(() => {
      void tick();
    }, delay);
  }

  async function tick() {
    if (disposed) return;
    timer = undefined;
    running = true;
    refreshRequested = false;
    const started = Date.now();
    try {
      await task();
    } catch (error) {
      console.error('Background host polling failed', error);
    } finally {
      running = false;
      if (!disposed) {
        // Slow requests leave nine times their duration idle, capped at 30 s.
        const delay = Math.max(
          interval,
          Math.min(30000, (Date.now() - started) * 9)
        );
        schedule(refreshRequested ? 0 : delay);
      }
    }
  }

  schedule(interval);
  return {
    refresh() {
      if (disposed) return;
      refreshRequested = true;
      if (running) return;
      clearTimeout(timer);
      schedule(0);
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
    }
  };
}
