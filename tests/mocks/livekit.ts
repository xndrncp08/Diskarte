import { vi } from "vitest";

/** Mutable state the LiveKit mocks read from; tests configure tracks/speakers per case. */
export const livekitMock = {
  rooms: [] as MockRoom[],
  tracks: [] as unknown[],
  speaking: new Set<string>(),
  reset() {
    this.rooms.length = 0;
    this.tracks = [];
    this.speaking.clear();
  },
};

export class MockRoom {
  handlers = new Map<string, (...args: unknown[]) => void>();
  connect = vi.fn(async () => undefined);
  disconnect = vi.fn(async () => undefined);
  localParticipant = {
    identity: "local",
    setMicrophoneEnabled: vi.fn(async () => undefined),
    setCameraEnabled: vi.fn(async () => undefined),
    setScreenShareEnabled: vi.fn(async () => undefined),
    getTrackPublication: vi.fn(() => undefined),
  };
  constructor(public options?: unknown) {
    livekitMock.rooms.push(this);
  }
  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, handler);
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
  }
}

/** Minimal participant object satisfying ParticipantTile (identity, events, mic/quality state). */
export function mockParticipant(identity: string, opts: { name?: string; isLocal?: boolean; micOn?: boolean } = {}) {
  const participant = {
    identity,
    name: opts.name ?? identity,
    isLocal: opts.isLocal ?? false,
    metadata: "",
    isMicrophoneEnabled: opts.micOn ?? true,
    connectionQuality: "excellent",
    on: () => participant,
    off: () => participant,
  };
  return participant;
}

/** A camera placeholder track reference as returned by useTracks(..., { withPlaceholder: true }). */
export function mockCameraPlaceholder(participant: ReturnType<typeof mockParticipant>) {
  return { participant, source: "camera", publication: undefined };
}
