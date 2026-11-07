import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { RoomDetail } from '@verbalist/shared-types';
import { RoomAudio } from '@/lib/room-audio';
const room = {
  self_id: 'alice',
  room: { status: 'active', turn_count: 0, clock_phase: 'speaking' },
  members: [{ user_id: 'alice', role: 'proposition', voice_muted: false }],
} as RoomDetail;
let track: { enabled: boolean; stop: ReturnType<typeof vi.fn> }, stream: MediaStream;
class Recorder {
  static count = 0;
  static inputs: MediaStream[] = [];
  static isTypeSupported() {
    return true;
  }
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(input: MediaStream) {
    Recorder.count++;
    Recorder.inputs.push(input);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['own microphone']) });
    this.onstop?.();
  }
}
beforeEach(() => {
  track = { enabled: true, stop: vi.fn() };
  stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  vi.stubGlobal('MediaRecorder', Recorder);
  Recorder.count = 0;
  Recorder.inputs = [];
});
afterEach(() => vi.unstubAllGlobals());
function audio() {
  const recorded = vi.fn(),
    send = vi.fn<(value: unknown) => boolean>(() => true);
  return { c: new RoomAudio(() => 'own-connection', send, vi.fn(), recorded), recorded, send };
}
it('keeps microphone disabled outside the floor and never records without opt-in', async () => {
  const { c, recorded } = audio();
  c.setRoom(room, false);
  await c.join({}, true);
  expect(track.enabled).toBe(false);
  c.setRoom(room, true);
  expect(track.enabled).toBe(true);
  c.setMuted(true);
  expect(track.enabled).toBe(false);
  c.setMuted(false);
  expect(track.enabled).toBe(true);
  c.setRoom(room, false);
  expect(track.enabled).toBe(false);
  expect(Recorder.count).toBe(0);
  expect(recorded).not.toHaveBeenCalled();
  c.leave();
  expect(track.stop).toHaveBeenCalled();
});
it('records only the own stream once after explicit next-take consent and stops on floor loss', async () => {
  const { c, recorded } = audio();
  c.setRoom(room, false);
  await c.join({}, true);
  c.armRecording(true);
  c.setRoom(room, true);
  expect(Recorder.inputs).toEqual([stream]);
  c.setRoom(room, false);
  expect(recorded).toHaveBeenCalledOnce();
  expect(recorded.mock.calls[0][0]).toBeInstanceOf(Blob);
  c.setRoom(room, true);
  expect(Recorder.count).toBe(1);
  c.leave();
});
it('listeners never request a microphone or record', async () => {
  const { c } = audio();
  c.setRoom({ ...room, members: [{ ...room.members[0], role: 'judge' }] }, false);
  await c.join({}, false);
  c.armRecording(true);
  c.setRoom(room, true);
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  expect(Recorder.count).toBe(0);
  c.leave();
});
it('discards delayed microphone permission after leaving instead of restarting capture', async () => {
  let resolve!: (value: MediaStream) => void;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const { c, send } = audio();
  c.setRoom(room, false);
  const pending = c.join({}, true);
  c.leave();
  resolve(stream);
  await pending;
  expect(track.stop).toHaveBeenCalled();
  expect(send.mock.calls.some(([v]) => (v as { enabled: boolean }).enabled === true)).toBe(false);
});
it('stops microphone capture when another tab replaces this room connection', async () => {
  const { c } = audio();
  c.setRoom(room, true);
  await c.join({}, true);
  expect(track.enabled).toBe(true);
  c.frame({
    type: 'state',
    version: 1,
    peers: [{ user_id: 'alice', connection_id: 'replacement', voice: true, muted: false }],
  });
  expect(track.stop).toHaveBeenCalled();
});
it('keeps the navigation recording guard active until an asynchronous stop delivers its file', async () => {
  vi.useFakeTimers();
  try {
    class DelayedRecorder extends Recorder {
      stop() {
        this.state = 'inactive';
        setTimeout(() => {
          this.ondataavailable?.({ data: new Blob(['final audio']) });
          this.onstop?.();
        }, 10);
      }
    }
    vi.stubGlobal('MediaRecorder', DelayedRecorder);
    const { c, recorded } = audio();
    c.setRoom(room, false);
    await c.join({}, true);
    c.armRecording(true);
    c.setRoom(room, true);
    c.setRoom(room, false);
    expect(c.isRecording()).toBe(true);
    expect(recorded).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(recorded).toHaveBeenCalledOnce();
    expect(c.isRecording()).toBe(false);
    c.leave();
  } finally {
    vi.useRealTimers();
  }
});
