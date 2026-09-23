// Sharper hearing with Whisper. Keeps the last 20 seconds of mic audio in memory; when you
// finish a longer sentence, that clip goes to Whisper (free on Groq), which hears accents and
// Hinglish much better than the browser does. Any failure falls back to the browser transcript.
import { state } from "./state";

const EAR_RATE = 16_000;
const BUFFER_SECONDS = 20;

const ear = {
  ctx: null as AudioContext | null,
  buf: new Float32Array(EAR_RATE * BUFFER_SECONDS),
  write: 0,
  filled: 0,
  ready: false,
  starting: false,
};

export async function startEar(): Promise<void> {
  if (ear.ready || ear.starting || !state.settings.whisper || !state.hasGroq) return;
  ear.starting = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but is the simplest way to tap raw samples from a content
    // script; an AudioWorklet would need a separate web-accessible file.
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const ratio = ctx.sampleRate / EAR_RATE;
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      for (let pos = 0; pos + ratio <= d.length; pos += ratio) {
        let sum = 0;
        let n = 0;
        for (let k = Math.floor(pos); k < Math.floor(pos + ratio); k++) {
          sum += d[k];
          n++;
        }
        ear.buf[ear.write] = n ? sum / n : 0;
        ear.write = (ear.write + 1) % ear.buf.length;
        if (ear.filled < ear.buf.length) ear.filled++;
      }
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(proc);
    proc.connect(mute).connect(ctx.destination);
    ear.ctx = ctx;
    ear.ready = true;
    if (ctx.state !== "running") {
      // Browsers hold audio until the first click or key press.
      const wake = () => void ctx.resume().catch(() => {});
      wake();
      addEventListener("pointerdown", wake, { once: true });
      addEventListener("keydown", wake, { once: true });
    }
  } catch {
    ear.ready = false; // falls back to the browser's own recognition
  }
  ear.starting = false;
}

export const earIsRunning = (): boolean => ear.ready && ear.ctx?.state === "running";

// The most recent `seconds` of audio, oldest first.
export function grabAudio(seconds: number): Float32Array {
  const n = Math.min(Math.floor(seconds * EAR_RATE), ear.filled);
  const out = new Float32Array(n);
  const start = (ear.write - n + ear.buf.length) % ear.buf.length;
  for (let i = 0; i < n; i++) out[i] = ear.buf[(start + i) % ear.buf.length];
  return out;
}

// 16-bit mono WAV, base64-encoded for the message to the background worker.
export function wavBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) =>
    [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, EAR_RATE, true);
  v.setUint32(28, EAR_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
