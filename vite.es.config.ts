import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const hostSources = [
  'src/jsx/lib/json2.js',
  'src/jsx/ilst/arrange.jsx',
  'src/jsx/index.ts'
];

/** Vite uses slash-separated paths, including on Windows. */
export function isHostSource(file: string): boolean {
  const normalize = (source: string) => {
    const absolute = path.resolve(source).replace(/\\/g, '/');
    return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
  };
  return hostSources.some((source) => normalize(source) === normalize(file));
}

/** Keep the proven ES3 Illustrator algorithms intact, in a private scope.
 * Only the small typed dispatcher is transpiled; it also uses ES3 syntax.
 * The build tests parse the complete output with an ES3 parser.
 */
export function buildExtendScript(outDir: string): void {
  const [json, legacy, entry] = hostSources.map((file) =>
    fs.readFileSync(file, 'utf8')
  );
  const dispatcher = ts.transpileModule(entry, {
    compilerOptions: { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.None }
  }).outputText;
  const output = `${json}\n(function () {\n${legacy}\n${dispatcher}\n}());\n`;
  const hostDir = path.join(outDir, 'jsx');
  fs.mkdirSync(hostDir, { recursive: true });
  fs.writeFileSync(path.join(hostDir, 'index.js'), output);
}
