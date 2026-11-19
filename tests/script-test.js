// Runs the real apps-script/Code.gs against a small fake Google Sheet. Run with: node tests/script-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; }
  setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => { const rr = this.r - 1 + i; this.sh.data[rr] = this.sh.data[rr] || []; this.sh.data[rr][this.c - 1 + j] = v; })); return this; }
  getValue() { return this.getValues()[0][0]; }
  setValue(v) { return this.setValues([[v]]); }
  setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; } setFormula() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.data = []; }
  getLastRow() { let n = 0; this.data.forEach((row, i) => { if (row && row.some(v => v !== '' && v !== undefined)) n = i + 1; }); return n; }
  getMaxRows() { return Math.max(1000, this.data.length); }
  getRange(r, c, nr = 1, nc = 1) { if (typeof r === 'string') { const m = r.match(/^([A-Z]+)(\d+)$/); return new Range(this, Number(m[2]), m[1].charCodeAt(0) - 64, 1, 1); } return new Range(this, r, c, nr, nc); }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  setFrozenRows() {}
}
const sheets = {};
const ss = {
  getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = new Sheet(n)),
  setSpreadsheetTimeZone() {}, getUrl: () => 'https://example.com/sheet'
};
sheets.Expenses = new Sheet('Expenses'); sheets.Expenses.data = [['Receipt ID', 'Date', 'Merchant']]; sheets.Expenses.getRange('K1').setValue(2);
const props = { PIN: '246810' };
const ctx = {
  console, Date, JSON, Math, String, Number, Array, Object, isNaN,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; }, setProperties: o => Object.assign(props, o) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
  Utilities: { formatDate: (d, tz, f) => { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); } }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);

let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, x); } };
const call = req => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ pin: '246810', ...req }) } }).t);
const throws = fn => { try { fn(); return false; } catch (e) { return true; } };

// Budgets
check('Saves a budget', call({ action: 'saveBudget', category: 'Groceries', cents: 60000 }).ok);
check('Updates the same budget instead of adding a row', (call({ action: 'saveBudget', category: 'Groceries', cents: 65000 }), sheets.Budgets.getLastRow() === 2));
call({ action: 'saveBudget', category: 'Gas', cents: 30000 });
let l = call({ action: 'list' });
check('Budgets come back in the list', !l.ok ? false : l.budgets.length === 2 && l.budgets.find(b => b.category === 'Groceries').limit === 650);
check('Rejects a zero budget', !call({ action: 'saveBudget', category: 'Gas', cents: 0 }).ok);
check('Rejects a budget with no category', !call({ action: 'saveBudget', category: '', cents: 100 }).ok);
check('Formula text in a category is neutralised', (call({ action: 'saveBudget', category: '=1+1', cents: 100 }), sheets.Budgets.data.some(r => r[0] === "'=1+1")));
check('Removes a budget', (call({ action: 'removeBudget', category: 'Gas' }), call({ action: 'list' }).budgets.every(b => b.category !== 'Gas')));

// Bills
const bill = { id: 'b_phone0000000001', name: 'Phone plan', cents: 8500, category: 'Phone and Internet', freq: 'Monthly', nextDue: '2026-12-01', day: 1, active: true };
check('Saves a bill', call({ action: 'saveBill', bill }).ok);
call({ action: 'saveBill', bill: { ...bill, nextDue: '2027-01-01' } });
l = call({ action: 'list' });
check('Updating a bill does not add a row', l.bills.length === 1 && l.bills[0].nextDue === '2027-01-01' && l.bills[0].amount === 85 && l.bills[0].day === 1 && l.bills[0].active === true, JSON.stringify(l.bills));
check('Rejects a bad frequency', !call({ action: 'saveBill', bill: { ...bill, freq: 'Daily' } }).ok);
check('Rejects a bad id', !call({ action: 'saveBill', bill: { ...bill, id: 'x' } }).ok);
check('Rejects a bad date', !call({ action: 'saveBill', bill: { ...bill, nextDue: 'soon' } }).ok);
check('Removes a bill', (call({ action: 'removeBill', id: bill.id }), call({ action: 'list' }).bills.length === 0));

