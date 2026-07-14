"""assignment.py — Lab 14 · harden microRAG's retriever.

You are given a working microRAG retriever over a small fixed corpus (bundled
below, so grading is deterministic — no file paths, no model download). Your job
is to implement ONE function, rank(), that adds the two production safeguards the
lab's §2.3 exercise and §6 talked about:

  1. GROUNDING GATE   — if nothing in the corpus really matches the query
                        (the best RAW keyword score is below MIN_KW), REFUSE
                        instead of returning the least-bad guess. This is what
                        stops a RAG system from confidently answering an
                        out-of-corpus question. (Mitigates KB-noise hallucination.)

  2. DIVERSITY CAP    — keep at most MAX_PER_SOURCE chunks from any single
                        document, so one multi-chunk file can't dominate the
                        whole top-K. (Mitigates the Lab 15 §4 embedding-collision
                        / single-source-domination attack.)

--- I/O PROTOCOL (how the autograder talks to you) -------------------------
Run it and type queries, one per line. For each query print ONE line:

    OK: <id>, <id>, ...     the ranked chunk ids after your hardening
    REFUSE                  nothing cleared the grounding gate

    $ echo "how do I reset my password?" | python3 assignment.py
    OK: password.md#0, database.md#2, onboarding.md#1, network.md#0

A chunk id is "<doc>#<chunk-index>", e.g. "database.md#2".

--- WHAT base_retrieve(query) HANDS YOU ------------------------------------
A list of dicts, ALREADY SORTED best-first by hybrid_score. Each dict:
    { "id": "database.md#2", "doc": "database.md",
      "raw_kw": 0.52,      # raw (un-normalized) TF-IDF keyword score
      "raw_em": 0.31,      # raw embedding cosine
      "hybrid": 0.90 }     # the normalized blend used for the sort
Note raw_kw is the *un-normalized* score — that's the one the grounding gate
needs, because the normalized hybrid score is ~1.0 for the top chunk even when
the query matches nothing (see §2.3).

Only edit the body of rank(). Everything else is done.
"""
from __future__ import annotations
import hashlib, math, re, sys
from collections import Counter

# ---- fixed corpus (bundled for deterministic grading) ---------------------
CORPUS = [
  {"id": "password.md#0", "doc": "password.md", "text": "Password reset policy. To reset your MegaCorpAI password, open the login page and click Need help signing in, then authenticate with Okta Verify."},
  {"id": "password.md#1", "doc": "password.md", "text": "Passwords rotate every ninety days. Choose a passphrase of at least sixteen characters including one symbol and one number."},
  {"id": "network.md#0",  "doc": "network.md",  "text": "VPN access. Connect to the corporate VPN using the GlobalProtect client before you reach any internal service."},
  {"id": "network.md#1",  "doc": "network.md",  "text": "The office subnet is ten dot twenty. Internal hostnames resolve through the corporate DNS resolver."},
  {"id": "onboarding.md#0","doc": "onboarding.md","text": "New hire onboarding. New employees complete orientation during their first week and request a laptop and badge from IT."},
  {"id": "onboarding.md#1","doc": "onboarding.md","text": "Benefits enrollment for new hires closes thirty days after the start date. Contact people operations with any questions."},
  {"id": "database.md#0", "doc": "database.md", "text": "The primary database is PostgreSQL. The production database hostname is db-prod dot megacorpai dot local."},
  {"id": "database.md#1", "doc": "database.md", "text": "Database backups run nightly. The analytics database replica is read only and lives in a separate database cluster."},
  {"id": "database.md#2", "doc": "database.md", "text": "Connect to the database with the database credentials from the vault. Never share the database password."},
  {"id": "database.md#3", "doc": "database.md", "text": "Database schema migrations run through the database migration tool before every database deploy."},
]

# ---- microRAG retrieval (given — same math as rag/micro_rag.py) ------------
_TOK = re.compile(r"[a-zA-Z][a-zA-Z']+")
def tokenize(t): return [w.lower() for w in _TOK.findall(t)]

_DF = Counter()
for _c in CORPUS: _DF.update(set(tokenize(_c["text"])))
_N = len(CORPUS)
IDF = {t: math.log((_N + 1) / (df + 1)) + 1.0 for t, df in _DF.items()}
for _c in CORPUS:
    _tf = Counter(tokenize(_c["text"]))
    _c["tfidf"] = {t: n * IDF.get(t, 0.0) for t, n in _tf.items()}

def tfidf_score(query, ctf):
    qv = {t: n * IDF.get(t, 0.0) for t, n in Counter(tokenize(query)).items()}
    dot = sum(qv[t] * ctf.get(t, 0.0) for t in qv)
    qn = math.sqrt(sum(v * v for v in qv.values()))
    cn = math.sqrt(sum(v * v for v in ctf.values()))
    return dot / (qn * cn + 1e-9)

_DIM = 128
def embed(text):
    v = [0.0] * _DIM
    for tok in tokenize(text):
        v[int(hashlib.md5(tok.encode()).hexdigest(), 16) % _DIM] += 1.0
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]
for _c in CORPUS: _c["emb"] = embed(_c["text"])

def cosine(a, b): return sum(x * y for x, y in zip(a, b))

W_KW = 0.5
def base_retrieve(query):
    """Score every chunk, blend, return ALL chunks sorted best-first."""
    qe = embed(query)
    kw = [tfidf_score(query, c["tfidf"]) for c in CORPUS]
    em = [cosine(qe, c["emb"]) for c in CORPUS]
    def norm(xs):
        lo, hi = min(xs), max(xs)
        return [0.0] * len(xs) if hi == lo else [(x - lo) / (hi - lo) for x in xs]
    kn, en = norm(kw), norm(em)
    out = [{"id": c["id"], "doc": c["doc"], "raw_kw": kw[i], "raw_em": em[i],
            "hybrid": W_KW * kn[i] + (1 - W_KW) * en[i]} for i, c in enumerate(CORPUS)]
    out.sort(key=lambda r: r["hybrid"], reverse=True)
    return out

# ---- knobs (given — do not rename; the grader relies on these) ------------
TOP_K = 4            # return at most this many chunk ids
MAX_PER_SOURCE = 2   # diversity cap: at most this many chunks per doc
MIN_KW = 0.05        # grounding floor on the best RAW keyword score


# ============================================================================
# YOUR JOB starts here.  Implement rank().
# ============================================================================
def rank(query):
    """Return a list of chunk ids (best first), or None to REFUSE.

    Steps:
      1. scored = base_retrieve(query)   # already sorted best-first
      2. GROUNDING GATE: if the best raw_kw across all chunks is < MIN_KW,
         return None  (the runner prints REFUSE).
      3. DIVERSITY CAP: walk scored best-first and keep a chunk only while
         its doc has fewer than MAX_PER_SOURCE chunks already kept.
      4. Return the ids of the first TOP_K survivors.
    """
    scored = base_retrieve(query)

    # TODO 1 — grounding gate: return None if nothing really matches.

    # TODO 2 — diversity-capped top-K: build the list of ids here.

    # Placeholder (naive top-K, no grounding, no diversity — REPLACE THIS):
    return [r["id"] for r in scored[:TOP_K]]
# ============================================================================
# YOUR JOB ends here.
# ============================================================================


def _format(ids):
    return "REFUSE" if ids is None else "OK: " + ", ".join(ids)

def main():
    for line in sys.stdin:
        q = line.strip()
        if q:
            print(_format(rank(q)), flush=True)

if __name__ == "__main__":
    main()
