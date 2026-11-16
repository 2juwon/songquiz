// 노래 목록 공유 링크 시험: node test/pack.test.mjs (wrangler dev 켜 두고)
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const post = b => fetch(BASE + '/api/packs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
// 나쁜 값 거절
assert.equal((await post({ app: 'nunkoip', songs: [] })).status, 400);
assert.equal((await post({ app: 'songquiz', songs: [{ v: 'bad', t: 'x' }] })).status, 400);
assert.equal((await post({ app: 'songquiz', songs: [{ v: 'gdZLi9oWNZg', t: '' }] })).status, 400);
// 올리기 — 이상한 곡·중복은 빠지고, 설정은 정해진 값만
const r = await post({ app: 'songquiz', title: '  회식용 <b>노래</b>  ', settings: { stages: 'easy', choices: 1, random: 0, evil: 'x' }, players: ['철수'],
  songs: [{ v: 'gdZLi9oWNZg', t: 'Dynamite', a: 'BTS', s: 61.25, c: ['dynamite'] }, { v: 'gdZLi9oWNZg', t: '중복' }, { v: 'nope', t: 'x' }, { v: 'BBBBBBBBBBB', t: '둘째', s: -5 }] });
assert.equal(r.status, 200);
const { id, delKey, count, expires } = await r.json();
assert.match(id, /^[a-z0-9]{10}$/); assert.equal(count, 2); assert.ok(expires > Date.now() + 29 * 864e5);
const g = await (await fetch(`${BASE}/api/packs/${id}`)).json();
assert.equal(g.title, '회식용 <b>노래</b>');
assert.deepEqual(g.settings, { stages: 'easy', choices: true, random: false });
assert.deepEqual(g.songs, [{ v: 'gdZLi9oWNZg', t: 'Dynamite', a: 'BTS', s: 61.3, c: ['dynamite'] }, { v: 'BBBBBBBBBBB', t: '둘째', a: '' }]);
assert.equal(g.players, undefined);
// 삭제: 열쇠 틀리면 거절, 맞으면 지워지고 404
assert.equal((await fetch(`${BASE}/api/packs/${id}?key=wrong`, { method: 'DELETE' })).status, 403);
assert.equal((await fetch(`${BASE}/api/packs/${id}?key=${delKey}`, { method: 'DELETE' })).status, 200);
assert.equal((await fetch(`${BASE}/api/packs/${id}`)).status, 404);
assert.equal((await fetch(`${BASE}/api/packs/zzzzzzzzzz`)).status, 404);
console.log('pack ok');
