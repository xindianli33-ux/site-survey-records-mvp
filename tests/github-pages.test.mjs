import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const root=new URL('../github-pages/',import.meta.url);
test('GitHub Pages mobile client uses Google APIs and device location',async()=>{const [html,js]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('app.js',root),'utf8')]);assert.match(html,/Google 登入/);assert.match(js,/navigator\.geolocation\.getCurrentPosition/);assert.match(js,/upload\/drive\/v3\/files/);assert.match(js,/sheets\.googleapis\.com/);assert.match(js,/46742451501-fc705j0o8ffabtpql28ufsqkfdq3js89/);});
