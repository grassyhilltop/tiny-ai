// The failure from room 7NJA, reproduced: the page gets moved to a mirror while the invite
// already in the tutor's chat still names the original relay. Commands arrived and the cursor
// moved, so the session looked alive, but every word the page said went to a topic nobody was
// reading, and the tutor never once saw the screen.
//
//   node bin/probe/relay-stub.mjs 8788 &     # the relay the invite named
//   node bin/probe/relay-stub.mjs 8789 &     # the mirror the page was moved to
//   bin/probe/fixture.sh
//   node bin/probe/cdp.mjs "http://localhost:8785/tiny-ai/" 3000 out.png bin/probe/split-brain.js
//
// A page that only ever listens where it speaks cannot pass this.
(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 240 && typeof window.AITutor === "undefined"; i++) await w(500);
  await w(2000);

  const A = "http://localhost:8788";            // what an older invite names
  const B = "http://localhost:8789";            // where the page ends up
  const r = {};
  const real = window.fetch.bind(window);

  // pretend A is out of quota for PUBLISHING (429), exactly as ntfy.sh answers, while its
  // reads keep working: that asymmetry is what makes this bug so quiet
  window.fetch = function (u, o) {
    const s = String(u);
    if (s.startsWith(A) && o && o.method === "POST")
      return Promise.resolve(new Response('{"code":42908}', { status: 429 }));
    if (s.startsWith("https://ntfy.")) return Promise.resolve(new Response("{}", { status: 200 }));
    return real(u, o);
  };
  // point the page's relay list at the two stubs
  AITutor._internals.setRelays([A, B]);

  AITutor.connect();
  await w(5000);                                 // arm: check the relay, open the streams
  r.publishHost = AITutor._internals.relay();
  r.movedToMirror = r.publishHost === B;
  r.listensOnBoth = AITutor._internals.streamKeys().filter(k => k[0] === "c").length >= 2;

  // the tutor, holding the OLD invite, publishes a command to A
  await real(A + "/" + "tinyai-" + AITutor.room().toLowerCase() + "-c/publish?message=" +
             encodeURIComponent(JSON.stringify({ cmd: "point", target: "dose" })));
  await w(3000);
  r.commandFromOldHostHeard = !!document.querySelector(".ait-badge.ait-live");

  // and now the point of it all: the page must answer where that tutor is actually reading
  await w(4000);
  const seenOnA = await (await real(A + "/tinyai-" + AITutor.room().toLowerCase() + "-s/raw?poll=1&since=9m")).text();
  r.stateReachedTheTutor = /"section"/.test(seenOnA);
  r.adoptedTutorsHost = AITutor._internals.relay() === A;
  // A is barred from publishing, so the page CANNOT answer there. The right behaviour is not
  // to pretend: it must say so and put a fresh invite one click away.
  const bub = document.querySelector(".ait-bubble");
  r.promptedRecopy = !!(bub && /copy the invite again/i.test(bub.textContent) &&
                        bub.querySelector(".ait-act"));

  r.PASS = r.movedToMirror && r.listensOnBoth && r.commandFromOldHostHeard &&
           (r.stateReachedTheTutor || r.promptedRecopy);
  return r;
})()
