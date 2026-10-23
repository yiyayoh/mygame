// 原创配乐：轻钢琴、长音与低频节拍。本地合成，不请求外部音频。
const D_MINOR = [[50, 57, 60, 65], [46, 53, 57, 62], [43, 50, 57, 58], [45, 52, 55, 62]];
const WARM = [[53, 60, 64, 69], [48, 55, 62, 64], [50, 57, 60, 65], [46, 53, 60, 62]];

// notes: [半拍位置, MIDI 音高, 持续拍数]；每 8 小节一轮，隔轮有轻微配器变化。
export const MUSIC_SCORES = {
  title: { bpm: 56, chords: D_MINOR, pad: 0.020, bass: 0.038, piano: 0.15, cutoff: 2400,
    notes: [[0, 69, 2.5], [6, 65, 2], [12, 64, 2], [18, 62, 3], [28, 64, 1.5], [32, 65, 3], [42, 72, 2], [48, 69, 3], [58, 64, 2]] },
  investigation: { bpm: 66, chords: D_MINOR, pad: 0.012, bass: 0.035, piano: 0.10, cutoff: 1900, arp: 0.040,
    notes: [[4, 69, 1.5], [14, 64, 2], [26, 65, 2], [36, 62, 2], [46, 67, 1.5], [58, 64, 2]] },
  deduction: { bpm: 82, chords: [[50, 57, 60, 64], [46, 53, 57, 60], [43, 50, 53, 57], [45, 52, 55, 61]], pad: 0.009, bass: 0.04, piano: 0.08, cutoff: 2100, arp: 0.055, pulse: 0.025,
    notes: [[0, 74, 1], [10, 69, 1], [20, 72, 1], [32, 65, 1.5], [42, 64, 1], [54, 69, 1.5]] },
  reflection: { bpm: 50, chords: D_MINOR, pad: 0.018, bass: 0.022, piano: 0.12, cutoff: 1800,
    notes: [[0, 65, 3], [8, 64, 3], [18, 62, 4], [32, 69, 3], [42, 65, 3], [52, 64, 4]] },
  tension: { bpm: 92, chords: [[38, 50, 57, 60], [34, 46, 53, 57], [38, 50, 55, 58], [33, 45, 52, 55]], pad: 0.022, bass: 0.035, piano: 0.075, cutoff: 1400, pulse: 0.050,
    notes: [[2, 69, 1.5], [14, 70, 1], [26, 69, 2], [34, 65, 2], [46, 64, 2], [58, 62, 2]] },
  recording: { bpm: 48, chords: D_MINOR, pad: 0.007, bass: 0, piano: 0.035, cutoff: 1000,
    notes: [[8, 65, 4], [40, 64, 4]] },
  afterglow: { bpm: 58, chords: WARM, pad: 0.015, bass: 0.025, piano: 0.13, cutoff: 2600,
    notes: [[0, 69, 2], [6, 72, 2], [14, 76, 3], [24, 72, 2], [32, 69, 2], [38, 65, 2], [46, 64, 3], [56, 65, 3]] },
};

export const MUSIC_CUES = {
  scene: { prologue: 'title', ch1_arrive: 'investigation', ch1_end: 'investigation', ch1_widow: 'reflection', ch2_open: 'investigation', ch2_end: 'reflection', ch3_open: 'reflection', ch3_end: 'reflection', ch4_open: 'tension', ch4_found: 'tension', ch4_night: 'investigation', recording: 'recording', ch4_after: 'reflection', ch5_open: 'investigation', finale: 'reflection', ending_truth: 'afterglow', ending_silence: 'reflection' },
  hub: { hub1: 'investigation', hub2: 'investigation', hub3: 'investigation', hub4a: 'tension', hub4: 'investigation', hub5: 'reflection' },
  deduction: { d1: 'deduction', d2: 'deduction', d3: 'deduction', d4: 'deduction', d5: 'deduction', d6: 'deduction' },
};

export function musicCueFor(state) {
  const id = state.mode === 'scene' ? state.scene : state.mode === 'hub' ? state.hub : state.ded;
  return MUSIC_CUES[state.mode]?.[id] ?? 'investigation';
}

const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.35));
const OUTPUT_GAIN = 3.6;
function ramp(param, value, now, seconds) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
  else { const current = param.value; param.cancelScheduledValues(now); param.setValueAtTime(current, now); }
  param.linearRampToValueAtTime(value, now + seconds);
}

