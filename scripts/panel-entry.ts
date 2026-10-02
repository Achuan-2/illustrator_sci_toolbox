import type { Plugin } from 'vite';

/** Keep relative module URLs anchored at the actual panel HTML entry. */
export function panelEntryRedirect(): Plugin {
  return {
    name: 'sci-panel-entry-redirect',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? '';
        if (url.split('?')[0] !== '/') return next();
        response.statusCode = 302;
        response.setHeader('Location', `/main/index.html${url.slice(1)}`);
        response.end();
      });
    }
  };
}
