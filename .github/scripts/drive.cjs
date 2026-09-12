// Drives the served page the way a reviewer does: the only check that catches a page rendered
// with no comment form. Usage: node drive.cjs <url> <out dir>   (needs playwright + chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [url, out] = process.argv.slice(2);
const failures = [];
const expect = (label, ok) => { console.log(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) failures.push(label); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(url);
  await page.waitForTimeout(800);
  expect('saved on the server', (await page.locator('#state-enreg').innerText()).includes('saved on the server'));
  // The view is a machine-wide pref (~/.config/gitai/prefs.json): a split table pairs a deleted
  // and an added line on one row, so the row count is only comparable to the model in unified.
  await page.click('#view-unified');
  await page.waitForTimeout(300);

  const model = JSON.parse(fs.readFileSync(path.join(out, 'diff.json'), 'utf8'));
  const renamedModel = model.files.find((f) => f.path === 'src/Domain/Commission/New.php');
  const renamedLines = renamedModel.hunks.reduce((n, h) => n + h.lines.length, 0);
  const renamed = page.locator('.file-diff[data-path="src/Domain/Commission/New.php"]');
  expect(`renamed+edited file renders its ${renamedLines} rows`,
    renamedLines > 0 && (await renamed.locator('tr.commentable').count()) === renamedLines);
  expect('renamed+edited file badged from its old name',
    (await renamed.locator('.file-diff-head .badge-outline').allInnerTexts()).join(' ') === 'renamed from Old.php');
  expect('pure rename keeps its note',
    (await page.locator('.file-diff[data-path="moved.txt"] .file-diff-body').innerText()).includes('rename detected'));
  expect('quoted names render', (await page.locator('.file-diff[data-path=\'we"ird.txt\'], .file-diff[data-path="back\\\\slash.txt"]').count()) === 2);

  // comment on a new-side line
  const keep = page.locator('.file-diff[data-path="keep.txt"]');
  await keep.locator('.line-code[data-side="new"][data-line="3"]').click();
  await page.locator('.form-row-inline textarea').fill('Trailing newline missing');
  await page.locator('.form-row-inline label[data-sev="nitpick"]').click();
  await page.locator('.form-row-inline [data-ok]').click();
  await page.waitForTimeout(600);
  expect('thread shown under the line', (await keep.locator('.thread-row .thread').count()) === 1);
  expect('type label rendered', (await keep.locator('.thread .sev-tag').innerText()) === 'Follow-up');
  expect('tracker lists it', (await page.locator('#tracker-list .tracker-item').count()) === 1);

  // comment on a deleted line
  await renamed.locator('.line-code[data-side="old"][data-line="2"]').click();
  await page.locator('.form-row-inline textarea').fill('why uppercase?');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(600);
  expect('deleted-line badge', (await renamed.locator('.thread-row .badge-outline').allInnerTexts()).includes('deleted line'));

  // split view keeps the threads
  await page.click('#view-split');
  await page.waitForTimeout(500);
  expect('split tables built', (await page.locator('.diff-table.split').count()) > 0);
  expect('threads survive the split', (await page.locator('.thread-row').count()) === 2);

  // markdown is escaped
  await page.click('#global');
  await page.locator('.form-row-inline textarea').fill('**bold** and <b>xss?</b>');
  await page.locator('.form-row-inline [data-ok]').click();
  await page.waitForTimeout(500);
  expect('markdown escaped', (await page.locator('#globaux .comment-body').innerHTML()) === '<p><strong>bold</strong> and &lt;b&gt;xss?&lt;/b&gt;</p>');

  await page.click('#terminer');
  await page.waitForTimeout(1500);
  expect('review sent', (await page.locator('#state-enreg').innerText()).includes('review sent'));
  expect('TODO.md written', fs.existsSync(path.join(out, 'TODO.md')));
  expect('done sentinel written', fs.existsSync(path.join(out, 'done')));
  expect('server.json removed on clean shutdown', !fs.existsSync(path.join(out, 'server.json')));
  expect('no JS error', errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  console.log(failures.length ? `page: ${failures.length} failure(s)` : 'page: OK');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
