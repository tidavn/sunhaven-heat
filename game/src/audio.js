// Sound for Sunhaven Heat, all synthesised with WebAudio: no audio
// files are shipped. Engine hum follows the car's speed, the siren
// wails while the police chase, and short blips cover pickups, shots,
// crashes and mission stings. Everything is guarded: a browser with
// no audio (or a muted tab) simply stays silent.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
  }

  /** Call from a user gesture (a key or click) — browsers block audio before one. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.ctx.destination);
      this.sirenOsc.start();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.engineGain) this.engineGain.gain.value = 0;
    if (this.sirenGain) this.sirenGain.gain.value = 0;
  }

  /** Engine hum: 0 when parked, rising with speed. */
  engine(speed, maxSpeed) {
    if (!this.ctx || this.muted) return;
    const t = Math.abs(speed) / Math.max(1, maxSpeed);
    this.engineOsc.frequency.value = 52 + t * 130;
    this.engineGain.gain.value = speed === 0 ? 0 : 0.05 + t * 0.05;
  }

  /** Two-tone siren while the police are chasing. */
  siren(active, nowSeconds) {
    if (!this.ctx || this.muted) return;
    if (!active) {
      this.sirenGain.gain.value = 0;
      this.sirenOn = false;
      return;
    }
    this.sirenOn = true;
    this.sirenOsc.frequency.value = Math.sin(nowSeconds * 4.4) > 0 ? 880 : 660;
    this.sirenGain.gain.value = 0.045;
  }

  _blip(freq, dur, type = 'sine', gain = 0.12) {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + dur);
    } catch {
      // Silence is fine.
    }
  }

  _noise(dur, gain = 0.2) {
    if (!this.ctx || this.muted) return;
    try {
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(g);
      g.connect(this.ctx.destination);
      src.start();
    } catch {
      // Silence is fine.
    }
  }

  pickup() {
    this._blip(880, 0.12);
    setTimeout(() => this._blip(1318, 0.16), 70);
  }

  coin() {
    this._blip(1046, 0.1);
    setTimeout(() => this._blip(1568, 0.18), 60);
  }

  gunshot() {
    this._noise(0.14, 0.3);
  }

  punch() {
    this._noise(0.08, 0.18);
  }

  crash() {
    this._noise(0.25, 0.3);
    this._blip(90, 0.2, 'sine', 0.2);
  }

  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._blip(f, 0.22), i * 110));
  }

  missionFail() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this._blip(f, 0.25, 'triangle'), i * 140));
  }

  busted() {
    [440, 440, 349].forEach((f, i) => setTimeout(() => this._blip(f, 0.3, 'square', 0.08), i * 160));
  }
}
