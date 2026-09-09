/* THE PAGE HAS TO AGREE TO STOP, and this proves it does.

   A Durable Object is billed for the wall-clock time it is resident and an open EventSource
   keeps it resident, so ending a session is the only thing that ends the bill. The relay
   cannot do it alone: EventSource reconnects by itself, so every server-side reap it tried
   was answered a second later by a fresh stream and the room went straight back on the clock.
   The relay now says `ended` on the way out and the page stops. If this probe goes red, a day
   of quota goes with it.

     FAST=1 node bin/probe/worker-do-local.mjs 8817 &
     python3 -m http.server 8783 --directory staging &
     node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/" 9000 out.png bin/probe/relay-hangup.js
*/
(async () => {
  const RELAY = "http://localhost:8907";
  const r = {};
  const wait = ms => new Promise(res => setTimeout(res, ms));
  for (let i = 0; i < 240 && typeof window.AITutor === "undefined"; i++) await wait(500);
  if (typeof window.AITutor === "undefined") return { fatal: "AITutor never loaded" };
  await wait(800);

  const S = () => AITutor.session();
  const keys = () => AITutor._internals.streamKeys();
  const label = () => (document.querySelector("#aitLiveState") || {}).textContent || "";

  AITutor._internals.setRelays([RELAY]);
  AITutor.connect();
  r.room = AITutor.room();
  /* keep the room awake through the handshake, as a tutor that has just been handed the invite
     would. Under FAST the reap is four seconds and a loaded machine can take longer than that to
     open two EventSources, so without this the probe watches its own slowness and calls it a
     failure to connect. */
  for (let i = 0; i < 40 && !(keys().length && S().live); i++) {
    if (i % 6 === 0) fetch(RELAY + "/clear/" + r.room.toLowerCase() + "/" + i).catch(() => {});
    await wait(250);
  }
  r.connected = keys().length > 0 && S().live === true;
  r.notPausedWhileTalking = S().paused === "";
  r.clocksRun = S().open_ms > 0;

  /* the relay's idle window is 2.5s under FAST; give it the keepalive tick plus slack */
  for (let i = 0; i < 40 && !S().paused; i++) await wait(250);
  r.pausedAfterHangup = !!S().paused;
  r.pauseSaysWhy = /no tutor/.test(S().paused || "");
  r.streamsClosed = keys().length === 0;
  r.statusSaysPaused = /paused/.test(label());

  /* THE ONE THAT MATTERS. EventSource retries on its own, and every retry is a resident
     object again; five seconds is a dozen of its retry windows. */
  await wait(5000);
  r.stayedDown = keys().length === 0 && !!S().paused;

  /* and one click brings it back, or the fix is just a way to lose a lesson */
  /* RESUME WITH NOBODY THERE, first and without waking anything. This is the case a person
     actually hits: they come back to a paused room and click, and no tutor has said a word.
     It used to reconnect and re-pause on the next ten-second tick, because startLive only
     stamped the idle clock if it was unset and a resumed room inherits a stale one. Two ticks
     of quiet is the test; the earlier version of this probe pinged the room while resuming and
     so never saw it. */
  const clickedAt = Date.now();
  document.querySelector("#aitLiveState").click();
  for (let i = 0; i < 20 && !(keys().length && S().live); i++) await wait(250);
  r.resumesWithNoTutor = keys().length > 0 && S().live === true;
  /* READ THE PAGE'S CLOCK, DO NOT WAIT FOR ITS ALARM. The obvious version of this waited
     twelve seconds and asserted the room was still up, and it could not fail: under FAST the
     RELAY reaps after four seconds, so the room was always down by then for a reason that has
     nothing to do with the bug, and production's relay window is twenty five minutes anyway.
     The bug is exactly that a resumed session inherits a stale idle clock, and the clock is
     readable, so read it. With the bug this measured 45,947 ms one line after a successful
     resume; the page would then have paused itself on the next ten-second tick.
     No magic threshold: the clock must have been reset AT OR AFTER the click, so it cannot be
     older than the handshake that followed it. A few seconds of reconnect is expected and fine;
     forty six is the bug. */
  const resumed = S(), sinceClick = Date.now() - clickedAt;
  r.resumeQuietMs = resumed.quiet_ms;
  r.resumeSinceClickMs = sinceClick;
  r.resumeResetsTheIdleClock = resumed.quiet_ms <= sinceClick + 500 &&
                               resumed.open_ms <= sinceClick + 500;

  /* now wake the relay's own clock, because under FAST its idle window is four seconds: a page
     that reconnects into a still-idle ROOM is hung up from the far end, which is correct
     behaviour and would mask the page-side check above. */
  await fetch(RELAY + "/clear/" + r.room.toLowerCase() + "/9").catch(() => {});
  r.statusIsClickable = typeof document.querySelector("#aitLiveState").onclick === "function";
  document.querySelector("#aitLiveState").click();
  /* and keep the room awake while it reconnects, exactly as a tutor who has come back would.
     Without this the probe races the relay's own reap: under FAST the room is idle again four
     seconds later, so a slow machine hangs it up mid-handshake and a working resume reads as a
     broken one. That flake cost a run. */
  for (let i = 0; i < 40 && !(keys().length && S().live); i++) {
    if (i % 8 === 0) fetch(RELAY + "/clear/" + r.room.toLowerCase() + "/" + (20 + i)).catch(() => {});
    await wait(250);
  }
  r.afterClick = JSON.stringify({ keys: keys(), s: S(), label: label() });
  r.resumesOnClick = keys().length > 0 && S().paused === "" && S().live === true;

  /* AND WHILE A REAL RELAY IS UP, MEASURE THE INVITE THAT ONLY EXISTS WHEN ONE IS. This does
     not belong to hangups and lives here anyway, because this is the only probe that runs with
     a Worker answering: without one the page falls back to legacyBootstrapInvite, so smoke
     check 11 has been measuring the SHORT invite and passing, while the long one it was written
     to guard went unmeasured and drifted 8 characters over the cliff. A silent pass is worse
     than a failure. Both host and page origin are substituted up to their real lengths, because
     localhost is 17 characters shorter per URL across thirteen URLs and staging is the longest
     page origin we serve. */
  const inv = AITutor.bootstrap();
  const asStaging = inv.split(RELAY).join("https://tiny-ai.joel-sadler.workers.dev")
                       .split(location.origin + "/tiny-ai/").join("https://claybits.xyz/staging/tiny-ai/");
  r.workerInvite = /\/p\//.test(inv);
  r.inviteLen = asStaging.length;
  r.inviteUnderCliff = asStaging.length < 2000;
  /* the bug that put it over: an unattributed "Every reply opens by naming the address it
     answers" was read as an instruction about the TUTOR's reply, and one said the address out
     loud to the student */
  r.inviteNamesItsAudience = /for you, not for me/.test(asStaging) &&
                             /never read an address out loud/.test(asStaging);

  r.PASS = r.connected && r.notPausedWhileTalking && r.pausedAfterHangup && r.pauseSaysWhy &&
           r.streamsClosed && r.statusSaysPaused && r.stayedDown && r.statusIsClickable &&
           r.resumesOnClick && r.resumesWithNoTutor && r.resumeResetsTheIdleClock &&
           r.workerInvite && r.inviteUnderCliff && r.inviteNamesItsAudience;
  return r;
})()
