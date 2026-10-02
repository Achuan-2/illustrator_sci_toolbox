// Load before Svelte evaluates: transpiling syntax does not supply browser APIs.
import 'core-js/stable/global-this';
import 'core-js/stable/string/replace-all';
// CEP 8 already has a native Promise; patch only the missing methods.
import 'core-js/modules/es.promise.all-settled';
import 'core-js/modules/es.promise.finally';

// Use the native Promise microtask queue in CEP 8/9. Report callback failures
// as uncaught errors, matching queueMicrotask rather than rejected promises.
if (typeof window.queueMicrotask !== 'function') {
  window.queueMicrotask = (callback: VoidFunction): void => {
    if (typeof callback !== 'function')
      throw new TypeError('Expected a function');
    void Promise.resolve()
      .then(callback)
      .catch((error) => {
        setTimeout(() => {
          throw error;
        }, 0);
      });
  };
}

/** CSS.supports('gap') also succeeds when only grid gap is supported. */
export function configureLegacyLayout(document: Document): void {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px';
  probe.appendChild(document.createElement('div'));
  probe.appendChild(document.createElement('div'));
  document.body.appendChild(probe);
  document.documentElement.classList.toggle(
    'no-flex-gap',
    probe.scrollHeight !== 1
  );
  document.body.removeChild(probe);
}
