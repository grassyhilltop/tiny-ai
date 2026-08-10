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

```javascript
var TOKEN = 'tiny-ai-2026';   // must match FEEDBACK.LOG_TOKEN in the lab

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var d = JSON.parse(e.postData.contents);
  if (d.token !== TOKEN) return ContentService.createTextOutput('nope');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['at','event','user','build','url','sessionSec',
                     'secToComplete','score','sentence','telemetry','survey','raw']);
  }
  sheet.appendRow([d.at, d.event, d.user, d.build, d.url, d.sessionSec,
                   d.secToComplete || '', d.score === 0 ? 0 : (d.score || ''),
                   d.sentence || d.comment || '',
                   JSON.stringify(d.telemetry || {}), JSON.stringify(d.survey || {}),
                   JSON.stringify(d)]);
  return ContentService.createTextOutput('ok');
}
```

2. **Deploy → New deployment → Web app.** Execute as **Me**; who has access **Anyone**.
3. Copy the `/exec` URL into `FEEDBACK.LOG_ENDPOINT` in `staging/tiny-ai/index.html`.

Apps Script does not send CORS headers, so the browser reports the POST as failed even when the
row lands. That is why `feedbackSend` treats *any* sink succeeding as success and never surfaces
an error to the reader — and why the local log exists as the backstop.


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

## Seeding the two tests we already ran

`docs/seed-rows-user-tests.csv` holds what is known about User 1 (**PaulS**) and User 2
(**BladeO**). Paste it below the header row in the sheet. Both predate the instrumentation, so the
numbers are hand-recorded from the sessions rather than captured — the `build` column says
`pre-instrumentation` so they never get mistaken for real events.

| | PaulS | BladeO |
|---|---|---|
| reached the tiny test | 4:04 (244s) | 22:49 (1369s) |
| NPS | 8 | 10 |
| confidence pre → post | — | 7 → 7 |

Both completed, so completion is 2/2. Treat n=2 as a direction, not a rate.

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
   the response-shift caveat in `staging/tiny-ai/SURVEY.md` in hand: BladeO went 7 → 7, which is
   not "no learning", it is a novice who already rated themselves high and then found out what the
   task actually involved.