function mixer(ac, volume) {
  const input = ac.createGain(), master = ac.createGain(), compressor = ac.createDynamicsCompressor();
  const room = ac.createConvolver(), wet = ac.createGain(), dry = ac.createGain();
  const impulse = ac.createBuffer(2, Math.ceil(ac.sampleRate * 1.8), ac.sampleRate);
  let seed = 713;
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 2147483648 - 1) * (1 - i / data.length) ** 3;
    }
  }
  room.buffer = impulse;
  dry.gain.value = 0.86;
  wet.gain.value = 0.22;
  master.gain.value = volume * OUTPUT_GAIN;
  compressor.threshold.value = -16;
  compressor.ratio.value = 3;
  input.connect(dry).connect(master);
  input.connect(room).connect(wet).connect(master);
  master.connect(compressor).connect(ac.destination);
  return { input, master };
}

function layer(ac, cue, destination, now, fade = 2.4) {
  const bus = ac.createGain(), filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = MUSIC_SCORES[cue].cutoff;
  filter.Q.value = 0.3;
  bus.gain.setValueAtTime(fade ? 0 : 1, now);
  if (fade) bus.gain.linearRampToValueAtTime(1, now + fade);
  filter.connect(bus).connect(destination);
  return { cue, bus, filter, voices: new Set(), step: 0, next: now + 0.035, timer: null, cleanup: null };
}

