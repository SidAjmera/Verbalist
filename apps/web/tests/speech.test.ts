import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Dictation, SpeechPlayback, type RecognitionEvent } from '@/lib/speech';
class Recognition {
  static instances: Recognition[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: RecognitionEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  constructor() {
    Recognition.instances.push(this);
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.onresult?.({ results: [{ isFinal: true, 0: { transcript: 'Final words' } }] });
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
}
class Recorder {
  static count = 0;
  static isTypeSupported() {
    return true;
  }
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    Recorder.count++;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio']) });
    this.onstop?.();
  }
}
const track = { stop: vi.fn(), onended: null },
  getUserMedia = vi.fn();
function setup() {
  let text = 'Opening';
  const options = {
    language: 'en-SG',
    record: false,
    getText: () => text,
    onText: vi.fn((value: string) => {
      text = value;
    }),
    onInterim: vi.fn(),
    onState: vi.fn(),
    onError: vi.fn(),
    onRecording: vi.fn(),
  };
  return { options, getText: () => text };
}
beforeEach(() => {
  vi.useFakeTimers();
  Recognition.instances = [];
  Recorder.count = 0;
  track.stop.mockClear();
  getUserMedia
    .mockReset()
    .mockResolvedValue({ getTracks: () => [track], getAudioTracks: () => [track] });
  vi.stubGlobal('SpeechRecognition', Recognition);
  vi.stubGlobal('MediaRecorder', Recorder);
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('transcribes without constructing a recorder when saving is off', async () => {
  const { options, getText } = setup();
  const capture = new Dictation();
  await capture.start(options);
  const recognition = Recognition.instances[0];
  recognition.onresult?.({
    results: [
      { isFinal: true, 0: { transcript: 'A clear argument' } },
      { isFinal: false, 0: { transcript: 'still thinking' } },
    ],
  });
  expect(getText()).toBe('Opening A clear argument');
  expect(options.onInterim).toHaveBeenLastCalledWith('still thinking');
  expect(Recorder.count).toBe(0);
  capture.stop();
  expect(getText()).toBe('Opening Final words');
  expect(track.stop).toHaveBeenCalled();
  expect(options.onRecording).not.toHaveBeenCalled();
  capture.dispose();
});
it('creates a local audio blob only after explicit opt-in and stop', async () => {
  const { options } = setup();
  const capture = new Dictation();
  await capture.start({ ...options, record: true });
  expect(Recorder.count).toBe(1);
  expect(options.onRecording).not.toHaveBeenCalled();
  capture.stop();
  expect(options.onRecording).toHaveBeenCalledOnce();
  expect(options.onRecording.mock.calls[0][0].type).toBe('audio/webm');
  capture.dispose();
});
it('maps denied permission into an actionable text fallback', async () => {
  getUserMedia.mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
  const { options } = setup();
  const capture = new Dictation();
  await capture.start(options);
  expect(options.onError).toHaveBeenCalledWith(expect.stringContaining('permission was denied'));
  expect(options.onState).toHaveBeenLastCalledWith('idle');
  expect(Recognition.instances).toHaveLength(0);
});
it('offers text without requesting a microphone when recognition is unsupported', async () => {
  vi.stubGlobal('SpeechRecognition', undefined);
  const { options } = setup();
  await new Dictation().start(options);
  expect(options.onError).toHaveBeenCalledWith(
    expect.stringContaining('unavailable in this browser'),
  );
  expect(getUserMedia).not.toHaveBeenCalled();
});
it('releases permission granted after cancellation without starting recognition', async () => {
  let resolve!: (stream: unknown) => void;
  getUserMedia.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { options } = setup();
  const capture = new Dictation();
  const pending = capture.start(options);
  capture.stop(true);
  resolve({ getTracks: () => [track] });
  await pending;
  expect(track.stop).toHaveBeenCalledOnce();
  expect(Recognition.instances).toHaveLength(0);
});
it('restarts recognition without duplicating already final text', async () => {
  const { options, getText } = setup();
  const capture = new Dictation();
  await capture.start(options);
  Recognition.instances[0].onresult?.({ results: [{ isFinal: true, 0: { transcript: 'First' } }] });
  Recognition.instances[0].onend?.();
  await vi.advanceTimersByTimeAsync(800);
  Recognition.instances[1].onresult?.({
    results: [{ isFinal: true, 0: { transcript: 'Second' } }],
  });
  expect(getText()).toBe('Opening First Second');
  capture.dispose();
});
it('ignores late recognition results after immediate interruption', async () => {
  const { options, getText } = setup();
  const capture = new Dictation();
  await capture.start(options);
  const recognition = Recognition.instances[0];
  capture.stop(true);
  recognition.onresult?.({ results: [{ isFinal: true, 0: { transcript: 'Late' } }] });
  expect(getText()).toBe('Opening');
  capture.dispose();
});
it('cancels queued speech and preserves its remaining allowance during pause', () => {
  const synthesis = {
    cancel: vi.fn(),
    speak: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => [],
  };
  vi.stubGlobal('speechSynthesis', synthesis);
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
    },
  );
  const state = vi.fn(),
    error = vi.fn();
  const playback = new SpeechPlayback(state, error);
  playback.play('One sentence. Another sentence.', {
    language: 'en-US',
    voice: '',
    rate: 1,
    seconds: 10,
  });
  const first = synthesis.speak.mock.calls[0][0];
  vi.advanceTimersByTime(3000);
  playback.pause();
  vi.advanceTimersByTime(10000);
  expect(state).toHaveBeenLastCalledWith('paused');
  playback.resume();
  vi.advanceTimersByTime(6999);
  expect(state).toHaveBeenLastCalledWith('playing');
  vi.advanceTimersByTime(1);
  expect(state).toHaveBeenLastCalledWith('idle');
  first.onend();
  expect(synthesis.speak).toHaveBeenCalledTimes(1);
});
