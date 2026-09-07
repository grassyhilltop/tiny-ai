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
  for (let i = 0; i < 40 && !(keys().length && S().live); i++) await wait(250);
  r.room = AITutor.room();
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
  for (let i = 0; i < 40 && !(keys().length && S().live); i++) await wait(250);
  r.afterClick = JSON.stringify({ keys: keys(), s: S(), label: label() });
  r.resumesOnClick = keys().length > 0 && S().paused === "" && S().live === true;

  r.PASS = r.connected && r.notPausedWhileTalking && r.pausedAfterHangup && r.pauseSaysWhy &&
           r.streamsClosed && r.statusSaysPaused && r.stayedDown && r.statusIsClickable &&
           r.resumesOnClick;
  return r;
})()
