import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../apps-script/", import.meta.url);

test("Apps Script backend is single-user and idempotent", async () => {
  const [code, manifest] = await Promise.all([
    readFile(new URL("Code.gs", root), "utf8"),
    readFile(new URL("appsscript.json", root), "utf8").then(JSON.parse),
  ]);
  assert.equal(manifest.webapp.access, "MYSELF");
  assert.equal(manifest.webapp.executeAs, "USER_DEPLOYING");
  assert.match(code, /findRecord_\(sheet, payload\.clientId\)/);
  assert.match(code, /LockService\.getScriptLock\(\)/);
  assert.match(code, /folder\.createFile\(blob\)/);
  assert.match(code, /sheet\.appendRow\(row\)/);
});

test("mobile client keeps an IndexedDB offline queue", async () => {
  const [index, client] = await Promise.all([
    readFile(new URL("Index.html", root), "utf8"),
    readFile(new URL("JavaScript.html", root), "utf8"),
  ]);
  assert.match(index, /id="cameraInput" hidden type="file" accept="image\/\*">/);
  assert.match(index, /離線可暫存/);
  assert.match(client, /indexedDB\.open/);
  assert.match(client, /window\.addEventListener\('online'/);
  assert.match(client, /saveSurveyPhoto/);
  assert.match(index, /photoDescription/);
  assert.match(client, /readExifGps/);
  assert.match(client, /compressImage/);
  assert.match(client, /source:'EXIF'/);
  assert.match(client, /已取得照片，請輸入文字說明/);
  assert.match(client, /memoryDrafts:new Map/);
  assert.match(client, /typeof dialog\.showModal/);
});
