// NestLog browser tests. Run with: node tests/test.js
// A phone-sized browser drives the real index.html against a fake Sheet script, so nothing leaves this machine.
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RECEIPT = fs.readFileSync(path.join(__dirname, 'fixtures', 'receipt.png'));
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
const PIN = '246810';
const BASE = 'http://localhost:8791/index.html';
const CATS = ['Groceries', 'Dining Out', 'Household', 'Utilities', 'Phone and Internet', 'Subscriptions', 'Other'];
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = ymd(new Date());

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/json' };
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' });
  fs.createReadStream(f).pipe(res);
});

function newSheet() {
  return { rows: [], income: [], jobs: [], budgets: [], bills: [], notes: [], old: false, calls: [] };
}
function sheetHandler(sheet) {
  return async route => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*' } });
    const b = JSON.parse(req.postData() || '{}');
    sheet.calls.push(b.action);
    const ok = o => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, ...o }) });
    const bad = m => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: false, error: m }) });
    if (b.pin !== PIN) return bad('Wrong PIN');
    const NEW = ['saveBudget', 'removeBudget', 'saveBill', 'removeBill', 'addNote', 'removeNote'];
    if (sheet.old && NEW.includes(b.action)) return bad('Unknown action');
    switch (b.action) {
      case 'list': return ok({
        rows: sheet.rows, income: sheet.income, jobs: sheet.jobs,
        ...(sheet.old ? {} : { budgets: sheet.budgets, bills: sheet.bills, notes: sheet.notes }),
        meta: { people: ['John', 'Sue'], accounts: [], categories: CATS, multiplier: 2, sheetUrl: 'https://example.com/sheet' }
      });
      case 'add': b.receipt.lines.forEach(l => sheet.rows.push({ id: b.receipt.id, date: b.receipt.date, merchant: b.receipt.merchant, category: l.category, note: b.receipt.note || '', amount: l.cents / 100, paidBy: b.receipt.paidBy, account: b.receipt.account || '', ratio: null })); return ok({});
      case 'remove': sheet.rows = sheet.rows.filter(r => r.id !== b.id); return ok({});
      case 'saveBudget': { const i = sheet.budgets.findIndex(x => x.category === b.category); const o = { category: b.category, limit: b.cents / 100 }; if (i >= 0) sheet.budgets[i] = o; else sheet.budgets.push(o); return ok({}); }
      case 'removeBudget': sheet.budgets = sheet.budgets.filter(x => x.category !== b.category); return ok({});
      case 'saveBill': { const x = b.bill, o = { id: x.id, name: x.name, amount: x.cents / 100, category: x.category, freq: x.freq, nextDue: x.nextDue, day: x.day, active: x.active }; const i = sheet.bills.findIndex(y => y.id === x.id); if (i >= 0) sheet.bills[i] = o; else sheet.bills.push(o); return ok({}); }
      case 'removeBill': sheet.bills = sheet.bills.filter(x => x.id !== b.id); return ok({});
      case 'addNote': if (!sheet.notes.some(n => n.id === b.note.id)) sheet.notes.push({ ...b.note }); return ok({});
      case 'removeNote': sheet.notes = sheet.notes.filter(n => n.id !== b.id); return ok({});
      case 'scan': return ok({ receipt: { merchant: 'Test Mart', date: today, total: 12.5, tax: 0, items: [
        { description: 'Milk', amount: 4.5, category: 'Groceries', section: '', taxed: null },
        { description: 'Bread', amount: 8, category: 'Groceries', section: '', taxed: null }] } });
      default: return bad('Unknown action');
    }
  };
}

let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, x); } };
const errors = [];

