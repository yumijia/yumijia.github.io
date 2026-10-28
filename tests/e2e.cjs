// End-to-end check of index.html (customer) + staff.html against the local emulators.
// Needs: ./start-emulators.sh, node seed-staff.mjs, then `node e2e.cjs`.
// Pages are served from ../ on a local port; the Firebase SDK is served from node_modules
// and the QR library is stubbed, so no outside network is needed.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const FB = path.join(__dirname, 'node_modules', 'firebase');
const PASSWORD = 'test-only-123456';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-yumijia/databases/(default)/documents/shops/yumijia';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

function serve() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

async function wipe() {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-yumijia/databases/(default)/documents', { method: 'DELETE' });
}
// Patch the day field as an admin, to simulate the next night.
async function setDay(day) {
  const r = await fetch(FS + '?updateMask.fieldPaths=day', {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { day: { stringValue: day } } })
  });
  assert.ok(r.ok, 'admin patch failed');
}

async function newPage(browser, errors, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  await ctx.route(/www\.gstatic\.com\/firebasejs\/12\.19\.0\/(firebase-[a-z]+\.js)$/, r => {
    const name = r.request().url().split('/').pop();
    r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(FB, name)) });
  });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: 'window.QRCode=function(el,o){var c=document.createElement("canvas");c.width=o.width;c.height=o.height;c.dataset.text=o.text;el.appendChild(c)};QRCode.CorrectLevel={M:0};' }));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|Could not reach Cloud Firestore|WebChannelConnection|net::ERR|status of 400/.test(m.text())) errors.push(m.text()); });
  return { ctx, page };
}

const text = page => page.locator('main').innerText();
async function noHScroll(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0, label + ': horizontal scroll of ' + over + 'px');
}
async function noBannedWords(page, label) {
  const t = await page.evaluate(() => document.documentElement.outerHTML + document.title);
  assert.ok(!/claude/i.test(t), label + ' mentions Claude');
  assert.ok(!/示範/.test(t), label + ' mentions 示範');
}

