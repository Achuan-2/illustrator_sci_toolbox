import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const releaseFooter = `---

百度网盘地址：https://pan.baidu.com/s/1zRVdx0TtWFCZi0rwfZkUBw?pwd=ftit

夸克网盘地址：https://pan.quark.cn/s/12bf0d38de47

开发和维护不易，如果你觉得这个插件好用欢迎给我打赏

<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/network-asset-image-20250614123558-fuhir5v.png" />`;

export function releaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const heading = new RegExp(
    `^#{1,6}\\s+v?${version.replace(/\./g, '\\.')}[\\s/]`
  );
  const start = lines.findIndex((line) => heading.test(line + ' '));
  if (start === -1)
    throw new Error(`CHANGELOG.md has no entry for v${version}`);
  let end = start + 1;
  while (
    end < lines.length &&
    !/^#{1,6}\s+v?\d+\.\d+\.\d+(?=\s|$)/.test(lines[end])
  )
    end++;
  const notes = lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
  if (!notes)
    throw new Error(`CHANGELOG.md has no release notes for v${version}`);
  return `${notes}\n\n${releaseFooter}\n`;
}

export function validateTag(tag, version) {
  if (tag !== `v${version}`)
    throw new Error(`Tag ${tag} does not match package.json v${version}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const tag = process.env.GITHUB_REF_NAME || process.argv[2];
  if (tag) validateTag(tag, version);
  fs.writeFileSync(
    'release-notes.md',
    releaseNotes(fs.readFileSync('CHANGELOG.md', 'utf8'), version)
  );
  console.log(`Release notes prepared for v${version}`);
}
