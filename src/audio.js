// audio.js — Web Audio synth (note-per-bounce) + best-effort monophonic pitch
// extraction (YIN) from an uploaded melody. The synth always works even if
// extraction is never used; extraction is purely additive (SPEC §5).
//
// Zero dependencies: YIN is implemented directly here rather than pulling in
// pitchfinder, per the project's "prefer zero deps" rule.

const SCALES = {
  // Semitone offsets from a root, repeated up an octave for a longer run.
  pentatonic: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22],
  major:      [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19],
  minor:      [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19],
  chromatic:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

const ROOT = 220; // A3

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sequence = scaleToFreqs('pentatonic');
    this.index = 0;
    this.source = 'built-in';   // or 'upload'
    this.uploadSequence = null; // cached extracted notes
    this.cfg = { sound: true, volume: 0.5, waveform: 'triangle', scale: 'pentatonic' };
  }

  // Must be called from a user gesture (Start button).
  async resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.cfg.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  applyConfig(cfg) {
    this.cfg = { ...this.cfg, ...cfg };
    if (this.master) this.master.gain.value = this.cfg.sound ? this.cfg.volume : 0;
    this.rebuildSequence();
  }

  // Choose the active note list: extracted upload if present + selected, else
  // the built-in scale.
  rebuildSequence() {
    if (this.source === 'upload' && this.uploadSequence && this.uploadSequence.length) {
      this.sequence = this.uploadSequence;
    } else {
      this.sequence = scaleToFreqs(this.cfg.scale);
    }
    if (this.index >= this.sequence.length) this.index = 0;
  }

  setSource(src) {
    this.source = src;
    this.rebuildSequence();
  }

  reset() {
    this.index = 0;
  }

  // Play the next note in the active sequence with a short pluck envelope.
  bounce(detune = 0) {
    if (!this.ctx || !this.cfg.sound || this.cfg.volume <= 0) return;
    const f = this.sequence[this.index % this.sequence.length];
    this.index = (this.index + 1) % this.sequence.length;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = this.cfg.waveform;
    osc.frequency.value = f;
    osc.detune.value = detune;

    // Short attack, quick decay + small release tail so it reads as musical.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.9, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  // Decode + extract a monophonic melody from an uploaded file. Returns
  // { ok, count, message }. On too-few notes, keeps the built-in fallback.
  async extractFromFile(file) {
    await this.resume();
    const buf = await file.arrayBuffer();
    let audio;
    try {
      audio = await this.ctx.decodeAudioData(buf);
    } catch (e) {
      return { ok: false, count: 0, message: 'Could not decode that audio file.' };
    }
    const pcm = audio.getChannelData(0); // mono: first channel is enough
    const notes = extractMelody(pcm, audio.sampleRate);
    if (notes.length < 4) {
      this.uploadSequence = null;
      this.setSource('built-in');
      return {
        ok: false,
        count: notes.length,
        message: `Only ${notes.length} clean notes found — using built-in scale instead.`,
      };
    }
    this.uploadSequence = notes;
    this.setSource('upload');
    return { ok: true, count: notes.length, message: `Extracted ${notes.length} notes from your melody.` };
  }
}

function scaleToFreqs(name) {
  const steps = SCALES[name] || SCALES.pentatonic;
  return steps.map((s) => ROOT * Math.pow(2, s / 12));
}

// ---- YIN pitch detection (direct implementation) -------------------------

// Run YIN window-by-window over PCM, then clean into a note list:
// drop silence + low-confidence frames, quantize to equal temperament,
// collapse repeats.
function extractMelody(pcm, sampleRate) {
  const W = 2048;                 // analysis window
  const hop = 1024;
  const threshold = 0.12;         // YIN absolute threshold
  const minRms = 0.012;           // silence gate
  const fmin = 70, fmax = 1200;

  const rawNotes = [];
  for (let start = 0; start + W <= pcm.length; start += hop) {
    const frame = pcm.subarray(start, start + W);

    let sumSq = 0;
    for (let i = 0; i < W; i++) sumSq += frame[i] * frame[i];
    const rms = Math.sqrt(sumSq / W);
    if (rms < minRms) { rawNotes.push(null); continue; }

    const freq = yin(frame, sampleRate, threshold, fmin, fmax);
    if (!freq) { rawNotes.push(null); continue; }
    rawNotes.push(freqToMidi(freq));
  }

  // Collapse consecutive identical (quantized) notes; drop nulls.
  const out = [];
  let prev = null;
  for (const m of rawNotes) {
    if (m == null) { prev = null; continue; }
    if (m === prev) continue;
    out.push(midiToFreq(m));
    prev = m;
  }
  return out;
}

function yin(frame, sampleRate, threshold, fmin, fmax) {
  const W = frame.length;
  const halfW = Math.floor(W / 2);
  const diff = new Float32Array(halfW);

  // Difference function.
  for (let tau = 1; tau < halfW; tau++) {
    let sum = 0;
    for (let i = 0; i < halfW; i++) {
      const d = frame[i] - frame[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  // Cumulative mean normalized difference.
  const cmnd = new Float32Array(halfW);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau < halfW; tau++) {
    running += diff[tau];
    cmnd[tau] = running === 0 ? 1 : (diff[tau] * tau) / running;
  }

  const tauMin = Math.max(1, Math.floor(sampleRate / fmax));
  const tauMax = Math.min(halfW - 1, Math.floor(sampleRate / fmin));

  // Absolute threshold: first dip below `threshold`, then local minimum.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return null;

  // Parabolic interpolation around the chosen tau for sub-sample accuracy.
  const x0 = tau > 1 ? cmnd[tau - 1] : cmnd[tau];
  const x2 = tau + 1 < halfW ? cmnd[tau + 1] : cmnd[tau];
  const a = x0 + x2 - 2 * cmnd[tau];
  const b = (x2 - x0) / 2;
  const betterTau = a ? tau - b / (2 * a) : tau;

  return sampleRate / betterTau;
}

function freqToMidi(f) {
  return Math.round(69 + 12 * Math.log2(f / 440));
}
function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}
