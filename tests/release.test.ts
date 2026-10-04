import assert from 'node:assert/strict';
import test from 'node:test';
// These helpers are also called by gh_release.sh.
import { releaseNotes, validateTag } from '../scripts/release-notes.mjs';

test('release validates exact tag version and extracts only the matching CHANGELOG entry', () => {
  validateTag('v2.4.2', '2.4.2');
  assert.throws(() => validateTag('v2.4.3', '2.4.2'));
  const changelog =
    '## v2.4.2 / 20261001\n\n- Current changes\n\n## v2.4.1 / 20260816\n\n- Old changes\n';
  assert.equal(
    releaseNotes(changelog, '2.4.2'),
    `- Current changes

---

百度网盘地址：https://pan.baidu.com/s/1zRVdx0TtWFCZi0rwfZkUBw?pwd=ftit

夸克网盘地址：https://pan.quark.cn/s/12bf0d38de47

开发和维护不易，如果你觉得这个插件好用欢迎给我打赏

<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/network-asset-image-20250614123558-fuhir5v.png" />
`
  );
  assert.throws(() => releaseNotes(changelog, '2.5.0'));
  assert.throws(() => releaseNotes('## v2.4.2\n\n', '2.4.2'));
});
