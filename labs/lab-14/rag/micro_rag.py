"""micro_rag.py — the smallest readable Retrieval-Augmented Generation pipeline.

One file. Two retrievers. Hybrid scoring. Stdlib + one optional dep.

How RAG works in ~200 lines:

    documents → chunk → index (twice: keyword + embedding)
       ↓
    user query → retrieve top-K hybrid → augment prompt → call LLM → answer

Run interactively (no LLM needed for the retrieval demo):

    python rag/micro_rag.py retrieve  "how do I reset my password?"

With a real LLM (set LLM_BASE_URL / LLM_API_KEY / LLM_MODEL first):

    python rag/micro_rag.py ask "how do I reset my password?"

That's the whole protocol. Lab 15 attacks every step of it.
"""

from __future__ import annotations
import argparse, hashlib, json, math, os, re, sys
from collections import Counter
from pathlib import Path

# Optional: real embedding model. If sentence-transformers isn't installed,
# we fall back to a hashed-feature embedding so the lab still runs.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

DATA = Path(__file__).resolve().parent.parent / "microdata"


# === STEP 1 · LOAD + CHUNK =================================================

def load_corpus() -> list[dict]:
    """Read every .md / .txt file under microdata/ and return a list of docs."""
    docs = []
    for p in sorted(DATA.rglob("*")):
        if p.is_file() and p.suffix.lower() in (".md", ".txt"):
            body = p.read_text(encoding="utf-8")
            docs.append({"path": p.relative_to(DATA).as_posix(), "body": body})
    return docs


def chunk(text: str, size: int = 300, overlap: int = 60) -> list[str]:
    """Split into overlapping windows. Real RAG chunks by tokens; we chunk by
    characters because it's smaller and shows the structure just as well."""
    out = []
    i = 0
    while i < len(text):
        out.append(text[i : i + size].strip())
        i += size - overlap
    return [c for c in out if c]


def build_index(docs: list[dict]) -> list[dict]:
    """Each chunk is a dict with path, body, and (filled below) two vectors."""
    chunks = []
    for d in docs:
        for k, body in enumerate(chunk(d["body"])):
            chunks.append({
                "doc_path": d["path"],
                "chunk_idx": k,
                "body": body,
            })
    return chunks


# === STEP 2 · TWO RETRIEVERS ================================================
#
# Retriever 1 · BM25-style keyword score (term frequency × inverse doc freq).
# Retriever 2 · Embedding cosine similarity. With sentence-transformers
#               installed we use a real model; without it we use the hashed-
#               feature embedding below — pedagogically identical, no GPU.

TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z']+")


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in TOKEN_RE.findall(text)]


def build_tfidf(chunks: list[dict]) -> None:
    """Compute TF for each chunk and IDF for the corpus."""
    df: Counter[str] = Counter()
    for c in chunks:
        toks = set(tokenize(c["body"]))
        df.update(toks)
    N = len(chunks)
    idf = {t: math.log((N + 1) / (df_t + 1)) + 1.0 for t, df_t in df.items()}
    for c in chunks:
        tf = Counter(tokenize(c["body"]))
        c["tfidf"] = {t: cnt * idf.get(t, 0.0) for t, cnt in tf.items()}
    return idf


def tfidf_score(query: str, chunk_tfidf: dict, idf: dict) -> float:
    """Cosine similarity between the query's TF-IDF vector and the chunk's."""
    qtf = Counter(tokenize(query))
    qvec = {t: cnt * idf.get(t, 0.0) for t, cnt in qtf.items()}
    dot = sum(qvec[t] * chunk_tfidf.get(t, 0.0) for t in qvec)
    qn = math.sqrt(sum(v * v for v in qvec.values()))
    cn = math.sqrt(sum(v * v for v in chunk_tfidf.values()))
    return dot / (qn * cn + 1e-9)


# --- Embedding side --------------------------------------------------------

EMBED_DIM = 128
try:
    from sentence_transformers import SentenceTransformer
    _embed_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    EMBED_DIM = _embed_model.get_sentence_embedding_dimension()

    def embed(text: str) -> list[float]:
        return _embed_model.encode([text])[0].tolist()
except ImportError:
    # Hashed-feature embedding · same interface, no model download required.
    def embed(text: str) -> list[float]:
        vec = [0.0] * EMBED_DIM
        for tok in tokenize(text):
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            vec[h % EMBED_DIM] += 1.0
        n = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / n for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))   # both unit-normalized → dot == cos


