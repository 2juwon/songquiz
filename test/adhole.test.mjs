// 광고 건너뛰기 구멍 시험: node test/adhole.test.mjs (python3 -m http.server 8080 켜 두고)
import { chromium } from 'playwright'; import assert from 'node:assert/strict'; import fs from 'node:fs';
const FAKE = fs.readFileSync(new URL('./fake-yt.js', import.meta.url), 'utf8');
const b = await chromium.launch();
for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  const p = await b.newPage({ viewport: vp });
  await p.route('https://www.youtube.com/iframe_api', r => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
  await p.route(/noembed|ytimg|fonts|cdnjs/, r => r.abort());
  await p.goto('http://127.0.0.1:8080/index.html');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('sq-songs', JSON.stringify([{ id: 'a', vid: 'SLOWAAAAAAA', title: '느린 곡', artist: '', start: 30 }])); localStorage.setItem('sq-settings', JSON.stringify({ stages: 'normal', count: '0', shuffle: false })); });
  await p.reload(); await p.click('#startBtn');
  await new Promise(r => setTimeout(r, 1500));
  assert.equal(await p.evaluate(() => document.querySelector('#stage').classList.contains('adhole')), false);   // 처음 4초는 그대로
  await p.waitForSelector('#stage.adhole', { timeout: 5000 });
  // 구멍 자리(오른쪽 아래)를 누르면 유튜브 플레이어가 받고, 가운데는 여전히 가림
  const hit = await p.evaluate(() => {
    const r = document.querySelector('#stage').getBoundingClientRect();
    const at = (fx, fy) => document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
    return { corner: !!at(.88, .88).closest('.yt:not(.back)'), center: !!at(.5, .5).closest('.cover'), topRight: !!at(.9, .3).closest('.cover'), botLeft: !!at(.2, .9).closest('.cover') };
  });
  assert.deepEqual(hit, { corner: true, center: true, topRight: true, botLeft: true });
  await p.screenshot({ path: `test/shot-adhole-${vp.width}.png` });
  await p.waitForSelector('#playBtn:not([disabled])', { timeout: 6000 });
  assert.equal(await p.evaluate(() => document.querySelector('#stage').classList.contains('adhole')), false);   // 준비되면 닫힘
  await p.close();
}
console.log('adhole ok');
await b.close();
