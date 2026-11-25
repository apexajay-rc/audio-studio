export interface PcmAudioSource {
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  readonly length: number;
  getChannelData(channel: number): Float32Array;
}

const WAV_HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function floatToPcm16(sample: number): number {
  const finiteSample = Number.isFinite(sample) ? sample : 0;
  const clipped = Math.min(1, Math.max(-1, finiteSample));
  return clipped < 0 ? Math.round(clipped * 32768) : Math.round(clipped * 32767);
}

export function encodePcmWav(source: PcmAudioSource): Uint8Array {
  const { sampleRate, numberOfChannels, length } = source;

  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new RangeError('WAV export requires a sample rate between 8 kHz and 192 kHz.');
  }
  if (!Number.isInteger(numberOfChannels) || numberOfChannels < 1 || numberOfChannels > 8) {
    throw new RangeError('WAV export supports between one and eight channels.');
  }
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new RangeError('WAV export requires at least one audio sample frame.');
  }

  const blockAlign = numberOfChannels * BYTES_PER_SAMPLE;
  const dataBytes = length * blockAlign;
  const riffSize = 36 + dataBytes;
  if (!Number.isSafeInteger(dataBytes) || riffSize > 0xffffffff) {
    throw new RangeError('The WAV file would exceed the 4 GiB RIFF size limit.');
  }

  const output = new Uint8Array(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(output.buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, riffSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Linear PCM.
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  const channelData = Array.from({ length: numberOfChannels }, (_, channel) =>
    source.getChannelData(channel),
  );

  let byteOffset = WAV_HEADER_BYTES;
  for (let frame = 0; frame < length; frame += 1) {
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      const sample = channelData[channel]?.[frame] ?? 0;
      view.setInt16(byteOffset, floatToPcm16(sample), true);
      byteOffset += BYTES_PER_SAMPLE;
    }
  }

  return output;
}
