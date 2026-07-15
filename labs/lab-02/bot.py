"""
bot.py - Safety-aware name generator.

YOUR JOB
========
The bot below already loads the trained microgpt weights and answers
letter-prefix requests by running one forward pass per prefix. Your task
is to implement two small safety hooks so the bot refuses unsafe requests
and filters unsafe outputs.

The "unsafe" content for this lab is FRUIT NAMES: the product policy is that
this name generator must never emit a fruit. So "apple" is banned, as are
"pear", "plum", "fig", "lime", "grape", "mango", and friends. Your hooks must
refuse prefixes that lead to fruit names and filter generated names that
contain a banned fruit substring.

    is_safe_request(prefixes) -> Optional[str]
    is_safe_name(name)        -> bool

Everything else is given. You should not need to touch the forward pass
or the request handler. Stick to the I/O protocol below or the autograder
won't be able to read your answers.


I/O PROTOCOL
============
Read one request per line from stdin until EOF.
Write one response per line to stdout. Use stderr for any debug prints.

Each request is one or more whitespace-separated letter prefixes:
    j           one prefix, one name starting with "j"
    ab          one prefix, one name starting with "ab"
    a b c       three prefixes, one name per prefix
    "" (blank)  no prefixes, generate one name from BOS

Response format (exactly one line per request):
    OK: <name>, <name>, ...        one name per prefix, in order, comma-separated
    REFUSE: <one-sentence reason>  request blocked by your safety policy

The autograder reads line by line and matches the prefix. Anything else
on stdout will break grading.


MODEL.JSON STRUCTURE
====================
The trained weights live in `model.json` next to this file. Top-level keys:

    "format"      : "tiny-gpt-char-v1"
    "config"      : architecture sizes (see below)
    "tokenizer"   : character-level vocab (a-z plus BOS at id 26)
    "state_dict"  : every weight matrix, as nested lists of floats

config:
    n_layer = 1, n_embd = 16, n_head = 4, head_dim = 4,
    block_size = 16, vocab_size = 27, BOS = 26

tokenizer:
    type   : "character"
    uchars : ["a", "b", ..., "z"]
    stoi   : {"a": 0, ..., "z": 25}
    itos   : {"0": "a", ..., "25": "z"}

state_dict (each value is a nested list of floats):
    wte              (27 x 16)
    wpe              (16 x 16)
    lm_head          (27 x 16)
    layer0.attn_wq   (16 x 16)
    layer0.attn_wk   (16 x 16)
    layer0.attn_wv   (16 x 16)
    layer0.attn_wo   (16 x 16)
    layer0.mlp_fc1   (64 x 16)
    layer0.mlp_fc2   (16 x 64)

RUNNING LOCALLY
===============
    echo 'j'      | python bot.py
    echo 'a b c'  | python bot.py
    python bot.py            # interactive - Ctrl-D to exit

No external dependencies - only Python stdlib (json, math, random, sys).
"""

import json
import math
import os
import random
import sys
from typing import List, Optional


# ===========================================================================
# Load model
# ===========================================================================
HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "model.json")) as _f:
    MODEL = json.load(_f)

CFG  = MODEL["config"]
SD   = MODEL["state_dict"]
ITOS = MODEL["tokenizer"]["itos"]
STOI = MODEL["tokenizer"]["stoi"]
BOS  = CFG["BOS"]

DEFAULT_TEMP = 0.7


# ===========================================================================
# Forward pass - given. You should NOT need to change anything in this section.
# ===========================================================================
def rmsnorm(x, eps=1e-5):
    total = 0.0
    for v in x:
        total = total + v * v
    ms = total / len(x)
    s = 1 / math.sqrt(ms + eps)
    out = []
    for v in x:
        out.append(v * s)
    return out


def matvec(M, x):
    out = []
    for row in M:
        total = 0.0
        for j in range(len(x)):
            total = total + row[j] * x[j]
        out.append(total)
    return out


def vec_add(a, b):
    out = []
    for u, v in zip(a, b):
        out.append(u + v)
    return out


def softmax(s, t=1.0):
    scaled = []
    for v in s:
        scaled.append(v / t)
    m = max(scaled)
    exps = []
    for v in scaled:
        exps.append(math.exp(v - m))
    Z = sum(exps)
    probs = []
    for e in exps:
        probs.append(e / Z)
    return probs


def sample_idx(probs):
    r = random.random()
    c = 0
    for i, p in enumerate(probs):
        c += p
        if r < c:
            return i
    return len(probs) - 1


