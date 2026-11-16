// 재생목록 후보 찾기 (GitHub Actions에서 YOUTUBE_API_KEY로 실행, 키는 출력하지 않음)
// node tools/find-playlists.mjs "검색어1" "검색어2" ...   또는  CHECK=PLxxx,PLyyy 로 특정 재생목록 내용 확인
const key = process.env.YOUTUBE_API_KEY;
if (!key) { console.log('YOUTUBE_API_KEY 없음'); process.exit(1); }
const API = 'https://www.googleapis.com/youtube/v3';
const get = async (path, q) => { const r = await fetch(`${API}/${path}?${new URLSearchParams({ ...q, key })}`); const d = await r.json(); if (d.error) throw new Error(d.error.message); return d; };
const queries = process.argv.slice(2);
const seen = new Map();
for (const q of queries) {
  const d = await get('search', { part: 'snippet', type: 'playlist', q, maxResults: '10', regionCode: 'KR', relevanceLanguage: 'ko' });
  const ids = d.items.map(i => i.id.playlistId);
  const info = ids.length ? await get('playlists', { part: 'snippet,contentDetails', id: ids.join(','), maxResults: '50' }) : { items: [] };
  console.log(`\n### 검색: ${q}`);
  for (const p of info.items) {
    console.log(`- ${p.id} | ${p.snippet.title} | 채널: ${p.snippet.channelTitle} | ${p.contentDetails.itemCount}곡`);
    seen.set(p.id, p);
  }
}
const checks = (process.env.CHECK || '').split(',').map(s => s.trim()).filter(Boolean);
for (const id of checks) {
  let items = [], page = '';
  try {
    for (let i = 0; i < 4; i++) {
      const d = await get('playlistItems', { part: 'snippet,contentDetails', playlistId: id, maxResults: '50', ...(page ? { pageToken: page } : {}) });
      items.push(...d.items); if (!d.nextPageToken) break; page = d.nextPageToken;
    }
  } catch (e) { console.log(`\n### 확인 ${id}: 못 읽음 (${e.message})`); continue; }
  const vids = items.map(i => i.contentDetails.videoId).filter(Boolean);
  let emb = 0, ok = 0, official = 0;
  for (let i = 0; i < vids.length; i += 50) {
    const d = await get('videos', { part: 'status,contentDetails,snippet', id: vids.slice(i, i + 50).join(',') });
    for (const v of d.items) {
      ok++; if (v.status.embeddable) emb++;
      if (/official|mv|m\/v|뮤직비디오/i.test(v.snippet.title) || /vevo|official|entertainment|music|1thek|stone|genie|kakao/i.test(v.snippet.channelTitle)) official++;
    }
  }
  console.log(`\n### 확인 ${id}: ${items.length}개 중 살아 있는 영상 ${ok}, 퍼가기 가능 ${emb}, 공식으로 보이는 것 ${official}`);
  for (const it of items.slice(0, 12)) console.log(`   · ${it.snippet.title} (${it.snippet.videoOwnerChannelTitle || '?'})`);
}
