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

// Safety
check('A wrong PIN is refused for the new actions', JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ pin: '000000', action: 'saveBudget', category: 'Gas', cents: 100 }) } }).t).ok === false);
check('Unknown actions are still refused', call({ action: 'nope' }).ok === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
