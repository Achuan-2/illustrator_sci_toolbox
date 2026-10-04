import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export const developmentStatusPath = '/__sci/dev/status';
export const developmentReloadPath = '/__sci/dev/reload';

/** Build and serve use the same CEP entry; only release packages stay static. */
export function developmentPanel(port: number, enabled: boolean): Plugin {
  const html = `<!doctype html>
<html>
  <head><meta charset="UTF-8"><title>SCI Toolbox</title></head>
  <body><script>
    location.replace('http://localhost:${port}/main/index.html' + location.search + location.hash);
  </script></body>
</html>
`;
  const writeEntry = (outDir: string) => {
    const entry = path.resolve(outDir, 'main/index.html');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, html);
  };

  return {
    name: 'sci-development-panel',
    configResolved(config) {
      if (!enabled || config.command !== 'serve') return;
      writeEntry(config.build.outDir);
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        if (!enabled) return;
        const entry = bundle['main/index.html'];
        if (entry?.type !== 'asset')
          throw new Error('Missing CEP panel HTML entry');
        entry.source = html;
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split('?')[0];
        if (request.method === 'GET' && url === developmentStatusPath) {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ root: server.config.root }));
        } else if (request.method === 'POST' && url === developmentReloadPath) {
          // Restore the development entry even after a release package was built.
          writeEntry(server.config.build.outDir);
          server.ws.send({ type: 'full-reload' });
          response.statusCode = 204;
          response.end();
        } else next();
      });
    },
    handleHotUpdate({ file, server }) {
      const relative = path.relative(path.join(server.config.root, 'i18n'), file);
      if (
        relative.startsWith('..') ||
        path.isAbsolute(relative) ||
        !relative.endsWith('.json')
      )
        return;
      // Recreate translation stores and closures together, including translated menus.
      server.ws.send({ type: 'full-reload' });
      return [];
    }
  };
}
