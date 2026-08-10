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

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var d = JSON.parse(e.postData.contents);
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
