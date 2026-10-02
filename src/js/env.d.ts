import type { CepAdapter } from './services/bridge';
declare global {
  interface Window {
    __adobe_cep__?: CepAdapter;
    cep?: { util: { openURLInDefaultBrowser(url: string): void } };
  }
}
export {};
