/* Run tutor-bridge/worker-do.js on Node, Durable Object and all, so the relay can be tested
   before anyone deploys it or pays for anything.

   The worker is written for Cloudflare: a fetch handler plus an exported Durable Object class.
   Node 18+ already has Request, Response, TransformStream and URL, so the only missing piece is
   the DurableObjectNamespace binding, which is a name-to-instance map with a fetch on each
   instance. That is about ten lines below. Nothing about the worker changes; this is a harness,
   not a second implementation, which is the whole point: what you test is what you deploy.

     node bin/probe/worker-do-local.mjs [port]                                                */
import http from "node:http";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

const PORT = +(process.argv[2] || 8797);
const SRC = "staging/tiny-ai/tutor-bridge/worker-do.js";

/* The one substitution this harness makes, and why. The worker imports DurableObject from
   cloudflare:workers, which Node cannot resolve, and it extends it because the free plan's
   SQLite-backed Durable Objects want the modern base class. The base contributes nothing this
   relay uses (it just stashes ctx and env), so a two-line stand-in keeps the file otherwise
   byte-identical: what you test is still what you deploy. */
const tmp = join(mkdtempSync(join(tmpdir(), "wdo-")), "worker.mjs");
writeFileSync(tmp, readFileSync(SRC, "utf8").replace(
  'import { DurableObject } from "cloudflare:workers";',
  'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }'));
const mod = await import(tmp);
const { handle, Room } = mod;

/* the binding: one live Room per name, exactly like the real namespace */
const live = new Map();
const ROOMS = {
  idFromName: (name) => ({ name, toString: () => name }),
  get: (id) => {
    if (!live.has(id.name)) live.set(id.name, new Room({ id }));
    const inst = live.get(id.name);
    return { fetch: (r) => inst.fetch(typeof r === "string" ? new Request(r) : r) };
  },
};

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request("http://localhost:" + PORT + req.url, {
    method: req.method, headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
  });
  const out = await handle(request, { ROOMS });
  res.writeHead(out.status, Object.fromEntries(out.headers));
  /* an SSE response is an open stream, not a buffer: piping it is the difference between a
     working subscription and a request that hangs until the client gives up */
  if ((out.headers.get("content-type") || "").includes("event-stream") && out.body) {
    Readable.fromWeb(out.body).pipe(res);
    req.on("close", () => { try { out.body.cancel(); } catch (e) {} });
    return;
  }
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(PORT, () => console.log(`worker-do on http://localhost:${PORT}`));
