/**
 * Generative ambient music and soundscape, synthesised live with Web Audio (no sound files):
 * slow pad chords, sparse bell notes through a long reverb, and mood ambience (rain, wind, city
 * hum, birds by day, crickets at night). Browsers only allow sound after a tap or key press, so
 * it starts from the speaker button (and remembers the choice).
 */

export type SoundMood = "day" | "golden" | "night" | "rain";

const PROGRESSIONS: Record<SoundMood, number[][]> = {
  // MIDI notes; each chord lasts a bar of ~8 s.
  golden: [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 64]], // Cmaj7 Am7 Fmaj7 G6
  day: [[53, 60, 65, 69], [52, 60, 64, 67], [50, 57, 62, 65], [46, 53, 62, 65]], // F C/E Dm Bb
  night: [[45, 52, 59, 60, 64], [41, 48, 55, 57, 64], [38, 45, 52, 53, 57], [40, 47, 55, 59, 62]], // Am9 Fmaj7 Dm9 Em7
  rain: [[38, 45, 52, 53, 57], [46, 53, 57, 62], [43, 50, 57, 58, 62], [45, 52, 55, 60]], // Dm9 Bbmaj7 Gm9 Am7
};
const SCALES: Record<SoundMood, number[]> = {
  golden: [60, 62, 64, 67, 69, 72, 74, 76, 79],
  day: [65, 67, 69, 72, 74, 77, 79, 81],
  night: [57, 60, 62, 64, 67, 69, 72, 74, 76],
  rain: [62, 65, 67, 69, 72, 74, 77, 79],
};
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const STORE = "fg:lumenhd:sound";

export class Ambience {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private reverb!: ConvolverNode;
  private delay!: DelayNode;
  private beds: Record<string, GainNode> = {};
  private mood: SoundMood = "golden";
  private timers: number[] = [];
  private bar = 0;
  private readonly button: HTMLButtonElement;
  on = false;

