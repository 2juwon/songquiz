// 유튜브 인기 음악 시험: node test/chart.test.mjs
// 1) 제목 추리기(guessTitle) 단위 시험  2) 가짜 유튜브 서버(127.0.0.1:8790)로 wrangler dev(.dev.vars에 키·주소) 통해 /api/chart
import assert from 'node:assert/strict';
import http from 'node:http';
import { guessTitle, isoDur } from '../src/chart.js';

const G = (t, c) => { const g = guessTitle(t, c); return [g.title, g.artist]; };
assert.deepEqual(G("IVE 아이브 'REBEL HEART' MV"), ['REBEL HEART', 'IVE 아이브']);
assert.deepEqual(G('[MV] 아이유(IU) _ 바이, 썸머(Bye, Summer)'), ['바이, 썸머(Bye, Summer)', '아이유(IU)']);
assert.deepEqual(G('ROSÉ & Bruno Mars - APT. (Official Music Video)'), ['APT.', 'ROSÉ & Bruno Mars']);
assert.deepEqual(G("BTS (방탄소년단) 'Dynamite' Official MV"), ['Dynamite', 'BTS (방탄소년단)']);
assert.deepEqual(G('[MV] 우즈 (WOODZ) - Drowning'), ['Drowning', '우즈 (WOODZ)']);
assert.deepEqual(G('Golden (Official Lyric Video)', 'HUNTR/X - Topic'), ['Golden', 'HUNTR/X']);
assert.equal(isoDur('PT3M25S'), 205); assert.equal(isoDur('PT1H2M'), 3720); assert.equal(isoDur('P0D'), 0);
console.log('guessTitle ok');

// 가짜 유튜브
const item = (id, title, dur, embeddable = true, ch = 'Label') => ({ id, snippet: { title, channelTitle: ch }, contentDetails: { duration: dur }, status: { embeddable } });
let calls = 0, lastKey = '', plCalls = 0;
const yt = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); calls++; lastKey = u.searchParams.get('key');
  const send = b => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
  // 재생목록(드라마 OST 카테고리)
  if (u.pathname === '/playlistItems') {
    plCalls++;
    assert.equal(u.searchParams.get('playlistId'), 'RDCLAK5uy_lOLzp6hkiifnFubcBWM1GgRSnCTKcc_bg');
    if (u.searchParams.get('pageToken') === 'q2') return send({ items: [{ contentDetails: { videoId: 'OSTOSTOST02' } }, { contentDetails: { videoId: 'GONEGONEGO1' } }] });
    return send({ nextPageToken: 'q2', items: [{ contentDetails: { videoId: 'OSTOSTOST01' } }, { contentDetails: { videoId: 'LONGLONGLO1' } }] });
  }
  if (u.searchParams.get('id')) {
    assert.deepEqual(u.searchParams.get('id').split(','), ['OSTOSTOST01', 'LONGLONGLO1', 'OSTOSTOST02', 'GONEGONEGO1']);
    return send({ items: [   // GONE은 지워진 영상이라 안 돌아옴
      item('OSTOSTOST02', '눈의 꽃', 'PT4M10S', true, 'Park Hyo Shin - Topic'),
      item('OSTOSTOST01', '[도깨비 OST Part 1] 찬열, 펀치 (CHANYEOL, PUNCH) - Stay With Me MV', 'PT3M30S', true, 'STONE MUSIC'),
      item('LONGLONGLO1', 'OST 1시간 모음', 'PT1H'),
    ] });
  }
  assert.equal(u.pathname, '/videos'); assert.equal(u.searchParams.get('chart'), 'mostPopular');
  assert.equal(u.searchParams.get('regionCode'), 'KR'); assert.equal(u.searchParams.get('videoCategoryId'), '10');
  const p2 = u.searchParams.get('pageToken') === 'p2';
  const body = p2
    ? { items: [item('CCCCCCCCCCC', "aespa 에스파 'Dirty Work' MV", 'PT3M1S')] }
    : { nextPageToken: 'p2', items: [
        item('AAAAAAAAAAA', "IVE 아이브 'REBEL HEART' MV", 'PT3M20S'),
        item('BLOCKEDBLK1', "막힌 곡 'X' MV", 'PT3M', false),
        item('SHORTSHORT1', "쇼츠 'Y'", 'PT45S'),
        item('LONGLONGLO1', '1시간 모음', 'PT1H'),
        item('BBBBBBBBBBB', '[MV] 아이유(IU) _ 바이, 썸머(Bye, Summer)', 'PT4M2S'),
      ] };
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
});
await new Promise(r => yt.listen(8790, '127.0.0.1', r));
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
// 예약 작업(6시간마다)을 직접 한 번 돌려서 새로 받게 함 — wrangler dev --test-scheduled
const sch = await fetch(BASE + '/__scheduled?cron=17+*/6+*+*+*');
assert.equal(sch.status, 200, 'wrangler dev를 --test-scheduled로 켜 주세요');
for (let i = 0; i < 40 && calls < 2; i++) await new Promise(r => setTimeout(r, 100));
const r = await fetch(BASE + '/api/chart');
assert.equal(r.status, 200, await r.clone().text());
assert.equal(r.headers.get('access-control-allow-origin'), '*');
const d = await r.json();
assert.equal(d.region, 'KR'); assert.ok(d.updated > 0);
assert.deepEqual(d.songs.map(s => [s.v, s.t, s.a, s.rank]), [
  ['AAAAAAAAAAA', 'REBEL HEART', 'IVE 아이브', 1],
  ['BBBBBBBBBBB', '바이, 썸머(Bye, Summer)', '아이유(IU)', 2],
  ['CCCCCCCCCCC', 'Dirty Work', 'aespa 에스파', 3],
]);
assert.equal(lastKey, 'test-key'); assert.equal(calls, 2);
// 6시간 안에는 다시 안 받음 (저장본)
await fetch(BASE + '/api/chart'); assert.equal(calls, 2);
// 카테고리(재생목록): 순서 유지, 지워진/긴 영상 빼기, "- Topic" 채널은 제목 그대로
const o = await fetch(BASE + '/api/chart?cat=ost');
assert.equal(o.status, 200, await o.clone().text());
const od = await o.json();
assert.equal(od.cat, 'ost');
assert.deepEqual(od.songs.map(s => [s.v, s.t, s.a]), [
  ['OSTOSTOST01', 'Stay With Me', '찬열, 펀치 (CHANYEOL, PUNCH)'],
  ['OSTOSTOST02', '눈의 꽃', 'Park Hyo Shin'],
]);
assert.ok(plCalls === 2 || plCalls === 0);   // 처음이면 2번(두 쪽), 저장돼 있으면 0번
const before = plCalls; await fetch(BASE + '/api/chart?cat=ost'); assert.equal(plCalls, before);  // 하루 안에는 저장본
assert.equal((await fetch(BASE + '/api/chart?cat=nope')).status, 404);
yt.close();
console.log('chart ok');
