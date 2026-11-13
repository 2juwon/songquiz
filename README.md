# 1초 노래 맞히기

노래 한 토막만 듣고 제목을 맞히는 파티 게임. 1초 → 3초 → 5초 → 10초로 늘려 가며 들려주고, 짧게 듣고 맞힐수록 점수가 커요(4·3·2·1점).

- 주소: https://2juwon.github.io/songquiz/
- 노래는 유튜브 공식 플레이어(IFrame API)로 재생해요. 페이지에 음원 파일은 없어요.
- 기본 곡 묶음 2개(2020년대·2010년대 K-pop 공식 뮤비) + 유튜브 링크 붙여넣기(`링크 | 제목 | 가수 | 1:05`)
- 곡마다 시작 지점을 정하거나(구간 정하기) 자동(곡 22~68% 사이 무작위)
- 퍼가기가 막힌 영상·없어진 영상은 저절로 건너뛰고, 기본 곡은 영상 제목이 바뀌었으면 건너뜀
- 혼자 하기(한 화면) / 방 같이 하기: 출제자 휴대폰에서 소리, 참가자는 각자 휴대폰으로 '🙋 알아요!'와 순위
- 목록 공유 링크(`#s=…`, 압축), 내보내기·가져오기(JSON)

## 파일
- `index.html` — 게임 전체
- `server/` — 방 서버 (Cloudflare Worker `songquiz` + Durable Object `Room`). `main`에 push하면 GitHub Actions가 배포 (Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 필요)
- `test/` — 가짜 유튜브 플레이어(`fake-yt.js`)로 하는 브라우저 시험

## 시험
```
cd server && npm ci && npm run dev     # 127.0.0.1:8787
node test/room.test.mjs                # 서버 시험 (server 폴더에서)
python3 -m http.server 8080            # 저장소 폴더에서
node test/play.test.mjs                # 브라우저 시험 (playwright)
```
