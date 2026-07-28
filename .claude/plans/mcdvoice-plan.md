# Implementation Plan: survey-snap (McDVoice receipt-to-survey assistant)

> Executor note: you have this file and an **empty** directory at
> `/home/eric/projects/survey-snap` (no git repo, no files). Everything below is
> self-contained. Section 2 ("Live site reconnaissance") contains **real,
> verified** DOM details captured from mcdvoice.com on 2026-07-28 — trust it over
> guesswork, but re-verify with the probe script in Task 9 before you build
> against it, because the site can change.

---

## 1. Summary

Build `survey-snap`: a single-user, local-network Next.js (TypeScript) web app the
user opens from their phone browser. It captures a photo of a McDonald's receipt
with the phone camera, OCRs it to extract the 26-digit McDVoice survey code plus
receipt metadata (store #, KS/register #, date/time, order #, total, best-effort
line items), lets the user correct the OCR result, then uses headless Playwright
to drive the real mcdvoice.com survey: first a **staging** pass that walks the
question flow and records every question with a suggested answer (subjective →
most positive; factual → from receipt metadata; unrecognized → blank), then, only
after the user reviews/edits the staged answers and clicks an explicit
**"Confirm & Submit"** for that specific receipt, a **submit** phase that
completes the survey and scrapes the validation code. Everything is recorded in a
local SQLite history so the user can see which receipts are already redeemed. The
point is to remove the tedium (typing 26 digits, tapping through ~15 pages) while
keeping a human in the loop for every answer that reaches McDonald's.

---

## 2. Live site reconnaissance (VERIFIED — captured 2026-07-28)

mcdvoice.com is a **Service Management Group (SMG)** ASP.NET WebForms-style
survey engine (`Survey.aspx`), rendered server-side, navigated by **POST of a
plain HTML form** — not a SPA, no XHR/JSON API. Every page is a full page load.

### 2.1 Code entry page — `https://www.mcdvoice.com/` (a.k.a. `Index.aspx`)

Verified markup:

```html
<form method="post" id="surveyEntryForm" action="Survey.aspx?c=493313" autocomplete="off">
  <input type="hidden" id="JavaScriptEnabled" name="JavaScriptEnabled" value="0"/>
  <input type="hidden" id="FIP" name="FIP" value="True"/>
  <input class="coupon-length-5" type="text" id="CN1" name="CN1" aria-label="Input digits 1-5 of the Survey Code." maxlength="5" value="" />
  <input class="coupon-length-5" type="text" id="CN2" name="CN2" aria-label="Input digits 6-10 of the Survey Code." maxlength="5" value="" />
  <input class="coupon-length-5" type="text" id="CN3" name="CN3" aria-label="Input digits 11-15 of the Survey Code." maxlength="5" value="" />
  <input class="coupon-length-5" type="text" id="CN4" name="CN4" aria-label="Input digits 16-20 of the Survey Code." maxlength="5" value="" />
  <input class="coupon-length-5" type="text" id="CN5" name="CN5" aria-label="Input digits 21-25 of the Survey Code." maxlength="5" value="" />
  <input class="coupon-length-1" type="text" id="CN6" name="CN6" aria-label="Input digit 26 of the Survey Code." maxlength="1" value="" />
  <input type="submit" id="NextButton" name="NextButton" value="Start" class="NextButton" UseWaitScreen="true"/>
  <a href="Index.aspx?POSType=PieceMeal">…if you do not have a 26-digit code…</a>
  <input type="hidden" id="AllowCapture" name="AllowCapture" value=""/>
</form>
```

So: fill `#CN1..#CN5` with 5-digit slices and `#CN6` with digit 26, click
`#NextButton`. The `?c=NNNNNN` query param on the form action is a **rotating
per-page token** — never hardcode it, always submit the form that is on screen.

**Invalid-code behaviour (verified)**: the browser stays on `Index.aspx?c=…&AllowCapture=False`,
the `CN*` inputs gain class `inputErrorBorder`, and an element
`span#errorCN5.Error.ErrorSign` appears with text `* Error: Please answer this question.`
→ Detect failure as: still on `Index.aspx` **or** `.inputErrorBorder` present
**or** any `.Error` element with non-empty text.

### 2.2 Alternate "no code" path — `Index.aspx?POSType=PieceMeal`

Verified fields (useful both as a fallback when OCR can't recover the code and as
a **test harness for mapping the question flow without consuming a real receipt
code** — this is how the flow below was mapped):

