# NestLog, phase 4 (budgets, bills, notes, and a camera that works offline)

A household income and expense tracker for two phones, writing to a Google Sheet. It covers the menu and navigation, Add expense with single or split categories, receipt scanning, income and jobs for you and Sue, a Home view of what is left over each month, the PIN, sync, undo, delete, and CSV export. Phase 4 adds budgets, recurring bills, notes on entries, a Home activity feed, and a camera that works with no Sheet connected. The other menu items are in place and say which phase fills them.

## Set up the Sheet (about 10 minutes, on a computer)

1. Create a new Google Sheet named NestLog.
2. Extensions > Apps Script. Delete the starter code and paste in `apps-script/Code.gs`.
3. Project Settings (gear icon) > tick "Show appsscript.json manifest file in editor". Open `appsscript.json` and paste in the contents of `apps-script/appsscript.json`.
4. Pick `setup` in the function dropdown and press Run. Approve the permissions. This builds the Expenses, Items, Income, Jobs, Categories, and Settings tabs, the average-ratio formula, and the red highlight rule. If you set up an earlier version already, run it again to add the new tabs.
5. Project Settings > Script properties > Add script property. Name: `PIN`. Value: six digits or more. This PIN is the household password.
6. Deploy > New deployment > type Web app. Execute as: Me. Who has access: Anyone. Deploy, then copy the Web app link (it ends in `/exec`). If you already deployed, use Manage deployments > edit > New version instead, so the link stays the same.
7. Share the Sheet with Sue's Google account as an editor. Nobody else.

## Turn on receipt scanning

1. Go to Google AI Studio (aistudio.google.com), choose Get API key, and create a key.
2. Turn on billing for that key's project. This matters: on Google's free tier, your prompts and images may be used to improve Google's products and reviewed by people, and on the paid tier they are not. A receipt shows your spending and sometimes part of a card number, so use the paid tier. At household volume the cost is small, but check Google's current pricing page.
3. In Apps Script, Project Settings > Script properties, add `GEMINI_API_KEY` with the key.
4. Optional: Google retires models often. The script uses `gemini-3.6-flash`. If scanning ever says the model is unknown, add a script property `GEMINI_MODEL` with a current Gemini Flash model name from Google's model list. No code change is needed.
5. The script allows 60 scans a day, so a bug or a stolen PIN can never run up a bill.

## Put the app online

1. Create a GitHub repository (or add a folder to the Lift repository) and upload `index.html`, `manifest.webmanifest`, `sw.js`, and the three `icon-*.png` files. Do not upload the `apps-script` folder.
2. Settings > Pages > deploy from the main branch.
3. The script link and PIN are never in the repository. Each phone asks for them once, so the public code holds no secrets.

## Install on each phone

1. Open the Pages address in Safari.
2. Share > Add to Home Screen.
3. Open NestLog from the home screen. Paste the script link and the PIN, then pick who is using that phone. That person becomes the default for Paid by.

## Income and jobs

- Income has two tabs: Paycheques (the monthly list, with the plus to log one) and Jobs.
- Add each job once: whose it is, a name, how often it pays (Weekly, Every 2 weeks, Twice a month, Monthly, or Irregular), the usual take-home amount, and the next pay date. Several jobs per person are fine, and a job can be paused.
- When a job's pay date arrives, Home shows a Paycheque due card. Tap Log it and the form is already filled in from the job. Change the amount if this one differs, add the gross pay if you want deductions worked out, and save.
- Saving moves the job's next pay date forward. Twice a month means the 15th and the last day of the month. Monthly keeps the same day and shortens to month end when it has to. Logging a paycheque late or early still lands the next date correctly.
- Something else covers one-off money such as a tax refund, bonus, or gift.
- Home shows Left over: take-home income this month minus what was spent, with the two figures beneath it. Until you log income it shows spending and a link to log a paycheque.
- Deleting a paycheque does not move the job's pay date back. Edit the job if you need to correct it.
- Take-home pay is what counts toward Left over. Gross and deductions are stored for the Sheet.

## Phase 4: update the Sheet script first

Budgets, bills and notes need the newest `apps-script/Code.gs`. Paste it over the old one, then Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy. The link stays the same, and the Budgets, Bills and Notes tabs appear in the Sheet the first time you save one. Until you do this, the app keeps working but those saves show a "Could not save" card on Home with a Try again button.

## Camera with no Sheet connected

The camera button works before the Sheet is connected, and when the signal is gone. The photo is shrunk and kept on the phone, and the Add expense form opens with it at the top so you can type the details in from the photo or paste its text. When you save, the photo stays with that entry (open the entry and tap Receipt photo). A photo you do not finish is kept on Home with Add expense and Discard buttons. With a Sheet connected and a signal, Read photo on the form reads it for you, and the camera reads receipts straight away as before. Photos never leave the phone unless you read one with Gemini.

