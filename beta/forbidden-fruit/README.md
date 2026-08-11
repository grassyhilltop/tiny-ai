# Forbidden Fruit — the fruit-filter exercise

`grader.py` is the exercise; read its docstring first. This note exists only to say what
`testset.b64` is, because an encoded file sitting on its own is easy to misread.

## Running it

Write `allow(text) -> bool` in `solution.py` — you create that file, it is not checked in,
so `grader.py` fails to import until it exists — then:

    python3 grader.py

Scoring: 2 points against you for every fruit mention let through, 1 for every innocent
sentence blocked. Five stars is a clean sweep.

## What `testset.b64` is

16 short English sentences as JSON, each tagged `{"text": ..., "fruit": true|false}`:
8 that mention fruit and 8 that do not, most of the latter chosen because they look like
they do — "Apple Inc.", "the Grapefruit League", "kiwi the bird". `grader.py` decodes the
file and scores your `allow()` against it.

Base64 is spoiler protection, not secrecy: plain JSON sitting in the folder would let you
read the answers by accident while looking around. Decoding it is fine and spoils only
your own score.

    base64 -d < testset.b64

Use the redirect. `base64 -d testset.b64` — the positional-filename form — errors on
macOS/BSD base64.