// Notes
const note = { id: 'n_note000000000001', entryId: 'r_entry00000000001', author: 'John', text: 'Is this the one-off?', ts: 1790000000000 };
check('Adds a note', call({ action: 'addNote', note }).ok);
const dup = call({ action: 'addNote', note });
check('A retried note is not added twice', dup.ok && dup.duplicate === true && call({ action: 'list' }).notes.length === 1);
l = call({ action: 'list' });
check('Note comes back with its time and author', l.notes[0].author === 'John' && l.notes[0].entryId === note.entryId && l.notes[0].ts === note.ts && l.notes[0].text === note.text, JSON.stringify(l.notes));
check('Rejects an empty note', !call({ action: 'addNote', note: { ...note, id: 'n_note000000000002', text: '  ' } }).ok);
check('Rejects a note with a bad entry id', !call({ action: 'addNote', note: { ...note, id: 'n_note000000000003', entryId: '..' } }).ok);
check('Removes a note', (call({ action: 'removeNote', id: note.id }), call({ action: 'list' }).notes.length === 0));

// Editing an expense
const rc = { id: 'r_edit0000000001', date: '2026-11-10', merchant: 'Costco', paidBy: 'Sue', account: 'Credit Card', note: '', lines: [{ category: 'Groceries', cents: 8000 }, { category: 'Household', cents: 2000 }] };
check('Adds an expense to edit', call({ action: 'add', receipt: rc }).ok);
call({ action: 'add', receipt: { ...rc, id: 'r_other000000001', merchant: 'Shoppers', lines: [{ category: 'Other', cents: 500 }] } });
const rowsOf = id => sheets.Expenses.data.filter(r => r[0] === id);
const stamp = rowsOf(rc.id)[0][9];
check('Edit with the same number of lines changes it in place', (call({ action: 'edit', receipt: { ...rc, merchant: 'Costco Wholesale', note: 'Bulk', lines: [{ category: 'Groceries', cents: 7500 }, { category: 'Household', cents: 2500 }] } }), rowsOf(rc.id).length === 2 && rowsOf(rc.id)[0][2] === 'Costco Wholesale' && rowsOf(rc.id)[0][5] === 75 && rowsOf(rc.id)[1][5] === 25 && rowsOf(rc.id)[0][4] === 'Bulk'));
check('Edit keeps the same id and the original entered time', rowsOf(rc.id)[0][0] === rc.id && rowsOf(rc.id)[0][9] === stamp);
check('Edit with fewer lines drops the extra row', (call({ action: 'edit', receipt: { ...rc, lines: [{ category: 'Groceries', cents: 10000 }] } }), rowsOf(rc.id).length === 1 && rowsOf(rc.id)[0][5] === 100));
check('Edit with more lines adds the rows', (call({ action: 'edit', receipt: { ...rc, lines: [{ category: 'Groceries', cents: 6000 }, { category: 'Household', cents: 3000 }, { category: 'Other', cents: 1000 }] } }), rowsOf(rc.id).length === 3 && rowsOf(rc.id).reduce((t, r) => t + r[5], 0) === 100 && rowsOf(rc.id)[0][9] === stamp));
check('Editing one entry leaves the others alone', rowsOf('r_other000000001').length === 1 && rowsOf('r_other000000001')[0][2] === 'Shoppers');
l = call({ action: 'list' });
check('The list shows the edited entry once', l.rows.filter(r => r.id === rc.id).length === 3);
check('Editing an entry the Sheet never saw adds it', (call({ action: 'edit', receipt: { ...rc, id: 'r_new00000000001', merchant: 'Fresh' } }), rowsOf('r_new00000000001').length === 2));
check('A retried edit does not double the rows', (call({ action: 'edit', receipt: { ...rc, id: 'r_new00000000001', merchant: 'Fresh' } }), rowsOf('r_new00000000001').length === 2));
check('Edit rejects a bad amount', !call({ action: 'edit', receipt: { ...rc, lines: [{ category: 'Groceries', cents: 0 }] } }).ok);
check('Edit rejects a missing merchant', !call({ action: 'edit', receipt: { ...rc, merchant: ' ' } }).ok);
check('A rejected edit leaves the entry as it was', rowsOf(rc.id).length === 3);
sheets.Items = new Sheet('Items'); sheets.Items.data = [['Receipt ID', 'Date', 'Merchant', 'Item']];
sheets.Items.data.push([rc.id, '2026-11-10', 'Costco', 'Milk'], ['r_other000000001', '2026-11-10', 'Shoppers', 'Gum']);
call({ action: 'edit', receipt: { ...rc, merchant: 'Costco Mississauga', date: '2026-11-12' } });
check('Scanned items follow the new merchant and date', sheets.Items.data[1][2] === 'Costco Mississauga' && sheets.Items.data[1][1] instanceof Date && sheets.Items.data[1][1].getDate() === 12 && sheets.Items.data[2][2] === 'Shoppers');

