// 테스트용 가짜 유튜브 IFrame API — 시간은 실제 시계로 흐르고, 재생 기록을 window.__plays에 남김
(function(){
  const TITLES = window.__ytTitles || {};
  window.__plays = [];
  class Player {
    constructor(id, opts){
      this.opts = opts; this.el = document.getElementById(id);
      const f = document.createElement('div'); f.className = 'fake-yt'; f.style.cssText = 'width:100%;height:100%;background:#335;color:#fff;display:grid;place-items:center';
      this.el.replaceWith(f); this.el = f;
      this.vid = null; this.state = -1; this.t = 0; this.base = 0; this.since = 0; this.muted = false;
      setTimeout(() => opts.events.onReady && opts.events.onReady({ target: this }), 50);
    }
    _set(s){ this.state = s; this.opts.events.onStateChange && this.opts.events.onStateChange({ data: s, target: this }); }
    _now(){ if(this.pending != null) return this.base; return this.state === 1 ? this.base + (performance.now() - this.since) / 1000 : this.base; }
    loadVideoById(o){ this.vid = o.videoId; this.base = o.startSeconds || 0; this.el.textContent = 'video ' + this.vid;
      if(/^BAD/.test(this.vid)){ setTimeout(() => this.opts.events.onError({ data: 150 }), 100); return; }
      this._set(3); setTimeout(() => { this.since = performance.now(); this._set(1); }, 200); }
    cueVideoById(o){ this.vid = o.videoId; this.base = o.startSeconds || 0; this._set(5); }
    playVideo(){ if(this._pz){ clearTimeout(this._pz); this._pz = 0; } if(this.state === 1) return; this._set(3); setTimeout(() => { this.since = performance.now(); this._set(1); if(this.pending != null){ const t = this.pending; this.pending = null; setTimeout(() => { this.base = t; this.since = performance.now(); }, 300); } window.__plays.push({ vid: this.vid, from: this.base, muted: this.muted, at: performance.now() }); }, 120); }
    pauseVideo(now){ if(window.__coarse && this.state === 1 && !now){ if(!this._pz){ this._pz = setTimeout(() => { this._pz = 0; this.pauseVideo(true); }, 150); } return; } if(this.state === 1){ this.base = this._now(); } const last = window.__plays[window.__plays.length - 1]; if(last && last.to == null && this.state === 1) last.to = this.base; this._set(2); }
    stopVideo(){ this.base = 0; this._set(0); }
    seekTo(t){ if(window.__mobileStale && this.state !== 1){ this.pending = t; return; } this.base = t; if(this.state === 1) this.since = performance.now(); }
    getCurrentTime(){ if(!window.__coarse) return this._now(); const n = performance.now(); if(!this._ct || n - this._ct >= 250 || this.state !== 1){ this._ct = n; this._cv = this._now(); } return this._cv; }
    getPlayerState(){ return this.state; }
    getDuration(){ return this.vid ? 200 : 0; }
    getVideoData(){ return { title: TITLES[this.vid] || ('Official MV ' + this.vid), author: 'Label' }; }
    mute(){ this.muted = true; } unMute(){ this.muted = false; } setVolume(){}
  }
  window.YT = { Player: Player, PlayerState: { PLAYING: 1 } };
  setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 10);
})();
