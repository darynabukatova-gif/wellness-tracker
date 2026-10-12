'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  focusWindow,
  isExpectedAppUrl,
  isTrustedRenderer,
} = require('../electron/security.js');

const appUrl = 'file:///opt/Wellness%20Tracker/index.html';

function makeWindow(url = appUrl) {
  const mainFrame = { url };
  const webContents = {
    mainFrame,
    getURL: () => url,
  };
  return { webContents };
}

test('Electron security: accepts only the expected local application URL', () => {
  assert.equal(isExpectedAppUrl(appUrl, appUrl), true);
  assert.equal(isExpectedAppUrl('https://example.test/', appUrl), false);
  assert.equal(isExpectedAppUrl('file:///tmp/other.html', appUrl), false);
});

test('Electron security: IPC requires the expected main frame in the application window', () => {
  const window = makeWindow();
  const trustedEvent = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  };
  assert.equal(isTrustedRenderer(trustedEvent, window, appUrl), true);

  assert.equal(isTrustedRenderer({
    sender: window.webContents,
    senderFrame: { url: appUrl },
  }, window, appUrl), false);

  const navigatedWindow = makeWindow('https://example.test/');
  assert.equal(isTrustedRenderer({
    sender: navigatedWindow.webContents,
    senderFrame: navigatedWindow.webContents.mainFrame,
  }, navigatedWindow, appUrl), false);
});

test('Electron security: second launches restore and focus the existing window', () => {
  const calls = [];
  const minimizedWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    focus: () => calls.push('focus'),
  };
  assert.equal(focusWindow(minimizedWindow), true);
  assert.deepEqual(calls, ['restore', 'focus']);

  const destroyedWindow = {
    isDestroyed: () => true,
  };
  assert.equal(focusWindow(destroyedWindow), false);
});
