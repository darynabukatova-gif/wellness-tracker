'use strict';

const assert = require('node:assert/strict');
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const scriptPath = path.resolve(__dirname, '..', 'scripts', 'install-linux.sh');

function withLegacyFixture(desktopContents, callback) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'wellness-installer-'));
  const applicationsDir = path.join(directory, 'Applications');
  const iconsDir = path.join(directory, '.local', 'share', 'icons');
  const launchersDir = path.join(directory, '.local', 'share', 'applications');
  const stateDir = path.join(directory, '.local', 'share', 'wellness-tracker');
  const appImage = path.join(applicationsDir, 'WellnessTracker.AppImage');
  const icon = path.join(iconsDir, 'wellness-tracker.png');
  const desktopFile = path.join(launchersDir, 'wellness-tracker.desktop');
  const marker = path.join(stateDir, 'launcher-installation');

  mkdirSync(applicationsDir, { recursive: true });
  mkdirSync(iconsDir, { recursive: true });
  mkdirSync(launchersDir, { recursive: true });
  writeFileSync(appImage, 'legacy AppImage');
  writeFileSync(icon, 'legacy icon');
  writeFileSync(desktopFile, desktopContents(appImage, icon));

  try {
    return callback({ appImage, icon, desktopFile, marker, stateDir });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runLegacyAdoption({ appImage, icon, desktopFile, marker, stateDir }) {
  const sourceAndAdopt = [
    'source "$1"',
    'installed_appimage="$2"',
    'installed_icon="$3"',
    'desktop_file="$4"',
    'ownership_marker="$5"',
    'state_dir="$6"',
    "marker_contents='Wellness Tracker launcher installer v1'",
    'temporary_files=()',
    'adopt_legacy_installation',
  ].join('\n');
  return spawnSync(
    'bash',
    ['-c', sourceAndAdopt, 'bash', scriptPath, appImage, icon, desktopFile, marker, stateDir],
    { encoding: 'utf8' }
  );
}

function validDesktopEntry(appImage, icon) {
  return [
    '[Desktop Entry]',
    'Name=Wellness Tracker',
    `Exec="${appImage}"`,
    `Icon=${icon}`,
    'Type=Application',
    'StartupWMClass=wellness-tracker',
  ].join('\n');
}

test('Linux installer: shell syntax is valid without executing the installer', () => {
  const result = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('Linux installer: uses ownership checks and atomic replacement for managed files', () => {
  const source = readFileSync(scriptPath, 'utf8');
  assert.match(source, /ownership_marker=/);
  assert.match(source, /Existing files are not marked as installer-managed/);
  assert.match(source, /mktemp --tmpdir="\$destination_dir"/);
  assert.match(source, /mv -f -- "\$temporary_file" "\$destination"/);
  assert.match(source, /temporary_files=\(\)/);
  assert.match(source, /trap cleanup EXIT/);
  assert.match(source, /--adopt-legacy/);
  assert.match(source, /verify_legacy_installation/);
});

test('Linux installer: a verified legacy installation can be explicitly adopted', () => {
  withLegacyFixture(validDesktopEntry, fixture => {
    const result = runLegacyAdoption(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(fixture.marker, 'utf8').trim(),
      'Wellness Tracker launcher installer v1'
    );
  });
});

test('Linux installer: unrelated existing files cannot be adopted', () => {
  withLegacyFixture((appImage, icon) => [
    '[Desktop Entry]',
    'Name=Unrelated App',
    `Exec="${appImage}"`,
    `Icon=${icon}`,
    'Type=Application',
    'StartupWMClass=other-app',
  ].join('\n'), fixture => {
    const result = runLegacyAdoption(fixture);
    assert.notEqual(result.status, 0);
    assert.equal(result.status, 1);
    assert.throws(() => readFileSync(fixture.marker, 'utf8'));
  });
});