// Editing a paycheque
const inc = { id: 'i_pay00000000001', date: '2026-11-13', person: 'John', job: 'CAMH', gross: 300000, net: 220000, account: 'Chequing', note: '' };
call({ action: 'addIncome', entry: inc });
call({ action: 'addIncome', entry: { ...inc, id: 'i_pay00000000002', person: 'Sue', job: 'School' } });
check('Edits a paycheque in place', (call({ action: 'editIncome', entry: { ...inc, net: 225000, gross: 305000, note: 'Raise' } }), sheets.Income.data.filter(r => r[0] === inc.id).length === 1 && sheets.Income.data.find(r => r[0] === inc.id)[5] === 2250));
check('Deductions follow the edit', sheets.Income.data.find(r => r[0] === inc.id)[6] === 800);
check('The entered time and the other paycheque are untouched', sheets.Income.data.find(r => r[0] === inc.id)[9] instanceof Date && sheets.Income.data.find(r => r[0] === 'i_pay00000000002')[3] === 'School');
check('Edit can clear the gross pay', (call({ action: 'editIncome', entry: { ...inc, gross: null } }), sheets.Income.data.find(r => r[0] === inc.id)[4] === ''));
check('Income edit rejects gross below net', !call({ action: 'editIncome', entry: { ...inc, gross: 100 } }).ok);
check('Income edit of an unseen paycheque adds it', (call({ action: 'editIncome', entry: { ...inc, id: 'i_pay00000000003' } }), sheets.Income.data.filter(r => r[0] === 'i_pay00000000003').length === 1));
check('The edited paycheque comes back in the list', call({ action: 'list' }).income.find(r => r.id === inc.id).net === 2200);

// Accounts and balances
const acct = { id: 'a_chq0000000000001', name: 'TD Chequing', type: 'Chequing', owner: 'Joint', active: true };
check('Saves an account', call({ action: 'saveAccount', account: acct }).ok);
call({ action: 'saveAccount', account: { ...acct, name: 'TD Everyday' } });
l = call({ action: 'list' });
check('Updating an account does not add a row', l.accounts.length === 1 && l.accounts[0].name === 'TD Everyday' && l.accounts[0].active === true, JSON.stringify(l.accounts));
check('Rejects a bad account type', !call({ action: 'saveAccount', account: { ...acct, type: 'Pirate chest' } }).ok);
check('Rejects an account with no name', !call({ action: 'saveAccount', account: { ...acct, name: ' ' } }).ok);
const bal = { id: 'b_bal0000000000001', accountId: acct.id, date: '2026-11-01', cents: 345678 };
check('Adds a balance', call({ action: 'addBalance', balance: bal }).ok);
check('A retried balance is not added twice', (call({ action: 'addBalance', balance: bal }), call({ action: 'list' }).balances.length === 1));
check('Balance comes back in dollars with its date', (l = call({ action: 'list' }), l.balances[0].balance === 3456.78 && l.balances[0].date === '2026-11-01' && l.balances[0].accountId === acct.id));
check('A negative balance is allowed', call({ action: 'addBalance', balance: { ...bal, id: 'b_bal0000000000002', date: '2026-11-08', cents: -5000 } }).ok);
check('Rejects a balance for an unknown account', !call({ action: 'addBalance', balance: { ...bal, id: 'b_bal0000000000003', accountId: 'a_nobody000000001' } }).ok);
check('Rejects a fractional cent amount', !call({ action: 'addBalance', balance: { ...bal, id: 'b_bal0000000000004', cents: 10.5 } }).ok);
check('Rejects a bad balance date', !call({ action: 'addBalance', balance: { ...bal, id: 'b_bal0000000000005', date: 'soon' } }).ok);
check('Removes one balance', (call({ action: 'removeBalance', id: 'b_bal0000000000002' }), call({ action: 'list' }).balances.length === 1));
call({ action: 'addBalance', balance: { ...bal, id: 'b_bal0000000000006', date: '2026-11-15', cents: 400000 } });
check('Removing an account removes its balances too', (call({ action: 'removeAccount', id: acct.id }), (l = call({ action: 'list' }), l.accounts.length === 0 && l.balances.length === 0)));

// Safety
check('A wrong PIN is refused for the new actions', JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ pin: '000000', action: 'saveBudget', category: 'Gas', cents: 100 }) } }).t).ok === false);
check('Unknown actions are still refused', call({ action: 'nope' }).ok === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
