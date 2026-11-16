// 1초 노래 퀴즈 — 같이 하기 방 서버
// 출제자(host) 휴대폰에서 노래가 나오고, 참가자(player)는 각자 휴대폰으로 문제 상황·'알아요!' 버튼·순위를 봐요.
// 정답(곡 제목)은 출제자가 정답을 공개할 때만 보내요. 방이 6시간 동안 쓰이지 않으면 모두 지워요.

import { Chart } from './chart.js';
export { Chart };

const PHASES = ['lobby', 'question', 'reveal', 'end'];
const TTL = 6 * 60 * 60 * 1000;          // 마지막 사용 뒤 6시간이면 방 정리
const MAX_PLAYERS = 60;
const MAX_MSG = 20_000;                   // 한 번에 받는 메시지 최대 크기
const VID_RE = /^[A-Za-z0-9_-]{11}$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const rid = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''); };
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

export default {
  // 6시간마다 차트 새로 받기 (wrangler.toml [triggers])
  async scheduled(event, env, ctx) {
    const stub = env.CHART.get(env.CHART.idFromName('KR'));
    ctx.waitUntil(stub.fetch('https://chart/refresh'));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      const hostKey = rid(24);
      for (let i = 0; i < 8; i++) {
        const a = new Uint32Array(1); crypto.getRandomValues(a);
        const code = String(10000 + (a[0] % 90000));
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        const r = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ hostKey, code }) });
        if ((await r.json()).ok) return json({ code, hostKey });
      }
      return json({ error: 'busy' }, 503);
    }

    let m = url.pathname.match(/^\/api\/rooms\/(\d{5})$/);
    if (m) {
      const stub = env.ROOM.get(env.ROOM.idFromName(m[1]));
      return json(await (await stub.fetch('https://room/info')).json());
    }

    m = url.pathname.match(/^\/ws\/(\d{5})$/);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket only' }, 426);
      const stub = env.ROOM.get(env.ROOM.idFromName(m[1]));
      return stub.fetch(new Request('https://room/ws' + url.search, req));
    }

    // ---- 노래 목록 공유 링크 ----
    if (url.pathname === '/api/packs' && req.method === 'POST') {
      const text = await req.text();
      if (text.length > PACK_MAX_BODY) return json({ error: 'too_large' }, 413);
      let d; try { d = JSON.parse(text); } catch (e) { return json({ error: 'bad_json' }, 400); }
      const pack = cleanPack(d);
      if (!pack) return json({ error: 'bad_pack' }, 400);
      const id = rid(10), delKey = rid(20);
      const stub = env.PACK.get(env.PACK.idFromName(id));
      const r = await stub.fetch('https://pack/put', { method: 'POST', body: JSON.stringify({ ...pack, delKey }) });
      if (!r.ok) return json({ error: 'save_failed' }, 500);
      const meta = await r.json();
      return json({ id, delKey, expires: meta.expires, count: pack.songs.length });
    }
    m = url.pathname.match(/^\/api\/packs\/([a-z0-9]{10})$/);
    if (m) {
      const stub = env.PACK.get(env.PACK.idFromName(m[1]));
      if (req.method === 'GET') return stub.fetch('https://pack/get');
      if (req.method === 'DELETE') return stub.fetch('https://pack/del?key=' + encodeURIComponent(url.searchParams.get('key') || ''), { method: 'POST' });
    }

    // ---- 유튜브 인기 음악(한국) ----
    if (url.pathname === '/api/chart' && req.method === 'GET') {
      const stub = env.CHART.get(env.CHART.idFromName('KR'));
      const r = await stub.fetch('https://chart/get');
      return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
    }

    if (url.pathname === '/' || url.pathname === '/api/health') return json({ ok: true, app: 'songquiz-room' });
    return json({ error: 'not found' }, 404);
  },
};