function tone(ac, track, midi, time, duration, amplitude, kind = 'piano') {
  if (!amplitude) return;
  const gain = ac.createGain();
  const attack = kind === 'pad' ? 0.8 : kind === 'pulse' ? 0.03 : 0.012;
  const end = time + duration + (kind === 'pad' ? 1.0 : 0.35);
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(amplitude, time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  const pan = ac.createStereoPanner?.();
  if (pan) { pan.pan.value = kind === 'pad' ? 0 : ((midi % 7) - 3) * 0.07; gain.connect(pan).connect(track.filter); }
  else gain.connect(track.filter);
  const partials = kind === 'piano' ? [1, 0.24, 0.055] : [1];
  let remaining = partials.length;
  for (let i = 0; i < partials.length; i++) {
    const osc = ac.createOscillator(), level = ac.createGain();
    osc.type = kind === 'pad' ? 'triangle' : 'sine';
    osc.frequency.value = frequency(midi) * (i + 1);
    level.gain.value = partials[i];
    osc.connect(level).connect(gain);
    track.voices.add(osc);
    osc.onended = () => { track.voices.delete(osc); osc.disconnect(); level.disconnect(); if (!--remaining) { gain.disconnect(); pan?.disconnect(); } };
    osc.start(time);
    osc.stop(end + 0.02);
  }
}

function scheduleStep(ac, track, step, time) {
  const score = MUSIC_SCORES[track.cue], beat = 60 / score.bpm;
  const position = step % 64, bar = Math.floor(position / 8), chord = score.chords[bar % score.chords.length];
  const variation = Math.floor(step / 64) % 4;
  if (position % 16 === 0) {
    for (const note of chord.slice(1)) tone(ac, track, note, time, beat * 7, score.pad, 'pad');
  }
  if (position % 8 === 0) tone(ac, track, chord[0] < 43 ? chord[0] : chord[0] - 12, time, beat * 2.7, score.bass, 'bass');
  for (const [at, note, length] of score.notes) {
    if (at === position) tone(ac, track, note, time, beat * length, score.piano * (variation === 3 ? 0.82 : 1));
  }
  if (score.arp && bar !== 7 && position % (track.cue === 'deduction' ? 1 : 2) === 0) {
    const pitch = chord[1 + ((Math.floor(position / 2) + variation) % 3)] + 12;
    tone(ac, track, pitch, time, beat * 0.55, score.arp);
  }
  if (score.pulse && position % 2 === 0) tone(ac, track, chord[0] < 43 ? chord[0] : chord[0] - 12, time, beat * 0.23, score.pulse * (position % 8 ? 0.65 : 1), 'pulse');
}

// 使用同一配器和调度代码导出试听，也用于检查实际输出波形。
export function renderMusicPreview(ac, cue, duration = 16, volume = 0.35) {
  const mix = mixer(ac, volume), track = layer(ac, cue, mix.input, 0, 0);
  const halfBeat = 30 / MUSIC_SCORES[cue].bpm;
  for (let step = 0; step * halfBeat < duration - 1.5; step++) scheduleStep(ac, track, step, step * halfBeat);
  ramp(mix.master.gain, 0, duration - 1.5, 1.5);
  return ac.startRendering();
}

export class MusicDirector {
  constructor({ enabled = true, volume = 0.35, onChange = () => {} } = {}) {
    this.enabled = enabled;
    this.volume = clamp(volume);
    this.onChange = onChange;
    this.cue = 'title';
    this.context = null;
    this.current = null;
    this.layers = new Set();
    this.unlocked = false;
    this.hidden = false;
    this.error = false;
    this.disposed = false;
    this.pending = null;
    this.suspendTimer = null;
  }

  get status() {
    return { cue: this.cue, enabled: this.enabled, volume: this.volume, unlocked: this.unlocked, hidden: this.hidden, error: this.error, contextState: this.context?.state ?? 'uninitialized', layers: this.layers.size, voices: [...this.layers].reduce((n, t) => n + t.voices.size, 0) };
  }

  getContext() {
    if (!this.context) {
      const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Audio) throw new Error('Audio unavailable');
      this.context = new Audio({ latencyHint: 'playback' });
      this.mix = mixer(this.context, this.enabled ? this.volume : 0);
      this.context.onstatechange = () => this.onChange(this.status);
    }
    return this.context;
  }

  async unlock() {
    if (this.hidden || this.disposed) return false;
    if (this.pending) return this.pending;
    try {
      const ac = this.getContext();
      if (ac.state === 'running') { this.unlocked = true; this.error = false; this.ensureLayer(); this.onChange(this.status); return true; }
      this.pending = Promise.resolve(ac.resume()).then(() => {
        this.unlocked = ac.state === 'running';
        this.error = false;
        if (!this.hidden && !this.disposed) this.ensureLayer();
        this.onChange(this.status);
        return this.unlocked;
      }).catch(() => { this.error = true; this.onChange(this.status); return false; }).finally(() => { this.pending = null; });
      return this.pending;
    } catch {
      this.error = true;
      this.onChange(this.status);
      return false;
    }
  }

  setCue(cue) {
    const next = MUSIC_SCORES[cue] ? cue : 'investigation';
    if (this.cue === next) return;
    this.cue = next;
    this.ensureLayer();
    this.onChange(this.status);
  }

  ensureLayer() {
    if (!this.enabled || !this.volume || this.hidden || !this.unlocked || this.disposed || this.context?.state !== 'running') return;
    if (this.current?.cue === this.cue) return;
    if (this.current) this.retire(this.current, 2.4);
    this.current = layer(this.context, this.cue, this.mix.input, this.context.currentTime);
    this.layers.add(this.current);
    const active = this.current;
    const tick = () => {
      const now = this.context.currentTime;
      if (active.next < now) active.next = now + 0.035;
      while (active.next < now + 0.2) {
        scheduleStep(this.context, active, active.step++, active.next);
        active.next += 30 / MUSIC_SCORES[active.cue].bpm;
      }
    };
    tick();
    active.timer = setInterval(tick, 80);
    // 快速换场也只保留有限的淡出尾音。
    const outgoing = [...this.layers].filter((t) => t !== active);
    for (const old of outgoing.slice(0, -2)) this.retire(old, 0.08);
  }

  retire(track, seconds) {
    clearInterval(track.timer);
    clearTimeout(track.cleanup);
    ramp(track.bus.gain, 0, this.context.currentTime, seconds);
    track.cleanup = setTimeout(() => this.drop(track), seconds * 1000 + 40);
  }

  drop(track) {
    clearInterval(track.timer);
    clearTimeout(track.cleanup);
    for (const voice of track.voices) { try { voice.stop(); } catch { /* 已结束的音符 */ } voice.disconnect(); }
    track.voices.clear();
    track.bus.disconnect();
    track.filter.disconnect();
    this.layers.delete(track);
    if (this.current === track) this.current = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.context) ramp(this.mix.master.gain, this.enabled ? this.volume * OUTPUT_GAIN : 0, this.context.currentTime, 0.18);
    if (!this.enabled) { for (const t of this.layers) this.retire(t, 0.18); this.current = null; }
    else this.ensureLayer();
    this.onChange(this.status);
  }

  setVolume(volume) {
    this.volume = clamp(volume);
    if (this.context) ramp(this.mix.master.gain, this.enabled ? this.volume * OUTPUT_GAIN : 0, this.context.currentTime, 0.15);
    if (!this.volume) { for (const t of this.layers) this.retire(t, 0.15); this.current = null; }
    else this.ensureLayer();
    this.onChange(this.status);
  }

  setHidden(hidden) {
    this.hidden = hidden;
    clearTimeout(this.suspendTimer);
    if (hidden) {
      for (const t of this.layers) this.retire(t, 0.12);
      this.current = null;
      if (this.context) this.suspendTimer = setTimeout(() => { this.context.suspend().catch(() => {}); }, 200);
    } else if (this.unlocked) void this.unlock();
    this.onChange(this.status);
  }

  async dispose() {
    this.disposed = true;
    clearTimeout(this.suspendTimer);
    for (const t of [...this.layers]) this.drop(t);
    if (this.context && this.context.state !== 'closed') await this.context.close();
  }
}
