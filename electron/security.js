'use strict';

function isExpectedAppUrl(url, expectedUrl) {
  return typeof url === 'string' && url === expectedUrl;
}

function isTrustedRenderer(event, window, expectedUrl) {
  if (!event || !window || !window.webContents || !event.senderFrame) return false;

  const contents = window.webContents;
  return event.sender === contents &&
    event.senderFrame === contents.mainFrame &&
    isExpectedAppUrl(event.senderFrame.url, expectedUrl) &&
    isExpectedAppUrl(contents.getURL(), expectedUrl);
}

function focusWindow(window) {
  if (!window || (typeof window.isDestroyed === 'function' && window.isDestroyed())) {
    return false;
  }

  if (window.isMinimized()) window.restore();
  window.focus();
  return true;
}

module.exports = { focusWindow, isExpectedAppUrl, isTrustedRenderer };
