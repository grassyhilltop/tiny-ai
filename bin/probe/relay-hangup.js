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
  const RELAY = "http://localhost:8817";
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
  /* Wake the relay's own clock first, exactly as a returning tutor would: under FAST its idle
     window is 2.5 seconds, so a page that reconnects into a still-idle room is hung up again
     before the probe can see it, which looks like a broken resume and is not. */
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
           r.resumesOnClick && r.workerInvite && r.inviteUnderCliff && r.inviteNamesItsAudience;
  return r;
})()
