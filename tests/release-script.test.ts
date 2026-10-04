import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Export Bash functions so the real script runs with no GitHub or Git writes.
const commands = `
record() { printf '%s\\n' "$*" >> "$RELEASE_TEST_LOG"; }
node() { printf '2.5.0\\n'; }
git() {
  record git "$@"
  case "$*" in
    'remote get-url origin') printf 'https://github.com/example/toolbox.git\\n' ;;
    'rev-parse HEAD') printf '0123456789012345678901234567890123456789\\n' ;;
    *) return 90 ;;
  esac
}
pnpm() {
  record pnpm "$@"
  [[ "$1" != "$RELEASE_TEST_FAIL" ]] || return 91
  case "$1" in
    release:notes) printf 'Release notes\\n' > release-notes.md ;;
    zip)
      mkdir -p dist/zxp dist/zip
      printf 'signed fixture' > dist/zxp/illustrator_sci_toolbox_v2.5.0.zxp
      cp dist/zxp/illustrator_sci_toolbox_v2.5.0.zxp dist/zip/illustrator_sci_toolbox_v2.5.0.zip
      ;;
  esac
}
gh() {
  record gh "$@"
  case "$1 $2" in
    'auth status') ;;
    'repo view') printf 'example/toolbox\\n' ;;
    'api --paginate')
      [[ "$RELEASE_TEST_FAIL" != 'list' ]] || return 92
      if [[ "$RELEASE_TEST_MODE" == 'existing' ]]; then
        printf 'v2.4.9\\nv2.5.0\\nv2.4.8\\n'
      fi
      ;;
    api*) printf '0123456789012345678901234567890123456789\\n' ;;
    'release view') printf 'https://github.com/example/toolbox/releases/tag/v2.5.0\\n' ;;
    'release create'|'release edit') ;;
    *) return 93 ;;
  esac
}
export -f record node git pnpm gh
script="$1/release.sh"
shift
bash "$script" "$@"
`;

function runRelease(mode = 'new', fail = '', args: string[] = []) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'release script fixture-')
  );
  try {
    fs.writeFileSync(
      path.join(directory, 'release.sh'),
      fs.readFileSync('release.sh', 'utf8').replace(/\r\n/g, '\n')
    );
    const logfile = path.join(directory, 'commands.log');
    const result = spawnSync(
      'bash',
      ['-c', commands, 'release-test', directory.replace(/\\/g, '/'), ...args],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          RELEASE_TEST_LOG: logfile.replace(/\\/g, '/'),
          RELEASE_TEST_MODE: mode,
          RELEASE_TEST_FAIL: fail
        }
      }
    );
    assert.ifError(result.error);
    const log = fs.existsSync(logfile) ? fs.readFileSync(logfile, 'utf8') : '';
    return { ...result, log };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('release creates from HEAD after verification without uploading packages', () => {
  const result = runRelease();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.log, /pnpm release:notes v2\.5\.0/);
  assert.ok(
    result.log.indexOf('pnpm verify:package') <
      result.log.indexOf('gh release create')
  );
  assert.match(
    result.log,
    /gh release create v2\.5\.0 --repo example\/toolbox --target 0123456789012345678901234567890123456789 --title v2\.5\.0 --notes-file release-notes\.md/
  );
  assert.doesNotMatch(result.log, /^gh .*\.(zxp|zip)|gh release upload/m);
  assert.doesNotMatch(result.log, /git (add|commit|push|tag)/);
});

test('release updates existing notes without uploading packages or recreating the tag', () => {
  const result = runRelease('existing');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.log, /gh release edit .* --notes-file release-notes\.md/);
  assert.doesNotMatch(
    result.log,
    /^gh .*\.(zxp|zip)|gh release (create|upload)/m
  );
});

test('release stops on failed package verification or GitHub listing', () => {
  for (const failure of ['verify:package', 'list']) {
    const result = runRelease('new', failure);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.log, /gh release (create|upload|edit)/);
  }
});

test('release supports local packaging without Git or GitHub commands', () => {
  const result = runRelease('new', '', ['--no-release']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.log, /pnpm verify:package/);
  assert.doesNotMatch(result.log, /^(gh|git) /m);
});
