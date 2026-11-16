// 유튜브 인기 음악(한국) — YouTube Data API v3 videos.list(chart=mostPopular, regionCode=KR, videoCategoryId=10)
// 서버가 6시간마다 받아 Durable Object에 저장해 두고, 게임은 GET /api/chart 로 가져가요. API 키는 Cloudflare 비밀값 YOUTUBE_API_KEY.

export const CHART_TTL = 6 * 60 * 60 * 1000;
const MAX_SONGS = 100;

// "PT3M25S" → 205
export function isoDur(s) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(s || ''));
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

// 뮤직비디오 제목에서 노래 제목·가수를 추림
//  "IVE 아이브 'REBEL HEART' MV" → {title:'REBEL HEART', artist:'IVE 아이브'}
//  "[MV] 아이유(IU) _ 바이, 썸머(Bye, Summer)" → {title:'바이, 썸머(Bye, Summer)', artist:'아이유(IU)'}
//  "ROSÉ & Bruno Mars - APT. (Official Music Video)" → {title:'APT.', artist:'ROSÉ & Bruno Mars'}
export function guessTitle(raw, channel) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  const out = { title: '', artist: '' };
  if (!s) return out;
  s = s.replace(/^\s*(\[[^\]]*\]|【[^】]*】)\s*/g, '');
  const q = s.match(/^(.*?)\s*['‘’"“”「『]([^'‘’"“”」』]{1,60})['‘’"“”」』]/);
  if (q) { out.title = q[2]; out.artist = q[1]; }
  else {
    const d = s.split(/\s+[-–—|_]\s+/);
    if (d.length >= 2) { out.artist = d[0]; out.title = d.slice(1).join(' '); } else out.title = s;
  }
  const clean = t => t.replace(/\[[^\]]*\]|【[^】]*】/g, '')
    .replace(/\((?:[^)]*(?:official|mv|m\/v|video|lyric|audio|performance|ver\.?|visualizer|가사|뮤직|특별))[^)]*\)/ig, '')
    .replace(/\b(official\s*)?(music\s*video|mv|m\/v|lyric\s*video|audio|visualizer)\b/ig, '')
    .replace(/\s{2,}/g, ' ').replace(/[\s\-–|:_]+$/, '').replace(/^[\s\-–|:_]+/, '').trim();
  out.title = clean(out.title).slice(0, 60);
  out.artist = clean(out.artist).slice(0, 40);
  if (!out.artist && channel) out.artist = String(channel).replace(/\s*(-\s*topic|official|vevo|channel)\s*$/ig, '').trim().slice(0, 40);
  return out;
}

// 유튜브에서 받아 게임용 목록으로 (퍼가기 막힌 영상·1분 30초 미만(쇼츠 등)·10분 넘는 영상은 뺌)
export async function fetchChart(env) {
  const key = env.YOUTUBE_API_KEY;
  if (!key) return { error: 'no_key' };
  const base = env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3';
  const songs = [];
  let page = '', pages = 0;
  while (songs.length < MAX_SONGS && pages < 4) {
    const q = new URLSearchParams({ part: 'snippet,contentDetails,status', chart: 'mostPopular', regionCode: 'KR', videoCategoryId: '10', maxResults: '50', hl: 'ko', key });
    if (page) q.set('pageToken', page);
    const r = await fetch(`${base}/videos?${q}`);
    if (!r.ok) {
      let reason = '';
      try { reason = ((await r.json()).error.errors[0] || {}).reason || ''; } catch (e) {}
      return { error: 'youtube_' + r.status + (reason ? '_' + reason : '') };
    }
    const d = await r.json();
    pages++;
    for (const it of d.items || []) {
      if (!it || typeof it.id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(it.id)) continue;
      if (it.status && it.status.embeddable === false) continue;
      const sec = isoDur(it.contentDetails && it.contentDetails.duration);
      if (sec && (sec < 90 || sec > 600)) continue;
      const sn = it.snippet || {};
      const g = guessTitle(sn.title, sn.channelTitle);
      if (!g.title) continue;
      songs.push({ v: it.id, t: g.title, a: g.artist, raw: String(sn.title || '').slice(0, 120), rank: songs.length + 1 });
      if (songs.length >= MAX_SONGS) break;
    }
    if (!d.nextPageToken) break;
    page = d.nextPageToken;
  }
  if (!songs.length) return { error: 'empty' };
  return { songs };
}

// 한국 차트 하나를 들고 있는 Durable Object
export class Chart {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async refresh() {
    const r = await fetchChart(this.env);
    const now = Date.now();
    if (r.error) {
      await this.ctx.storage.put('lastError', { error: r.error, at: now });
      return r;
    }
    const data = { updated: now, songs: r.songs };
    await this.ctx.storage.put('chart', data);
    await this.ctx.storage.delete('lastError');
    return data;
  }
  async fetch(req) {
    const url = new URL(req.url);
    let data = await this.ctx.storage.get('chart');
    if (url.pathname === '/refresh' || !data || Date.now() - data.updated > CHART_TTL) {
      // 너무 자주 부르지 않게: 실패는 10분 동안 다시 안 함
      const last = await this.ctx.storage.get('lastError');
      if (url.pathname === '/refresh' || !last || Date.now() - last.at > 10 * 60 * 1000) {
        const r = await this.refresh();
        if (!r.error) data = r;
      }
    }
    if (!data) {
      const last = await this.ctx.storage.get('lastError');
      return new Response(JSON.stringify({ error: (last && last.error) || 'not_ready' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ region: 'KR', updated: data.updated, songs: data.songs }), { headers: { 'Content-Type': 'application/json' } });
  }
}
