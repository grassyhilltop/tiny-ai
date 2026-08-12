# What the lab records, and where it goes

Nothing is recorded until the reader does something that is itself a report: answering a survey
item, saving the one-sentence answer, passing the tiny test, or sending feedback. There is no
mouse tracking, no keystrokes, and no identity beyond a random per-browser id.

## Every event carries

| field | what it is |
|---|---|
| `event` | `survey`, `knowledge_check`, `completed`, `feedback` |
| `user` | random per-browser id (`gl_uid`), e.g. `u_k3f9a1x2z8`. Joins one person's events together; tells you nothing about who they are. |
| `build` | the deploying commit's short SHA, stamped by the Pages workflow |
| `url` | the exact page, so staging and live never get mixed up |
| `ref` | referrer, or `(direct)` |
| `seq`, `sessionSec` | order and seconds since page load |
| `telemetry` | per section: `bestStars`, `secTo4`, `secTo5`, `secOnSection` |
| `survey` | every answer given so far |

The number that matters most is `completed.secToComplete` — seconds from page load to passing the
tiny test. `telemetry.step4_twoBends.secTo5` is the runner-up: how long the hardest fit took.

## Two things that were losing data, now fixed

1. **Completion only reported on a browser's *first* ever finish.** It was gated on
   `localStorage.gl_done`, so a tester who had opened the lab before could finish the entire thing
   and generate nothing. It always reports now and carries `firstTime` so repeats can be filtered
   on the way in rather than silently dropped.
2. **Every event used the same email subject**, so a mail client threaded a whole session into one
   message and it looked like only the first thing arrived. Each event now has its own subject
   with a timestamp.

## Where it goes

- **`FEEDBACK.ENDPOINT`** — FormSubmit, addressed by activation token. Verified delivering: a POST
  of the page's own shape returns `200 {"success":"true"}`.
- **`FEEDBACK.LOG_ENDPOINT`** — optional second sink that appends a row instead of sending mail.
  Null by default.
- **The device itself** — every event is also written to `localStorage.gl_log` (capped at 200,
  oldest dropped) *before* the network is touched, so a failed POST is a delayed report rather
  than a lost one. ⚙ → **Download the log (.csv)** exports it.

**Email is a poor primary store.** It threads, it filters, and you cannot sort it. Set up the
Sheet below and treat mail as the notification, not the record.

## Turning a Google Sheet into `LOG_ENDPOINT`

1. New Google Sheet. **Extensions → Apps Script.** Paste:

**Add the token check.** The `/exec` URL is a public write endpoint and it is visible in this
repo, so anyone who reads it can POST. They cannot read the sheet and they cannot touch the
account — `doPost` only appends — but they can add junk rows. This check makes that require
guessing a token too. The token also sits in the page's JavaScript, so it stops drive-by noise,
not a determined person; rotating it is a redeploy plus one string.

This version does three jobs the first one did not: it **emails you on every event** (so the
inbox works even if FormSubmit was never activated — that is now the optional extra, not the
primary path), it carries the **`name`, `tester` and `debug`** columns the lab sends, and it
exposes a **read endpoint (`doGet`)** so a summary can be pulled back out with the token.

```javascript
var TOKEN  = 'tiny-ai-2026';         // must match FEEDBACK.LOG_TOKEN in the lab
var MAIL_TO = 'joel@claybits.xyz';   // where the notification emails go
var COLS = ['at','event','user','name','tester','debug','build','url','sessionSec',
            'secToComplete','score','bucket','sentence','telemetry','survey','raw'];

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var d = JSON.parse(e.postData.contents);
  if (d.token !== TOKEN) return ContentService.createTextOutput('nope');
  if (sheet.getLastRow() === 0) sheet.appendRow(COLS);
  sheet.appendRow([d.at, d.event, d.user, d.name || '', d.tester || '', d.debug ? 'debug' : '',
                   d.build, d.url, d.sessionSec,
                   d.secToComplete || '', d.score === 0 ? 0 : (d.score || ''), d.bucket || '',
                   d.sentence || d.comment || '',
                   JSON.stringify(d.telemetry || {}), JSON.stringify(d.survey || {}),
                   JSON.stringify(d)]);
  // Email on the events worth reading in real time. Wrapped so a mail hiccup never loses the row.
  try {
    if (!d.backfill && (d.event === 'completed' || d.event === 'feedback' || d.event === 'knowledge_check')) {
      MailApp.sendEmail(MAIL_TO,
        '[tiny-ai]' + (d.debug ? '[DEBUG]' : '') + ' ' + d.event + (d.name ? ' · ' + d.name : ''),
        Object.keys(d).map(function(k){ return k + ': ' + JSON.stringify(d[k]); }).join('\n'));
    }
  } catch (err) {}
  return ContentService.createTextOutput('ok');
}

// Read the sheet back as JSON: GET .../exec?token=tiny-ai-2026  (omit debug rows with &live=1)
function doGet(e) {
  if (!e || e.parameter.token !== TOKEN) return ContentService.createTextOutput('nope');
  var rows = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getDataRange().getValues();
  var head = rows.shift() || [];
  var out = rows.map(function(r){ var o = {}; head.forEach(function(h,i){ o[h] = r[i]; }); return o; });
  if (e.parameter.live) out = out.filter(function(o){ return o.debug !== 'debug'; });
  return ContentService.createTextOutput(JSON.stringify(out))
                       .setMimeType(ContentService.MimeType.JSON);
}
```

