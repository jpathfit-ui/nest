# NestLog, phase 2 and 3 (income, jobs, and receipt scanning)

A household income and expense tracker for two phones, writing to a Google Sheet. It covers the menu and navigation, Add expense with single or split categories, receipt scanning, income and jobs for you and Sue, a Home view of what is left over each month, the PIN, sync, undo, delete, and CSV export. The other menu items are in place and say which phase fills them.

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

## What was and was not tested

Tested: the app in a phone-sized browser against a simulated Sheet script (88 checks, plus 15 for pull to refresh, 28 for paste text and 33 for the text reader, including pay date rules across month ends, year ends, and clock changes), the script's real code against a simulated Google Sheet and a simulated Gemini reply (56 checks), and the tax split over 4,000 random receipts.

Not tested: the iPhone Scan Text button (the app only provides the box), the script inside real Google services, and the reader on real receipts with a real Gemini key, because neither is reachable from where this was built. Start with a few receipts you can check by eye, and expect to correct some lines at first. Photos in good light, flat, and filling the frame read best.

## Not built yet

Budgets and bills (phase 4), accounts and statement import (phase 5), planning, what-ifs, mortgage, taxes, reports (phase 6). Editing an existing entry is delete and re-add for now. Receipt photos are not stored; only the extracted data is.