# === STEP 3 · HYBRID RETRIEVAL ==============================================

def retrieve(query: str, chunks: list[dict], idf: dict,
             top_k: int = 4, w_kw: float = 0.5) -> list[dict]:
    """Score every chunk twice, normalize, blend, return top K."""
    q_emb = embed(query)
    kw = [tfidf_score(query, c["tfidf"], idf) for c in chunks]
    em = [cosine(q_emb, c["emb"]) for c in chunks]

    def normalize(xs: list[float]) -> list[float]:
        lo, hi = min(xs), max(xs)
        return [0.0 for _ in xs] if hi == lo else [(x - lo) / (hi - lo) for x in xs]

    kw_n, em_n = normalize(kw), normalize(em)
    scored = [
        {**c, "kw_score": kw_n[i], "em_score": em_n[i],
              "hybrid_score": w_kw * kw_n[i] + (1 - w_kw) * em_n[i]}
        for i, c in enumerate(chunks)
    ]
    scored.sort(key=lambda x: x["hybrid_score"], reverse=True)
    return scored[:top_k]


# === STEP 4 · AUGMENT THE PROMPT ============================================

SYSTEM_PROMPT = """You answer questions using ONLY the retrieved context below.
If the context does not contain the answer, say so plainly. Cite the source
filename at the end of every fact you take from the context."""


def augment(query: str, top: list[dict]) -> list[dict]:
    """Assemble the messages list a chat-completions endpoint expects."""
    context = "\n\n".join(
        f"[source: {c['doc_path']} · chunk {c['chunk_idx']}]\n{c['body']}"
        for c in top
    )
    user = f"# Retrieved context\n\n{context}\n\n# User question\n\n{query}"
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": user},
    ]


# === STEP 5 · CALL THE LLM ==================================================

def chat(messages: list[dict]) -> str:
    """OpenAI-compatible chat-completions call. Reads creds from env.

    The RC GenAI endpoint streams Server-Sent Events even for one-shot calls
    (the body is a series of `data: {json}` lines), so we request a stream and
    stitch the assistant's content deltas together — ignoring the model's
    "reasoning" deltas, which are its private chain-of-thought.
    """
    import httpx
    url = os.environ["LLM_BASE_URL"].rstrip("/") + "/chat/completions"
    r = httpx.post(url,
        headers={"Authorization": f"Bearer {os.environ['LLM_API_KEY']}"},
        json={"model": os.environ["LLM_MODEL"], "messages": messages,
              "temperature": 0.2, "stream": True},
        timeout=120)
    r.raise_for_status()
    out = []
    for line in r.text.splitlines():
        if not line.startswith("data: "):
            continue
        payload = line[len("data: "):].strip()
        if payload == "[DONE]":
            break
        try:
            delta = json.loads(payload)["choices"][0]["delta"]
        except (json.JSONDecodeError, KeyError, IndexError):
            continue
        if delta.get("content"):
            out.append(delta["content"])
    return "".join(out).strip()


# === GLUE · build once, then answer questions ==============================

def ingest() -> tuple[list[dict], dict]:
    docs = load_corpus()
    chunks = build_index(docs)
    idf = build_tfidf(chunks)
    for c in chunks:
        c["emb"] = embed(c["body"])
    return chunks, idf


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_ret = sub.add_parser("retrieve", help="show top-K chunks for a query (no LLM)")
    p_ret.add_argument("query")
    p_ask = sub.add_parser("ask", help="full RAG round-trip — call the LLM")
    p_ask.add_argument("query")
    args = ap.parse_args()

    print(f"# Loading {DATA} …", file=sys.stderr)
    chunks, idf = ingest()
    print(f"# {len(chunks)} chunks indexed, embedding dim={len(chunks[0]['emb'])}",
          file=sys.stderr)

    top = retrieve(args.query, chunks, idf)
    if args.cmd == "retrieve":
        for c in top:
            print(f"\n[{c['hybrid_score']:.3f} kw={c['kw_score']:.2f} em={c['em_score']:.2f}] "
                  f"{c['doc_path']} · chunk {c['chunk_idx']}")
            print("  " + c["body"][:160].replace("\n", " "))
        return

    messages = augment(args.query, top)
    print(chat(messages))


if __name__ == "__main__":
    main()
