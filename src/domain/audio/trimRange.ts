import type { TrimRange } from './audioTypes';

export function validateTrimRange(
  range: TrimRange,
  durationSeconds: number,
): boolean {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
  if (!Number.isFinite(range.startSeconds) || !Number.isFinite(range.endSeconds)) {
    return false;
  }

  return (
    range.startSeconds >= 0 &&
    range.endSeconds > range.startSeconds &&
    range.endSeconds <= durationSeconds
  );
}

export function clampTime(timeSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(timeSeconds) || !Number.isFinite(durationSeconds)) return 0;
  if (durationSeconds <= 0) return 0;
  return Math.min(Math.max(timeSeconds, 0), durationSeconds);
}

/**
 * Snap a UI time value to the nearest sample boundary.
 * AudioBuffer.duration is derived from its frame count, so the rounded frame
 * count is the final representable boundary for the decoded buffer.
 */
export function snapTimeToSample(
  timeSeconds: number,
  sampleRate: number,
  durationSeconds: number,
): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return 0;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;

  const frameCount = Math.max(0, Math.round(durationSeconds * sampleRate));
  const requestedFrame = Number.isFinite(timeSeconds)
    ? Math.round(timeSeconds * sampleRate)
    : 0;
  const boundedFrame = Math.min(Math.max(requestedFrame, 0), frameCount);

  return boundedFrame / sampleRate;
}
