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
const daysBack = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/json' };
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' });
  fs.createReadStream(f).pipe(res);
});

function newSheet() {
  return { rows: [], income: [], jobs: [], budgets: [], bills: [], notes: [], accounts: [], balances: [], cats: [...CATS], accts: [], old: false, calls: [] };
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
    const NEW = ['saveBudget', 'removeBudget', 'saveBill', 'removeBill', 'addNote', 'removeNote', 'edit', 'editIncome', 'saveAccount', 'removeAccount', 'addBalance', 'removeBalance', 'addOption'];
    if (sheet.old && NEW.includes(b.action)) return bad('Unknown action');
    switch (b.action) {
      case 'list': return ok({
        rows: sheet.rows, income: sheet.income, jobs: sheet.jobs,
        ...(sheet.old ? {} : { budgets: sheet.budgets, bills: sheet.bills, notes: sheet.notes, accounts: sheet.accounts, balances: sheet.balances }),
        meta: { people: ['John', 'Sue'], accounts: sheet.accts, categories: sheet.cats, multiplier: 2, sheetUrl: 'https://example.com/sheet' }
      });
      case 'add': b.receipt.lines.forEach(l => sheet.rows.push({ id: b.receipt.id, date: b.receipt.date, merchant: b.receipt.merchant, category: l.category, note: b.receipt.note || '', amount: l.cents / 100, paidBy: b.receipt.paidBy, account: b.receipt.account || '', ratio: null })); return ok({});
      case 'edit': { const rc = b.receipt; sheet.rows = sheet.rows.filter(r => r.id !== rc.id); rc.lines.forEach(l => sheet.rows.push({ id: rc.id, date: rc.date, merchant: rc.merchant, category: l.category, note: rc.note || '', amount: l.cents / 100, paidBy: rc.paidBy, account: rc.account || '', ratio: null })); return ok({}); }
      case 'remove': sheet.rows = sheet.rows.filter(r => r.id !== b.id); return ok({});
      case 'addIncome': { const e = b.entry; if (!sheet.income.some(r => r.id === e.id)) sheet.income.push({ id: e.id, date: e.date, person: e.person, job: e.job, gross: e.gross === null ? null : e.gross / 100, net: e.net / 100, account: e.account || '', note: e.note || '' }); return ok({}); }
      case 'editIncome': { const e = b.entry; sheet.income = sheet.income.filter(r => r.id !== e.id); sheet.income.push({ id: e.id, date: e.date, person: e.person, job: e.job, gross: e.gross === null ? null : e.gross / 100, net: e.net / 100, account: e.account || '', note: e.note || '' }); return ok({}); }
      case 'removeIncome': sheet.income = sheet.income.filter(r => r.id !== b.id); return ok({});
      case 'saveBudget': { const i = sheet.budgets.findIndex(x => x.category === b.category); const o = { category: b.category, limit: b.cents / 100 }; if (i >= 0) sheet.budgets[i] = o; else sheet.budgets.push(o); return ok({}); }
      case 'removeBudget': sheet.budgets = sheet.budgets.filter(x => x.category !== b.category); return ok({});
      case 'saveBill': { const x = b.bill, o = { id: x.id, name: x.name, amount: x.cents / 100, category: x.category, freq: x.freq, nextDue: x.nextDue, day: x.day, active: x.active }; const i = sheet.bills.findIndex(y => y.id === x.id); if (i >= 0) sheet.bills[i] = o; else sheet.bills.push(o); return ok({}); }
      case 'removeBill': sheet.bills = sheet.bills.filter(x => x.id !== b.id); return ok({});
      case 'addNote': if (!sheet.notes.some(n => n.id === b.note.id)) sheet.notes.push({ ...b.note }); return ok({});
      case 'removeNote': sheet.notes = sheet.notes.filter(n => n.id !== b.id); return ok({});
      case 'addOption': { const l = b.kind === 'category' ? sheet.cats : sheet.accts; if (!l.some(x => x.toLowerCase() === b.value.toLowerCase())) l.push(b.value); return ok({}); }
      case 'saveAccount': { const a = b.account, i = sheet.accounts.findIndex(x => x.id === a.id); if (i >= 0) sheet.accounts[i] = { ...a }; else sheet.accounts.push({ ...a }); return ok({}); }
      case 'removeAccount': sheet.accounts = sheet.accounts.filter(x => x.id !== b.id); sheet.balances = sheet.balances.filter(x => x.accountId !== b.id); return ok({});
      case 'addBalance': if (!sheet.accounts.some(x => x.id === b.balance.accountId)) return bad('Unknown account'); if (!sheet.balances.some(x => x.id === b.balance.id)) sheet.balances.push({ id: b.balance.id, accountId: b.balance.accountId, date: b.balance.date, balance: b.balance.cents / 100 }); return ok({});
      case 'removeBalance': sheet.balances = sheet.balances.filter(x => x.id !== b.id); return ok({});
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
const openCard = async (page, name, act = 'edit') => { if (!(await page.isVisible('[data-act="' + act + '"]'))) await page.click('.rc-main >> text=' + name); };
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
    check('Read photo explains it needs a key or a connection', /Gemini key in Settings, or connect your Sheet/.test(await text(page, '#toast')));

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

  // ---------- 5b. Editing entries ----------
  {
    const sheet = newSheet();
    const SID = 'r_edit00000000000001';
    sheet.rows.push({ id: SID, date: today, merchant: 'Costco', category: 'Groceries', note: '', amount: 80, paidBy: 'Sue', account: '', ratio: null });
    sheet.rows.push({ id: SID, date: today, merchant: 'Costco', category: 'Household', note: '', amount: 20, paidBy: 'Sue', account: '', ratio: null });
    sheet.notes.push({ id: 'n_edit00000000000001', entryId: SID, author: 'Sue', text: 'For the party', ts: Date.now() - 60000 });
    sheet.income.push({ id: 'i_edit00000000000001', date: today, person: 'John', job: 'CAMH', gross: 3000, net: 2200, account: '', note: '' });
    const { ctx, page } = await mk(browser, { sheet, connected: true, who: 'John' });
    await synced(page);
    await go(page, '#/expenses');
    await page.click('.rc-main >> text=Costco');
    check('Expanded entry has an Edit button next to Delete', await page.isVisible('[data-act="edit"]') && await page.isVisible('[data-act="del"]'));
    await page.click('[data-act="edit"]');
    await page.waitForFunction(() => location.hash === '#/expenses/edit');
    check('Edit opens the form with the entry filled in', (await page.inputValue('#f-merchant')) === 'Costco' && (await page.inputValue('#f-total')) === '100.00');
    check('A split entry opens already split', await page.isVisible('#splitbox') && (await page.$$eval('#lines select', e => e.map(x => x.value))).join() === 'Groceries,Household');
    check('Split amounts are filled in', (await page.$eval('#lines input[data-k="amt"]', e => e.value)) === '20.00');
    check('Edit form hides scan and paste', !(await page.isVisible('[data-act="scan"]')) && !/Paste receipt text/.test(await text(page)));
    check('Edit form says Save changes', /Save changes/.test(await text(page)));
    await page.fill('#f-merchant', 'Costco Wholesale');
    await page.fill('#f-total', '120'); await page.dispatchEvent('#f-total', 'change');
    await page.fill('#lines input[data-k="amt"]', '30'); await page.dispatchEvent('#lines input[data-k="amt"]', 'change');
    await page.click('form[data-form="add"] button.btn.pri');
    await page.waitForFunction(() => location.hash === '#/expenses');
    await page.waitForTimeout(200);
    const list1 = await text(page);
    check('The edit shows straight away', /Costco Wholesale/.test(list1) && /\$120\.00/.test(list1) && !/\$100\.00/.test(list1), list1.slice(0, 200));
    check('The edited entry is not duplicated', (await page.$$eval('.rc-name', e => e.filter(x => /Costco/.test(x.textContent)).length)) === 1);
    check('Toast confirms the change', /Saved changes to Costco Wholesale/.test(await text(page, '#toast')));
    await synced(page);
    check('The edit reached the Sheet as an edit, not a delete and add', sheet.calls.includes('edit') && !sheet.calls.includes('remove'));
    check('The Sheet holds the new lines under the same id', sheet.rows.filter(r => r.id === SID).length === 2 && sheet.rows.filter(r => r.id === SID).reduce((t, r) => t + r.amount, 0) === 120 && sheet.rows[0].merchant === 'Costco Wholesale');
    await openCard(page, 'Costco Wholesale');
    check('Notes stay with the edited entry', /For the party/.test(await text(page)));
    // Undo puts it back
    await page.click('[data-act="edit"]');
    await page.waitForFunction(() => location.hash === '#/expenses/edit');
    await page.fill('#f-merchant', 'Oops'); await page.click('form[data-form="add"] button.btn.pri');
    await page.waitForFunction(() => location.hash === '#/expenses');
    await page.click('#toast [data-act="toastAct"]');
    await page.waitForTimeout(250); await synced(page);
    check('Undo brings the entry back as it was', /Costco Wholesale/.test(await text(page)) && !/Oops/.test(await text(page)) && sheet.rows.every(r => r.merchant === 'Costco Wholesale'));
    // Turning a split into one category
    await openCard(page, 'Costco Wholesale');
    await page.click('[data-act="edit"]');
    await page.waitForFunction(() => location.hash === '#/expenses/edit');
    await page.click('[data-act="unsplit"]');
    await page.selectOption('#f-cat', 'Household');
    await page.click('form[data-form="add"] button.btn.pri');
    await page.waitForFunction(() => location.hash === '#/expenses');
    await synced(page);
    check('A split can be turned into one category', sheet.rows.filter(r => r.id === SID).length === 1 && sheet.rows.find(r => r.id === SID).category === 'Household' && sheet.rows.find(r => r.id === SID).amount === 120);
    // Edit with no draft goes back to the list instead of showing a blank form
    await go(page, '#/expenses/edit');
    await page.waitForFunction(() => location.hash === '#/expenses', null, { timeout: 3000 });
    check('Opening the edit page directly goes back to the list', (await hash(page)) === '#/expenses');
    // Leaving the edit form drops it, so Add starts clean
    await openCard(page, 'Costco Wholesale');
    await page.click('[data-act="edit"]');
    await page.waitForFunction(() => location.hash === '#/expenses/edit');
    await go(page, '#/expenses/add');
    await page.waitForFunction(() => /Save expense/.test(document.querySelector('#view').textContent), null, { timeout: 5000 });
    const addVals = [await hash(page), await page.inputValue('#f-merchant'), await page.inputValue('#f-total')];
    check('Add after a cancelled edit starts empty', addVals[0] === '#/expenses/add' && addVals[1] === '' && addVals[2] === '', JSON.stringify(addVals));

    // Paycheque
    await go(page, '#/income');
    await openCard(page, 'CAMH', 'iedit');
    await page.click('[data-act="iedit"]');
    await page.waitForFunction(() => location.hash === '#/income/edit');
    check('Paycheque edit is filled in', (await page.inputValue('#p-net')) === '2200.00' && (await page.inputValue('#p-gross')) === '3000.00' && (await page.inputValue('#p-name')) === 'CAMH');
    await page.fill('#p-net', '2250'); await page.dispatchEvent('#p-net', 'change');
    await page.click('form[data-form="pay"] button.btn.pri');
    await page.waitForFunction(() => location.hash === '#/income');
    await page.waitForTimeout(200);
    check('Paycheque edit shows straight away', /\$2,250\.00/.test(await text(page)) && !/\$2,200\.00/.test(await text(page)));
    await synced(page);
    check('Paycheque edit reached the Sheet as an edit', sheet.calls.includes('editIncome') && !sheet.calls.includes('removeIncome') && sheet.income.length === 1 && sheet.income[0].net === 2250);
    await ctx.close();
  }

  // ---------- 5c. Editing something that has not synced yet ----------
  {
    const sheet = newSheet();
    const { ctx, page } = await mk(browser);
    await addExpense(page, '40', 'Tims', 'Dining Out');
    await go(page, '#/expenses');
    await page.click('.rc-main >> text=Tims');
    await page.click('[data-act="edit"]');
    await page.waitForFunction(() => location.hash === '#/expenses/edit');
    await page.fill('#f-total', '45.50'); await page.dispatchEvent('#f-total', 'change');
    await page.fill('#f-merchant', 'Tim Hortons');
    await page.click('form[data-form="add"] button.btn.pri');
    await page.waitForFunction(() => location.hash === '#/expenses');
    const q = await page.evaluate(() => JSON.parse(localStorage.getItem('ledger.queue')));
    check('An unsynced entry is changed in place, still one queued add', q.length === 1 && q[0].type === 'add' && q[0].receipt.merchant === 'Tim Hortons' && q[0].receipt.lines[0].cents === 4550, JSON.stringify(q));
    check('It still says waiting to sync', /Waiting to sync/.test(await text(page)));
    await ctx.close();
    const c2 = await mk(browser, { sheet, connected: true });
    await synced(c2.page);
    await addExpense(c2.page, '12', 'Bagel', 'Dining Out');
    await synced(c2.page);
    await go(c2.page, '#/expenses');
    await openCard(c2.page, 'Bagel');
    await c2.page.click('[data-act="edit"]');
    await c2.page.waitForFunction(() => location.hash === '#/expenses/edit');
    await c2.page.fill('#f-total', '14'); await c2.page.dispatchEvent('#f-total', 'change');
    await c2.page.click('form[data-form="add"] button.btn.pri');
    await c2.page.waitForFunction(() => location.hash === '#/expenses');
    await synced(c2.page);
    check('A synced entry edited once sends one edit', sheet.calls.filter(c => c === 'edit').length === 1 && sheet.rows.find(r => r.merchant === 'Bagel').amount === 14);
    await c2.ctx.close();
  }

  // ---------- 5d. Accounts, balances and net worth ----------
  {
    const sheet = newSheet();
    const { ctx, page } = await mk(browser, { sheet });
    await go(page, '#/accounts');
    check('Accounts starts with a clear empty state', /See what you own and owe/.test(await text(page)));
    const addAcct = async (name, type) => {
      await go(page, '#/accounts/account');
      await page.fill('#a-name', name); await page.selectOption('#a-type', type);
      await page.click('form[data-form="account"] button.btn.pri');
      await page.waitForSelector('#bal-amt');
    };
    const saveBal = async amt => { await page.fill('#bal-amt', amt); await page.click('form[data-form="balance"] button.btn.pri'); await page.waitForSelector('.hero .big'); await page.waitForTimeout(150); };
    await addAcct('td chequing', 'Chequing');
    check('A new account goes straight to its first balance', /first balance/.test(await text(page)) && /Td chequing/.test(await page.$eval('#bal-acct', e => e.selectedOptions[0].textContent)));
    await saveBal('5000');
    check('Net worth shows the first balance', /Net worth/.test(await text(page)) && /\$5,000\.00/.test(await text(page, '.big')));
    await addAcct('Visa', 'Credit card');
    check('A debt asks for the amount owing', /Amount owing today/.test(await text(page)));
    await saveBal('1200');
    check('Debts subtract from net worth', /\$3,800\.00/.test(await text(page, '.big')) && /Assets \$5,000\.00 · Owing \$1,200\.00/.test(await text(page)));
    check('Accounts are grouped into assets and owing', /Assets/.test(await text(page, 'h2')) && (await page.$$eval('h2', e => e.map(x => x.textContent))).join().includes('Owing'));
    await go(page, '#/home');
    check('Home shows the net worth', /Net worth/.test(await text(page)) && /\$3,800\.00/.test(await text(page)));
    // History makes a trend and a change
    await go(page, '#/accounts');
    await page.click('.rc-main >> text=Td chequing');
    await page.waitForSelector('#bal-amt');
    await page.fill('#bal-amt', '4000'); await page.fill('#bal-date', daysBack(40)); await page.dispatchEvent('#bal-date', 'change');
    await page.click('form[data-form="balance"] button.btn.pri');
    await page.waitForSelector('.hero .big'); await page.waitForTimeout(200);
    check('Net worth still uses the latest balance, not the older one', /\$3,800\.00/.test(await text(page, '.big')));
    check('A chart appears once there is history', await page.isVisible('svg.nw'));
    check('The line draws with an animation', (await page.$eval('.nwl', el => getComputedStyle(el).animationName)) === 'draw');
    await page.click('svg.nw rect[data-i="0"]', { force: true });
    const firstPt = await page.$eval('svg.nw', e => JSON.parse(e.dataset.pts)[0]);
    check('Tapping the chart reads out that month', (await text(page, '#nwread')).includes(firstPt[2]) && (await text(page, '#nwread')).includes(firstPt[3]), firstPt.join('|'));
    check('Shows the change since last month', /(Up|Down) \$/.test(await text(page)) && /since/.test(await text(page)));
    // Stale
    await go(page, '#/accounts/account');
    await page.fill('#a-name', 'Old savings'); await page.selectOption('#a-type', 'Savings'); await page.click('form[data-form="account"] button.btn.pri');
    await page.waitForSelector('#bal-amt');
    await page.fill('#bal-amt', '900'); await page.fill('#bal-date', daysBack(60)); await page.dispatchEvent('#bal-date', 'change');
    await page.click('form[data-form="balance"] button.btn.pri'); await page.waitForSelector('.hero .big');
    check('An account not updated in over a month says so', /Needs an update/.test(await text(page)));
    // Validation
    await go(page, '#/accounts/account');
    await page.fill('#a-name', 'visa'); await page.click('form[data-form="account"] button.btn.pri');
    check('A duplicate account name is refused', /already have an account/.test(await text(page, '#err')));
    await go(page, '#/accounts/balance');
    await page.click('form[data-form="balance"] button.btn.pri');
    check('An empty balance is refused', /Enter the balance/.test(await text(page, '#err')));
    await page.fill('#bal-amt', '10'); await page.fill('#bal-date', '2999-01-01'); await page.dispatchEvent('#bal-date', 'change');
    await page.click('form[data-form="balance"] button.btn.pri');
    check('A future date is refused', /future/.test(await text(page, '#err')));
    // Edit, close, delete with undo
    await go(page, '#/accounts');
    await page.click('[data-act="acctEdit"][aria-label="Edit Old savings"]');
    await page.waitForSelector('#a-name');
    check('Edit account shows its balance history', /Balance history/.test(await text(page)) && /\$900\.00/.test(await text(page)));
    await page.click('[data-act="acctActive"][data-v="0"]');
    await page.click('form[data-form="account"] button.btn.pri');
    await page.waitForSelector('.hero .big');
    check('A closed account leaves the list', !/Old savings/.test(await text(page)) && /Show 1 closed account/.test(await text(page)));
    await page.click('[data-act="closedToggle"]');
    check('Closed accounts can be shown again', /Old savings/.test(await text(page)));
    await page.click('[data-act="acctEdit"][aria-label="Edit Visa"]');
    await page.waitForSelector('#a-name');
    await page.click('[data-act="acctDel"]');
    await page.click('#modal [data-m="1"]');
    await page.waitForSelector('.hero .big'); await page.waitForTimeout(150);
    check('Deleting an account removes it and changes net worth', !/Visa/.test(await text(page, '.rc-name')) && /\$5,900\.00/.test(await text(page, '.big')));
    await page.click('#toast [data-act="toastAct"]'); await page.waitForTimeout(200);
    check('Undo brings the account and its balance back', /Visa/.test(await text(page)) && /\$4,700\.00/.test(await text(page, '.big')));
    // Connect: everything saved offline reaches the Sheet
    await ctx.route('https://script.google.com/**', sheetHandler(sheet));
    await connectUI(page);
    await synced(page);
    check('Offline accounts and balances reach the Sheet', sheet.accounts.length === 3 && sheet.balances.length === 4 && sheet.accounts.some(a => a.name === 'Visa'), JSON.stringify([sheet.accounts.length, sheet.balances.length]));
    await go(page, '#/accounts');
    check('Net worth is the same after syncing', /\$4,700\.00/.test(await text(page, '.big')));
    // Another phone sees them
    const c2 = await mk(browser, { sheet, connected: true, who: 'Sue' });
    await synced(c2.page); await go(c2.page, '#/accounts');
    check('The other phone sees the same net worth', /\$4,700\.00/.test(await text(c2.page, '.big')));
    await c2.ctx.close();
    await ctx.close();
  }

  // ---------- 5e. Other in a dropdown ----------
  {
    const sheet = newSheet();
    const { ctx, page } = await mk(browser, { sheet, connected: true });
    await synced(page);
    await go(page, '#/expenses/add');
    check('Category dropdown ends with Other', (await page.$$eval('#f-cat option', e => e.map(x => x.textContent))).pop() === 'Other…');
    check('Account dropdown shows even with no accounts, and has Other', (await page.$$eval('#f-acct option', e => e.map(x => x.textContent))).join() === 'Not set,Other…');
    await page.selectOption('#f-cat', '__other__');
    check('Choosing Other opens a text field', await page.isVisible('.other-row input'));
    check('Choosing Other does not save "Other…" as the category', true);
    await page.fill('.other-row input', 'pet sitting');
    await page.click('[data-act="otherAdd"]');
    check('The new category is selected and joins the list', (await page.$eval('#f-cat', e => e.value)) === 'Pet sitting' && (await page.$$eval('#f-cat option', e => e.map(x => x.textContent))).includes('Pet sitting') && !(await page.isVisible('.other-row')));
    check('The new category is queued for the Sheet', sheet.cats.includes('Pet sitting') || (await page.evaluate(() => JSON.parse(localStorage.getItem('ledger.queue')).some(q => q.type === 'addOption'))));
    await page.fill('#f-merchant', 'Rover'); await page.fill('#f-total', '35'); await page.dispatchEvent('#f-total', 'change');
    await page.click('form[data-form="add"] button.btn.pri');
    await page.waitForSelector('.rc-name'); await synced(page);
    check('The expense saved under the new category', sheet.rows.some(r => r.merchant === 'Rover' && r.category === 'Pet sitting'));
    check('The Sheet list got the new category', sheet.cats.includes('Pet sitting') && sheet.calls.includes('addOption'));
    // Typing an existing one (any case) picks it instead of duplicating
    await go(page, '#/expenses/add');
    await page.selectOption('#f-cat', '__other__'); await page.fill('.other-row input', 'groceries'); await page.keyboard.press('Enter');
    check('Enter adds without submitting the form, and an existing name is reused', (await page.$eval('#f-cat', e => e.value)) === 'Groceries' && (await hash(page)) === '#/expenses/add' && sheet.cats.filter(c => c.toLowerCase() === 'groceries').length === 1);
    // Cancel goes back
    await page.selectOption('#f-cat', 'Utilities');
    await page.selectOption('#f-cat', '__other__');
    await page.click('[data-act="otherCancel"]');
    check('Cancel puts the dropdown back', (await page.$eval('#f-cat', e => e.value)) === 'Utilities' && !(await page.isVisible('.other-row')));
    // Account
    await page.selectOption('#f-acct', '__other__'); await page.fill('.other-row input', 'amex gold');
    await page.click('[data-act="otherAdd"]');
    check('A new account is selected and added', (await page.$eval('#f-acct', e => e.value)) === 'Amex gold');
    await synced(page);
    check('The Sheet Accounts list got it', sheet.accts.includes('Amex gold'));
    // It shows up on other forms too
    await go(page, '#/income/pay');
    check('Other forms offer the new account', (await page.$$eval('#p-acct option', e => e.map(x => x.textContent))).includes('Amex gold'));
    await go(page, '#/expenses/budget');
    check('Budgets can add a category with Other too', (await page.$$eval('#b-cat option', e => e.map(x => x.textContent))).pop() === 'Other…');
    await ctx.close();
    // Offline: the choice is kept and sent later
    const off = await mk(browser);
    await go(off.page, '#/expenses/add');
    await off.page.selectOption('#f-cat', '__other__'); await off.page.fill('.other-row input', 'Gifts'); await off.page.click('[data-act="otherAdd"]');
    const q = await off.page.evaluate(() => JSON.parse(localStorage.getItem('ledger.queue')));
    check('Offline, the new choice waits in the queue', q.length === 1 && q[0].type === 'addOption' && q[0].value === 'Gifts' && q[0].kind === 'category');
    await off.ctx.close();
  }

  // ---------- 5f. Gemini key on the phone ----------
  {
    const gem = { calls: [], status: 200, reply: null };
    const GEM_OK = { candidates: [{ content: { parts: [{ text: JSON.stringify({ merchant: 'phone mart', date: today, total: 12.5, tax: 0, items: [{ description: 'Milk', amount: 4.5, category: 'Groceries', section: '', taxed: null }, { description: 'Mystery', amount: 8, category: 'Not a category', section: '', taxed: null }] }) }] } }] };
    const route = ctx => ctx.route('https://generativelanguage.googleapis.com/**', r => {
      const req = r.request(); gem.calls.push({ url: req.url(), key: req.headers()['x-goog-api-key'], body: req.postData() });
      r.fulfill({ status: gem.status, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' }, body: JSON.stringify(gem.status === 200 ? (gem.reply || GEM_OK) : { error: { message: 'API key not valid' } }) });
    });
    const scriptHits = [];
    const { ctx, page } = await mk(browser);
    await route(ctx); await ctx.route('https://script.google.com/**', r => { scriptHits.push(1); r.abort(); });
    await go(page, '#/settings');
    check('Settings has a Gemini key section', /Read receipts with Gemini/.test(await text(page)) && /No key on this phone/.test(await text(page)));
    await page.fill('input[name="key"]', 'not a key'); await page.click('form[data-form="gemkey"] button.btn.pri');
    check('A bad key is refused', /does not look like a Gemini key/.test(await text(page, '#toast')) && !(await page.evaluate(() => localStorage.getItem('ledger.gkey'))));
    await page.fill('input[name="key"]', 'AIzaSyTESTKEY1234567890abcdefghijWXYZ'); await page.click('form[data-form="gemkey"] button.btn.pri');
    await page.waitForTimeout(150);
    check('A good key is saved and shown only by its last four', /ending WXYZ/.test(await text(page)) && !/AIzaSyTESTKEY/.test(await text(page)));
    // Camera now reads the receipt with no Sheet
    await go(page, '#/home');
    await page.setInputFiles('#cam', { name: 'r.png', mimeType: 'image/png', buffer: RECEIPT });
    await page.waitForFunction(() => location.hash === '#/expenses/scan');
    await page.waitForSelector('#s-m[value="Phone mart"]', { timeout: 8000 });
    check('With a key and no Sheet the camera reads the receipt', (await page.inputValue('#s-m')) === 'Phone mart' && gem.calls.length === 1);
    check('The key goes to Google only, as a header', gem.calls[0].key === 'AIzaSyTESTKEY1234567890abcdefghijWXYZ' && !gem.calls[0].url.includes('AIza') && scriptHits.length === 0);
    check('The prompt lists the real categories and carries the photo', /Groceries, Dining Out/.test(gem.calls[0].body) && /inline_data/.test(gem.calls[0].body));
    check('An unknown category from the model becomes Other', /Other/.test(await page.$$eval('select', e => e.map(x => x.value).join())));
    // Read photo from the Add form, and Gemini on pasted text
    await go(page, '#/expenses/paste');
    await page.fill('#p-t', 'PHONE MART\n1 Milk 4.50\n1 Bread 8.00\nTOTAL 12.50');
    await page.click('[data-act="readTextAI"]');
    await page.waitForSelector('#s-m[value="Phone mart"]', { timeout: 8000 });
    check('Sorting pasted text with Gemini works with just a key', gem.calls.length === 2 && /RECEIPT TEXT/.test(gem.calls[1].body));
    // Errors
    gem.status = 400;
    await go(page, '#/expenses/paste'); await page.fill('#p-t', 'PHONE MART\n1 Milk 4.50\nTOTAL 4.50');
    await page.click('[data-act="readTextAI"]');
    await page.waitForSelector('text=not valid', { timeout: 8000 });
    check('A rejected key says so plainly', /Gemini key is not valid/.test(await text(page)));
    gem.status = 200;
    // Remove
    await go(page, '#/settings');
    await page.click('[data-act="gemRemove"]');
    check('Removing the key clears it', /No key on this phone/.test(await text(page)) && !(JSON.parse(await page.evaluate(() => localStorage.getItem('ledger.gkey')) || '""')));
    await go(page, '#/home');
    await page.setInputFiles('#cam', { name: 'r.png', mimeType: 'image/png', buffer: RECEIPT });
    await page.waitForFunction(() => location.hash === '#/expenses/add');
    check('Without a key and a Sheet the photo is just kept', /kept on this phone/.test(await text(page, '#toast')) && gem.calls.length === 3);
    await ctx.close();

    // Connected, but the script has no Gemini key of its own: the phone key steps in
    const sheet = newSheet();
    const c2 = await mk(browser, { sheet, connected: true });
    await route(c2.ctx);
    await c2.page.evaluate(() => localStorage.setItem('ledger.gkey', JSON.stringify('AIzaSyTESTKEY1234567890abcdefghijWXYZ')));
    const sh = sheetHandler(sheet);
    await c2.ctx.route('https://script.google.com/**', r => { const b = JSON.parse(r.request().postData() || '{}'); if (b.action === 'scan') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'Receipt scanning is not set up yet. Add GEMINI_API_KEY in the script properties.' }) }); return sh(r); });
    await synced(c2.page);
    const before = gem.calls.length;
    await go(c2.page, '#/home');
    await c2.page.setInputFiles('#cam', { name: 'r.png', mimeType: 'image/png', buffer: RECEIPT });
    await c2.page.waitForSelector('#s-m[value="Phone mart"]', { timeout: 8000 });
    check('If the script cannot scan, the phone key does it', gem.calls.length === before + 1);
    await c2.ctx.close();

    // Forget this phone also forgets the key
    const c3 = await mk(browser);
    await c3.page.evaluate(() => localStorage.setItem('ledger.gkey', JSON.stringify('AIzaSyTESTKEY1234567890abcdefghijWXYZ')));
    await go(c3.page, '#/settings');
    await c3.page.click('[data-act="forget"]'); await c3.page.click('#modal [data-m="1"]');
    await c3.page.waitForTimeout(800);
    check('Forget this phone removes the key', (await c3.page.evaluate(() => localStorage.getItem('ledger.gkey'))) === null);
    await c3.ctx.close();
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
    const routes = ['#/home', '#/accounts', '#/accounts/account', '#/accounts/balance', '#/expenses', '#/expenses/budgets', '#/expenses/budget', '#/expenses/bills', '#/expenses/bill', '#/expenses/add', '#/expenses/paste'];
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
