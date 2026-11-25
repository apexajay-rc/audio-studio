import * as lamejs from '@breezystack/lamejs';

interface Mp3EncoderInstance {
  encodeBuffer(left: Int16Array, right?: Int16Array): Uint8Array;
  flush(): Uint8Array;
}

interface Mp3EncoderConstructor {
  new (channels: number, sampleRate: number, bitrateKbps: number): Mp3EncoderInstance;
}

const Encoder = (lamejs as unknown as { Mp3Encoder: Mp3EncoderConstructor }).Mp3Encoder;

interface InitMessage {
  readonly type: 'init';
  readonly channels: number;
  readonly sampleRate: number;
  readonly bitrateKbps: number;
}

interface EncodeMessage {
  readonly type: 'encode';
  readonly left: ArrayBuffer;
  readonly right?: ArrayBuffer;
}

interface FlushMessage {
  readonly type: 'flush';
}

type WorkerRequest = InitMessage | EncodeMessage | FlushMessage;

type WorkerResponse =
  | { readonly type: 'ready' }
  | { readonly type: 'encoded'; readonly bytes: ArrayBuffer }
  | { readonly type: 'flushed'; readonly bytes: ArrayBuffer }
  | { readonly type: 'error'; readonly message: string };

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}

const workerScope = globalThis as unknown as WorkerScope;
let encoder: Mp3EncoderInstance | null = null;
let channelCount = 0;

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const totalBytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function toTransferableBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

workerScope.onmessage = (event): void => {
  const message = event.data;

  try {
    if (message.type === 'init') {
      if (message.channels < 1 || message.channels > 2) {
        throw new RangeError('MP3 encoding supports mono or stereo audio.');
      }
      encoder = new Encoder(message.channels, message.sampleRate, message.bitrateKbps);
      channelCount = message.channels;
      workerScope.postMessage({ type: 'ready' });
      return;
    }

    if (!encoder) throw new Error('The MP3 encoder has not been initialized.');

    if (message.type === 'encode') {
      const left = new Int16Array(message.left);
      const right = message.right ? new Int16Array(message.right) : undefined;
      if (channelCount === 2 && !right) {
        throw new Error('Stereo MP3 encoding requires both audio channels.');
      }
      if (right && right.length !== left.length) {
        throw new Error('The left and right MP3 input channels have different lengths.');
      }

      const packets: Uint8Array[] = [];
      const sampleBlockSize = 1152;
      for (let offset = 0; offset < left.length; offset += sampleBlockSize) {
        const leftBlock = left.subarray(offset, Math.min(offset + sampleBlockSize, left.length));
        const rightBlock = right?.subarray(offset, Math.min(offset + sampleBlockSize, right.length));
        const encoded = rightBlock
          ? encoder.encodeBuffer(leftBlock, rightBlock)
          : encoder.encodeBuffer(leftBlock);
        if (encoded.byteLength > 0) packets.push(encoded);
      }

      const encodedBytes = toTransferableBytes(concatenate(packets));
      workerScope.postMessage({ type: 'encoded', bytes: encodedBytes }, [encodedBytes]);
      return;
    }

    const tail = encoder.flush();
    encoder = null;
    const tailBytes = toTransferableBytes(tail);
    workerScope.postMessage({ type: 'flushed', bytes: tailBytes }, [tailBytes]);
  } catch (error) {
    encoder = null;
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'MP3 encoding failed.',
    });
  }
};
