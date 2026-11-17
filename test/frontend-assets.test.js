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

test('calendar period navigation controls retain direct inputs, icon buttons, and descriptive labels', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles', 'app.css'), 'utf8');

  [
    ['trend-custom-month', 'custom period'],
    ['trend-comparison-first-month', 'first comparison period'],
    ['trend-comparison-second-month', 'second comparison period'],
  ].forEach(([inputId, label]) => {
    assert.match(html, new RegExp('<input id="' + inputId + '" type="month"'));
    assert.match(html, new RegExp('id="' + inputId + '-prev"[^>]*aria-label="Previous month for ' + label + '"'));
    assert.match(html, new RegExp('id="' + inputId + '-next"[^>]*aria-label="Next month for ' + label + '"'));
    assert.match(html, new RegExp('id="' + inputId + '-prev"[^>]*><svg class="trend-navigation-icon"[^>]*aria-hidden="true"'));
    assert.match(html, new RegExp('id="' + inputId + '-next"[^>]*><svg class="trend-navigation-icon"[^>]*aria-hidden="true"'));
  });
  [
    ['trend-custom-year', 'custom period'],
    ['trend-comparison-first-year', 'first comparison period'],
    ['trend-comparison-second-year', 'second comparison period'],
  ].forEach(([inputId, label]) => {
    assert.match(html, new RegExp('<input id="' + inputId + '" type="text"'));
    assert.match(html, new RegExp('id="' + inputId + '-prev"[^>]*aria-label="Previous year for ' + label + '"'));
    assert.match(html, new RegExp('id="' + inputId + '-next"[^>]*aria-label="Next year for ' + label + '"'));
    assert.match(html, new RegExp('id="' + inputId + '-prev"[^>]*><svg class="trend-navigation-icon"[^>]*aria-hidden="true"'));
    assert.match(html, new RegExp('id="' + inputId + '-next"[^>]*><svg class="trend-navigation-icon"[^>]*aria-hidden="true"'));
  });
  assert.match(css, /\.trend-custom-type-field label,\s*\.trend-custom-field label\s*\{[\s\S]*?display:\s*block/);
  assert.match(css, /\.trend-month-navigation,\s*\.trend-year-navigation\s*\{[\s\S]*?grid-template-columns:\s*2\.5rem minmax\(0, 1fr\) 2\.5rem/);
  assert.match(css, /\.trend-month-nav-btn,\s*\.trend-year-nav-btn\s*\{[\s\S]*?min-height:\s*2\.5rem/);
  assert.match(css, /\.trend-navigation-icon\s*\{[\s\S]*?stroke:\s*currentColor/);
  assert.match(html, /id="trend-comparison-swap-btn"[^>]*aria-label="Swap first and second comparison periods"/);
  assert.match(html, /id="trend-comparison-previous-btn"[^>]*aria-label="Set the first comparison period to the period before the second"/);
  assert.match(html, /id="trend-comparison-current-btn"[^>]*aria-label="Set comparison periods to the previous and current periods"/);
  assert.match(css, /\.trend-comparison-shortcuts\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(css, /#apply-trend-comparison-btn\s*\{[\s\S]*?justify-self:\s*start/);
});

test('daily entry date navigation uses accessible chevrons and a responsive readable input layout', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles', 'app.css'), 'utf8');

  assert.match(html, /id="entry-date-prev"[^>]*aria-label="Previous day"[^>]*><svg class="trend-navigation-icon"[^>]*aria-hidden="true"/);
  assert.match(html, /id="entry-date-next"[^>]*aria-label="Next day"[^>]*><svg class="trend-navigation-icon"[^>]*aria-hidden="true"/);
  assert.match(html, /type="date"[^>]*id="entry-date"/);
  assert.match(css, /\.entry-date-navigation\s*\{[\s\S]*?grid-template-columns:\s*2\.5rem minmax\(13rem, 1fr\) 2\.5rem/);
  assert.match(css, /\.entry-date-nav-btn\s*\{[\s\S]*?min-height:\s*2\.5rem/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.entry-date-navigation input\[type="date"\][\s\S]*?grid-column:\s*1 \/ -1[\s\S]*?grid-row:\s*2/);
});

test('all exact-data tables share accessible scrolling and sticky layering', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles', 'app.css'), 'utf8');

  assert.match(html, /<details class="trend-data-details">[\s\S]*?<summary>[\s\S]*?trend-data-summary-collapsed[\s\S]*?Show exact chart data/);
  assert.match(html, /trend-data-summary-expanded[\s\S]*?Hide exact chart data/);
  assert.match(css, /\.trend-data-details\[open\][\s\S]*?\.trend-data-summary-collapsed[\s\S]*?display:\s*none/);
  assert.match(css, /\.trend-data-details\[open\][\s\S]*?\.trend-data-summary-expanded[\s\S]*?display:\s*inline/);
  assert.match(css, /\.trend-data-table-wrap\.trend-data-table-host[\s\S]*?overflow:\s*visible/);
  assert.match(css, /\.trend-data-table-scroll-region\s*\{[\s\S]*?max-height:\s*70vh[\s\S]*?overflow:\s*auto/);
  assert.match(css, /\.trend-data-table th:first-child,[\s\S]*?\.trend-data-table td:first-child[\s\S]*?position:\s*sticky[\s\S]*?left:\s*0/);
  assert.match(css, /\.trend-data-table thead th\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*0[\s\S]*?z-index:\s*2/);
  assert.match(css, /\.trend-data-table thead th:first-child\s*\{[\s\S]*?left:\s*0[\s\S]*?z-index:\s*3/);
});
