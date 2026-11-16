// 유튜브 인기 음악 묶음 화면 시험: node test/chart-ui.test.mjs
// (server에서 npm run dev + 한 번 이상 server/test/chart.test.mjs 돌려서 차트가 저장돼 있어야 함, python3 -m http.server 8080)
import { chromium } from 'playwright'; import assert from 'node:assert/strict';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.route(/youtube\.com|noembed|ytimg|fonts|cdnjs/, r => r.abort());
await p.goto('http://127.0.0.1:8080/index.html');
await p.evaluate(() => localStorage.clear()); await p.reload();
assert.match(await p.textContent('#packs .pack.hot'), /유튜브 인기 음악/);
await p.click('[data-cat=KR]');
await p.waitForSelector('#dialog:not(.hidden)');
assert.match(await p.textContent('#dlgMsg'), /기준 3곡/);
await p.screenshot({ path: 'test/shot-chart.png' });
await p.click('#dlgBtns .primary');   // 전부 3곡
await new Promise(r => setTimeout(r, 400));
const s = await p.evaluate(() => JSON.parse(localStorage.getItem('sq-songs')).map(x => [x.vid, x.title, x.artist]));
assert.deepEqual(s, [['AAAAAAAAAAA', 'REBEL HEART', 'IVE 아이브'], ['BBBBBBBBBBB', '바이, 썸머(Bye, Summer)', '아이유(IU)'], ['CCCCCCCCCCC', 'Dirty Work', 'aespa 에스파']]);
// 다시 누르면 중복 없이
await p.click('[data-cat=KR]'); await p.waitForSelector('#dialog:not(.hidden)'); await p.click('#dlgBtns .primary');
await new Promise(r => setTimeout(r, 300));
assert.equal(await p.locator('.song').count(), 3);
// 카테고리 카드: 드라마 OST → 무작위 고르기 / 전부
assert.equal(await p.locator('#packs [data-cat]').count(), 9);
await p.click('[data-cat=ost]'); await p.waitForSelector('#dialog:not(.hidden)');
assert.match(await p.textContent('#dlgMsg'), /드라마 OST/);
await p.screenshot({ path: 'test/shot-cat.png' });
await p.click('#dlgBtns .primary'); await new Promise(r => setTimeout(r, 300));
const s2 = await p.evaluate(() => JSON.parse(localStorage.getItem('sq-songs')).map(x => [x.vid, x.title, x.artist]));
assert.deepEqual(s2.slice(3), [['OSTOSTOST01', 'Stay With Me', '찬열, 펀치 (CHANYEOL, PUNCH)'], ['OSTOSTOST02', '눈의 꽃', 'Park Hyo Shin']]);
await p.setViewportSize({ width: 1280, height: 900 }); await p.evaluate(() => scrollTo(0, 0));
await p.click('#dlgBtns button >> nth=0').catch(() => {});
await p.screenshot({ path: 'test/shot-cats-1280.png', fullPage: true });
console.log('chart-ui ok');
await b.close();
