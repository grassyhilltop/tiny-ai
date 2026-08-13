/* The codon panel morphing between the wired overview and the Python it is equivalent to. Two
   user tests never noticed the panel HAD a Python view, which is why the lab auto-previews the
   morph on load and why it is worth a README clip: the whole claim of the section is that the
   diagram and the code are the same object.

   Driven by posting straight to the iframe, the same message the morph slider sends. The panel
   eases toward whatever value it is given, so this needs a longer settle than the others; encode
   with --loopback so it reads as one slider being dragged and let go. */
(() => {
  const w = ms => new Promise(r => setTimeout(r, ms));

  let top0 = 0;

  window.__frames = 26;
  window.__settle = 420;      // the panel eases to the posted value; do not photograph the ease

  window.__setup = async () => {
    document.getElementById("codoncard").style.display = "block";
    await w(600);
    stopCodonDemo(true);      // the auto-preview would be dragging the same slider
    codonWin.postMessage({ codon: "morph", v: 0 }, "*");
    await w(900);
    /* scrollTop directly, and remember the offset so every frame can re-assert it. The page sets
       scroll-behavior:smooth, so scrollIntoView animates and the rectangle gets measured
       mid-flight; and captureScreenshot's clip is in DOCUMENT coordinates while the visible
       region is still only the viewport, so a frame captured at the wrong scroll comes back
       blank rather than wrong. */
    const de = document.documentElement;
    de.style.scrollBehavior = "auto";
    top0 = de.scrollTop + document.getElementById("codoncard").getBoundingClientRect().top - 8;
    de.scrollTop = top0;
    await w(600);
    window.__clip = { sel: "#codoncard" };
  };

  window.__tick = async (i, n) => {
    document.documentElement.scrollTop = top0;   // an in-flight smooth scroll would slide the frame
    codonWin.postMessage({ codon: "morph", v: i / (n - 1) }, "*");
  };
})();