// ---- 노래 목록 공유 링크: 링크를 아는 사람만, 30일 뒤 자동 삭제 ----
const PACK_TTL = 30 * 24 * 60 * 60 * 1000;
const PACK_MAX_BODY = 200_000;
const PACK_MAX_SONGS = 300;
function cleanPack(d) {
  if (!d || d.app !== 'songquiz' || !Array.isArray(d.songs)) return null;
  const songs = [], seen = new Set();
  for (const o of d.songs) {
    if (!o || typeof o.v !== 'string' || !VID_RE.test(o.v) || seen.has(o.v)) continue;
    const t = str(o.t, 60); if (!t) continue;
    seen.add(o.v);
    const x = { v: o.v, t, a: str(o.a, 40) };
    if (typeof o.s === 'number' && isFinite(o.s) && o.s >= 0 && o.s < 36000) x.s = Math.round(o.s * 10) / 10;
    if (Array.isArray(o.c)) x.c = o.c.slice(0, 4).map(k => str(k, 30)).filter(Boolean);
    songs.push(x);
  }
  if (songs.length < 1 || songs.length > PACK_MAX_SONGS) return null;
  const st = d.settings && typeof d.settings === 'object' ? d.settings : {};
  const settings = { stages: ['hard', 'normal', 'easy'].includes(st.stages) ? st.stages : 'normal', choices: !!st.choices, random: !!st.random };
  return { title: str(d.title, 40) || `노래 ${songs.length}곡`, songs, settings };
}

export class Pack {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(req) {
    const url = new URL(req.url), st = this.ctx.storage;
    const meta = await st.get('meta');
    const live = meta && Date.now() < meta.expires;
    if (url.pathname === '/put') {
      if (meta) return json({ error: 'exists' }, 409);
      const d = await req.json(), now = Date.now();
      await st.put({ meta: { title: d.title, settings: d.settings, created: now, expires: now + PACK_TTL, delKey: d.delKey }, songs: d.songs });
      await st.setAlarm(now + PACK_TTL);
      return json({ ok: true, expires: now + PACK_TTL });
    }
    if (url.pathname === '/get') {
      if (!live) return json({ error: 'not_found' }, 404);
      return json({ app: 'songquiz', v: 1, title: meta.title, settings: meta.settings, songs: (await st.get('songs')) || [], created: meta.created, expires: meta.expires });
    }
    if (url.pathname === '/del') {
      if (!meta) return json({ ok: true, gone: true });
      if (url.searchParams.get('key') !== meta.delKey) return json({ error: 'bad_key' }, 403);
      await st.deleteAlarm(); await st.deleteAll();
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
}

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    ctx.blockConcurrencyWhile(async () => {
      this.meta = (await ctx.storage.get('meta')) || null;
      this.state = (await ctx.storage.get('state')) || { phase: 'lobby' };
      this.players = (await ctx.storage.get('players')) || {};
      this.awards = (await ctx.storage.get('awards')) || {};
      this.buzz = (await ctx.storage.get('buzz')) || {};
    });
  }

  alive() { return !!this.meta && Date.now() - this.meta.touched < TTL; }