async function mk(browser, { sheet, connected = false, who = 'John', reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion });
  if (sheet) await ctx.route('https://script.google.com/**', sheetHandler(sheet));
  await ctx.addInitScript(([conn, url, pin, who]) => {
    if (sessionStorage.getItem('seeded')) return; // only the first load of a test, so reloads keep real state
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('ledger.prefs', JSON.stringify({ paidBy: who, account: '', lockMin: 30 }));
    if (conn) localStorage.setItem('ledger.cfg', JSON.stringify({ url, pin }));
  }, [connected, URL_, PIN, who]);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE);
  await page.waitForSelector('#view *');
  await page.waitForTimeout(1300); // the opening splash is gone by now
  return { ctx, page };
}
const hash = page => page.evaluate(() => location.hash);
const go = async (page, h) => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForTimeout(150); };
const text = (page, sel = '#view') => page.textContent(sel);
const pill = page => page.textContent('.pill');
const photoFile = { name: 'receipt.png', mimeType: 'image/png', buffer: RECEIPT };
async function addExpense(page, amt, merchant, cat) {
  await go(page, '#/expenses/add');
  await page.fill('#f-total', amt); await page.dispatchEvent('#f-total', 'change');
  await page.fill('#f-merchant', merchant);
  await page.selectOption('#f-cat', cat);
  await page.click('form[data-form="add"] button.btn.pri');
  await page.waitForTimeout(250);
}
async function connectUI(page) {
  await go(page, '#/settings');
  await page.fill('#c-url', URL_); await page.fill('#c-pin', PIN);
  await page.click('form[data-form="connect"] button');
  await page.waitForFunction(() => /Synced|Waiting/.test(document.querySelector('.pill').textContent), null, { timeout: 8000 });
}
const synced = page => page.waitForFunction(() => /^\s*Synced/.test(document.querySelector('.pill').textContent), null, { timeout: 8000 });

