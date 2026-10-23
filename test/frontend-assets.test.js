'use strict';

const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

test('frontend assets are referenced in order and included in Electron packaging', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const expectedScripts = [
    '<script defer src="js/core.js"></script>',
    '<script defer src="js/views.js"></script>',
    '<script defer src="js/app.js"></script>'
  ];

  assert.match(html, /<link rel="stylesheet" href="styles\/app\.css">/);
  assert.equal(fs.existsSync(path.join(root, 'styles', 'app.css')), true);
  assert.deepEqual(html.match(/<script\b[^>]*><\/script>/g), expectedScripts);
  ['core.js', 'views.js', 'app.js'].forEach(file => {
    assert.equal(fs.existsSync(path.join(root, 'js', file)), true);
  });
  assert.ok(packageJson.build.files.includes('js/**/*'));
  assert.ok(packageJson.build.files.includes('styles/**/*'));
});

test('chart axis labels use a narrow-container readability rule without changing the base size', () => {
  const css = fs.readFileSync(path.join(root, 'styles', 'app.css'), 'utf8');
  assert.match(css, /\.trend-chart-card\s*\{[\s\S]*?container-type:\s*inline-size/);
  assert.match(css, /@container\s*\(max-width:\s*400px\)[\s\S]*?\.trend-axis-label\s*\{[\s\S]*?font-size:\s*12px/);
  assert.match(css, /@container\s*\(max-width:\s*360px\)[\s\S]*?\.trend-axis-label\s*\{[\s\S]*?font-size:\s*13px/);
  assert.match(css, /@container\s*\(max-width:\s*320px\)[\s\S]*?\.trend-axis-label\s*\{[\s\S]*?font-size:\s*14px/);
  assert.match(css, /\.trend-axis-label\s*\{[\s\S]*?font-size:\s*10px/);
});
