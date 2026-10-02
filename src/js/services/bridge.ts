import {
  hostNamespace,
  type HostArguments,
  type HostOperation,
  type HostResponse
} from '../../shared/host';

export interface CepAdapter {
  evalScript(script: string, callback: (result: string) => void): void;
  getSystemPath(name: string): string;
  getExtensionId?(): string;
  getExtensions?(): string;
  requestOpenExtension?(extensionId: string, params?: string): void;
  closeExtension?(): void;
  dispatchEvent?(event: { type: string; scope: string; data: string; [key: string]: unknown }): void;
  addEventListener?(type: string, listener: (event: unknown) => void): void;
  removeEventListener?(type: string, listener: (event: unknown) => void): void;
}

export class HostError extends Error {
  constructor(
    public key: string,
    public args: string[] | Record<string, string> = []
  ) {
    super(key);
  }
}

export function extensionPath(cep: CepAdapter): string {
  return decodeURI(cep.getSystemPath('extension'))
    .replace(/^file:\/\/\/(?=[a-z]:)/i, '')
    .replace(/^file:\/\//, '')
    .replace(/\\/g, '/');
}

/** Initialization and calls share one queue. Failed requests release the queue. */
export function createBridge(cep: CepAdapter | undefined) {
  let initialization: Promise<void> | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const evaluate = (script: string) =>
    new Promise<string>((resolve, reject) => {
      if (!cep) return reject(new HostError('errors.hostUnavailable'));
      try {
        cep.evalScript(script, (result) => {
          if (!result || result === 'EvalScript error.')
            reject(new HostError('errors.script'));
          else resolve(result);
        });
      } catch {
        reject(new HostError('errors.script'));
      }
    });

  function initialize(): Promise<void> {
    if (!initialization) {
      const path = cep ? `${extensionPath(cep)}/jsx/index.js` : '';
      initialization = evaluate(
        `try { $.evalFile(${JSON.stringify(path)}); "SCI_READY"; } catch (e) { "SCI_LOAD_ERROR: " + e.message + " (line " + e.line + ")"; }`
      )
        .then((result) => {
          if (result !== 'SCI_READY')
            throw new HostError('errors.hostLoad', [result]);
        })
        .catch((error) => {
          initialization = undefined;
          throw error;
        });
    }
    return initialization;
  }

  return {
    initialize,
    call<K extends HostOperation>(
      operation: K,
      ...args: HostArguments[K]
    ): Promise<string> {
      const request = queue.then(async () => {
        await initialize();
        // Payload cannot introduce executable code, even with quotes or backslashes.
        const payload = encodeURIComponent(JSON.stringify(args));
        const result = await evaluate(
          `$[${JSON.stringify(hostNamespace)}].call(${JSON.stringify(operation)}, ${JSON.stringify(payload)})`
        );
        let response: HostResponse;
        try {
          response = JSON.parse(result);
        } catch {
          throw new HostError('errors.script');
        }
        if (!response.ok) throw new HostError(response.error, response.args);
        return response.data;
      });
      queue = request.catch(() => undefined);
      return request;
    }
  };
}

export const bridge = createBridge(
  typeof window === 'undefined' ? undefined : window.__adobe_cep__
);