def forward(token_id, pos_id, keys, values):
    """One forward pass. Mutates `keys` and `values` to grow the KV cache.
    Returns logits over the vocab."""
    x = vec_add(SD["wte"][token_id], SD["wpe"][pos_id])
    x = rmsnorm(x)
    for li in range(CFG["n_layer"]):
        # Attention
        x_res = x
        xn = rmsnorm(x)
        q = matvec(SD[f"layer{li}.attn_wq"], xn)
        k = matvec(SD[f"layer{li}.attn_wk"], xn)
        v = matvec(SD[f"layer{li}.attn_wv"], xn)
        keys[li].append(k)
        values[li].append(v)
        x_attn = [0.0] * CFG["n_embd"]
        sqrt_dh = math.sqrt(CFG["head_dim"])
        for h in range(CFG["n_head"]):
            hs = h * CFG["head_dim"]
            logits = []
            for kt in keys[li]:
                dot = 0.0
                for j in range(CFG["head_dim"]):
                    dot = dot + q[hs + j] * kt[hs + j]
                logits.append(dot / sqrt_dh)
            mx = max(logits)
            exps = []
            for L in logits:
                exps.append(math.exp(L - mx))
            Z = sum(exps)
            w = []
            for e in exps:
                w.append(e / Z)
            for t, vt in enumerate(values[li]):
                for j in range(CFG["head_dim"]):
                    x_attn[hs + j] += w[t] * vt[hs + j]
        x = vec_add(matvec(SD[f"layer{li}.attn_wo"], x_attn), x_res)
        # MLP
        x_res_mlp = x
        xm = rmsnorm(x)
        xm = matvec(SD[f"layer{li}.mlp_fc1"], xm)
        relu_xm = []
        for v in xm:
            relu_xm.append(max(0.0, v))
        xm = relu_xm
        xm = matvec(SD[f"layer{li}.mlp_fc2"], xm)
        x = vec_add(xm, x_res_mlp)
    return matvec(SD["lm_head"], x)


def generate_one(prefix: Optional[str] = None, temperature: float = DEFAULT_TEMP) -> str:
    """Sample one name. If `prefix` is given (e.g. "j", "ab"), the first
    `len(prefix)` characters are forced; the rest is sampled."""
    keys = []
    values = []
    for _ in range(CFG["n_layer"]):
        keys.append([])
        values.append([])
    token_id = BOS
    chars = []
    prefix_ids = []
    if prefix:
        for ch in prefix.lower():
            if ch in STOI:
                prefix_ids.append(STOI[ch])
    for pos in range(CFG["block_size"]):
        logits = forward(token_id, pos, keys, values)
        if pos < len(prefix_ids):
            token_id = prefix_ids[pos]
        else:
            probs = softmax(logits, temperature)
            token_id = sample_idx(probs)
        if token_id == BOS:
            break
        chars.append(ITOS[str(token_id)])
    return "".join(chars)


# ===========================================================================
# YOUR JOB starts here.
# ===========================================================================

# Starter blocklists. Expand them - and consider whether substring matching
# is enough or you need a smarter rule. The autograder probes both obvious
# and subtle inputs.
BLOCKED_PREFIX_PATTERNS: List[str] = [
    # TODO: prefixes you want to refuse outright. For this lab the product
    # policy bans fruit names, so a prefix like "appl" (heading toward "apple")
    # should be refused before you ever generate.
]

BLOCKED_OUTPUT_PATTERNS: List[str] = [
    # TODO: fruit substrings you don't want to appear in generated names,
    # e.g. "apple", "pear", "plum", "fig", "lime", "grape", "mango".
]


def is_safe_request(prefixes: List[str]) -> Optional[str]:
    """Decide whether to fulfill the request.

    `prefixes` is the list of letter-string prefixes the user typed
    (e.g. ['j']  or  ['ab']  or  ['a', 'b', 'c']  or  [''] for a no-prefix request).
    Return None to allow generation, or a one-sentence string to refuse
    (the bot will emit "REFUSE: <your reason>").

    The autograder will test both directions:
      - you BLOCK prefixes you should block (you'll lose points for letting them through)
      - you don't OVER-BLOCK common prefixes like 'j' or 'ab' (you'll lose points for over-refusing)
    """
    # TODO: your implementation here.
    return None


def is_safe_name(name: str) -> bool:
    """Decide whether a generated name is OK to return.

    Return True to keep it, False to discard (the bot resamples).

    Even when the request itself is benign, the model can sometimes emit a
    name containing a fruit substring (e.g. a request for "f" that samples
    out as "fig"). Use this hook to filter those outputs.
    """
    # TODO: your implementation here.
    return True


# ===========================================================================
# Bot loop - uses YOUR hooks. You should NOT need to change this.
# ===========================================================================
def handle(raw: str) -> str:
    # Tokenize: each whitespace-separated token is one letter-prefix.
    # Filter non-letter chars so noise like "a!" or "ab123" becomes "a"/"ab".
    raw_tokens = raw.strip().lower().split()
    prefixes = []
    for t in raw_tokens:
        cleaned = ""
        for ch in t:
            if ch in STOI:
                cleaned = cleaned + ch
        prefixes.append(cleaned)
    prefixes = [p for p in prefixes if p]  # drop empties

    if not raw_tokens:
        # Empty input - generate one no-prefix name.
        prefixes = [""]
    elif not prefixes:
        return "REFUSE: input had no usable letters (a-z)."

    # Safety check on the request as a whole.
    refusal = is_safe_request(prefixes)
    if refusal is not None:
        return f"REFUSE: {refusal}"

    names = []
    for px in prefixes:
        name = ""
        # Try up to 10 times to get a name that passes is_safe_name.
        for _ in range(10):
            cand = generate_one(prefix=px or None)
            if cand and is_safe_name(cand):
                name = cand
                break
        if not name:
            return "REFUSE: couldn't generate a safe name for one of the prefixes."
        names.append(name)

    return "OK: " + ", ".join(names)


def main():
    for line in sys.stdin:
        line = line.rstrip("\n")
        sys.stdout.write(handle(line) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
