# Concept Brief: survey-snap (McDVoice receipt-to-survey assistant)

## Problem

The user occasionally eats at McDonald's and gets a receipt with a McDVoice
survey (mcdvoice.com) printed on it. Completing the survey manually — typing
in the 26-digit code, answering the questions, getting the validation code
for the free-item offer — is tedious enough that receipts often get lost or
the survey never gets done, and the reward is missed.

## Goal

A personal, phone-browser web app that:
1. Lets the user snap a photo of a McDonald's receipt with their phone camera.
2. OCRs the receipt to extract the 26-digit McDVoice survey code and other
   receipt metadata (store number, date/time, order items, total).
3. Uses Playwright to walk the actual mcdvoice.com survey and stage suggested
   answers — subjective/opinion questions default to the most positive
   option, factual questions are answered from receipt metadata where
   possible.
4. Shows the staged questions/answers in the app's own UI (no separate
   visible browser window) for the user to review and edit.
5. Only when the user explicitly confirms in-app does Playwright actually
   submit the survey on mcdvoice.com and capture the resulting validation
   code, which is then shown to the user in the app.

This is a **single-user personal tool**. The user reviews and can edit every
answer before anything is submitted to McDonald's — the app assists with
tedious data entry, it does not auto-submit unreviewed responses. Volume is
low (a few receipts a month), so ease of catching "did I already redeem
this one" matters more than raw throughput.

## In scope

- Mobile-browser camera capture of a receipt photo (`getUserMedia`).
- OCR (Tesseract) + regex/parsing tuned specifically to McDonald's receipt
  layout to extract: 26-digit survey code, store number, date/time, order
  items (best effort), total.
- Playwright automation of **mcdvoice.com specifically**:
  - Entering the 26-digit code (split across the site's 5x5+1 digit input
    boxes).
  - Walking the subsequent question pages headlessly to discover the
    question set and stage suggested answers (without submitting).
  - On explicit user confirmation, replaying the confirmed answers into the
    live site and submitting, then scraping the validation code from the
    result page.
- An in-app review/edit UI: shows extracted receipt data, shows staged
  survey Q&A, lets the user edit any answer, has a single "Confirm &
  Submit" action that triggers the real submission.
- A lightweight local history (SQLite): receipt photo, extracted metadata,
  survey status (not started / staged / submitted), validation code, so the
  user doesn't lose or duplicate a receipt.
- Runs as a small Next.js (TypeScript) app the user accesses from their
  phone's browser over the local network.

## Out of scope (v1)

- Any other restaurant chain or survey platform (Qualtrics, Medallia, etc.)
  — McDVoice/mcdvoice.com only.
- Any fully-automatic, no-review submission path. The confirm step is
  mandatory and cannot be disabled.
- Multi-user accounts, auth, or cloud deployment — single user, local
  network use.
- Bulk/batch processing of many receipts at once.
- Generalized "any survey site" form-mapping engine.

## Constraints

- **No unreviewed auto-submission, ever.** This is the core ethical/ToS
  guardrail for this build — Playwright may pre-stage answers but must not
  submit to mcdvoice.com without an explicit user confirmation action in
  this session, per receipt. Do not build a mode that removes this gate.
- mcdvoice.com's actual question set/order isn't fully known ahead of time
  and may change; the survey-walking step must be resilient to encountering
  unexpected question types (fall back to leaving them blank for the user
  to answer, rather than guessing wrong or crashing).
- The 26-digit code entry on mcdvoice.com is split into boxes: 5+5+5+5+5+1
  digits — OCR/parsing needs to produce a clean 26-digit string that the
  code can be sliced into those chunks.
- Phone camera photos of receipts will be imperfect (glare, skew, thermal
  paper fade) — OCR accuracy on the survey code is the single highest-value
  thing to get right, since a wrong digit sends the user down a dead end on
  mcdvoice.com.

## Acceptance criteria

1. From a phone browser, the user can open the app and capture a receipt
   photo via the camera.
2. The app extracts a candidate 26-digit McDVoice code and displays it
   editable/correctable before use (OCR won't be perfect — the user must be
   able to fix digits).
3. The app also extracts store number, date/time, and (best effort) order
   items/total, shown alongside the code.
4. The app uses Playwright to enter the code on mcdvoice.com and walks the
   resulting question flow, staging a suggested answer for each question:
   subjective questions default to the most positive/agreeable option;
   questions answerable from receipt metadata use that data.
5. The staged Q&A is shown in the app's UI (not a separate browser window)
   and every answer is editable before submission.
6. Submission to mcdvoice.com only happens after the user clicks an explicit
   "Confirm & Submit" action in the app.
7. After submission, the app captures and displays the validation code from
   mcdvoice.com's confirmation page, and records the receipt + code in local
   history.
8. A previously-submitted receipt's history entry is visible so the user
   can tell they've already redeemed it.

## Open questions & decisions made

- Review UX: **in-app UI only**, no separate visible Playwright browser
  window (decided).
- Answer strategy for subjective questions: **default to most positive/
  agreeable option**, user edits before submit (decided).
- Tech stack: **Next.js + TypeScript**, Playwright (Node bindings), Tesseract
  OCR, SQLite for local history (decided based on discussion; open for the
  planner to confirm specific libraries, e.g. `tesseract.js` vs a system
  Tesseract binary, `better-sqlite3` vs `prisma`).
- Deployment: local network use from the user's phone browser — the planner
  should account for the dev server being reachable via LAN IP (Next.js
  `-H 0.0.0.0`), not necessarily a public/hosted deployment.
- Unresolved / left to the planner to investigate concretely: the exact
  live question flow and HTML structure of mcdvoice.com's survey pages
  (selectors, question types — rating scales, yes/no, free text, multi-page
  navigation) will need to be discovered by actually driving the site with
  Playwright during implementation, since it wasn't fully mapped during
  discovery. The plan should call this out as the highest-uncertainty part
  of the build and suggest starting there.

## Relevant files/areas

None yet — this is a brand-new, empty project directory
(`/home/eric/projects/survey-snap`, not yet a git repository).

## Repo commands & tree state

- **Working tree**: empty directory, not a git repository. No pre-existing
  files or changes.
- **Build/test/run commands**: none yet — to be established by the plan
  (expected: `npm install`, `npm run dev`, `npm test`/`npx playwright test`,
  Next.js dev server bound to `0.0.0.0` for LAN phone access). The planner
  should specify exact commands as part of project scaffolding.
- Recommend the plan include `git init` and an initial commit as part of
  scaffolding, since the user will likely want this tracked.
