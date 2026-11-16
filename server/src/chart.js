// 유튜브 인기 음악(한국) — YouTube Data API v3 videos.list(chart=mostPopular, regionCode=KR, videoCategoryId=10)
// 서버가 6시간마다 받아 Durable Object에 저장해 두고, 게임은 GET /api/chart 로 가져가요. API 키는 Cloudflare 비밀값 YOUTUBE_API_KEY.

export const CHART_TTL = 6 * 60 * 60 * 1000;          // 인기 음악: 6시간
export const PLAYLIST_TTL = 24 * 60 * 60 * 1000;      // 카테고리 재생목록: 하루 한 번
const MAX_SONGS = 100;
const MAX_PL_SONGS = 200;

// 카테고리 카드 → 유튜브 재생목록 (바꾸거나 더하려면 여기만 고치면 돼요)
export const PLAYLISTS = {
  krtop:  { list: 'PL4fGSI1pDJn6jXS_Tv_N9B8Z0HTRVJE0m', name: '한국 TOP 100' },        // YouTube Music Global Charts
  hits00: { list: 'RDCLAK5uy_mBByyHJ1EbCFdlduTYAgeVJpCtOjcR0h8', name: '2000년대 히트곡' }, // YouTube 공식
  hits10: { list: 'RDCLAK5uy_na4azCRpw21U2TJAdH3TNQo3FwhRQqAVk', name: '2010년대 히트곡' }, // YouTube 공식
  ost:    { list: 'RDCLAK5uy_lOLzp6hkiifnFubcBWM1GgRSnCTKcc_bg', name: '드라마 OST' },     // YouTube 공식
  dance00:{ list: 'PLooeWILrVByL5_q0cGVJ4EFV_I6dM-VBI', name: '2000년대 댄스' },
  ballad20:{ list: 'PLl8Xb8msUKHysn4Zf_GRoZYl_m0tovuHg', name: '2020년대 발라드' },
  hiphop: { list: 'PLFm1M1t6UclkCA47HxC-IaqzM5qSM8Umv', name: '국내 힙합' },
  carol:  { list: 'PLWUXmX2htJ7OzJNLeLuw6_Q-AJDzcJ_R2', name: '크리스마스 캐롤' },
};

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
  // 자동 생성 음원(채널 이름 "가수 - Topic")은 영상 제목이 곧 노래 제목
  const topic = /^(.*?)\s*-\s*Topic$/i.exec(String(channel || '').trim());
  const q = topic ? null : s.match(/^(.*?)\s*['‘’"“”「『]([^'‘’"“”」』]{1,60})['‘’"“”」』]/);
  if (topic) { out.title = s; out.artist = topic[1]; }
  else if (q) { out.title = q[2]; out.artist = q[1]; }
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
async function ytGet(env, path, params) {
  const base = env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3';
  const r = await fetch(`${base}/${path}?${new URLSearchParams({ ...params, key: env.YOUTUBE_API_KEY })}`);
  if (!r.ok) {
    let reason = '';
    try { reason = ((await r.json()).error.errors[0] || {}).reason || ''; } catch (e) {}
    return { error: 'youtube_' + r.status + (reason ? '_' + reason : '') };
  }
  return r.json();
}
function toSong(it, rank) {
  if (!it || typeof it.id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(it.id)) return null;
  if (it.status && it.status.embeddable === false) return null;
  if (it.status && it.status.privacyStatus && it.status.privacyStatus === 'private') return null;
  const sec = isoDur(it.contentDetails && it.contentDetails.duration);
  if (sec && (sec < 90 || sec > 600)) return null;
  const sn = it.snippet || {};
  const g = guessTitle(sn.title, sn.channelTitle);
  if (!g.title) return null;
  return { v: it.id, t: g.title, a: g.artist, raw: String(sn.title || '').slice(0, 120), rank };
}

// 재생목록 → 게임용 목록 (순서 유지, 지워진·비공개·퍼가기 막힌·너무 짧거나 긴 영상은 뺌)
export async function fetchPlaylist(env, listId) {
  if (!env.YOUTUBE_API_KEY) return { error: 'no_key' };
  const ids = [];
  let page = '';
  for (let i = 0; i < 4 && ids.length < MAX_PL_SONGS; i++) {
    const d = await ytGet(env, 'playlistItems', { part: 'contentDetails', playlistId: listId, maxResults: '50', ...(page ? { pageToken: page } : {}) });
    if (d.error) return d.error === 'youtube_404_playlistNotFound' ? { error: 'playlist_gone' } : d;
    for (const it of d.items || []) { const v = it && it.contentDetails && it.contentDetails.videoId; if (v && !ids.includes(v)) ids.push(v); }
    if (!d.nextPageToken) break;
    page = d.nextPageToken;
  }
  const songs = [];
  for (let i = 0; i < ids.length; i += 50) {
    const d = await ytGet(env, 'videos', { part: 'snippet,contentDetails,status', id: ids.slice(i, i + 50).join(','), hl: 'ko', maxResults: '50' });
    if (d.error) return d;
    const byId = new Map((d.items || []).map(x => [x.id, x]));
    for (const v of ids.slice(i, i + 50)) { const s = toSong(byId.get(v), songs.length + 1); if (s) songs.push(s); }
  }
  if (!songs.length) return { error: 'empty' };
  return { songs: songs.slice(0, MAX_PL_SONGS) };
}

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
      const s = toSong(it, songs.length + 1);
      if (s) songs.push(s);
      if (songs.length >= MAX_SONGS) break;
    }
    if (!d.nextPageToken) break;
    page = d.nextPageToken;
  }
  if (!songs.length) return { error: 'empty' };
  return { songs };
}

// 목록 하나(인기 음악 'KR' 또는 카테고리 하나)를 들고 있는 Durable Object — 이름이 곧 카테고리
export class Chart {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async refresh(cat) {
    const pl = PLAYLISTS[cat];
    const r = pl ? await fetchPlaylist(this.env, pl.list) : await fetchChart(this.env);
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
    const cat = url.searchParams.get('cat') || 'KR';
    const ttl = PLAYLISTS[cat] ? PLAYLIST_TTL : CHART_TTL;
    let data = await this.ctx.storage.get('chart');
    if (url.pathname === '/refresh' || !data || Date.now() - data.updated > ttl) {
      // 너무 자주 부르지 않게: 실패는 10분 동안 다시 안 함
      const last = await this.ctx.storage.get('lastError');
      // 키가 없어서 실패했던 거면, 키가 생긴 뒤엔 기다리지 않고 바로 다시 받음
      const retry = !last || Date.now() - last.at > 10 * 60 * 1000 || (last.error === 'no_key' && this.env.YOUTUBE_API_KEY);
      if (url.pathname === '/refresh' || retry) {
        const r = await this.refresh(cat);
        if (!r.error) data = r;
      }
    }
    if (!data) {
      const last = await this.ctx.storage.get('lastError');
      return new Response(JSON.stringify({ error: (last && last.error) || 'not_ready' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ region: 'KR', cat, updated: data.updated, songs: data.songs }), { headers: { 'Content-Type': 'application/json' } });
  }
}
