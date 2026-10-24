// Dev-only Vite plugin: serves POST /api/explain and /api/help from the same
// handlers a deploy uses (api/*.ts), so the AI tutor works under `npm run dev`.
// The Gemini key is read by those handlers from the dev server's own
// environment (GEMINI_API_KEY); it is never part of the browser bundle.
import type { Plugin } from "vite";

const ROUTES: Record<string, string> = {
  "/api/explain": "../api/explain.ts",
  "/api/help": "../api/help.ts",
};

/** The handler module for an API path (relative to the frontend root), or null. */
export function matchRoute(url: string | undefined): string | null {
  if (!url) return null;
  return ROUTES[url.split("?")[0]!] ?? null;
}

type NodeHeaders = Record<string, string | string[] | undefined>;
type NodeReq = AsyncIterable<Uint8Array> & { method?: string; url?: string; headers: NodeHeaders };
type NodeRes = { statusCode: number; setHeader(name: string, value: string): void; end(chunk?: Uint8Array): void };
type DevServer = {
  config: { root: string };
  middlewares: { use(fn: (req: NodeReq, res: NodeRes, next: () => void) => void | Promise<void>): void };
  ssrLoadModule(id: string): Promise<Record<string, unknown>>;
};

/** A Node request (already read into `body`) as a Web Request. */
export function toWebRequest(req: { method?: string; url?: string; headers: NodeHeaders }, body: Uint8Array<ArrayBuffer>): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(", "));
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(new URL(req.url ?? "/", "http://localhost"), { method, headers, body: hasBody ? body : undefined });
}

/** Write a Web Response to a Node response. */
export async function sendWebResponse(res: NodeRes, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(new Uint8Array(await response.arrayBuffer()));
}

async function readBody(req: NodeReq): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    size += chunk.byteLength;
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

function resolveFrom(root: string, rel: string): string {
  return decodeURIComponent(new URL(rel, `file://${root.endsWith("/") ? root : `${root}/`}`).pathname);
}

export function apiDevServer(): Plugin {
  const plugin = {
    name: "codelens-api-dev",
    apply: "serve" as const, // never part of a production build
    configureServer(server: DevServer) {
      server.middlewares.use(async (req, res, next) => {
        const rel = matchRoute(req.url);
        if (rel === null) return next();
        try {
          const mod = await server.ssrLoadModule(resolveFrom(server.config.root, rel));
          const handler = mod.POST as (request: Request) => Promise<Response>;
          await sendWebResponse(res, await handler(toWebRequest(req, await readBody(req))));
        } catch {
          // Like the handlers themselves: never echo error details.
          await sendWebResponse(res, new Response(JSON.stringify({ error: "api error" }), { status: 500 }));
        }
      });
    },
  };
  return plugin as unknown as Plugin;
}
