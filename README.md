# survey-snap

A single-user, local-network web app for turning a photo of a McDonald's receipt
into a completed [mcdvoice.com](https://www.mcdvoice.com/) survey — without
typing 26 digits or tapping through ~18 pages.

You open it from your phone on your home Wi-Fi, photograph the receipt, check the
OCR'd survey code, review the answers it drafted, and then — only after you
explicitly confirm — it submits the survey and shows you the validation code.

**Nothing is ever sent to McDonald's without you ticking a confirmation box for
that specific receipt.** See [Safety](#safety) below; this is the app's central
design constraint, not a nicety.

---

## Setup

Requires **Node 20+** and a Linux/macOS host.

```bash
npm install
npx playwright install chromium        # headless browser that drives the survey
sudo apt-get install -y tesseract-ocr tesseract-ocr-eng   # OCR engine
npm run doctor                         # verify everything above
```

`npm run doctor` checks the tesseract binary and its English language data,
`sharp`, a headless Chromium launch, `better-sqlite3`, and that `data/` is
writable — and prints the exact fix command for anything missing. Get it
all-green before going further.

### Installing tesseract without sudo

If you don't have root, install it into your home directory:

```bash
mkdir -p ~/deb && cd ~/deb
apt-get install --print-uris -y tesseract-ocr tesseract-ocr-eng \
  | grep -oP "^'\K[^']+" > uris.txt
while read u; do wget -q "$u"; done < uris.txt

PREFIX=$HOME/.local/opt/tesseract
mkdir -p $PREFIX
for d in *.deb; do dpkg-deb -x "$d" $PREFIX; done

cat > $HOME/.local/bin/tesseract <<'EOF'
#!/bin/sh
PREFIX="$HOME/.local/opt/tesseract"
export LD_LIBRARY_PATH="$PREFIX/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"
export TESSDATA_PREFIX="${TESSDATA_PREFIX:-$PREFIX/usr/share/tesseract-ocr/5/tessdata}"
exec "$PREFIX/usr/bin/tesseract" "$@"
EOF
chmod +x $HOME/.local/bin/tesseract
```

Make sure `~/.local/bin` is on your `PATH`. Alternatively, point the app at any
tesseract binary with `TESSERACT_BIN=/path/to/tesseract`.

---

## Running

```bash
npm run dev        # http://0.0.0.0:3000
```

Find your LAN IP and open it from your phone:

```bash
hostname -I | awk '{print $1}'      # e.g. 192.168.1.42
# then browse to http://192.168.1.42:3000
```

If port 3000 is already taken, `npm run dev -- -p 3100` works the same way.

### Camera over plain HTTP

`http://<LAN-IP>:3000` is not a secure context, so browsers block the in-page
live camera (`getUserMedia`). This is expected and handled: the primary capture
button uses `<input type="file" capture="environment">`, which opens your
phone's own camera app and works fine over plain HTTP.

If you want the in-page live preview, run the dev server over HTTPS:

```bash
npx next dev --experimental-https -H 0.0.0.0
```

and accept the self-signed certificate warning on the phone.

---

## Using it

1. **Snap** — photograph the receipt, flat and well lit.
2. **Check the code** — OCR fills six segmented boxes mirroring the site's
   5-5-5-5-5-1 layout. Compare them against the photo shown alongside. A single
   wrong digit is rejected by mcdvoice.com, so this step matters. Pick a
   different OCR candidate from the dropdown, or type over any box.
3. **Stage** — a headless browser enters the code and walks the survey, drafting
   an answer for each question. It stops at the final page **without submitting**.
   Takes 30–90 seconds.
4. **Review** — every question is shown with its options and the drafted answer,
   fully editable. Anything the app wasn't confident about is flagged and floated
   to a banner at the top. Edits save as you go.
5. **Confirm & Submit** — opens a dialog restating the code, store and answer
   count, with a checkbox you must tick. Only then is the survey submitted.
6. **Validation code** — shown large and copyable, with the final page's text and
   a screenshot beneath as a manual-read fallback.

The home screen lists every receipt with its status (`new` / `staged` /
`submitted` / `error`), so you can see at a glance which ones are already
redeemed. Re-entering a survey code that's already in your history is rejected
with a link to the existing entry.

### How answers are drafted

- **Factual** questions come from the receipt (you visited this store: yes; order
  accurate: yes).
- **Subjective** scales get the most positive option, chosen by reading the
  option's *label text* — never its numeric value, which is inconsistent across
  question types.
- **Negative-polarity** questions are inverted correctly: "Did you experience a
  problem during your visit?" is answered **No**.
- **Anything unrecognised** — free text, dropdowns, unknown widgets — is left
  **blank** and flagged for you. The app never guesses.

---

## Safety

This app drives a real survey on a real restaurant's behalf and consumes a real
validation code, so submission is deliberately hard to reach by accident.

- Exactly one code path can submit: `POST /api/survey/confirm`, and only when the
  request body carries `confirm: true`. That flag is set in exactly one place in
  the UI, after you tick the confirmation checkbox.
- The staging walk **cannot** submit. mcdvoice.com's final question page looks
  identical to every other page — its button still reads "Next" — so the walk
  keys on `#ProgressPercentage` reaching 100% and refuses to click there. Two
  independent guards enforce this.
- Replays are capped at 2 per receipt, so a fault can't burn the
  five-surveys-per-month-per-restaurant allowance.
- If a code is rejected when re-entered, the receipt is recorded as `error` —
  never silently as `submitted`.

There is deliberately **no** "auto mode", skip-review flag, or environment
variable that bypasses confirmation. Please don't add one.

### Privacy

The app itself binds to `0.0.0.0` with **no authentication built in** — that's
only acceptable as-is on a trusted home LAN. Public access (see below) is
gated externally by Cloudflare Access, not by the app. Receipt photos and the
SQLite database live in `data/`, which is gitignored and never leaves the
machine (or the container's bind-mounted volume). OCR runs locally; no image
is sent to any cloud service.

---

## Deployment (lab)

Packaged as a multi-stage Docker image following the lab's standard
conventions (`Dockerfile`, `docker-compose.yml`):

```bash
docker compose up -d --build
docker compose logs --tail=30 app
```

Runs on `127.0.0.1:8800` (host-only — the container never binds a public
interface directly). `./data` is bind-mounted to `/app/data` for the SQLite DB
and receipt uploads, so they persist across rebuilds.

Public access is at **https://ss.mooseflip.com**, via the shared lab Cloudflare
Tunnel and gated by **Cloudflare Access**, restricted to `ericfaris@gmail.com`
only (same shape as the other lab apps — self-hosted Access application, email
policy, 730h session). This tunnel is *remotely managed*: routing lives in
Cloudflare's cloud config, not the local `cloudflared` `config.yml` — update it
via the Cloudflare API (`cfd_tunnel/{id}/configurations`), not by editing the
YAML file, or the change silently won't take effect.

The Dockerfile installs `tesseract-ocr`, rebuilds `better-sqlite3`'s native
binding, and installs Playwright's Chromium with `--with-deps`, then purges
the C/C++ build toolchain to keep the runtime image lean. Runs as uid 1000
(matches the host user via the bind mount), not root.

---

## Development

```bash
npm test          # 120 unit tests — OCR, parser, answer strategy, DB, submit guards
npm run lint
npm run build     # type-check + production build
npm run doctor    # environment preflight
```

Tests never touch the network.

### Live reconnaissance

`scripts/probe-mcdvoice.ts` walks the real site to re-verify its DOM:

```bash
npm run probe:mcdvoice -- --piecemeal --store 05678
```

The `--piecemeal` mode uses the site's "no 26-digit code" path, so it consumes no
receipt code. **It does still file a real survey response for that restaurant**,
so treat it as costly, not as a free dry run. It dumps each page's HTML and a
screenshot to `tmp/probe/` plus a `summary.json`, and asserts on exit that it
never reached the Thank-You page.

Two further modes need a real receipt and are for you to run, not automation:

```bash
npm run probe:mcdvoice -- --code <26 digits> --stage-only    # walk with a real code
npm run probe:mcdvoice -- --code <26 digits> --reuse-check   # test code re-entry
```

`--reuse-check` answers the one open question in the design: whether a code can
be re-entered after a survey is started and abandoned. The replay path assumes it
can. Record the result at the top of `lib/survey/mcdvoice.ts`.

### Layout

```
app/                Next.js App Router — pages and API routes
  api/receipts/     upload, list, detail, metadata + answer edits
  api/ocr/          OCR a stored receipt photo
  api/survey/       stage, confirm (the only submit path), status polling
components/         React UI
lib/
  ocr/              sharp preprocessing, tesseract passes, code + metadata extraction
  survey/           page parser, answer strategy, Playwright driver, session store
  db/               SQLite schema and typed helpers
scripts/            doctor.ts, probe-mcdvoice.ts
data/               receipt images + SQLite DB (gitignored)
```

The plan this was built from is in `.claude/plans/mcdvoice-plan.md`. Its §2.5
records where the live site turned out to differ from the original
reconnaissance — read that before changing anything in `lib/survey/`.