  async touch() {
    this.meta.touched = Date.now();
    await this.ctx.storage.put('meta', this.meta);
    await this.ctx.storage.setAlarm(Date.now() + TTL + 60_000);
  }

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/init') {
      if (this.alive()) return json({ ok: false });
      const { hostKey, code } = await req.json();
      await this.ctx.storage.deleteAll();
      this.meta = { hostKey, code, created: Date.now(), touched: Date.now() };
      this.state = { phase: 'lobby' };
      this.players = {};
      this.awards = {};
      this.buzz = {};
      await this.ctx.storage.put({ meta: this.meta, state: this.state, players: this.players, awards: this.awards, buzz: this.buzz });
      await this.ctx.storage.setAlarm(Date.now() + TTL + 60_000);
      return json({ ok: true });
    }

    if (url.pathname === '/info') {
      if (!this.alive()) return json({ exists: false });
      return json({ exists: true, phase: this.state.phase, players: Object.keys(this.players).length });
    }

    if (url.pathname === '/ws') {
      if (!this.alive()) return json({ error: 'no room' }, 404);
      const role = url.searchParams.get('role');
      let att;
      if (role === 'host') {
        if (url.searchParams.get('key') !== this.meta.hostKey) return json({ error: 'bad key' }, 403);
        for (const ws of this.ctx.getWebSockets('host')) { try { ws.close(4000, 'replaced'); } catch (e) {} }
        att = { role: 'host' };
      } else {
        let pid = url.searchParams.get('pid') || '';
        if (!/^[a-z0-9]{8,20}$/.test(pid)) pid = rid(12);
        const name = str(url.searchParams.get('name'), 12) || '참가자';
        if (!this.players[pid]) {
          if (Object.keys(this.players).length >= MAX_PLAYERS) return json({ error: 'full' }, 403);
          this.players[pid] = { name, joined: Date.now() };
        } else {
          this.players[pid].name = name;
        }
        await this.ctx.storage.put('players', this.players);
        for (const ws of this.ctx.getWebSockets('p:' + pid)) { try { ws.close(4000, 'replaced'); } catch (e) {} }
        att = { role: 'player', pid };
      }
      const pair = new WebSocketPair();
      const tags = att.role === 'host' ? ['host'] : ['player', 'p:' + att.pid];
      this.ctx.acceptWebSocket(pair[1], tags);
      pair[1].serializeAttachment(att);
      await this.touch();
      pair[1].send(JSON.stringify({ t: 'welcome', role: att.role, pid: att.pid || null, code: this.meta.code, state: this.state, players: this.playerList(), buzz: this.buzzNow(), now: Date.now() }));
      this.broadcastPlayers();
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return json({ error: 'not found' }, 404);
  }

  onlinePids() {
    const s = new Set();
    for (const ws of this.ctx.getWebSockets('player')) {
      const a = ws.deserializeAttachment();
      if (a && a.pid && ws.readyState === 1) s.add(a.pid);
    }
    return s;
  }

  playerList() {
    const online = this.onlinePids();
    const score = {};
    for (const a of Object.values(this.awards)) for (const pid of a.pids) score[pid] = (score[pid] || 0) + a.pts;
    return {
      host: this.ctx.getWebSockets('host').some(ws => ws.readyState === 1),
      awards: this.awards,
      list: Object.entries(this.players)
        .map(([pid, p]) => ({ pid, name: p.name, score: score[pid] || 0, online: online.has(pid), joined: p.joined }))
        .sort((a, b) => a.joined - b.joined),
    };
  }

  // 지금 문제의 '알아요!' 순서: [{pid, ms}] — ms는 그 단계 재생을 시작하고 몇 ms 뒤에 눌렀는지
  buzzNow() {
    const s = this.state;
    if (s.phase !== 'question' && s.phase !== 'reveal') return { q: -1, list: [] };
    return { q: s.q, list: this.buzz[s.q] || [] };
  }

  send(ws, obj) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) {} }
  broadcast(obj, tag) { const s = JSON.stringify(obj); for (const ws of this.ctx.getWebSockets(tag)) this.send(ws, s); }
  broadcastPlayers() { this.broadcast({ t: 'players', players: this.playerList() }); }
  broadcastBuzz() { this.broadcast({ t: 'buzz', buzz: this.buzzNow() }); }

  cleanState(s) {
    if (!s || typeof s !== 'object' || !PHASES.includes(s.phase)) return null;
    const out = { phase: s.phase };
    const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi ? v : null;
    out.total = int(s.total, 0, 500) ?? 0;
    if (s.phase === 'lobby' || s.phase === 'end') return out;
    out.q = int(s.q, 0, 499) ?? 0;
    out.stage = int(s.stage, 0, 3) ?? 0;
    out.stages = Array.isArray(s.stages) && s.stages.length === 4 && s.stages.every(v => typeof v === 'number' && v > 0 && v <= 60)
      ? s.stages.map(v => Math.round(v * 10) / 10) : [1, 3, 5, 10];
    out.pts = int(s.pts, 0, 4) ?? 1;
    // 재생 중 표시: 몇 번째 재생인지(n)와 길이(sec). 시각은 서버가 받은 때로 찍음
    if (s.play && typeof s.play === 'object' && int(s.play.n, 0, 100000) != null && typeof s.play.sec === 'number' && s.play.sec > 0 && s.play.sec <= 60) {
      const prev = this.state && this.state.play;
      const same = prev && prev.n === s.play.n && this.state.q === out.q;
      out.play = { n: s.play.n, sec: Math.round(s.play.sec * 10) / 10, at: same ? prev.at : Date.now() };
    }
    out.choices = Array.isArray(s.choices) ? s.choices.slice(0, 4).map(c => str(c, 60)) : null;
    if (s.phase === 'reveal' && s.answer && typeof s.answer === 'object') {
      out.answer = { title: str(s.answer.title, 60), artist: str(s.answer.artist, 40) };
      if (typeof s.answer.vid === 'string' && VID_RE.test(s.answer.vid)) out.answer.vid = s.answer.vid;
    }
    return out;
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return;
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    const att = ws.deserializeAttachment() || {};

    if (msg.t === 'ping') { this.send(ws, { t: 'pong', now: Date.now() }); return; }

    if (att.role === 'host') {
      if (msg.t === 'state') {
        const s = this.cleanState(msg.state);
        if (!s) return;
        const qChanged = s.q !== this.state.q || s.phase === 'lobby' || s.phase === 'end';
        this.state = s;
        await this.ctx.storage.put('state', s);
        this.broadcast({ t: 'state', state: s, now: Date.now() }, 'player');
        if (qChanged) this.broadcastBuzz();
        await this.touch();
      } else if (msg.t === 'award') {
        const q = Number.isInteger(msg.q) && msg.q >= 0 && msg.q < 500 ? msg.q : null;
        if (q == null) return;
        const pts = Number.isInteger(msg.pts) && msg.pts >= 0 && msg.pts <= 4 ? msg.pts : 1;
        const pids = Array.isArray(msg.pids) ? [...new Set(msg.pids)].filter(p => this.players[p]) : [];
        if (pids.length) this.awards[q] = { pids, pts }; else delete this.awards[q];
        await this.ctx.storage.put('awards', this.awards);
        this.broadcastPlayers();
      } else if (msg.t === 'resetScores') {
        this.awards = {};
        this.buzz = {};
        await this.ctx.storage.put({ awards: this.awards, buzz: this.buzz });
        this.broadcastPlayers();
        this.broadcastBuzz();
      } else if (msg.t === 'clearBuzz') {
        const q = this.state.q;
        if (q != null && this.buzz[q]) { delete this.buzz[q]; await this.ctx.storage.put('buzz', this.buzz); }
        this.broadcastBuzz();
      } else if (msg.t === 'kick') {
        const pid = String(msg.pid || '');
        if (this.players[pid]) {
          delete this.players[pid];
          for (const a of Object.values(this.awards)) a.pids = a.pids.filter(p => p !== pid);
          for (const q of Object.keys(this.buzz)) this.buzz[q] = this.buzz[q].filter(b => b.pid !== pid);
          await this.ctx.storage.put({ players: this.players, awards: this.awards, buzz: this.buzz });
          for (const w of this.ctx.getWebSockets('p:' + pid)) { this.send(w, { t: 'kicked' }); try { w.close(4001, 'kicked'); } catch (e) {} }
          this.broadcastPlayers();
          this.broadcastBuzz();
        }
      }
    } else if (att.role === 'player') {
      if (msg.t === 'name' && this.players[att.pid]) {
        const name = str(msg.name, 12);
        if (name) { this.players[att.pid].name = name; await this.ctx.storage.put('players', this.players); this.broadcastPlayers(); }
      } else if (msg.t === 'buzz' && this.players[att.pid]) {
        const s = this.state;
        if (s.phase !== 'question' || msg.q !== s.q) return;
        const list = this.buzz[s.q] || (this.buzz[s.q] = []);
        if (list.some(b => b.pid === att.pid) || list.length >= MAX_PLAYERS) return;
        list.push({ pid: att.pid, stage: s.stage, ms: s.play ? Math.max(0, Date.now() - s.play.at) : null });
        await this.ctx.storage.put('buzz', this.buzz);
        this.broadcastBuzz();
      }
    }
  }

  async webSocketClose(ws) { try { ws.close(); } catch (e) {} this.broadcastPlayers(); }
  async webSocketError() { this.broadcastPlayers(); }

  async alarm() {
    if (this.meta && Date.now() - this.meta.touched < TTL) {
      await this.ctx.storage.setAlarm(this.meta.touched + TTL + 60_000);
      return;
    }
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(4002, 'expired'); } catch (e) {} }
    await this.ctx.storage.deleteAll();
    this.meta = null; this.state = { phase: 'lobby' }; this.players = {}; this.awards = {}; this.buzz = {};
  }
}
