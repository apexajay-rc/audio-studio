import type { Mp3BitrateKbps } from '../../domain/audio/audioTypes';

const ENCODE_CHUNK_FRAMES = 16384;

interface Mp3WorkerResponse {
  readonly type: 'ready' | 'encoded' | 'flushed' | 'error';
  readonly bytes?: ArrayBuffer;
  readonly message?: string;
}

export const SUPPORTED_MP3_SAMPLE_RATES = [48000, 44100, 32000] as const;

export function getMp3TargetSampleRate(sourceSampleRate: number): number {
  if (!Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) {
    throw new RangeError('A valid source sample rate is required for MP3 export.');
  }

  return SUPPORTED_MP3_SAMPLE_RATES.reduce((closest, candidate) =>
    Math.abs(candidate - sourceSampleRate) < Math.abs(closest - sourceSampleRate)
      ? candidate
      : closest,
  );
}

export function convertFloatSamplesToPcm16(
  samples: Float32Array,
): Int16Array<ArrayBuffer> {
  // Allocate explicitly from an ArrayBuffer so the result is safely transferable
  // to the MP3 worker under TypeScript versions that model buffer as ArrayBufferLike.
  const backingBuffer = new ArrayBuffer(samples.length * Int16Array.BYTES_PER_ELEMENT);
  const output = new Int16Array(backingBuffer);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    const finite = Number.isFinite(sample) ? sample : 0;
    const clipped = Math.min(1, Math.max(-1, finite));
    output[index] = clipped < 0
      ? Math.round(clipped * 32768)
      : Math.round(clipped * 32767);
  }
  return output;
}

export function encodeMp3InWorker(
  audio: AudioBuffer,
  bitrateKbps: Mp3BitrateKbps,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  if (audio.numberOfChannels < 1 || audio.numberOfChannels > 2) {
    return Promise.reject(new RangeError('MP3 export supports mono or stereo audio.'));
  }
  if (!(SUPPORTED_MP3_SAMPLE_RATES as readonly number[]).includes(audio.sampleRate)) {
    return Promise.reject(new RangeError('The MP3 encoder does not support this sample rate.'));
  }

  return new Promise<Blob>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/mp3-encoder.worker.ts', import.meta.url), {
        type: 'module',
        name: 'audio-studio-mp3-encoder',
      });
    } catch {
      reject(new Error('This browser could not start the MP3 encoding worker.'));
      return;
    }

    const parts: ArrayBuffer[] = [];
    const leftChannel = audio.getChannelData(0);
    const rightChannel = audio.numberOfChannels === 2 ? audio.getChannelData(1) : undefined;
    let nextFrame = 0;
    let settled = false;

    const cleanup = (): void => {
      worker.terminate();
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
    };

    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const sendNextChunk = (): void => {
      if (nextFrame >= audio.length) {
        worker.postMessage({ type: 'flush' });
        return;
      }

      const endFrame = Math.min(nextFrame + ENCODE_CHUNK_FRAMES, audio.length);
      const left = convertFloatSamplesToPcm16(leftChannel.subarray(nextFrame, endFrame));
      const right = rightChannel
        ? convertFloatSamplesToPcm16(rightChannel.subarray(nextFrame, endFrame))
        : undefined;
      const transfer: Transferable[] = [left.buffer];
      const message: { type: 'encode'; left: ArrayBuffer; right?: ArrayBuffer } = {
        type: 'encode',
        left: left.buffer,
      };
      if (right) {
        message.right = right.buffer;
        transfer.push(right.buffer);
      }

      nextFrame = endFrame;
      worker.postMessage(message, transfer);
    };

    worker.onmessage = (event: MessageEvent<Mp3WorkerResponse>): void => {
      const message = event.data;
      if (message.type === 'error') {
        fail(message.message ?? 'MP3 encoding failed.');
        return;
      }
      if (message.type === 'ready') {
        sendNextChunk();
        return;
      }
      if (message.type === 'encoded') {
        if (message.bytes && message.bytes.byteLength > 0) parts.push(message.bytes);
        onProgress?.(Math.min(0.98, nextFrame / audio.length));
        sendNextChunk();
        return;
      }
      if (message.type === 'flushed') {
        if (message.bytes && message.bytes.byteLength > 0) parts.push(message.bytes);
        if (settled) return;
        settled = true;
        cleanup();
        onProgress?.(1);
        resolve(new Blob(parts, { type: 'audio/mpeg' }));
      }
    };

    worker.onerror = (event: ErrorEvent): void => {
      event.preventDefault();
      fail(event.message || 'The MP3 encoding worker encountered an unexpected error.');
    };
    worker.onmessageerror = (): void => fail('The MP3 encoding worker returned an unreadable response.');

    worker.postMessage({
      type: 'init',
      channels: audio.numberOfChannels,
      sampleRate: audio.sampleRate,
      bitrateKbps,
    });
  });
}