`#InputStoreID` (maxlength 5), `#InputRegisterNum` (KS #, maxlength 2),
`select#InputMonth` / `#InputDay` / `#InputYear` / `#InputHour` / `#InputMinute`
(option values are zero-padded, e.g. `"01".."12"`, years `"2025"`, …),
`#InputTransactionNum` (order #, maxlength 4), `#AmountSpent1` (dollars,
maxlength 4), `#AmountSpent2` (cents, maxlength 2), then `#NextButton` (value
`Start`). A real store number is required — `05678` (1300 N COAST HWY, NEWPORT,
OR) was verified working on 2026-07-28.

### 2.3 Question pages — `Survey.aspx?c=NNNNNN`

Common shell on every question page (verified):

- `form#surveyForm[method=post][action="Survey.aspx?c=NNNNNN"]`
- `div#surveyQuestions.SurveyHolder` — the question container
- `input[type=submit]#NextButton` with `value="Next"`
- `input[type=hidden]#PostedFNS` — **pipe-delimited list of the field IDs on this
  page**, e.g. `value="R028000|R006000|R011000|R000351|R007000|R009000"`. This is
  the authoritative per-page question list. `S`-prefixed ids are static text
  blocks, `R`-prefixed ids are real questions.
- `input[type=hidden]#IoNF`
- `div#ProgressPercentage` — e.g. `0%`, `89%`; `div#ProgressBarholder`
- `document.title` = `McDonald’s Customer Satisfaction Survey on McDVoice.com - Questions - N% Progress`
- `body.className` includes `Survey` (plus `US`, `lightSurvey`, `DesktopMode`,
  `OSAT_{R003000}`, and `PieceMeal` when entered via the piecemeal path)
- A jQuery-UI session dialog `div#sessionTimeoutDialog` with an
  **"Extend Session"** button. Page JS declares `var sessionTimeout = 1200;`
  → **20-minute server session**, warning at 2:00 remaining, and its text says
  *"otherwise your survey will time out and you will need to start over."*

**There is no Back/Previous button.** Navigation is strictly forward. This is the
single most important architectural fact — see §3.5.

#### Question type taxonomy (all verified except where noted)

**(a) Scale / grid — `table.Inputtyperbl`**

```html
<table role="presentation" class="Inputtyperbl ScaleSize5 HighlySatisfiedNeitherDESC">
 <thead><tr>
   <td class="…Question TopLeftCell"><span class="sr-only">Survey Question</span></td>
   <th id="HighlySatisfiedNeitherDESC5" class="Scale ScaleSize5 HighlySatisfiedNeitherDESC5" scope="col">Highly Satisfied</th>
   … Satisfied / Neither Satisfied nor Dissatisfied / Dissatisfied / Highly Dissatisfied …
 </tr></thead>
 <tbody>
   <tr id="FNSR028000" class="InputRowOdd" role="radiogroup" aria-labelledby="textR028000">
     <th id="textR028000" class="LeftColumn" scope="row">The quality of your food.</th>
     <td class="Opt1 inputtyperbloption">
       <input type="radio" name="R028000" value="5" id="R028000.5" aria-labelledby="HighlySatisfiedNeitherDESC5" class="simpleInput rbl sr-only">
       <label for="R028000.5" class="radioSimpleInput">&zwj;</label>
     </td>
     … value="4" … "3" … "2" … "1" …
   </tr>
   … more rows, one question each …
 </tbody>
</table>
```

Key points: **the radio `value` is not reliably ordered** — for the 5-point
satisfaction scale the *first* column is `value="5"`, for Yes/No the first column
is `value="1"`. Always resolve the option label via the `aria-labelledby` →
`th.Scale` text, never by numeric value.

Yes/No grid variant (verified): `table.Inputtyperbl.ScaleSize2.YesNoASC`,
headers `th#YesNoASC1` = `Yes` (value `1`), `th#YesNoASC2` = `No` (value `2`).

**(b) Vertical single-select — `fieldset.FNSITEM.inputtyperblv`**

```html
<fieldset class="FNSITEM inputtyperblv" id="FNSR000455">
  <legend class="FNSText" id="textR000455">How did you place your order?</legend>
  <div class="rbListContainer"><div class="rbList" aria-labelledby="textR000455">
    <div class="Opt1 rbloption">
      <span class="radioButtonHolder">
        <input type="radio" name="R000455" value="1" id="R000455.1" class="simpleInput rblv sr-only">
        <label for="R000455.1" id="textR000455.1" class="radioSimpleInput"><span>With an employee at the restaurant</span></label>
      </span>
    </div>
    <div class="Opt3 rbloption">… value="3" … "Using the McDonald’s Mobile app" …</div>
    <div class="Opt2 rbloption">… value="2" … "Using a kiosk inside the restaurant" …</div>
  </div></div>
</fieldset>
```

Note the DOM order (`Opt1, Opt3, Opt2`) does **not** match value order. Option
label = text of `label[for=<inputId>]`.

**(c) Multi-select checkboxes — `fieldset.inputtypeopt`**

```html
<fieldset class="inputtypeopt">
  <legend id="textBlock800" class="FNSText blocktitle">Which of the following did you order on this visit? (Please select all that apply.)</legend>
  <div class="cataListContainer"><div class="cataList">
    <div id="FNSR000504" class="cataOption" aria-labelledby="textR000504" aria-checked="false">
      <span class="checkboxholder">
        <input type="checkbox" name="R000504" value="1" id="R000504" class="simpleInput sr-only">
        <span class="checkboxSimpleInput">…</span>
      </span>
      <label for="R000504" id="textR000504">Breakfast</label>
    </div>
    … R000505 "Burgers, Chicken & Fish", R000506 "Beverages & Coffee",
      R000507 "Sweet Treats", R000908 "Fried Apple Pie",
      R000918 "Honey Brown Butter Bacon, Egg, & Cheese Biscuit Sandwich",
      R000919 "Bacon Caesar McCrispy", R000920 "Caesar Snack Wrap" …
  </div></div>
</fieldset>
```

Critical: **each checkbox is its own question id**, all with `value="1"`. The
group's prompt lives in the `legend` (id `textBlock800`), not per-checkbox.

**(d) Static text block — `div.FNSITEM.inputtypeinstr`**

```html
<div class="FNSITEM inputtypeinstr" id="FNSS000100">
  <p class="FNSText BlockHeader" id="textS000100"><span>Upon completion of this survey you will be given a validation code…</span></p>
</div>
```

No input — render as informational, never as a question.

**(e) Free text — NOT VERIFIED.** The walk was abandoned at 89% progress
(deliberately, to avoid submitting a fabricated survey), which is just before the
comment/demographics tail. Expect a `<textarea>` inside a
`fieldset.FNSITEM` / `div.FNSITEM` with class beginning `inputtype…` and
`name`/`id` = the `R######` question id, plus possibly `<select>` dropdowns for
demographics. **Handle `textarea`, `select`, and `input[type=text]` generically
by falling back to: question id from the enclosing `[id^="FNS"]`, prompt text
from `#text<QID>` or the nearest `legend`/`label`, answer left BLANK and flagged
`needsUser: true`.** Do not guess free-text content.

#### Verified question flow (piecemeal entry, store 05678, 2026-07-28)

| Page | Progress | Field IDs (`PostedFNS`) | Type | Prompt |
|---|---|---|---|---|
| 0 | 0% | `R000060` | Yes/No grid | "Did you visit the McDonald's located at 1300 N COAST HWY in NEWPORT, OR?" |
| 1 | 1% | `S000100\|R000455` | static + vertical radio | "How did you place your order?" (employee / Mobile app / kiosk) |
| 2 | 1% | `R004000` | vertical radio | "Please select your visit type:" (Drive-thru / Carry out / Dine-in) |
| 3 | 1% | `R003000` (OSAT) | 5-pt scale | "Please rate your overall satisfaction with your experience at this McDonald's." |
| 4 | 2% | `R…` | Yes/No grid | "Are you a member of MyMcDonald's Rewards?" |
| 5 | 3% | 2 ids | Yes/No grid | "Did the employee ask if you were using your mobile app?" / "Did the employee greet you by name or thank you for being a Rewards member?" |
| 6 | 4% | `R028000\|R006000\|R011000\|R000351\|R007000\|R009000` | 5-pt grid | quality of food / temperature of food / ease of placing order / cleanliness of restaurant / accuracy of order / friendliness of employees |
| 7 | 5% | 3 ids | 5-pt grid | speed of service / taste of food / overall value for the price |
| 8 | 5% | `R…` | Yes/No grid | "Was your order accurate?" |
| 9 | 10% | `R000504…R000920` | checkbox multi | "Which of the following did you order on this visit? (Please select all that apply.)" |
| 10 | 89% | `R016000` | Yes/No grid | "Did you experience a problem during your visit?" |
| 11+ | — | **UNVERIFIED** | — | expected: problem detail (if yes), free-text comments, demographics, contact opt-in, then validation code |

The progress bar is **not linear** (jumps 10% → 89%); do not use it to decide
"am I at the end". Branching is heavy — answering "Yes" to the Rewards question
opened pages 5; answering "No" to the problem question at page 10 almost
certainly skips the problem-detail branch.

### 2.4 Final / validation-code page — **UNVERIFIED, flag clearly**

Not captured, deliberately: reaching it requires actually completing a survey,
which would have submitted fabricated feedback for a real restaurant. `Finish.aspx`,
`Thanks.aspx`, `Complete.aspx` all 302 back to `Index.aspx` when hit directly, so
it cannot be probed out of band, and the site CSS exposes no `#ValidationCode`-style
selector to key off.

**Detect the terminal state structurally, not by selector:**

1. `#surveyForm` still exists but the submit button's `value` is no longer `"Next"`
   (expect `Submit` / `Finish` / `Done`) → this is the **last page before
   submission**; STOP here during staging.
2. After the final click: no `#NextButton` present, and/or `document.body.className`
   no longer contains `Survey`, and/or `#ProgressPercentage` reads `100%`.
3. Scrape the validation code with a layered strategy against
   `document.querySelector('#content')?.innerText`:
   - Prefer an element whose id/class matches `/valid/i` if one exists.
   - Else regex the text near the phrase "validation code" (case-insensitive):
     `/validation\s*code[^0-9]{0,80}([0-9]{4,20})/i`.
   - Else fall back to the longest standalone digit run of length 4–20 on the page.
   - **Always** additionally persist the full `innerText` of `#content` and a
     full-page PNG screenshot so the user can read the code manually if the
     scrape misses. This is the safety net that makes the unverified selector
     acceptable.

---

## 2.5 AMENDMENT — corrections from live recon (2026-07-28, during implementation)

> Written after Task 9 ran `npm run probe:mcdvoice -- --piecemeal --store 05678`
> against the live site. **These supersede §2.3 and §2.4 where they conflict.**
> Everything here is verified, not inferred.

### A. The terminal page does NOT announce itself — §2.4 rule 1 is wrong

§2.4 assumed the last page before submission is detectable because the submit
button's `value` changes from `Next` to `Submit`/`Finish`/`Done`, and §3.5/§7.4
made `advance()`'s `value === 'Next'` assertion the sole guarantee that staging
cannot submit.

**No such page exists.** Verified:

- The last question page (demographics; `#ProgressPercentage` = `100%`) carries
  `<input type="submit" id="NextButton" value="Next" class="NextButton">`.
- Clicking that "Next" **submits the survey**. The following page is the
  Thank-You page: `body class="… Finish …"`, no submit button, validation code
  in the body text.
- Therefore the `value === 'Next'` assertion **never fires before submission**
  and provides no protection whatsoever.

**Incident:** the first `--piecemeal` recon run, implemented exactly to the
original plan, walked to completion and submitted a fabricated survey for store
05678 (validation code `6209701`). No real receipt code was involved. `--piecemeal`
is safe with respect to *receipt codes*, but it is **not** free of consequences:
it files a real survey response. Treat it as costly, not as a dry run.

### B. Adopted rule: 100% progress IS the terminal state, enforced by two guards

Replaces §2.4 rule 1 and the §7.4 `advance()` contract:

1. **A page whose `#ProgressPercentage` reads exactly `100%` is the terminal
   page.** During STAGE: parse it, record its questions as staged, and **stop**.
   Never call `advance()` on it, under any circumstance.
2. Only the CONFIRM phase — `/api/survey/confirm`, still gated on `confirm: true`
   in the body, still reachable only after the user ticks the in-app checkbox —
   may click "Next" on a 100% page. **That click is the submission.**
3. **Two independent guards**, because the incident happened with exactly one
   guard that was wrong (`lib/survey/mcdvoice.ts`):
   - *Guard 1* — `WalkGuard`: the walk records every page index it judged
     terminal; `advance()` refuses any page in that set without consulting the
     DOM at all.
   - *Guard 2* — a live re-read of `#ProgressPercentage` on every `advance()`.
   Either one alone stops the walk; both must fail to reach a submission.
4. The probe script additionally asserts, after every run, that it never reached
   a `Finish`-class page, and aborts loudly if it did.

Regression coverage: `lib/survey/__tests__/submitGuard.test.ts` (including an
explicit test that a `"Next"` label alone is not sufficient to permit advancing),
plus the live `--piecemeal` re-run, which now stops at page 17 / 100% with no
`Finish` page and no validation code captured.

> The progress bar is non-linear (§2.3 notes it jumps 10% → 89%), so `100%` is
> used strictly as an *equality* test on the terminal page — never as an ordering
> or "are we nearly done" signal.

### C. `S`-prefixed ids are NOT always static text — §2.3 is wrong

§2.3 states "`S`-prefixed ids are static text blocks, `R`-prefixed ids are real
questions". The free-text comment box at 95% progress is:

```html
<div class="FNSITEM inputtypetxt" id="FNSS081000">
  <textarea name="S081000" id="S081000" rows="8" maxlength="1200"></textarea>
```

— an `S`-prefixed id that is a real (optional) question. Classifying by id prefix
silently drops it.

**Corrected rule:** type a field by its container's `inputtype…` class, never by
the id prefix. `inputtypeinstr` is the only genuinely static one; a container with
no `input`/`textarea`/`select` is also static. Everything else is a question.
See `isStaticBlock()` / `isEngineField()` in `lib/survey/parsePage.ts`.

### D. Smaller corrections

- **§2.1 failure detection.** "Still on `Index.aspx`" is **not** a failure signal:
  a *successful* piecemeal entry 302s to `Index.aspx?c=NNNNNN&AllowCapture=False`,
  and that page carries the first real question (`#PostedFNS=R000060`). Detect
  structurally instead — if `#CN1` or `#InputStoreID` is still present, we were
  bounced. A rejection re-renders the form with cleared fields and adds
  `PreValidation` to the body class, often with **no** `.Error` element at all.
- **§2.2 piecemeal entry** requires a visit date/time in the **past** in the
  store's local time. Same-day entries are rejected outright, even at an hour
  that has already passed locally. Default to the previous day.
- **Navigation.** `Promise.all([page.waitForLoadState(...), page.click(...)])`
  resolves immediately — the current document is already loaded — so every check
  after it inspects the *pre-click* page. Use `waitForNavigation`; each step here
  is a full form POST, usually through a 302.
- **Question ids drift.** The live ids no longer match the §2.3 table (OSAT is
  `R001000`, not `R003000`; page 6/7 contents are swapped). As §7.3 predicted,
  ids are content. The parser is structure-driven and unaffected.

---

## 3. Approach & key decisions

### 3.1 Framework — Next.js 15, App Router, TypeScript

Single Next.js app serves both the phone UI and the Playwright-driving API
routes. All API routes are Node-runtime (`export const runtime = 'nodejs'`) —
Playwright, `better-sqlite3` and `child_process` cannot run on the Edge runtime.
Dev server bound to `0.0.0.0` so the phone can reach it at `http://<LAN-IP>:3000`.

*Rejected*: separate Express backend (extra moving part for one user);
Server Actions for the survey calls (long-running multi-minute work is clearer as
explicit JSON routes with a polling status endpoint).

**LAN + camera caveat (important):** `navigator.mediaDevices.getUserMedia` requires
a secure context. `http://<LAN-IP>:3000` is **not** secure, so the live camera
stream will be blocked in mobile Chrome/Safari. Mitigations, in order:
1. Primary capture path is `<input type="file" accept="image/*" capture="environment">`,
   which opens the native camera app and works over plain HTTP. **Build this
   first — it satisfies acceptance criterion 1 on its own.**
2. Progressive enhancement: if `window.isSecureContext && navigator.mediaDevices`,
   offer the in-page `getUserMedia` live preview.
3. Document `next dev --experimental-https` (Next generates a local cert) as the
   opt-in path to get (2) working on the LAN, accepting the cert warning on the phone.

### 3.2 OCR — **system `tesseract` binary** via `child_process`, not `tesseract.js`

Decision: shell out to the `tesseract` CLI (`tesseract-ocr` + `tesseract-ocr-eng`
apt packages).

Rationale: (a) it is 3–10× faster than the WASM build on a full-resolution phone
photo; (b) it exposes the knobs that actually matter here — `--psm` page
segmentation modes and `-c tessedit_char_whitelist=0123456789` — which let us run
a **second, digits-only pass** dedicated to the survey code, the single
highest-value extraction; (c) `tesseract.js` ships ~15 MB of WASM + language data
and pins us to whatever preprocessing it bundles. The environment already requires
system deps for Playwright's Chromium, so "one more apt package" is not a new
class of dependency. Cost: a hard external binary dependency — mitigated by an
`npm run doctor` preflight (Task 2) that checks for `tesseract`, `sharp`, and the
Playwright browser and prints exact install commands.

*Rejected*: `tesseract.js` (slower, less tunable); a cloud OCR API (this is a
local single-user tool; no cloud dependency, no receipt images leaving the LAN).

Preprocessing with **`sharp`** before OCR (this is where most of the accuracy
comes from on thermal paper): grayscale → `rotate()` honouring EXIF → resize so
the long edge is ~2000 px → `normalise()` → `linear()` contrast stretch →
`sharpen()` → `threshold(~140)`. Emit both a full-page variant and a
digits-optimised high-contrast variant.

**Code extraction pipeline** (`lib/ocr/extractCode.ts`):
1. Run pass A: `tesseract img - --psm 6` (full receipt text) → metadata parsing.
2. Run pass B: `tesseract img - --psm 6 -c tessedit_char_whitelist=0123456789 -c classify_bln_numeric_mode=1`
   → digit-dense text for the code.
3. Normalize both texts: uppercase, then apply a confusion map on **digit-context
   only** — `O/o/Q/D→0`, `I/l/|/!→1`, `Z→2`, `S→5`, `G→6`, `T/?→7`, `B→8`, `g/q→9`.
   Strip spaces/hyphens/newlines within candidate runs.
4. Candidate generation, in priority order:
   - text matching the receipt's printed grouping `\d{5}[-\s]?\d{5}[-\s]?\d{5}[-\s]?\d{5}[-\s]?\d{5}[-\s]?\d{1}`
   - a line following a "Survey Code" / "McDVoice" / "survey" anchor line
   - any 26-consecutive-digit run after whitespace stripping
5. Score candidates (grouping match > anchor proximity > bare run) and return
   **the ranked list**, not just the winner — the UI shows the best candidate and
   lets the user pick another or hand-edit.
6. **Always** return `rawText` so the correction UI can show the OCR output
   alongside the receipt photo.

The UI (Task 6) renders the code as **six segmented inputs mirroring the site's
5/5/5/5/5/1 layout**, pre-filled and fully editable, with a client-side guard
that exactly 26 digits are present before the survey can start. Assume OCR will
be wrong sometimes; the correction UI is a first-class feature, not a fallback.

Also parse from pass-A text (best effort, all individually optional):
`store #` (`/(?:store|survey)\s*#?\s*(\d{3,5})/i`, plus the `KS#` register),
date (`/\b(\d{2})\/(\d{2})\/(\d{4})\b/`), time (`/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i`),
order number (`/order\s*#?\s*(\d{1,4})/i`), total
(`/total\s*\$?\s*(\d+\.\d{2})/i` — take the last match, after tax), and line items
(lines matching `/^\s*(\d+)\s+(.{3,40}?)\s+(\d+\.\d{2})\s*$/`).

> Do **not** try to derive store/date/time by slicing the 26-digit code. Popular
> blogs claim a fixed field layout inside the code; that is unverified folklore
> and must not be load-bearing. Parse the printed receipt text instead.

### 3.3 SQLite — `better-sqlite3`, raw SQL, no ORM

Synchronous API (perfect inside route handlers, no async ceremony), zero-config,
single file at `data/survey-snap.db`. Schema applied by an idempotent
`CREATE TABLE IF NOT EXISTS` migration run on module load.

*Rejected*: Prisma (schema/codegen/migration tooling is heavy for 3 tables);
`node:sqlite` (built into Node 24 and dependency-free, but still churning — a fine
substitute if `better-sqlite3`'s native build fails; keep DB access behind
`lib/db.ts` so swapping is a one-file change).

Receipt images stored on disk under `data/uploads/<receiptId>.jpg` with only the
path in SQLite (keeps the DB small and lets the user eyeball files directly).

### 3.4 Playwright — server-side, headless, session registry

`playwright` (not `@playwright/test`) as a runtime dependency; Chromium only
(`npx playwright install chromium`). Launched from API route handlers.
`headless: true` always — the brief mandates no separate visible browser window.
Add `PWDEBUG`-free, deterministic settings: fixed viewport 1280×900, a normal
desktop UA, `locale: 'en-US'`.

Live browser contexts are held in a **module-level registry** keyed by a
`stagingSessionId`:

```ts
// lib/survey/sessionStore.ts
const g = globalThis as any;
g.__surveySnapSessions ??= new Map<string, LiveSession>();
```

Attaching to `globalThis` is required — Next dev HMR re-evaluates modules and
would otherwise silently drop live browsers. Each entry holds
`{ browser, context, page, receiptId, createdAt, transcript, status }` and is
reaped by a `setInterval` sweeper after **15 minutes** (deliberately under the
site's 1200 s / 20 min session timeout, so we never hand the user a session that
has already died server-side). Closing an entry always calls `browser.close()`.

### 3.5 The two-phase flow (the core design decision)

**Constraint discovered on the live site: the survey has no Back button, and each
"Next" click POSTs that page's answers to SMG.** So it is physically impossible
to walk the whole question set, then go back and change an earlier answer within
one session. That rules out "stage everything in one live session, then patch and
submit". The design must account for it explicitly.

**Chosen architecture — hold the session, and re-run only when edits require it:**

*Phase 1 — STAGE* (`POST /api/survey/stage`)
1. Launch Chromium, go to `https://www.mcdvoice.com/`, fill `#CN1..#CN6`, click
   `#NextButton`. Detect the invalid-code failure state (§2.1) and abort early
   with a clear error if it fires — this is the most common real failure and must
   not look like a crash.
2. Loop, up to a hard cap of 40 pages:
   a. **Parse** the page into `StagedQuestion[]` using the §2.3 taxonomy, seeded
      by `#PostedFNS`. Capture a page screenshot (PNG buffer) for the record.
   b. **Suggest** an answer per question via the answer strategy (§3.6).
   c. **Apply** the suggestions to the live DOM (click radios / check boxes).
      Questions with no suggestion are left blank and flagged `needsUser`.
   d. Inspect the submit button. If `value` is still `Next` → click, wait for
      `domcontentloaded`, continue. If `value` is anything else (Submit/Finish/
      Done), **or** the button is gone → this is the terminal page: record it and
      **STOP WITHOUT CLICKING**.
   e. If a required-field error (`.Error` with text, or `.inputErrorBorder`)
      appears after clicking Next, do not loop forever: record the page as
      `blocked`, mark its questions `needsUser`, and stop staging there.
3. Keep the browser open in the registry. Persist the full transcript
   (questions, options, suggestions, page order, per-page screenshots) to SQLite
   and return it. **Nothing has been submitted.**

*Review* — the app renders the transcript. Every answer is editable. Questions
flagged `needsUser` are surfaced at the top with a warning; the Confirm button is
disabled while any **required** question is unanswered.

*Phase 2 — CONFIRM & SUBMIT* (`POST /api/survey/confirm`), gated on a request
body that must carry `{ receiptId, stagingSessionId, confirm: true }` **and** a
server-side check that this receipt has not already been submitted:

- **Fast path — answers unchanged and the live session is still alive
  (`Date.now() - createdAt < 15 min` and `page` not closed):** resume the held
  page and click the terminal Submit button. One click, no code re-entry, no
  risk of the code being rejected. This is why we hold the session.
- **Replay path — the user edited any answer, or the held session expired/died:**
  close the old session, launch a fresh browser, **re-enter the same 26-digit
  code**, and walk the flow again applying the *confirmed* answers keyed by
  question id (with the staged transcript's page order as a hint, but always
  re-parsing the live page — branching means the page sequence can differ once
  answers change). Complete through the terminal Submit.

**Code/session reuse risk — called out explicitly.** The replay path assumes the
26-digit code can be entered a second time after an abandoned survey. Evidence it
can: the site's own timeout dialog says *"your survey will time out and you will
need to start over"*, which only makes sense if re-entry works; and McDonald's
allows up to five surveys per month per restaurant. But this is **not verified for
a code that has been partially walked**, and it is the biggest unknown in the
build. Required mitigations:

1. **Task 9 verifies it empirically with the user's real receipt before the
   replay path is trusted** — stage, abandon, re-enter the same code, confirm it
   is accepted. Do this *before* wiring the UI's confirm button to anything.
2. If re-entry is rejected, the app must surface `CODE_REJECTED_ON_REPLAY` with a
   plain-English message telling the user the code may be consumed, and must
   record the receipt as `error` (never silently as `submitted`).
3. Cap replay attempts at **2 per receipt**, tracked in the DB, so a broken loop
   can never burn the monthly per-restaurant allowance.
4. Encourage the fast path: the UI states that submitting promptly after review
   (within ~15 min) avoids a re-run, and shows a live countdown of the held
   session.

*Rejected alternative — "always redo the whole survey on confirm"*: simpler and
uniform, but it doubles code entries for *every* receipt, maximising exposure to
exactly the reuse risk above. *Rejected alternative — "never hold a session,
stage from a piecemeal dry run"*: the piecemeal path can map generic question
structure but produces a different, store-mismatched branch and still needs the
real code later; not worth the divergence.

### 3.6 Answer strategy

Deterministic, rule-based, in `lib/survey/answerStrategy.ts`. Applied per question:

1. **Factual, receipt-derived** — match the question prompt against a small rule
   table:
   - `/did you visit the mcdonald'?s located at/i` → **Yes**
   - `/was your order accurate/i` → **Yes**
   - `/how did you place your order/i` → prefer the option matching
     `/employee at the restaurant/i` (safest default; user edits if kiosk/app)
   - `/please select your visit type/i` → **no confident default → leave blank,
     `needsUser: true`** (receipt often indicates drive-thru vs dine-in; if the
     OCR text contains `/drive.?thru|drivethru/i` prefer that option, else blank)
   - `/which of the following did you order/i` → check boxes whose label
     case-insensitively overlaps parsed line-item words (e.g. "Fries"/"Burgers,
     Chicken & Fish"); if nothing matches confidently, leave all unchecked and
     flag `needsUser`
   - `/member of mymcdonald'?s rewards/i` → **No** (conservative; avoids the
     Rewards follow-up branch the user can't factually answer)
2. **Negative-polarity detection** — if the prompt matches
   `/problem|issue|complaint|wrong|missing|incorrect|dissatisf|difficult|concern/i`,
   the positive answer is the **negative-sounding** option ("No"). This is
   essential: verified page 10 is *"Did you experience a problem during your
   visit?"* where a naive "always pick option 1 / Yes" is exactly wrong.
3. **Subjective scales** — pick the option whose **label text** scores highest on
   a positive lexicon, ranked:
   `Highly Satisfied > Very Satisfied > Extremely Satisfied` ≈ `Strongly Agree`
   ≈ `Definitely Will > Very Likely > Excellent > Yes`. Match on the
   `th.Scale`/`label` text, **never on the numeric `value`** (verified: the
   5-point scale's most-positive option is `value="5"` while Yes/No's is
   `value="1"`).
4. **Free text / select / anything unrecognised** → leave blank,
   `needsUser: true`, and record the raw prompt + raw outer HTML snippet so the
   review UI can still render something meaningful. **Never guess.** This is the
   brief's resilience requirement: unexpected types degrade to "ask the user",
   never to a wrong guess and never to a crash.

---

## 4. Data / model / API changes

### 4.1 SQLite schema — `lib/db/schema.sql` (applied via `lib/db.ts`)

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS receipts (
  id              TEXT PRIMARY KEY,             -- uuid
  created_at      TEXT NOT NULL,                -- ISO-8601
  updated_at      TEXT NOT NULL,
  image_path      TEXT NOT NULL,                -- data/uploads/<id>.jpg
  ocr_raw_text    TEXT,
  survey_code     TEXT,                         -- 26 digits, user-corrected, no separators
  store_number    TEXT,
  register_number TEXT,
  visit_date      TEXT,                         -- ISO date, best effort
  visit_time      TEXT,                         -- HH:MM, best effort
  order_number    TEXT,
  total_amount    REAL,
  items_json      TEXT,                         -- JSON array [{qty,name,price}]
  status          TEXT NOT NULL DEFAULT 'new',  -- new|staged|submitted|error
  validation_code TEXT,
  submitted_at    TEXT,
  replay_attempts INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_code
  ON receipts(survey_code) WHERE survey_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status, created_at DESC);

CREATE TABLE IF NOT EXISTS survey_runs (
  id           TEXT PRIMARY KEY,
  receipt_id   TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  phase        TEXT NOT NULL,     -- 'stage' | 'confirm'
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  status       TEXT NOT NULL,     -- running|staged|submitted|failed
  page_count   INTEGER,
  transcript_json TEXT,           -- StagedQuestion[] snapshot
  final_page_text TEXT,           -- innerText of the terminal page (validation-code safety net)
  error        TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_receipt ON survey_runs(receipt_id, started_at DESC);

CREATE TABLE IF NOT EXISTS answers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id   TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL,     -- e.g. R028000
  page_index   INTEGER NOT NULL,
  prompt       TEXT NOT NULL,
  input_type   TEXT NOT NULL,     -- radio_grid|radio_list|checkbox|text|select|unknown
  options_json TEXT,              -- [{value,label}]
  suggested    TEXT,              -- JSON: string | string[] | null
  confirmed    TEXT,              -- JSON, set at confirm time
  needs_user   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(receipt_id, question_id)
);
```

The unique index on `survey_code` is what makes acceptance criterion 8 cheap: a
duplicate receipt collides and the UI can immediately show "already redeemed,
validation code was NNNNN".

### 4.2 Shared TypeScript types — `lib/types.ts`

```ts
export type InputType = 'radio_grid' | 'radio_list' | 'checkbox' | 'text' | 'select' | 'unknown';

export interface QuestionOption { value: string; label: string; }

export interface StagedQuestion {
  questionId: string;              // 'R028000'
  pageIndex: number;
  prompt: string;
  groupPrompt?: string;            // legend text for checkbox groups
  inputType: InputType;
  options: QuestionOption[];
  suggested: string | string[] | null;
  needsUser: boolean;
  required: boolean;
  rawHtml?: string;                // for unknown types
}

export interface StageResult {
  stagingSessionId: string;
  receiptId: string;
  pages: number;
  questions: StagedQuestion[];
  terminalButtonLabel: string | null;   // e.g. 'Submit' — null if never reached
  expiresAt: string;                    // ISO; held-session deadline
}
```

### 4.3 API route contracts (all `runtime = 'nodejs'`)

| Route | Method | Request | Response |
|---|---|---|---|
| `/api/receipts` | `POST` | `multipart/form-data` with `image` | `201 { receiptId, imageUrl }` |
| `/api/receipts` | `GET` | — | `200 { receipts: ReceiptSummary[] }` (history, newest first) |
| `/api/receipts/[id]` | `GET` | — | `200 { receipt, questions, latestRun }` |
| `/api/receipts/[id]` | `PATCH` | `{ surveyCode?, storeNumber?, visitDate?, visitTime?, orderNumber?, totalAmount?, items? }` | `200 { receipt }` — user corrections |
| `/api/ocr` | `POST` | `{ receiptId }` | `200 { rawText, codeCandidates: {code,score,source}[], bestCode, metadata: {storeNumber,registerNumber,visitDate,visitTime,orderNumber,totalAmount,items} }` |
| `/api/survey/stage` | `POST` | `{ receiptId }` (code read from DB) | `200 StageResult` / `422 { error:'INVALID_CODE', message }` / `409 { error:'ALREADY_SUBMITTED', validationCode }` / `500 { error:'STAGE_FAILED', message, pageIndex }` |
| `/api/survey/confirm` | `POST` | `{ receiptId, stagingSessionId, confirm: true, answers: Record<questionId, string \| string[]> }` | `200 { validationCode, finalPageText, screenshotUrl, path: 'resume' \| 'replay' }` / `4xx` errors below |
| `/api/survey/status/[runId]` | `GET` | — | `200 { status, pageIndex, message }` — polled by the UI during long runs |

`/api/survey/confirm` **must** hard-reject unless `confirm === true` is present in
the body (return `400 { error: 'CONFIRMATION_REQUIRED' }`), and must reject if
`receipts.status === 'submitted'` (`409 ALREADY_SUBMITTED`). There is no other
code path in the app that clicks a non-"Next" submit button. Error codes:
`CONFIRMATION_REQUIRED`, `ALREADY_SUBMITTED`, `SESSION_EXPIRED` (informational —
triggers replay, not a failure), `CODE_REJECTED_ON_REPLAY`, `REPLAY_LIMIT_REACHED`,
`VALIDATION_CODE_NOT_FOUND` (returns `finalPageText` + screenshot so the user can
read it manually).

Long-running note: staging takes ~30–90 s. Either stream progress or return a
`runId` immediately and poll `/api/survey/status/[runId]`; the polling route is
listed above because it also protects against phone-browser request timeouts.

---

## 5. Step-by-step tasks

Each task is independently verifiable. Commit after each.

### Task 1 — Scaffolding, git, LAN binding
Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`,
`app/layout.tsx`, `app/page.tsx`, `app/globals.css`.
- `npx create-next-app@latest . --ts --app --eslint --no-tailwind --no-src-dir`
  (or hand-write the equivalent; Tailwind optional — plain CSS modules are fine
  and keep the dep list short).
- Scripts: `"dev": "next dev -H 0.0.0.0 -p 3000"`, `"build": "next build"`,
  `"start": "next start -H 0.0.0.0 -p 3000"`, `"lint"`, `"doctor": "tsx scripts/doctor.ts"`,
  `"probe:mcdvoice": "tsx scripts/probe-mcdvoice.ts"`, `"test": "vitest run"`.
- `.gitignore` must include `node_modules`, `.next`, `data/`, `*.db*`,
  `data/uploads/`, `.env*.local` — **receipt images and the DB never get committed.**
- `git init`, add all, initial commit `"chore: scaffold Next.js + TypeScript app"`.
- Verify: `npm run dev`, load `http://<LAN-IP>:3000` from the phone.

### Task 2 — Dependencies + `doctor` preflight
Create: `scripts/doctor.ts`.
- Deps: `better-sqlite3`, `playwright`, `sharp`, `uuid`, `zod`.
  Dev: `typescript`, `@types/node`, `@types/better-sqlite3`, `tsx`, `vitest`.
- `npx playwright install chromium` (and `npx playwright install-deps chromium`
  if system libs are missing).
- System: `sudo apt-get install -y tesseract-ocr tesseract-ocr-eng`.
- `scripts/doctor.ts` checks: `tesseract --version` resolves, Chromium launches
  and closes, `data/` is writable, `better-sqlite3` loads. Prints the exact fix
  command for each failure.
- Verify: `npm run doctor` prints all-green.

### Task 3 — SQLite layer
Create: `lib/db.ts`, `lib/db/schema.sql`, `lib/db/receipts.ts`, `lib/db/runs.ts`,
`lib/db/answers.ts`.
- `lib/db.ts`: open `data/survey-snap.db` (mkdir -p `data/`), exec `schema.sql`,
  cache the handle on `globalThis` (HMR-safe), export typed helpers.
- Verify: `npm test` with a vitest unit test that inserts a receipt, updates
  status, and asserts the unique-code index rejects a duplicate.

### Task 4 — Capture UI + upload
Create: `app/page.tsx` (home = "New receipt" + history list),
`app/capture/page.tsx`, `components/ReceiptCapture.tsx`,
`app/api/receipts/route.ts`.
- `ReceiptCapture`: primary `<input type="file" accept="image/*" capture="environment">`,
  plus the optional `getUserMedia` live-preview branch guarded by
  `window.isSecureContext` (§3.1). Show a preview thumbnail before upload.
- `POST /api/receipts` writes `data/uploads/<uuid>.jpg` (re-encode via `sharp` to
  JPEG q85, max 2400 px long edge) and inserts the row; redirects to
  `/receipt/<id>`.
- Verify: photograph a receipt from the phone → file lands in `data/uploads/`,
  row appears in `receipts`. **Proves acceptance criterion 1.**

### Task 5 — OCR pipeline
Create: `lib/ocr/preprocess.ts`, `lib/ocr/tesseract.ts`, `lib/ocr/extractCode.ts`,
`lib/ocr/extractMetadata.ts`, `app/api/ocr/route.ts`, plus
`lib/ocr/__tests__/extractCode.test.ts`.
- Implement §3.2 exactly: sharp preprocessing, two tesseract passes, confusion-map
  normalisation, ranked candidate generation, metadata regexes.
- Unit tests run against **fixture strings** (paste real OCR output captured from
  the user's receipt into `lib/ocr/__tests__/fixtures/`), not against images —
  keeps `npm test` fast and CI-safe.
- Verify: `npm test`; and hitting `/api/ocr` with a real photo returns a
  26-digit `bestCode`.

### Task 6 — Receipt detail + code correction UI
Create: `app/receipt/[id]/page.tsx`, `components/CodeEditor.tsx`,
`components/ReceiptMetadataForm.tsx`, `app/api/receipts/[id]/route.ts`.
- `CodeEditor`: six inputs (`5,5,5,5,5,1`) mirroring mcdvoice.com, auto-advance on
  fill, paste-a-full-26-digit-string support, backspace-to-previous, `inputMode="numeric"`,
  a "candidates" dropdown from the OCR ranked list, and the receipt photo shown
  side-by-side (zoomable) so the user can read the digits off it.
- Metadata form: store #, date, time, order #, total, items — all editable.
- `PATCH` persists corrections.
- Verify: OCR a photo, deliberately corrupt a digit, fix it in the UI, reload —
  correction persists. **Proves acceptance criteria 2 and 3.**

### Task 7 — mcdvoice page parser (pure functions, unit-tested)
Create: `lib/survey/parsePage.ts`, `lib/survey/answerStrategy.ts`,
`lib/survey/__tests__/parsePage.test.ts` + `fixtures/*.html`.
- `parsePage(html): { questions: StagedQuestion[]; postedFns: string[]; submitLabel: string|null; progress: string|null }`
  implementing the §2.3 taxonomy. Written as a **pure function over an HTML
  string** (use `linkedom` or `cheerio`, or run it in-page via `page.evaluate` and
  keep a DOM-agnostic core) so it can be unit-tested without a browser.
- Save the real HTML captured in Task 9 as fixtures; assert question ids, prompts,
  option labels/values, and types for the grid / vertical-radio / checkbox /
  static-text cases.
- `answerStrategy.ts` implements §3.6; unit-test that
  *"Did you experience a problem during your visit?"* → **No**, and that the
  5-point scale picks the `Highly Satisfied` option by **label** (value `5`), while
  Yes/No picks `Yes` (value `1`).
- Verify: `npm test`.

### Task 8 — Playwright driver + session store
Create: `lib/survey/browser.ts`, `lib/survey/sessionStore.ts`,
`lib/survey/mcdvoice.ts`.
- `mcdvoice.ts` exports:
  - `enterCode(page, code26)` — fills `#CN1..#CN6`, clicks `#NextButton`, throws
    `InvalidCodeError` on the §2.1 failure signature.
  - `readPage(page)` — screenshot + `parsePage` over `page.content()`.
  - `applyAnswers(page, answers)` — clicks radios by `input[name][value]`, checks
    boxes by id; uses `label[for=…]` clicks where the input is `sr-only`
    (**important: all these inputs carry class `sr-only`, so `page.check()` on the
    input may fail visibility — click the associated `label` or use `{force:true}`**).
  - `advance(page)` — clicks `#NextButton`, waits for `domcontentloaded`, detects
    post-click `.Error` / `.inputErrorBorder`.
  - `isTerminalPage(page)` — submit button `value` no longer `"Next"`, or absent.
  - `scrapeValidationCode(page)` — layered strategy from §2.4, returns
    `{ code: string|null, text: string, screenshot: Buffer }`.
  - `enterPieceMeal(page, meta)` — the §2.2 fallback, also used by the probe script.
- `sessionStore.ts` per §3.4 (globalThis Map, 15-min reaper, `browser.close()`).
- Verify: `npm run probe:mcdvoice` (Task 9) exercises all of it.

### Task 9 — **Do this before Tasks 10–12: live reconnaissance script**
Create: `scripts/probe-mcdvoice.ts` (kept in-repo as a debugging tool, not a test).
- Modes:
  - `--piecemeal --store 05678` — walk via the no-code path (safe, uses no real
    receipt), dumping each page's HTML to `tmp/probe/page-NN.html`, plus a
    `summary.json` of parsed questions. **Stop before any non-"Next" button** —
    the script must refuse to click a Submit/Finish button. This regenerates the
    parser fixtures for Task 7.
  - `--code <26 digits> --stage-only` — same walk with the user's real code, still
    stopping before submission.
  - `--code <26 digits> --reuse-check` — enter the code, advance two pages, close
    the browser, then open a fresh browser and enter the **same code** again.
    **This is the empirical test of the code-reuse assumption in §3.5 and must be
    run with the user's real receipt before the replay path is trusted.** Record
    the result in a comment at the top of `lib/survey/mcdvoice.ts`.
- Verify: run `--piecemeal`, confirm the parsed `summary.json` matches the §2.3
  table (question ids `R000060`, `R000455`, `R004000`, `R003000`, `R028000`, …).
  If the DOM has drifted, **fix the parser to match reality and update fixtures**
  before continuing.

### Task 10 — Staging API + status polling
Create: `app/api/survey/stage/route.ts`, `app/api/survey/status/[runId]/route.ts`.
- Implements Phase 1 (§3.5). Inserts a `survey_runs` row (`phase='stage'`), writes
  per-question rows into `answers`, sets `receipts.status='staged'`, returns
  `StageResult`. Updates run status as it advances so the polling route can report
  `"page 6 of ~15"`.
- Hard caps: 40 pages, 3-minute wall clock, then abort and close the browser.
- Verify: `POST /api/survey/stage` with the real receipt id returns a transcript
  covering the §2.3 questions and `receipts.status = 'staged'`, and **no
  validation code exists yet** (nothing was submitted). **Proves acceptance
  criterion 4.**

### Task 11 — Review / edit UI
Create: `app/receipt/[id]/review/page.tsx`, `components/QuestionList.tsx`,
`components/QuestionEditor.tsx`, `components/ConfirmSubmitDialog.tsx`.
- Renders the staged Q&A grouped by page, in order. Each question shows its
  prompt, all options, and the suggested answer preselected — editable inline
  (radio group for single-select, checkbox group for multi, textarea for text).
  `needsUser` questions get a visible "needs your answer" badge and float to a
  summary banner at the top.
- No embedded browser view, no screenshots of the live site surfaced as the
  primary UI — the app renders its own controls, per the brief.
- A countdown showing how long the held session stays warm.
- "Confirm & Submit" is a **two-step** action: button → modal that restates the
  receipt code, store, and answer count, with a checkbox
  *"I have reviewed these answers and want to submit them to McDonald's"* — the
  POST is only issued with `confirm: true` after that checkbox is ticked.
  Disabled while any required question is unanswered, and disabled entirely if
  `receipts.status === 'submitted'`.
- Verify: edit an answer, reload, edit persists. **Proves acceptance criteria 5
  and 6.**

### Task 12 — Confirm/submit API + validation code display
Create: `app/api/survey/confirm/route.ts`, `app/receipt/[id]/result/page.tsx`.
- Implements Phase 2 (§3.5): guard checks → fast path (resume held session, click
  terminal Submit) or replay path (fresh browser, re-enter code, apply confirmed
  answers, submit) → `scrapeValidationCode` → persist
  `receipts.validation_code`, `status='submitted'`, `submitted_at`, and the run's
  `final_page_text` + screenshot to `data/uploads/<runId>-final.png`.
- Result page shows the validation code **large and copyable**, with the final
  page text and screenshot beneath as the manual-read fallback.
- Verify: real end-to-end run with the user's receipt (see §6). **Proves
  acceptance criterion 7.**

### Task 13 — History UI
Create: `components/HistoryList.tsx` (used on `app/page.tsx`),
`app/api/receipts/route.ts` GET branch.
- Newest-first list: thumbnail, date, store #, masked code (`…1234`), status
  pill (new / staged / submitted / error), validation code when submitted.
- Duplicate protection: on `PATCH` of a `survey_code` that already exists on a
  *different* receipt, respond `409` and have the UI link to the existing entry
  with "you already submitted this one — code NNNNN".
- Verify: after a submitted run, the entry shows `submitted` + the validation code
  on the home screen. **Proves acceptance criterion 8.**

### Task 14 — README + final commit
Create: `README.md` — setup (`npm install`, `npx playwright install chromium`,
`apt install tesseract-ocr`), `npm run doctor`, `npm run dev`, how to find the LAN
IP, the camera/HTTPS caveat, and an explicit note that submission always requires
in-app confirmation. Final commit.

---

## 6. Testing & verification

**Commands**

```bash
npm run doctor            # environment preflight (tesseract, chromium, data dir, sqlite)
npm test                  # vitest: OCR extraction, page parser, answer strategy, db
npm run lint
npm run build             # type-check + production build
npm run dev               # LAN dev server on 0.0.0.0:3000
npm run probe:mcdvoice -- --piecemeal --store 05678          # safe live DOM recon
npm run probe:mcdvoice -- --code <26 digits> --stage-only    # real-code staging dry run
npm run probe:mcdvoice -- --code <26 digits> --reuse-check   # code-reuse verification
```

**Unit/automated coverage** (no network): OCR code extraction against captured
OCR-text fixtures including deliberately corrupted variants (`O`→`0`, `l`→`1`,
missing separators); metadata regexes; `parsePage` against the four saved HTML
fixtures; `answerStrategy` polarity and label-based scale selection; DB
constraints.

**Live testing is manual and uses a real receipt the user supplies. Never put a
live mcdvoice.com submission in CI or in `npm test`** — it posts real feedback to
a real restaurant and consumes a real code from a five-per-month allowance.
Structure live testing as:

1. Safe recon first (`--piecemeal`) — costs nothing real.
2. `--stage-only` with the real code — proves code entry + the walk, submits nothing.
3. `--reuse-check` with the real code — proves or disproves the replay assumption.
4. One full end-to-end confirm+submit with the real receipt, with the user
   present, as the acceptance test for criteria 6 and 7.

**Acceptance-criterion → proof map**

| # | Criterion | Proven by |
|---|---|---|
| 1 | Phone camera capture | Task 4 manual check from the phone; file in `data/uploads/`, row in `receipts` |
| 2 | Editable 26-digit code | Task 5 unit tests + Task 6 manual edit/persist check |
| 3 | Store/date/time/items/total shown | Task 5 metadata tests + Task 6 detail page |
| 4 | Playwright enters code and stages answers | Task 10; `--stage-only` probe; transcript matches §2.3 |
| 5 | Staged Q&A in-app and editable | Task 11 manual; confirm no browser window is ever shown (headless: true) |
| 6 | Submit only after explicit confirm | Grep audit: only `app/api/survey/confirm/route.ts` may click a non-"Next" button; route returns `400 CONFIRMATION_REQUIRED` without `confirm:true` — add a unit test asserting that rejection |
| 7 | Validation code captured and displayed | The single live end-to-end run; result page shows the code + screenshot fallback |
| 8 | History shows already-redeemed receipts | Task 13 manual; duplicate-code `409` path |

---

## 7. Risks & watch-outs

1. **OCR accuracy on the 26-digit code is the highest-value risk.** A single wrong
   digit is a dead end on mcdvoice.com. Mitigations are structural, not
   aspirational: the digits-only second tesseract pass, the confusion map,
   *ranked* candidates rather than one answer, and a segmented editor shown next
   to a zoomable photo. **Never auto-start the survey from an unreviewed OCR
   result** — the user must see and accept the code first.
2. **Code/session reuse on mcdvoice.com is unverified.** The site's 20-minute
   session (`sessionTimeout = 1200`) and its "you will need to start over" copy
   suggest re-entry works, but nothing confirms it for a partially-walked code.
   Run Task 9's `--reuse-check` **before** trusting the replay path; cap replays
   at 2 per receipt; surface `CODE_REJECTED_ON_REPLAY` honestly rather than
   marking a receipt submitted. Also respect "five surveys per month per
   restaurant" — do not retry in a loop.
3. **The site will change.** Everything in §2 was captured 2026-07-28 from SMG's
   engine. Selectors like `#CN1..#CN6`, `#surveyForm`, `#NextButton`, `#PostedFNS`,
   `table.Inputtyperbl`, `fieldset.inputtyperblv`, `fieldset.inputtypeopt` are the
   engine's generic markup and are the most stable things to key on; the question
   *ids* (`R028000` …) and prompt wording are content and **will** drift. Build
   the parser to be structure-driven with prompt-regex only as a strategy hint,
   and re-run `npm run probe:mcdvoice -- --piecemeal` as step one of
   implementation to confirm nothing moved.
4. **HARD CONSTRAINT — no submission without explicit per-receipt confirmation.**
   Exactly one code path (`/api/survey/confirm` with `confirm: true` in the body,
   after the modal checkbox) may click a non-"Next" button. The staging walker
   must physically refuse: `advance()` should assert the button `value === 'Next'`
   before clicking and throw otherwise. Do not add a "skip review", "auto-submit",
   "remember my answers and just go", or CLI-submit mode — not behind a flag, not
   behind an env var. The probe script must likewise refuse to submit.
5. **No Back button on the survey.** Any design that assumes you can revisit an
   earlier page is wrong. This is why edits force a replay (§3.5).
6. **Branching flow.** Answers change which pages appear (Rewards → follow-ups;
   "problem?" → problem detail). The replay pass must re-parse every live page
   and match answers by **question id**, never by page index.
7. **`sr-only` inputs.** Every radio/checkbox carries `class="… sr-only"` and is
   visually replaced by its `<label>`. Playwright's `check()`/`click()` on the
   input can fail the visibility check — click `label[for="<id>"]` instead (or
   `{ force: true }`).
8. **Session-timeout dialog.** A jQuery-UI modal appears at 18 minutes and can
   intercept clicks. The 15-minute reaper avoids it, but also handle it
   defensively: if `#sessionTimeoutDialog` is visible, click "Extend Session"
   before proceeding.
9. **Next.js dev-mode module state.** HMR re-evaluates modules and would orphan
   live Chromium processes. Store the session registry and DB handle on
   `globalThis`, and ensure every error path calls `browser.close()` — orphaned
   headless Chromiums will eat the machine's RAM otherwise.
10. **Long requests vs. phone browsers.** Staging takes 30–90 s; mobile browsers
    and proxies can time out. Return a `runId` fast and poll
    `/api/survey/status/[runId]`.
11. **Ordering constraint:** Task 9 (live recon) must precede Tasks 10–12. The
    parser fixtures and the code-reuse answer both come from it, and building the
    staging/confirm routes against §2 without re-verifying risks building on
    stale DOM.
12. **Privacy/hygiene:** receipt images and the SQLite DB stay in `data/` and must
    be gitignored. The app binds to `0.0.0.0` with no auth — that is acceptable
    only on a trusted home LAN; say so in the README rather than adding auth.
13. **Rate/etiquette:** one browser at a time; do not parallelise runs; add a
    small delay between page advances so the walk looks like a human filling a
    form rather than a scraper.

---

## 8. Out of scope (v1)

Restated from the brief so the executor does not over-build:

- **Any other restaurant chain or survey platform** (Qualtrics, Medallia,
  Talk-to-Wendys, etc.). McDVoice / mcdvoice.com only.
- **Any fully-automatic, no-review submission path.** The confirm step is
  mandatory and must not be removable — no flag, no env var, no "expert mode".
- **Multi-user accounts, authentication, or cloud deployment.** Single user, local
  network, no login.
- **Bulk/batch processing** of many receipts at once. One receipt at a time.
- **A generalized "any survey site" form-mapping engine.** The parser is allowed
  to be specific to SMG's mcdvoice.com markup.
- Not required: offline/PWA support, push notifications, receipt-image
  deskew/perspective correction beyond the sharp pipeline, analytics, i18n
  (the site's Spanish path `Index.aspx?LanguageID=es-US` exists — ignore it).
