/** Records every synthesised 8-bit note so tests can assert sound cues fired. */
export const audioMock = { notes: [] as number[] };

export class FakeAudioContext {
  currentTime = 0;
  state = "running";
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    const frequency = { value: 0, setValueAtTime: (v: number) => audioMock.notes.push(v), exponentialRampToValueAtTime: () => undefined };
    return { type: "square", frequency, connect: (node: unknown) => node, start: () => undefined, stop: () => undefined };
  }
  sampleRate = 44100;
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { sampleRate: this.sampleRate, getChannelData: () => data };
  }
  createBufferSource() {
    return { buffer: null, connect: (node: unknown) => node, start: () => audioMock.notes.push(-1), stop: () => undefined };
  }
  createGain() {
    return { gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined }, connect: () => undefined };
  }
}
