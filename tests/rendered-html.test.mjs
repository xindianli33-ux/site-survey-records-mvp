import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the site-survey product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>現勘資料｜團隊現場紀錄<\/title>/);
  assert.match(html, /施工中現勘/);
  assert.match(html, /連線 Google 帳號/);
  assert.match(html, /選取照片/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("includes Google OAuth and synchronization routes", async () => {
  const [page, authRoute, callbackRoute, uploadRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/google/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/callback/google/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/google/upload/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /\/api\/auth\/google/);
  assert.match(page, /\/api\/google\/upload/);
  assert.match(authRoute, /code_challenge_method:\s*"S256"/);
  assert.match(callbackRoute, /sealSession/);
  assert.match(uploadRoute, /upload\/drive\/v3\/files/);
  assert.match(uploadRoute, /sheets\.googleapis\.com\/v4\/spreadsheets/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