(async () => {
  await wipe();
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const errors = [];
  const step = s => console.log('ok -', s);
  try {
    // Customer arrives before the stall has ever signed in.
    const cust = await newPage(browser, errors);
    await cust.page.goto(base + '/index.html?emu#n3');
    await cust.page.getByText('今天還沒開始發號').waitFor({ timeout: 15000 });
    assert.ok(!(await cust.page.locator('#issue, #toReady').count()), 'customer page has staff buttons');
    step('customer page loads, shows not-started, no staff buttons');

    // Staff sign-in.
    const staff = await newPage(browser, errors);
    await staff.page.goto(base + '/staff.html?emu');
    await staff.page.locator('#pw').fill('wrong-password');
    await staff.page.locator('#loginF button').click();
    await staff.page.getByText('密碼不對').waitFor({ timeout: 10000 });
    await staff.page.locator('#pw').fill(PASSWORD);
    await staff.page.locator('#loginF button').click();
    await staff.page.locator('#issue').waitFor({ timeout: 15000 });
    step('wrong password rejected, right password signs in');
    await staff.page.reload();
    await staff.page.locator('#issue').waitFor({ timeout: 15000 });
    step('stays signed in after reload');

    // Issue three numbers; the ticket QR points at the customer page.
    for (let i = 1; i <= 3; i++) {
      await staff.page.locator('#issue:not([disabled])').click();
      await staff.page.locator('.modal').waitFor();
      const qr = await staff.page.locator('#qrT canvas').getAttribute('data-text');
      assert.strictEqual(qr, base + '/#n' + i);
      await staff.page.locator('#closeT').click();
    }
    const t0 = Date.now();
    await cust.page.getByText('前面還有').waitFor({ timeout: 2000 });
    const ahead = await cust.page.locator('.kv b').first().innerText();
    assert.match(ahead, /^2/);
    step('3 numbers issued, customer #3 sees 2 ahead within ' + (Date.now() - t0) + 'ms of last issue');

    // 1 and 2 grilled.
    await staff.page.locator('button.chip[data-n="1"]').click();
    await staff.page.locator('button.chip[data-n="2"]').click();
    await staff.page.locator('#toReady:not([disabled])').click();
    await cust.page.waitForFunction(() => document.querySelector('.kv b') && document.querySelector('.kv b').innerText.startsWith('0'), null, { timeout: 2000 });
    assert.deepStrictEqual(await cust.page.locator('.chips .chip.ready').allInnerTexts(), ['1', '2']);
    step('marking 1,2 ready updates customer (0 ahead, ready chips 1 2)');

    await staff.page.locator('button.chip[data-n="3"]').click();
    await staff.page.locator('#toReady:not([disabled])').click();
    await cust.page.getByText('可以取餐了').waitFor({ timeout: 2000 });
    step('#3 ready shows 可以取餐了 on customer');

    await staff.page.locator('#undo:not([disabled])').click();
    await cust.page.getByText('炭火烤製中').waitFor({ timeout: 2000 });
    step('undo puts #3 back to grilling');

    await staff.page.locator('button.chip.ready[data-n="1"]').click();
    await staff.page.locator('#toDone:not([disabled])').click();
    await staff.page.waitForFunction(() => !document.querySelector('button.chip[data-n="1"]'));
    step('#1 marked picked up');

    // Customer reload without hash remembers the number.
    await cust.page.goto(base + '/index.html?emu');
    await cust.page.locator('.t-num').waitFor({ timeout: 10000 });
    assert.match(await cust.page.locator('.t-num').innerText(), /^3/);
    step('customer remembers number after reload');

    // Two phones issuing at the same instant must not get the same number.
    const staff2 = await newPage(browser, errors);
    await staff2.page.goto(base + '/staff.html?emu');
    await staff2.page.locator('#pw').fill(PASSWORD);
    await staff2.page.locator('#loginF button').click();
    await staff2.page.locator('#issue').waitFor({ timeout: 15000 });
    await Promise.all([staff.page.locator('#issue').click(), staff2.page.locator('#issue').click()]);
    await staff.page.locator('.modal').waitFor(); await staff2.page.locator('.modal').waitFor();
    const a = await staff.page.locator('.modal .t-num').innerText(), b = await staff2.page.locator('.modal .t-num').innerText();
    assert.notStrictEqual(a, b);
    assert.deepStrictEqual([a, b].map(Number).sort(), [4, 5]);
    await staff.page.locator('#closeT').click(); await staff2.page.locator('#closeT').click();
    step('two phones pressing at once get ' + a + ' and ' + b);

    // Settings: LINE link appears on the customer page.
    assert.strictEqual(await cust.page.locator('a.l-line').count(), 0);
    await staff.page.locator('#openSet').click();
    await staff.page.locator('#sLine').fill('https://lin.ee/example');
    await staff.page.locator('#sBase').fill('10');
    await staff.page.locator('#setF button[type=submit]').click();
    await cust.page.locator('a.l-line[href="https://lin.ee/example"]').waitFor({ timeout: 2000 });
    step('settings save; LINE button appears for customers');

    // Typing in settings survives another phone changing the queue.
    await staff.page.locator('#sShop').fill('玉米家測試中');
    await staff2.page.locator('#issue').click();
    await staff2.page.locator('.modal').waitFor(); await staff2.page.locator('#closeT').click();
    await staff.page.getByText('發下一號 7').waitFor({ timeout: 3000 });
    assert.strictEqual(await staff.page.locator('#sShop').inputValue(), '玉米家測試中');
    await staff.page.locator('#sShop').fill('玉米家');
    step('settings input keeps typed text while the queue changes');

    // A number remembered from an earlier night is forgotten.
    const old = await newPage(browser, errors);
    await old.page.goto(base + '/index.html?emu');
    await old.page.evaluate(() => localStorage.setItem('yumijiaNum', '3|2000-01-01'));
    await old.page.reload();
    await old.page.locator('#numIn').waitFor({ timeout: 10000 });
    await old.ctx.close();
    step('number saved on an earlier day is not reused');

    // Reset needs two taps and can be undone.
    await staff.page.locator('#reset').click();
    await staff.page.getByText('再按一次確認歸零').waitFor();
    await staff.page.locator('#reset').click();
    await cust.page.getByText('今天還沒開始發號').waitFor({ timeout: 2000 });
    await staff.page.locator('#undo:not([disabled])').click();
    await cust.page.getByText('炭火烤製中').waitFor({ timeout: 2000 });
    step('reset needs two taps, undo restores');

    // Next night: yesterday's numbers must not show as today's.
    await setDay('2000-01-01');
    await staff.page.locator('#newDay').waitFor({ timeout: 3000 });
    await cust.page.getByText('今天還沒開始發號').waitFor({ timeout: 3000 });
    await staff.page.locator('#newDay').click();
    await staff.page.getByText('發下一號 1').waitFor({ timeout: 3000 });
    step('old day: staff offered a fresh start, customer sees not-started');

    // Offline customer gets a warning instead of silently stale numbers.
    await cust.ctx.setOffline(true);
    await cust.page.locator('.conn').waitFor({ timeout: 15000 });
    await cust.ctx.setOffline(false);
    await cust.page.locator('.conn').waitFor({ state: 'detached', timeout: 20000 });
    step('offline banner shows and clears');

    // Rules: a signed-out browser cannot write even with the SDK.
    await staff2.page.locator('#openSet').click();
    await staff2.page.locator('#logout').click();
    await staff2.page.locator('#pw').waitFor();
    const denied = await staff2.page.evaluate(async () => {
      const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
      const { db } = await import('./common.js');
      try { await setDoc(doc(db, 'shops', 'yumijia'), { issued: 999 }); return 'written'; } catch (e) { return e.code; }
    });
    assert.strictEqual(denied, 'permission-denied');
    step('signed-out write is rejected by the rules');

    for (const [p, label] of [[cust.page, 'customer'], [staff.page, 'staff']]) {
      await noBannedWords(p, label);
      await noHScroll(p, label + ' 375px');
      await p.setViewportSize({ width: 1280, height: 800 });
      await noHScroll(p, label + ' 1280px');
      await p.setViewportSize({ width: 320, height: 640 });
      await noHScroll(p, label + ' 320px');
    }
    step('no Claude/示範 text; no horizontal scroll at 320/375/1280');

    await cust.page.setViewportSize({ width: 390, height: 844 });
    await staff.page.setViewportSize({ width: 390, height: 844 });
    await cust.page.screenshot({ path: path.join(__dirname, 'shot-customer.png'), fullPage: true });
    await staff.page.screenshot({ path: path.join(__dirname, 'shot-staff.png'), fullPage: true });

    assert.deepStrictEqual(errors, [], 'page errors:\n' + errors.join('\n'));
    step('no page errors');
    console.log('\nALL PASSED');
  } finally {
    await browser.close();
    srv.close();
  }
})().catch(e => { console.error('FAIL:', e.message || e); process.exit(1); });