  constructor(container: HTMLElement) {
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "sound-toggle";
    this.button.style.cssText =
      "position:absolute;top:8px;right:8px;z-index:5;min-width:44px;min-height:40px;border-radius:8px;border:1px solid #fff4;background:#0008;color:#fff;font:15px system-ui;padding:6px 10px;cursor:pointer";
    this.button.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.button.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.toggle();
    });
    container.append(this.button);
    this.label();
    let wanted = false;
    try {
      wanted = localStorage.getItem(STORE) === "on";
    } catch {
      /* storage unavailable */
    }
    if (wanted) {
      // Sound needs a gesture: start on the first tap or key press.
      const start = () => {
        // Only from the visible game (the style lab renders stills off-screen).
        const r = container.getBoundingClientRect();
        if (r.width === 0 || r.right < 0 || r.left > innerWidth) return;
        window.removeEventListener("pointerdown", start);
        window.removeEventListener("keydown", start);
        if (!this.on) void this.toggle();
      };
      window.addEventListener("pointerdown", start);
      window.addEventListener("keydown", start);
      this.startListener = start;
    }
  }
  private startListener: (() => void) | undefined;

  private label(): void {
    this.button.textContent = this.on ? "🔊 Music" : "🔇 Music";
    this.button.title = this.on ? "Turn the music and ambience off" : "Turn on generative music and ambience";
  }

  async toggle(): Promise<void> {
    this.on = !this.on;
    try {
      localStorage.setItem(STORE, this.on ? "on" : "off");
    } catch {
      /* storage unavailable */
    }
    this.label();
    if (this.on) {
      if (!this.ctx) this.build();
      await this.ctx!.resume();
      this.master.gain.setTargetAtTime(0.9, this.ctx!.currentTime, 1.5);
    } else if (this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    }
  }

  /** Changes the music and ambience to suit the scene. */
  setMood(mood: SoundMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.applyBeds();
  }

  /** A flutter of wings (pigeons taking off). */
  flutter(): void {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise(0.08);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900 + Math.random() * 600;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.07);
      g.gain.linearRampToValueAtTime(0.18 * (1 - i / 7), t + i * 0.07 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.08);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t + i * 0.07);
    }
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    // Long, dark reverb from a decaying noise impulse.
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 4;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dl = ctx.createBiquadFilter();
    dl.type = "lowpass";
    dl.frequency.value = 2200;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(this.reverb);
    dl.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.5;
    this.music.connect(this.master);
    this.music.connect(this.reverb);
    // Ambience beds: rain, wind, city hum, each a filtered noise loop.
    this.beds.rain = this.bed("bandpass", 1400, 0.6, 0.5);
    this.beds.hiss = this.bed("highpass", 5000, 0.5, 0.3);
    this.beds.wind = this.bed("lowpass", 380, 0.7, 1, true);
    this.beds.hum = this.bed("lowpass", 140, 0.7, 1);
    this.applyBeds();
    this.playBar();
    this.timers.push(window.setInterval(() => this.playBar(), 8000));
    this.scheduleBell();
    this.scheduleCritters();
  }

  private noise(seconds: number, brown = false): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  private bed(type: BiquadFilterType, freq: number, q: number, _gain: number, swell = false): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(6, type === "lowpass");
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    if (swell) {
      // Gusts: a slow LFO on the wind level.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const depth = ctx.createGain();
      depth.gain.value = 120;
      lfo.connect(depth).connect(f.frequency);
      lfo.start();
    }
    src.start();
    return g;
  }

  private applyBeds(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.mood;
    const level = { rain: m === "rain" ? 0.32 : 0, hiss: m === "rain" ? 0.06 : 0, wind: m === "night" ? 0.05 : m === "rain" ? 0.08 : 0.035, hum: m === "day" ? 0.05 : 0.035 };
    for (const [k, g] of Object.entries(this.beds)) g.gain.setTargetAtTime(level[k as keyof typeof level], t, 2);
  }

  private playBar(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const prog = PROGRESSIONS[this.mood];
    const chord = prog[this.bar++ % prog.length]!;
    const t = ctx.currentTime + 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(this.mood === "day" ? 1400 : 800, t);
    filter.frequency.linearRampToValueAtTime(this.mood === "day" ? 2000 : 1200, t + 4);
    filter.frequency.linearRampToValueAtTime(600, t + 9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 3);
    g.gain.setValueAtTime(0.09, t + 6);
    g.gain.linearRampToValueAtTime(0, t + 11);
    filter.connect(g).connect(this.music);
    for (const note of chord) {
      for (const detune of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = note < 50 ? "triangle" : "sawtooth";
        o.frequency.value = hz(note);
        o.detune.value = detune;
        const og = ctx.createGain();
        og.gain.value = note < 50 ? 0.5 : 0.18;
        o.connect(og).connect(filter);
        o.start(t);
        o.stop(t + 11.5);
      }
    }
  }

  private scheduleBell(): void {
    const next = () => {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const scale = SCALES[this.mood];
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const note = scale[Math.floor(Math.random() * scale.length)]!;
        const t = ctx.currentTime + 0.05 + i * (0.25 + Math.random() * 0.3);
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = hz(note);
        const o2 = ctx.createOscillator();
        o2.type = "sine";
        o2.frequency.value = hz(note) * 2.76; // bell partial
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 3);
        const g2 = ctx.createGain();
        g2.gain.value = 0.25;
        o.connect(g);
        o2.connect(g2).connect(g);
        g.connect(this.music);
        g.connect(this.delay);
        o.start(t);
        o2.start(t);
        o.stop(t + 3.2);
        o2.stop(t + 3.2);
      }
      this.timers.push(window.setTimeout(next, 2500 + Math.random() * 6000));
    };
    this.timers.push(window.setTimeout(next, 3000));
  }

  /** Birds by day, crickets at night. */
  private scheduleCritters(): void {
    const next = () => {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.05;
      if (this.mood === "day" || this.mood === "golden") {
        const notes = 2 + Math.floor(Math.random() * 4);
        const base = 2200 + Math.random() * 1800;
        for (let i = 0; i < notes; i++) {
          const o = ctx.createOscillator();
          o.type = "sine";
          const s = t + i * 0.12;
          o.frequency.setValueAtTime(base, s);
          o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.5), s + 0.06);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, s);
          g.gain.linearRampToValueAtTime(0.025, s + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0005, s + 0.09);
          o.connect(g).connect(this.master);
          g.connect(this.reverb);
          o.start(s);
          o.stop(s + 0.1);
        }
      } else if (this.mood === "night") {
        for (let i = 0; i < 3; i++) {
          const o = ctx.createOscillator();
          o.type = "square";
          o.frequency.value = 4400;
          const am = ctx.createGain();
          const s = t + i * 0.18;
          am.gain.setValueAtTime(0, s);
          for (let j = 0; j < 4; j++) {
            am.gain.setValueAtTime(0.006, s + j * 0.025);
            am.gain.setValueAtTime(0, s + j * 0.025 + 0.012);
          }
          const bp = ctx.createBiquadFilter();
          bp.type = "bandpass";
          bp.frequency.value = 4400;
          o.connect(bp).connect(am).connect(this.master);
          o.start(s);
          o.stop(s + 0.12);
        }
      }
      this.timers.push(window.setTimeout(next, 1500 + Math.random() * 5000));
    };
    this.timers.push(window.setTimeout(next, 2000));
  }

  destroy(): void {
    for (const t of this.timers) (clearTimeout(t), clearInterval(t));
    if (this.startListener) {
      window.removeEventListener("pointerdown", this.startListener);
      window.removeEventListener("keydown", this.startListener);
    }
    void this.ctx?.close();
    this.button.remove();
  }
}