(async () => {
  await new Promise(r => server.listen(8791, r));
  const browser = await chromium.launch();

  // ---------- 1. Camera with no Sheet connected ----------
  {
    const { ctx, page } = await mk(browser);
    check('Starts not connected', /Not connected/.test(await pill(page)));
    await page.click('[data-act="scan"]'); // the camera button must not refuse
    check('Camera button does not block when not connected', !/Connect your Sheet in Settings to scan/.test(await text(page, '#toast')));
    await page.setInputFiles('#cam', photoFile);
    await page.waitForFunction(() => location.hash === '#/expenses/add', null, { timeout: 5000 });
    check('Photo opens the Add expense form', (await hash(page)) === '#/expenses/add');
    check('Form shows the kept photo', await page.isVisible('img.thumb[alt="Your receipt photo"]') && /kept on this phone/.test(await text(page)));
    check('Toast explains the photo is kept', /kept on this phone/.test(await text(page, '#toast')));
    check('Photo is recorded as waiting', JSON.parse(await page.evaluate(() => localStorage.getItem('ledger.photos'))).length === 1);
    await page.click('[data-act="readPhoto"]');
    check('Read photo explains it needs a connection', /Connect your Sheet/.test(await text(page, '#toast')));

    await page.fill('#f-total', '23.45'); await page.dispatchEvent('#f-total', 'change');
    await page.fill('#f-merchant', 'Corner Store');
    await page.selectOption('#f-cat', 'Groceries');
    await page.click('form[data-form="add"] button.btn.pri');
    await page.waitForSelector('.rc-main');
    check('Expense saved on the phone with no Sheet', /Corner Store/.test(await text(page)) && /Waiting|Not connected/.test(await pill(page)));
    check('Waiting photo list is empty after saving', JSON.parse(await page.evaluate(() => localStorage.getItem('ledger.photos'))).length === 0);
    await page.click('.rc-main');
    check('Saved entry offers its receipt photo', await page.isVisible('[data-act="viewPic"]'));
    await page.click('[data-act="viewPic"]');
    await page.waitForSelector('#modal:not([hidden]) img');
    check('Receipt photo opens full size', await page.isVisible('#modal img'));
    await page.click('#modal [data-m="0"]');
    check('Photo closes', !(await page.isVisible('#modal')));

    // Abandon a photo, then come back to it from Home.
    await go(page, '#/home');
    await page.setInputFiles('#cam', photoFile);
    await page.waitForFunction(() => location.hash === '#/expenses/add');
    await go(page, '#/home');
    check('Home lists the photo that was not filled in', /receipt photos? (is|are) kept on this phone/.test(await text(page)) && await page.isVisible('[data-act="phOpen"]'));
    await page.waitForFunction(() => { const i = document.querySelector('img[data-ph]'); return i && i.src.startsWith('data:'); }, null, { timeout: 4000 });
    check('Home shows the photo thumbnail', true);
    await page.click('[data-act="phOpen"]');
    await page.waitForFunction(() => location.hash === '#/expenses/add');
    check('Opening it brings the photo back to the form', await page.isVisible('img.thumb[alt="Your receipt photo"]'));
    await go(page, '#/home');
    await page.click('[data-act="phDel"]');
    await page.click('#modal [data-m="1"]');
    await page.waitForTimeout(200);
    check('Discarding removes the photo from Home', !/receipt photos? (is|are) kept on this phone/.test(await text(page)), (await text(page)).slice(0, 300) + ' photos=' + (await page.evaluate(() => localStorage.getItem('ledger.photos'))));

    // Photo then paste text, with no Sheet.
    await page.setInputFiles('#cam', photoFile);
    await page.waitForFunction(() => location.hash === '#/expenses/add');
    await page.click('[data-act="pasteWithPhoto"]');
    await page.waitForFunction(() => location.hash === '#/expenses/paste');
    check('Paste screen keeps the photo in view', await page.isVisible('img.thumb'));
    await page.fill('#p-t', 'CORNER CAFE\nLatte 4.50\nMuffin 3.25\nTOTAL 7.75');
    await page.click('[data-act="readText"]');
    await page.waitForSelector('form[data-form="scan"]');
    check('Text from the photo is read on the phone', /Latte/.test(await text(page)) && /Matches the receipt total/.test(await text(page)), (await text(page)).slice(0, 700));
    await page.click('form[data-form="scan"] button.btn.pri');
    await page.waitForFunction(() => location.hash === '#/expenses');
    await page.click('.rc-main >> text=Corner Cafe');
    check('Saved from paste, the entry keeps the photo', await page.isVisible('[data-act="viewPic"]'));
    check('No leftover waiting photos', JSON.parse(await page.evaluate(() => localStorage.getItem('ledger.photos'))).length === 0);
    await ctx.close();
  }

  // ---------- 2. Camera with a Sheet ----------
  {
    const sheet = newSheet();
    const { ctx, page } = await mk(browser, { sheet, connected: true });
    await synced(page);
    await page.setInputFiles('#cam', photoFile);
    await page.waitForFunction(() => /Test Mart/.test(document.querySelector('#view').innerHTML) || location.hash === '#/expenses/scan', null, { timeout: 8000 });
    await page.waitForSelector('form[data-form="scan"]', { timeout: 8000 });
    check('Connected camera still reads the receipt', /Milk/.test(await text(page)));
    await page.click('form[data-form="scan"] button.btn.pri');
    await page.waitForFunction(() => location.hash === '#/expenses');
    await synced(page);
    check('Scanned receipt reached the Sheet', sheet.rows.some(r => r.merchant === 'Test Mart'));
    await page.click('.rc-main');
    check('Scanned receipt keeps its photo too', await page.isVisible('[data-act="viewPic"]'));

    // Connected but the signal drops: the photo is kept, nothing is lost.
    await ctx.setOffline(true);
    await go(page, '#/home');
    await page.setInputFiles('#cam', photoFile);
    await page.waitForFunction(() => location.hash === '#/expenses/add');
    check('Connected but offline keeps the photo', await page.isVisible('img.thumb[alt="Your receipt photo"]') && /No connection/.test(await text(page, '#toast')));
    await ctx.setOffline(false);
    await page.click('[data-act="readPhoto"]');
    await page.waitForSelector('form[data-form="scan"]', { timeout: 8000 });
    check('Back online, Read photo reads the kept photo', /Milk/.test(await text(page)));
    await page.click('form[data-form="scan"] button.btn.pri');
    await page.waitForFunction(() => location.hash === '#/expenses');
    check('No waiting photos left after reading', JSON.parse(await page.evaluate(() => localStorage.getItem('ledger.photos'))).length === 0);
    await ctx.close();
  }

  // ---------- 3. Budgets ----------
  {
    const sheet = newSheet();
    const { ctx, page } = await mk(browser);
    await go(page, '#/expenses/budgets');
    check('Budgets starts with an empty state', /No budgets yet/.test(await text(page)));
    await page.click('#bar [data-go="/expenses/budget"]');
    await page.selectOption('#b-cat', 'Groceries');
    await page.fill('#b-amt', '100'); await page.dispatchEvent('#b-amt', 'change');
    await page.click('form[data-form="budget"] button.btn.pri');
    await page.waitForFunction(() => location.hash === '#/expenses/budgets');
    check('Budget saved and listed', /Groceries/.test(await text(page)) && /\$100\.00/.test(await text(page)));
    await addExpense(page, '85', 'Costco', 'Groceries');
    await go(page, '#/expenses/budgets');
    check('Bar warns at 85 percent', await page.isVisible('.bud .bar.warn') && /\$15\.00 left/.test(await text(page)));
    await go(page, '#/home');
    check('Home flags the budget that is close', /Budgets/.test(await text(page)) && /Groceries/.test(await text(page)));
    await addExpense(page, '30', 'Loblaws', 'Groceries');
    await go(page, '#/expenses/budgets');
    check('Bar turns red when over', await page.isVisible('.bud .bar.bad') && /Over by \$15\.00/.test(await text(page)));
    await page.click('.bud');
    await page.waitForSelector('#b-hint');
    check('Editing shows the 3 month average hint', await page.isVisible('#b-hint'));
    await page.click('[data-act="budDel"]');
    await page.waitForFunction(() => location.hash === '#/expenses/budgets');
    check('Removing a budget empties the list', /No budgets yet/.test(await text(page)));
    await page.click('#toast [data-act="toastAct"]');
    await page.waitForTimeout(200);
    check('Undo brings the budget back', /\$100\.00/.test(await text(page)));
    await ctx.close();
    const s2 = sheet; // a second, connected phone against a fresh fake Sheet
    // Sync check on a connected phone
    const { ctx: c2, page: p2 } = await mk(browser, { sheet: s2, connected: true });
    await synced(p2);
    await go(p2, '#/expenses/budget');
    await p2.selectOption('#b-cat', 'Utilities'); await p2.fill('#b-amt', '150'); await p2.dispatchEvent('#b-amt', 'change');
    await p2.click('form[data-form="budget"] button.btn.pri');
    await synced(p2);
    check('Budget reaches the Sheet', s2.budgets.some(b => b.category === 'Utilities' && b.limit === 150));
    await p2.reload(); await p2.waitForTimeout(1300); await synced(p2);
    await go(p2, '#/expenses/budgets');
    check('Budget comes back from the Sheet', /Utilities/.test(await text(p2)));
    await c2.close();
  }

  // ---------- 4. Bills ----------
  {
    const { page: pg, ctx } = await mk(browser);
    const nd = await pg.evaluate(() => [
      window.__ledger.nextDueAfter('2026-01-31', 'Monthly', 31), window.__ledger.nextDueAfter('2026-02-28', 'Monthly', 31),
      window.__ledger.nextDueAfter('2024-02-29', 'Yearly', 29), window.__ledger.nextDueAfter('2026-12-28', 'Weekly', 0),
      window.__ledger.nextDueAfter('2026-12-20', 'Every 2 weeks', 0), window.__ledger.nextDueAfter('2026-12-15', 'Monthly', 15)]);
    check('Due dates move forward correctly', JSON.stringify(nd) === JSON.stringify(['2026-02-28', '2026-03-31', '2025-02-28', '2027-01-04', '2027-01-03', '2027-01-15']), JSON.stringify(nd));
    await go(pg, '#/expenses/bills');
    check('Bills starts with an empty state', /No bills yet/.test(await text(pg)));
    await pg.click('#bar [data-go="/expenses/bill"]');
    await pg.fill('#bl-name', 'phone plan');
    await pg.fill('#bl-amt', '50'); await pg.dispatchEvent('#bl-amt', 'change');
    await pg.selectOption('#bl-cat', 'Phone and Internet');
    await pg.click('form[data-form="bill"] button.btn.pri');
    await pg.waitForFunction(() => location.hash === '#/expenses/bills');
    check('Bill saved, name capitalised, monthly total shown', /Phone plan/.test(await text(pg)) && /\$50\.00/.test(await text(pg)) && /Due today/.test(await text(pg)));
    await go(pg, '#/home');
    check('Home shows the bill that is due', /Bills due soon/.test(await text(pg)) && await pg.isVisible('[data-act="billPay"]'));
    await pg.click('[data-act="billPay"]');
    await pg.waitForTimeout(250);
    check('Mark paid says when it is next due', /Next due/.test(await text(pg, '#toast')));
    check('Home no longer lists the paid bill', !(await pg.isVisible('[data-act="billPay"]')));
    await go(pg, '#/expenses');
    check('Paying logged the expense', /Phone plan/.test(await text(pg)));
    await go(pg, '#/expenses/bills');
    const nextShown = await text(pg);
    check('Bill moved to next month', !/Due today/.test(nextShown) && /Monthly/.test(nextShown));
    await go(pg, '#/home');
    await go(pg, '#/expenses/bills');
    await pg.click('[data-act="billPay"]');
    await pg.waitForTimeout(200);
    await pg.click('#toast [data-act="toastAct"]');
    await pg.waitForTimeout(250);
    check('Undo restores the due date', /Due /.test(await text(pg)));
    await go(pg, '#/expenses');
    const n = await pg.$$eval('.rc-name', els => els.filter(e => /Phone plan/.test(e.textContent)).length);
    check('Undo removes the second payment', n === 1, String(n));
    // Edit and delete
    await go(pg, '#/expenses/bills');
    await pg.click('[data-act="billEdit"]');
    check('Edit opens the filled form', (await pg.inputValue('#bl-name')) === 'Phone plan');
    await pg.click('[data-act="billDel"]');
    await pg.waitForFunction(() => location.hash === '#/expenses/bills');
    check('Deleting the bill empties the list', /No bills yet/.test(await text(pg)));
    await ctx.close();
  }

  // ---------- 5. Notes and the activity feed ----------
  {
    const sheet = newSheet();
    sheet.rows.push({ id: 'r_seed00000000000001', date: today, merchant: 'Costco', category: 'Groceries', note: '', amount: 142.3, paidBy: 'Sue', account: '', ratio: null });
    sheet.notes.push({ id: 'n_seed00000000000001', entryId: 'r_seed00000000000001', author: 'Sue', text: 'Is this the one-off?', ts: Date.now() - 60000 });
    const { ctx, page } = await mk(browser, { sheet, connected: true, who: 'John' });
    await synced(page);
    const feed = await text(page);
    check('Feed shows Sue paid at Costco', /Sue · Costco/.test(feed) && /\$142\.30/.test(feed));
    check('Feed shows Sue\'s note', /Sue · Is this the one-off\?/.test(feed) && /Note on Costco/.test(feed));
    await page.click('.act >> text=Is this the one-off');
    await page.waitForFunction(() => location.hash === '#/expenses');
    await page.waitForSelector('.thread');
    check('Tapping a note opens the entry with its notes', await page.isVisible('.thread') && /Is this the one-off\?/.test(await text(page)));
    check('Entry row says it has a note', /1 note/.test(await text(page)));
    await page.fill('.thread input[name="text"]', 'Yes, one-off for the party');
    await page.click('.thread button.btn.pri');
    await page.waitForTimeout(150);
    check('Reply shows straight away', /Yes, one-off for the party/.test(await text(page)));
    await synced(page);
    check('Reply reaches the Sheet under John\'s name', sheet.notes.some(n => n.text === 'Yes, one-off for the party' && n.author === 'John'));
    // Sue adds another from her phone; a sync shows it.
    sheet.notes.push({ id: 'n_seed00000000000002', entryId: 'r_seed00000000000001', author: 'Sue', text: 'Thanks, noted', ts: Date.now() });
    await page.click('.pill');
    await page.waitForFunction(() => /Thanks, noted/.test(document.querySelector('#view').textContent), null, { timeout: 5000 });
    check('Sue\'s new note appears after a sync', true);
    // Undo a note
    await page.fill('.thread input[name="text"]', 'Oops wrong entry');
    await page.click('.thread button.btn.pri');
    await page.waitForTimeout(150);
    await page.click('#toast [data-act="toastAct"]');
    await page.waitForTimeout(300);
    await synced(page);
    check('Undo takes the note back out', !/Oops wrong entry/.test(await text(page)) && !sheet.notes.some(n => n.text === 'Oops wrong entry'));
    await go(page, '#/home');
    await page.click('.act >> text=Costco');
    await page.waitForSelector('.thread');
    check('Tapping an expense opens it', (await hash(page)) === '#/expenses' && await page.isVisible('.thread'));
    await ctx.close();
  }

  // ---------- 6. Older Sheet script ----------
  {
    const sheet = newSheet(); sheet.old = true;
    const { ctx, page } = await mk(browser, { sheet, connected: true });
    await synced(page);
    await go(page, '#/expenses/budget');
    await page.selectOption('#b-cat', 'Groceries'); await page.fill('#b-amt', '90'); await page.dispatchEvent('#b-amt', 'change');
    await page.click('form[data-form="budget"] button.btn.pri');
    await page.waitForFunction(() => /Could not save/.test(document.querySelector('#view').textContent) || location.hash !== '#/expenses/budgets', null, { timeout: 8000 }).catch(() => {});
    await go(page, '#/home');
    await page.waitForFunction(() => /newest version/.test(document.querySelector('#view').textContent), null, { timeout: 8000 });
    check('Old script gets a clear "redeploy" message, not a crash', true);
    check('The failed change can be tried again', await page.isVisible('[data-act="retry"]'));
    await ctx.close();
  }

  // ---------- 7. Look and feel checks ----------
  {
    const sheet = newSheet();
    const { ctx, page } = await mk(browser, { sheet, connected: true });
    await synced(page);
    await addExpense(page, '10', 'Test', 'Groceries');
    const routes = ['#/home', '#/expenses', '#/expenses/budgets', '#/expenses/budget', '#/expenses/bills', '#/expenses/bill', '#/expenses/add', '#/expenses/paste'];
    let lower = [], wide = [];
    for (const r of routes) {
      await go(page, r);
      const bad = await page.$$eval('#view button, #view label, #view h1, #view h2, #view h3, #bar h1, .tab, #view .tag', els => els.map(e => e.textContent.trim()).filter(t => /^[a-z]/.test(t)));
      if (bad.length) lower.push(r + ': ' + bad.join(' | '));
      if (await page.evaluate(() => document.querySelector('#view').scrollWidth > document.querySelector('#view').clientWidth + 1)) wide.push(r);
    }
    check('Every label and button starts with a capital letter', lower.length === 0, lower.join(' ;; '));
    check('Nothing scrolls sideways on a phone', wide.length === 0, wide.join(', '));
    await ctx.close();
    const { ctx: c2, page: p2 } = await mk(browser, { reducedMotion: 'reduce' });
    await go(p2, '#/expenses/budget'); await p2.selectOption('#b-cat', 'Groceries'); await p2.fill('#b-amt', '50'); await p2.dispatchEvent('#b-amt', 'change');
    await p2.click('form[data-form="budget"] button.btn.pri');
    await p2.waitForSelector('.bud .bar > b', { state: 'attached' });
    check('Budget bar animation stops with reduce motion', (await p2.$eval('.bud .bar > b', el => getComputedStyle(el).animationName)) === 'none');
    await c2.close();
    const { ctx: c3, page: p3 } = await mk(browser);
    await go(p3, '#/expenses/budget'); await p3.selectOption('#b-cat', 'Groceries'); await p3.fill('#b-amt', '50'); await p3.dispatchEvent('#b-amt', 'change');
    await p3.click('form[data-form="budget"] button.btn.pri');
    await p3.waitForSelector('.bud .bar > b', { state: 'attached' });
    check('Budget bar fills with an animation normally', (await p3.$eval('.bud .bar > b', el => getComputedStyle(el).animationName)) === 'fill');
    await c3.close();
  }

  check('No page errors in any test', errors.length === 0, errors.join(' | '));
  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
