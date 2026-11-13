// 브라우저 시험: node test/play.test.mjs  (먼저 server에서 npm run dev, 그리고 python3 -m http.server 8080)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const FAKE = fs.readFileSync(new URL('./fake-yt.js', import.meta.url), 'utf8');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const URL0 = 'http://127.0.0.1:8080/index.html';
const browser = await chromium.launch();
const errors = [];
async function page(ctxOpts = {}, titles = {}){
  const ctx = await browser.newContext(ctxOpts);
  await ctx.route('https://www.youtube.com/iframe_api', r => r.fulfill({ contentType: 'text/javascript', body: `window.__ytTitles=${JSON.stringify(titles)};` + FAKE }));
  await ctx.route('https://noembed.com/**', r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ title: "IVE 아이브 'REBEL HEART' MV", author_name: 'STARSHIP' }) }));
  await ctx.route('https://i.ytimg.com/**', r => r.fulfill({ contentType: 'image/png', body: PNG }));
  await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await ctx.route(/cdnjs/, r => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  return p;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- 혼자 하기 ----------
const titles = { gdZLi9oWNZg: "BTS (방탄소년단) 'Dynamite' Official MV", WMweEpGlu_U: 'totally different video' };
const h = await page({ viewport: { width: 420, height: 860 } }, titles);
await h.goto(URL0);
await h.evaluate(() => localStorage.clear()); await h.reload();
await h.click('[data-pack=k20]');
assert.equal(await h.locator('.song').count(), 12);
await h.fill('#linkInput', 'https://youtu.be/AAAAAAAAAAA?t=30\nhttps://www.youtube.com/watch?v=BBBBBBBBBBB | 내 노래 | 우리 | 1:05\nBADBADBAD01 | 안 나오는 곡\n이상한 줄');
await h.click('#addBtn');
await wait(400);
assert.equal(await h.locator('.song').count(), 15);
assert.equal(await h.inputValue('#linkInput'), '이상한 줄');
const st = await h.evaluate(() => JSON.parse(localStorage.getItem('sq-songs')));
const a = st.find(s => s.vid === 'AAAAAAAAAAA'), b = st.find(s => s.vid === 'BBBBBBBBBBB');
assert.equal(a.title, 'REBEL HEART'); assert.equal(a.artist, 'IVE 아이브'); assert.equal(a.start, 30);
assert.equal(b.start, 65); assert.equal(b.title, '내 노래');
await h.screenshot({ path: 'test/shot-setup.png', fullPage: true });

// 순서: Dynamite, Butter(제목 바뀜 → 건너뜀), 내 노래, 안 나오는 곡(건너뜀)만 남기기
await h.evaluate(() => {
  const keep = ['gdZLi9oWNZg', 'WMweEpGlu_U', 'BBBBBBBBBBB', 'BADBADBAD01'];
  const s = JSON.parse(localStorage.getItem('sq-songs')).filter(x => keep.includes(x.vid)).sort((x, y) => keep.indexOf(x.vid) - keep.indexOf(y.vid));
  localStorage.setItem('sq-songs', JSON.stringify(s));
  localStorage.setItem('sq-settings', JSON.stringify({ stages: 'normal', count: '0', shuffle: false, choices: true, random: false }));
  localStorage.setItem('sq-players', JSON.stringify(['철수', '영희']));
});
await h.reload();
await h.click('#startBtn');
await h.waitForSelector('#playBtn:not([disabled])', { timeout: 8000 });
assert.equal(await h.textContent('#gq'), '1 / 4');
assert.equal(await h.isVisible('#peek'), false);           // 혼자 하기는 정답 미리보기 기본 숨김
assert.equal(await h.locator('#choices div').count(), 4);
await h.click('#playBtn');
await wait(2200);
let plays = await h.evaluate(() => window.__plays);
let last = plays[plays.length - 1];
assert.equal(last.vid, 'gdZLi9oWNZg'); assert.equal(last.muted, false);
const startA = last.from;
assert.ok(startA >= 200 * .15 && startA <= 200 * .75, 'auto start ' + startA);
// 처음부터 재생할 자리에서 불러옴 (0초부터 불러오지 않음)
assert.ok(await h.evaluate(() => window.__loads.filter(x => x.vid === 'gdZLi9oWNZg').every(x => x.at > 20)));
assert.ok(last.to - last.from > 0.9 && last.to - last.from < 1.3, 'len ' + (last.to - last.from));
assert.match(await h.textContent('#playBtn'), /다시/);
// 휴대폰처럼 seek가 늦게 반영돼도 진행 막대는 앞으로만
await h.evaluate(() => { window.__mobileStale = true; window.__bars = []; const b = document.querySelector('#bar'); window.__barT = setInterval(() => window.__bars.push(parseFloat(b.style.width) || 0), 20); });
await h.click('#moreBtn');
await wait(4200);
const bars = await h.evaluate(() => { clearInterval(window.__barT); window.__mobileStale = false; return window.__bars; });
const during = bars.slice(0, bars.lastIndexOf(100) + 1).filter((v, i, a) => i === 0 || v !== 0 || a[i - 1] === 0);
for(let i = 1; i < during.length; i++) if(during[i] !== 0) assert.ok(during[i] >= during[i - 1], 'bar went back ' + during.slice(Math.max(0, i - 3), i + 2));
assert.ok(bars.some(v => v > 40 && v < 70), 'bar fills gradually');
plays = await h.evaluate(() => window.__plays); last = plays[plays.length - 1];
assert.ok(Math.abs(last.from - startA) < 0.05);
assert.ok(last.to - last.from > 2.9 && last.to - last.from < 3.4, 'len3 ' + (last.to - last.from));
assert.match(await h.textContent('#stages'), /3초3점/);
await h.screenshot({ path: 'test/shot-question.png' });
// 길이 정확도: 휴대폰처럼 시간이 0.25초마다 바뀌고 멈춤이 0.15초 늦게 먹혀도, 몇 번 들으면 실제 길이가 ±0.08초 안으로
await h.evaluate(() => { window.__coarse = true; localStorage.removeItem('sq-lead'); });
const lens = [];
for(let i = 0; i < 5; i++){
  await h.click('#playBtn'); await wait(3900);
  const L = await h.evaluate(() => { const x = window.__plays[window.__plays.length - 1]; return x.to - x.from; });
  lens.push(+L.toFixed(3));
}
console.log('3초 실제 길이:', lens.join(', '), '· lead', await h.evaluate(() => localStorage.getItem('sq-lead')));
assert.ok(lens.slice(2).every(v => Math.abs(v - 3) < 0.08), 'accuracy ' + lens);
assert.match(await h.textContent('#coverMsg'), /실제 \d\.\d\d초/);
await h.evaluate(() => { window.__coarse = false; });
await h.click('#revealBtn');
assert.equal(await h.textContent('#ansT'), 'Dynamite');
assert.equal(await h.locator('#choices .right').count(), 1);
await h.click('#pickChips [data-pid="영희"]');
assert.match(await h.textContent('#scoreMini'), /영희3/);
await h.screenshot({ path: 'test/shot-reveal.png' });
await h.click('#nextBtn');
// Butter는 영상 제목이 달라서 건너뛰고 '내 노래'(1:05)로
await h.waitForSelector('#playBtn:not([disabled])', { timeout: 8000 });
await wait(300);
assert.equal(await h.textContent('#gq'), '2 / 3');
await h.click('#playBtn'); await wait(1800);
plays = await h.evaluate(() => window.__plays); last = plays[plays.length - 1];
assert.equal(last.vid, 'BBBBBBBBBBB'); assert.ok(Math.abs(last.from - 65) < 0.05);
await h.keyboard.press('Enter');   // 정답 공개
await h.keyboard.press('Enter');   // 다음 → 안 나오는 곡은 건너뛰고 결과
await h.waitForSelector('#result:not(.hidden)', { timeout: 8000 });
assert.match(await h.textContent('#rankList'), /영희3점/);
assert.match(await h.textContent('#resultSub'), /건너뛴 곡 2/);
const bad = await h.evaluate(() => JSON.parse(localStorage.getItem('sq-songs')).find(s => s.vid === 'BADBADBAD01').bad);
assert.equal(bad, true);

// 공유 링크
await h.click('#homeBtn');
const url = await h.evaluate(async () => { let u; navigator.clipboard.writeText = async t => { u = t; }; document.querySelector('#shareBtn').click(); await new Promise(r => setTimeout(r, 300)); return u; });
assert.match(url, /#s=z/);
const h2 = await page();
await h2.goto(url.replace('https://2juwon.github.io/songquiz/', URL0));
await wait(500);
assert.equal(await h2.locator('.song').count(), 3);   // 재생 안 되는 곡은 빼고 공유
assert.equal(await h2.evaluate(() => location.hash), '');

// 구간 편집기
await h.locator('.song [data-act=edit]').first().click();
await wait(400);
await h.evaluate(() => { edClip.p.seekTo(42.5); });
await h.click('#edSet');
assert.equal(await h.textContent('#edStart'), '0:42.5');
await h.click('#edClose');

// ---------- 방 ----------
const host = await page({ viewport: { width: 420, height: 860 } }, titles);
await host.goto(URL0);
await host.evaluate(() => { localStorage.clear(); localStorage.setItem('sq-songs', JSON.stringify([{ id: 'a', vid: 'gdZLi9oWNZg', title: 'Dynamite', artist: 'BTS' }, { id: 'b', vid: 'CCCCCCCCCCC', title: '둘째 곡', artist: '' }])); localStorage.setItem('sq-settings', JSON.stringify({ stages: 'normal', count: '0', shuffle: false, choices: false })); });
await host.reload();
await host.click('#roomBtn');
await host.waitForSelector('#lobby:not(.hidden)');
await host.waitForSelector('#roomConn.ok');
const code = await host.textContent('#roomCode');
const pl = await page({ viewport: { width: 390, height: 800 } });
await pl.goto(URL0 + '#' + code);
await pl.fill('#joinName', '민수');
await pl.click('#joinForm button');
await pl.waitForSelector('#play:not(.hidden)');
await wait(500);
assert.match(await host.textContent('#lobbyPlayers'), /민수/);
await host.click('#roomStart');
await host.waitForSelector('#playBtn:not([disabled])', { timeout: 8000 });
assert.equal(await host.isVisible('#peek'), true);       // 방에서는 출제자 정답 미리보기 기본으로 보임
await wait(300);
assert.match(await pl.textContent('#pstatus'), /4점/);
assert.doesNotMatch(await pl.textContent('#play'), /Dynamite/);
await host.click('#playBtn');
await wait(700);
assert.match(await pl.textContent('#pleft'), /1초 듣는 중/);
await pl.screenshot({ path: 'test/shot-player-q.png' });
await pl.click('#buzzBtn');
await wait(500);
assert.match(await host.textContent('#buzzes'), /민수/);
assert.match(await pl.textContent('#buzzBtn'), /1번째/);
await host.screenshot({ path: 'test/shot-host-q.png' });
await host.click('#revealBtn');
await wait(300);
assert.match(await pl.textContent('#pstatus'), /Dynamite/);
await host.click('#pickChips .chip');
await wait(500);
assert.match(await pl.textContent('#pstatus'), /맞혔어요! \+4점/);
assert.match(await pl.textContent('#pme'), /4점/);
await pl.screenshot({ path: 'test/shot-player-reveal.png' });
const tNext = Date.now();
await host.click('#nextBtn');
await host.waitForSelector('#playBtn:not([disabled])', { timeout: 8000 });
const readyMs = Date.now() - tNext;
console.log('다음 곡 준비까지', readyMs, 'ms');
assert.ok(readyMs < 300, 'preloaded next ' + readyMs);
// 지금 보이는 플레이어가 다음 곡을 들고 있음
assert.equal(await host.evaluate(() => clip.loaded.vid), 'CCCCCCCCCCC');
await host.click('#playBtn'); await wait(1600);
assert.equal(await host.evaluate(() => window.__plays.at(-1).vid), 'CCCCCCCCCCC');
await wait(300);
assert.equal(await pl.locator('#buzzBtn:not([disabled])').count(), 1);   // 새 문제면 다시 누를 수 있음
await host.click('#revealBtn'); await host.click('#nextBtn');
await host.waitForSelector('#result:not(.hidden)');
await wait(400);
assert.match(await pl.textContent('#pstatus'), /게임 끝/);
// 참가자 새로고침 → 같은 자리
await pl.reload(); await wait(800);
assert.match(await pl.textContent('#pme'), /민수 4점/);
assert.deepEqual(errors, []);
console.log('play ok');
await browser.close();
