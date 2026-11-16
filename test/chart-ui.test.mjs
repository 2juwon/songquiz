// 유튜브 인기 음악 묶음 화면 시험: node test/chart-ui.test.mjs
// (server에서 npm run dev + 한 번 이상 server/test/chart.test.mjs 돌려서 차트가 저장돼 있어야 함, python3 -m http.server 8080)
import { chromium } from 'playwright'; import assert from 'node:assert/strict';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.route(/youtube\.com|noembed|ytimg|fonts|cdnjs/, r => r.abort());
await p.goto('http://127.0.0.1:8080/index.html');
await p.evaluate(() => localStorage.clear()); await p.reload();
assert.match(await p.textContent('#packs .pack.hot'), /유튜브 인기 음악/);
await p.click('[data-pack=yt]');
await p.waitForSelector('#dialog:not(.hidden)');
assert.match(await p.textContent('#dlgMsg'), /기준 3곡/);
await p.screenshot({ path: 'test/shot-chart.png' });
await p.click('#dlgBtns .primary');   // 전부 3곡
await new Promise(r => setTimeout(r, 400));
const s = await p.evaluate(() => JSON.parse(localStorage.getItem('sq-songs')).map(x => [x.vid, x.title, x.artist]));
assert.deepEqual(s, [['AAAAAAAAAAA', 'REBEL HEART', 'IVE 아이브'], ['BBBBBBBBBBB', '바이, 썸머(Bye, Summer)', '아이유(IU)'], ['CCCCCCCCCCC', 'Dirty Work', 'aespa 에스파']]);
// 다시 누르면 중복 없이
await p.click('[data-pack=yt]'); await p.waitForSelector('#dialog:not(.hidden)'); await p.click('#dlgBtns .primary');
await new Promise(r => setTimeout(r, 300));
assert.equal(await p.locator('.song').count(), 3);
console.log('chart-ui ok');
await b.close();
