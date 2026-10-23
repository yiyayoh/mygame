// 背景雨：画布上的雨丝 + 用 Web Audio 合成的雨声（不需要任何音频文件）。
export class Rain {
  constructor(canvas, getAudioContext = () => new (window.AudioContext || window.webkitAudioContext)()) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.drops = [];
    this.audio = null;
    this.getAudioContext = getAudioContext;
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round((this.w * this.h) / 9000);
    this.drops = Array.from({ length: count }, () => this.newDrop(true));
  }

  newDrop(anywhere) {
    return {
      x: Math.random() * (this.w + 100),
      y: anywhere ? Math.random() * this.h : -20,
      len: 10 + Math.random() * 18,
      speed: 7 + Math.random() * 8,
      alpha: 0.08 + Math.random() * 0.18,
    };
  }

  start() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tick = () => {
      const { ctx } = this;
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.lineWidth = 1;
      for (const d of this.drops) {
        ctx.strokeStyle = `rgba(170,185,210,${d.alpha})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * 0.18, d.y + d.len);
        ctx.stroke();
        d.y += d.speed;
        d.x -= d.speed * 0.18;
        if (d.y > this.h) Object.assign(d, this.newDrop(false));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  soundOn() {
    if (!this.audio) {
      const ac = this.getAudioContext();
      // 两秒的粉红噪声循环播放，经低通滤波后就是比较柔和的雨声
      const buffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.12;
      }
      const src = ac.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1600;
      const gain = ac.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(ac.destination);
      src.start();
      this.audio = { ac, gain };
    }
    const { ac, gain } = this.audio;
    ac.resume().catch(() => {});
    gain.gain.setTargetAtTime(0.5, ac.currentTime, 0.6);
  }

  soundOff() {
    if (!this.audio) return;
    const { ac, gain } = this.audio;
    gain.gain.setTargetAtTime(0, ac.currentTime, 0.3);
  }
}
