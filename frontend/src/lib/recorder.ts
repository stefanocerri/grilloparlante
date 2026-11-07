const TARGET_SAMPLE_RATE = 24000;

export interface RecordedSample {
  wav: Uint8Array;
  durationSec: number;
  previewUrl: string;
}

export interface ActiveRecording {
  stop: () => Promise<RecordedSample>;
  cancel: () => void;
}

/**
 * Registra dal microfono e restituisce un WAV PCM 16-bit mono a 24 kHz,
 * formato che il backend Python legge senza dipendenze extra.
 */
export async function startMicrophoneRecording(): Promise<ActiveRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true
    }
  });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  const stopTracks = () => stream.getTracks().forEach((track) => track.stop());
  recorder.start(250);

  return {
    cancel: () => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
      stopTracks();
    },
    stop: () =>
      new Promise<RecordedSample>((resolve, reject) => {
        recorder.addEventListener(
          "stop",
          async () => {
            stopTracks();

            try {
              const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
              const sample = await encodeBlobToWav(blob);
              resolve(sample);
            } catch (error) {
              reject(error);
            }
          },
          { once: true }
        );

        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      })
  };
}

async function encodeBlobToWav(blob: Blob): Promise<RecordedSample> {
  const arrayBuffer = await blob.arrayBuffer();
  const decodeContext = new AudioContext();
  let decoded: AudioBuffer;

  try {
    decoded = await decodeContext.decodeAudioData(arrayBuffer);
  } finally {
    void decodeContext.close();
  }

  const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);
  const wav = encodeWav(samples, TARGET_SAMPLE_RATE);

  return {
    wav,
    durationSec: rendered.duration,
    previewUrl: URL.createObjectURL(new Blob([wav], { type: "audio/wav" }))
  };
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Uint8Array(buffer);
}