## Budgets

Expenses > Budgets. Set a monthly limit for any category. The bar fills as you spend, turns orange from 80 percent and red when you are over. Home flags budgets that are close or over. Setting a budget shows the average you spent in that category over the last three months. Everything works offline and syncs to a Budgets tab.

## Bills

Expenses > Bills. Add recurring bills with an amount, category, how often (monthly, weekly, every 2 weeks, yearly) and the next due date. Bills due within a week show on Home. Mark paid logs the expense for you, moves the due date forward one period, and has Undo. Monthly and yearly bills keep their day of the month, so a bill due on the 31st lands on the 28th in February and goes back to the 31st after. Syncs to a Bills tab.

## Notes and the activity feed

Open any entry and add a note. Each note shows who wrote it and when, so you and Sue can ask and answer ("Is this the one-off?"). Undo takes a note back. Home now has Recent activity: the latest expenses, paycheques and notes with who added them, and tapping one opens it. Notes sync to a Notes tab. The feed uses who paid, so an entry logged by John for Sue shows as Sue.

## Paste receipt text

On the Add expense screen, Paste receipt text opens a box. Tap in it and choose Scan Text (in the popup menu or on the keyboard) to read a receipt with the iPhone camera, or paste text you copied from a photo.

- Read this text works on the phone and sends nothing anywhere. It finds the store, date, items, tax and total with plain rules, picks a starting category from the store name, and shows the usual review screen. Use Set every item to... to change all categories at once.
- Sort the items with Gemini sends only the text (no photo) to Google for better item names and categories. It counts toward the same daily scan limit.
- If a date could be read two ways (03/04/26), the app picks the one that is recent and says when it is unsure.
- Tax is spread across all items, because plain text does not say which items are taxable.

## How scanning works

1. Tap the camera on Home, or Scan receipt on the Add screen. Choose photo picks an existing picture instead.
2. The photo is shrunk on the phone and sent to your script, which asks Gemini to read it. The key never leaves the script.
3. A review screen shows the store, date, and every line grouped under the receipt's department headings, each with a suggested category. Fix any amount or category, or remove a line.
4. Tax is spread over the items the receipt marks taxable (or over every item if it does not mark any), in whole cents so nothing is lost to rounding.
5. The screen compares your total with the printed total. If they differ it tells you by how much and asks before saving.
6. Saving writes one Expenses row per category, so your averages and flags stay meaningful, and one row per item on the Items tab (item, section, category, amount before tax, tax share) for digging in later.

## How the rest behaves

- Entries save the moment you confirm them. With no signal they wait in a queue and send when the connection returns, and a retry can never double book an entry. Scanning itself needs a connection.
- Split by hand: type the total, tap Split across categories, and enter the smaller amounts. The first category takes whatever is left.
- Undo appears for a few seconds after saving or deleting.
- Seeing the other person's entries: the app reads the Sheet when it opens and when you switch back to it. To check sooner, pull down at the top of any screen and let go. It says Up to date when finished, or tells you if the Sheet could not be reached. Pulling does nothing on entry forms, so a half finished entry is never disturbed.
- Rows more than twice their category average turn red in the Sheet once a category has five entries. Change the multiplier in cell K1 of the Expenses tab.
- The app locks after the idle time you choose in Settings. Five wrong PIN tries lock the script for 15 minutes.
- Categories, people, and accounts are edited in the Sheet (Categories and Settings tabs) and appear in the app on the next sync.

## Tests

`node tests/test.js` drives the real app in a phone-sized browser against a fake Sheet. It needs Playwright installed. The tests live in this repository so they are never lost.

## What was and was not tested

Tested: the app in a phone-sized browser against a simulated Sheet script (88 checks, plus 15 for pull to refresh, 28 for paste text and 33 for the text reader, including pay date rules across month ends, year ends, and clock changes), the script's real code against a simulated Google Sheet and a simulated Gemini reply (56 checks), and the tax split over 4,000 random receipts.

Phase 4 adds `tests/test.js` (64 checks on the app: the offline camera, budgets, bills, notes, the activity feed, capital letters, reduce motion) and `tests/script-test.js` (21 checks running the real `Code.gs` against a fake Sheet).

Not tested: the iPhone Scan Text button (the app only provides the box), the script inside real Google services, and the reader on real receipts with a real Gemini key, because neither is reachable from where this was built. Start with a few receipts you can check by eye, and expect to correct some lines at first. Photos in good light, flat, and filling the frame read best.

## Not built yet

Accounts and statement import (phase 5), planning, what-ifs, mortgage, taxes, reports (phase 6). Editing an existing entry is delete and re-add for now. Receipt photos are kept on the phone that took them only, so Sue will not see your photos on her phone.
