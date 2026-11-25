/**
 * Build a compact peak envelope from decoded channel samples.
 * The function does not mutate or copy the source channels.
 */
export function buildWaveformPeaks(
  channels: readonly Float32Array[],
  bucketCount: number,
): Float32Array {
  if (channels.length === 0) {
    throw new RangeError('At least one audio channel is required.');
  }

  if (!Number.isInteger(bucketCount) || bucketCount < 1) {
    throw new RangeError('Bucket count must be a positive integer.');
  }

  const sampleCount = channels[0]?.length ?? 0;
  if (sampleCount === 0) {
    throw new RangeError('Audio channels must contain samples.');
  }

  if (channels.some((channel) => channel.length !== sampleCount)) {
    throw new RangeError('All audio channels must have the same sample count.');
  }

  const peaks = new Float32Array(bucketCount);

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor((bucket * sampleCount) / bucketCount);
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * sampleCount) / bucketCount));
    let peak = 0;

    for (let sampleIndex = start; sampleIndex < Math.min(end, sampleCount); sampleIndex += 1) {
      for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
        const sample = channels[channelIndex]?.[sampleIndex] ?? 0;
        const magnitude = Math.abs(sample);
        if (magnitude > peak) peak = magnitude;
      }
    }

    peaks[bucket] = Math.min(peak, 1);
  }

  return peaks;
}
