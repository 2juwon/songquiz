// 로컬 서버(wrangler dev, 기본 http://127.0.0.1:8787)로 방 흐름을 시험해요: node test/room.test.mjs
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const WS = BASE.replace(/^http/, 'ws');
function conn(path) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(WS + path); const inbox = [];
    ws.onmessage = e => inbox.push(JSON.parse(e.data));
    ws.onopen = () => res({ ws, inbox, send: o => ws.send(JSON.stringify(o)), last: t => [...inbox].reverse().find(m => m.t === t) });
    ws.onerror = rej;
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const Q = (q, extra = {}) => ({ phase: 'question', q, total: 3, stage: 0, stages: [1, 3, 5, 10], pts: 4, ...extra });

const { code, hostKey } = await (await fetch(BASE + '/api/rooms', { method: 'POST' })).json();
assert.match(code, /^\d{5}$/);
assert.equal((await (await fetch(`${BASE}/api/rooms/${code}`)).json()).exists, true);
assert.equal((await (await fetch(`${BASE}/api/rooms/00000`)).json()).exists, false);

const badOk = await conn(`/ws/${code}?role=host&key=nope`).then(c => { c.ws.close(); return true; }, () => false);
assert.equal(badOk, false);

const host = await conn(`/ws/${code}?role=host&key=${hostKey}`);
const a = await conn(`/ws/${code}?role=player&pid=aaaaaaaaaa&name=${encodeURIComponent('철수')}`);
await wait(200);
assert.equal(a.last('welcome').state.phase, 'lobby');
let pl = host.last('players').players;
assert.equal(pl.list.length, 1); assert.equal(pl.host, true);

// 문제 상태: 정답은 문제 중에 안 감, 이상한 값은 걸러짐
host.send({ t: 'state', state: Q(0, { play: { n: 1, sec: 1 }, choices: ['가', '나'], answer: { title: '비밀' }, stages: [1, 2, 'x', 4] }) });
await wait(200);
let st = a.last('state').state;
assert.equal(st.phase, 'question'); assert.equal(st.answer, undefined); assert.deepEqual(st.stages, [1, 3, 5, 10]);
assert.equal(st.play.n, 1); assert.ok(st.play.at > 0);
const at1 = st.play.at;
// 같은 재생 번호면 시각 유지, 새 번호면 새 시각
host.send({ t: 'state', state: Q(0, { play: { n: 1, sec: 1 } }) }); await wait(150);
assert.equal(a.last('state').state.play.at, at1);
await wait(30);
host.send({ t: 'state', state: Q(0, { stage: 1, pts: 3, play: { n: 2, sec: 3 } }) }); await wait(150);
assert.ok(a.last('state').state.play.at > at1);

const b = await conn(`/ws/${code}?role=player&name=${encodeURIComponent('영희')}`);
await wait(200);
const bw = b.last('welcome'); assert.equal(bw.state.q, 0); assert.ok(bw.pid);

// 알아요! — 한 사람 한 번, 순서대로, 다른 문제 번호는 무시
b.send({ t: 'buzz', q: 0 }); await wait(80);
a.send({ t: 'buzz', q: 0 }); a.send({ t: 'buzz', q: 0 }); b.send({ t: 'buzz', q: 5 });
await wait(300);
let bz = host.last('buzz').buzz;
assert.equal(bz.q, 0);
assert.deepEqual(bz.list.map(x => x.pid), [bw.pid, 'aaaaaaaaaa']);
assert.equal(bz.list[0].stage, 1); assert.ok(bz.list[0].ms >= 0);

// 참가자는 상태·점수를 바꿀 수 없음
b.send({ t: 'state', state: { phase: 'end' } }); b.send({ t: 'award', q: 0, pids: [bw.pid], pts: 4 });
await wait(200);
assert.equal(a.last('state').state.phase, 'question');

// 점수
host.send({ t: 'award', q: 0, pids: ['aaaaaaaaaa', bw.pid], pts: 4 });
host.send({ t: 'award', q: 0, pids: ['aaaaaaaaaa'], pts: 3 });
host.send({ t: 'award', q: 1, pids: ['aaaaaaaaaa', bw.pid], pts: 2 });
await wait(800);
pl = b.last('players').players.list;
assert.deepEqual(pl.map(p => [p.name, p.score]), [['철수', 5], ['영희', 2]]);

// 정답 공개: 공개 단계에선 알아요 안 받음, 정답 전달
host.send({ t: 'state', state: { ...Q(0), phase: 'reveal', answer: { title: '<b>Dynamite</b>', artist: 'BTS', vid: 'gdZLi9oWNZg' } } });
await wait(200);
st = a.last('state').state;
assert.equal(st.answer.title, '<b>Dynamite</b>'); assert.equal(st.answer.vid, 'gdZLi9oWNZg');
host.send({ t: 'state', state: { ...Q(0), phase: 'reveal', answer: { title: 'x', vid: 'bad id"><' } } }); await wait(150);
assert.equal(a.last('state').state.answer.vid, undefined);

// 다음 문제로 가면 알아요 목록이 비워져서 감
host.send({ t: 'state', state: Q(1) }); await wait(200);
bz = a.last('buzz').buzz; assert.equal(bz.q, 1); assert.equal(bz.list.length, 0);
a.send({ t: 'buzz', q: 1 }); await wait(150);
host.send({ t: 'clearBuzz' }); await wait(150);
assert.equal(host.last('buzz').buzz.list.length, 0);

// 이름 바꾸기, 재접속하면 점수 유지
a.send({ t: 'name', name: '철수왕' }); await wait(150);
a.ws.close(); await wait(300);
pl = host.last('players').players.list;
assert.equal(pl[0].name, '철수왕'); assert.equal(pl[0].online, false);
const a2 = await conn(`/ws/${code}?role=player&pid=aaaaaaaaaa&name=${encodeURIComponent('철수왕')}`);
await wait(200);
assert.equal(a2.last('welcome').players.list.find(p => p.pid === 'aaaaaaaaaa').score, 5);
assert.equal(a2.last('welcome').state.q, 1);

// 내보내기
host.send({ t: 'kick', pid: bw.pid }); await wait(300);
assert.ok(b.last('kicked'));
assert.equal(host.last('players').players.list.length, 1);

// 점수 초기화
host.send({ t: 'resetScores' }); await wait(200);
assert.equal(host.last('players').players.list[0].score, 0);

// 출제자 재접속
const host2 = await conn(`/ws/${code}?role=host&key=${hostKey}`);
await wait(300);
assert.equal(host.ws.readyState, 3);
assert.equal(host2.last('welcome').state.q, 1);
for (const c of [host2, a2]) c.ws.close();
console.log('room ok');