2. **Deploy → New deployment → Web app.** Execute as **Me**; who has access **Anyone**.
   (Re-deploying an existing script: **Deploy → Manage deployments → edit → Version: New**, so the
   `/exec` URL stays the same and you do not have to touch the lab.)
3. Copy the `/exec` URL into `FEEDBACK.LOG_ENDPOINT` in `staging/tiny-ai/index.html` (already set).
   The very first save asks you to authorise `MailApp` — approve it once, past the "unverified"
   banner (it is your own script emailing your own address).

**The transport bug that lost two users' data (fixed 2026-08).** The page used to POST with
`Content-Type: application/json`, which makes the browser send a CORS **preflight** (`OPTIONS`)
first. Apps Script's `/exec` never answers a preflight, so the browser blocked the real POST
before it left — the row never landed, and with FormSubmit unactivated there was no email either,
so **Send showed "could not reach the inbox."** The fix in `feedbackSend`: send the log sink as a
*simple* request — `mode:"no-cors"` with `Content-Type:"text/plain"` and no custom headers — so
there is no preflight. `doPost` still `JSON.parse`s the body identically. no-cors means the reply
is opaque (we cannot read "ok"), so a resolved fetch — no network error — is the success signal,
and the local `gl_log` remains the backstop.


## Is the "Google hasn't verified this app" warning a problem?

No. It appears because the script asks for permission to touch your own Sheets, and Google shows
that banner for any Apps Script that has not been through its formal verification review — which
only matters for apps asking *other people* for access to *their* data. Here you are the developer
and the only person granting anything, and the only thing you granted is your own spreadsheet.

What "Anyone" access does mean: **the `/exec` URL is a public write endpoint.** Anyone who has it
can POST to it. They cannot read the sheet, cannot list your files, and cannot reach your account —
`doPost` only appends a row. The realistic worst case is junk rows, which is why the token check
above is worth the two lines. To rotate: change `TOKEN`, redeploy, update `LOG_TOKEN` in the lab.

**Should the URL be in the repo?** It is a write-only endpoint with no read path, so publishing it
is closer to publishing a mailbox address than a password. If that still feels wrong, the
alternative is a tiny proxy that keeps the URL server-side — but that means running a server, which
is the thing this whole setup exists to avoid.

## Seeding the manual user tests

The first four sessions (Aug 7–11) were hand-recorded, some before the instrumentation existed,
so they are back-filled rather than captured. **Names are deliberately NOT in this repo.** The
seed rows are pushed once from a browser console snippet (kept out of version control) that POSTs
to `LOG_ENDPOINT` with `build:"backfill"` and `debug` blank, so they read as real completions but
are obviously back-dated. Summary (n=4, a direction, not a rate):

| user # | time to tiny test | AI experience | confidence pre → post | NPS | build |
|---|---|---|---|---|---|
| 1 | 4:02 (242s) | ~2 (manual) | — (pre-instrumentation) | 8 | staging |
| 2 | 22:49 (1369s) | 4 | 7 → 7 | 10 | main |
| 3 | 15:58 (958s) | 1 | 1 → 1 | 7 | main |
| 4 | 11:15 (675s) | 7 | 5 → 5 | 10 | main |

All four completed → completion 4/4. The striking pattern is **zero confidence movement** across
all three measured sessions — read that against the response-shift caveat in
`staging/tiny-ai/SURVEY.md` before concluding the lab does not move self-efficacy.

## A dashboard tab

**Insert → Sheet**, name it `Dashboard`, and paste these into the cells shown. They read from the
data tab (rename `Sheet1` below if yours differs).

| cell | formula | shows |
|---|---|---|
| `A1` | `="Completions: "&COUNTIF(Sheet1!B:B,"completed")` | how many finished |
| `A2` | `="Unique users: "&COUNTA(UNIQUE(FILTER(Sheet1!C:C,Sheet1!C:C<>"",Sheet1!C:C<>"user")))` | people, not events |
| `A3` | `="Completion rate: "&TEXT(COUNTIF(Sheet1!B:B,"completed")/MAX(1,COUNTA(UNIQUE(FILTER(Sheet1!C:C,Sheet1!C:C<>"",Sheet1!C:C<>"user")))),"0%")` | the headline |
| `A4` | `="Median time to complete: "&TEXT(MEDIAN(FILTER(Sheet1!G:G,Sheet1!B:B="completed"))/60,"0.0")&" min"` | median, not mean — n is small and one slow session skews a mean badly |
| `A6` | `="NPS n="&COUNTA(FILTER(Sheet1!H:H,Sheet1!B:B="feedback"))` | the n that must sit next to any NPS |
| `A7` | `=AVERAGE(FILTER(Sheet1!H:H,Sheet1!B:B="feedback"))` | mean score |

Then **Insert → Chart** three times, over these ranges:

1. **NPS distribution** — column chart of `FILTER(Sheet1!H:H, Sheet1!B:B="feedback")`, bucketed
   0–10. Put the n in the title; an NPS from two people is an anecdote with a decimal point.
2. **Time to complete** — column chart of `FILTER(Sheet1!G:G, Sheet1!B:B="completed")/60`,
   one bar per user.
3. **Confidence pre → post** — two columns per user from the `survey` rows. Read the shift with
   the response-shift caveat in `staging/tiny-ai/SURVEY.md` in hand: User 2 went 7 → 7, which is
   not "no learning", it is a novice who already rated themselves high and then found out what the
   task actually involved.
