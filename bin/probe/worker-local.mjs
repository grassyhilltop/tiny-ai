/* Run tutor-bridge/worker.js on Node, so the MCP server can be tested before anyone deploys it.

   The worker is written for Cloudflare (a fetch handler over Web Request/Response). Node 18+ has
   both, so the only missing piece is an http server that converts between them. Nothing about the
   worker changes; this is a harness, not a second implementation.

     node bin/probe/worker-local.mjs [port] [relayBase]
     RELAY defaults to the real ntfy; point it at bin/probe/relay-stub.mjs to test for free.   */
import http from "node:http";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = +(process.argv[2] || 8789);
const RELAY = process.argv[3] || process.env.RELAY || "";

let src = readFileSync("staging/tiny-ai/tutor-bridge/worker.js", "utf8");
if (RELAY) src = src.replace('const RELAY = "https://ntfy.sh";', `const RELAY = ${JSON.stringify(RELAY)};`);
const tmp = join(mkdtempSync(join(tmpdir(), "w-")), "worker.mjs");
writeFileSync(tmp, src);
const { handle } = await import(tmp);

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request("http://localhost:" + PORT + req.url, {
    method: req.method, headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });
  const out = await handle(request, { NTFY_TOKEN: process.env.NTFY_TOKEN });
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(PORT, () => console.log(`worker on http://localhost:${PORT}  relay=${RELAY || "https://ntfy.sh"}`));
