export interface RecognitionResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
export interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>;
}
export interface BrowserRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionConstructor = new () => BrowserRecognition;
export function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return;
  const browser = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browser.SpeechRecognition || browser.webkitSpeechRecognition;
}
export type CaptureState =
  'idle' | 'requesting' | 'listening' | 'speaking' | 'reconnecting' | 'stopping';
interface DictationOptions {
  language: string;
  record: boolean;
  getText: () => string;
  onText: (text: string) => void;
  onInterim: (text: string) => void;
  onState: (state: CaptureState) => void;
  onError: (message: string) => void;
  onRecording: (blob: Blob) => void;
}
export class Dictation {
  private recognition: BrowserRecognition | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private restart: ReturnType<typeof setTimeout> | undefined;
  private wanted = false;
  private generation = 0;
  private disposed = false;
  private options: DictationOptions | null = null;
  private retries = 0;
  async start(options: DictationOptions) {
    this.stop(true);
    this.options = options;
    this.wanted = true;
    this.retries = 0;
    const generation = ++this.generation;
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      this.fail(
        'Live transcription is unavailable in this browser. Use text input or a browser with Web Speech recognition.',
      );
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.fail(
        'Microphone input requires HTTPS or a local development address. Text input is still available.',
      );
      return;
    }
    if (options.record && typeof MediaRecorder === 'undefined') {
      this.fail(
        'Audio saving is unavailable in this browser. Choose Don’t save audio to continue with transcription.',
      );
      return;
    }
    options.onState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (this.disposed || generation !== this.generation || !this.wanted) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      stream.getAudioTracks().forEach((track) => {
        track.onended = () =>
          this.fail(
            'The microphone disconnected. Your transcript is preserved; reconnect the microphone or use text.',
          );
      });
      if (options.record) {
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
          MediaRecorder.isTypeSupported(type),
        );
        const recorder = new MediaRecorder(
          stream,
          mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined,
        );
        this.recorder = recorder;
        const chunks: Blob[] = [];
        let bytes = 0;
        recorder.ondataavailable = (event) => {
          if (event.data.size) {
            bytes += event.data.size;
            if (bytes <= 25_000_000) chunks.push(event.data);
            else
              this.fail('The recording reached its size limit. Save this take before continuing.');
          }
        };
        recorder.onstop = () => {
          if (!this.disposed && chunks.length)
            options.onRecording(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        };
        recorder.onerror = () =>
          this.fail('Audio recording failed. Your saved transcript is safe.');
        recorder.start(1000);
      }
      this.beginRecognition(Constructor, options, generation);
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      const denied =
        error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name);
      this.fail(
        denied
          ? 'Microphone permission was denied. Allow access in browser settings, then retry, or use text.'
          : 'No usable microphone was found. Reconnect your device or use text input.',
      );
    }
  }
  private beginRecognition(
    Constructor: RecognitionConstructor,
    options: DictationOptions,
    generation: number,
  ) {
    if (!this.wanted || this.disposed || generation !== this.generation) return;
    const recognition = new Constructor();
    this.recognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = options.language;
    const base = options.getText().trim();
    recognition.onstart = () => {
      if (this.wanted) options.onState('listening');
    };
    recognition.onspeechstart = () => {
      if (this.wanted) options.onState('speaking');
    };
    recognition.onspeechend = () => {
      if (this.wanted) options.onState('listening');
    };
    recognition.onresult = (event) => {
      if (this.disposed || generation !== this.generation) return;
      const finals: string[] = [],
        interim: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        (result.isFinal ? finals : interim).push(result[0]?.transcript || '');
      }
      if (finals.length)
        options.onText([base, finals.join(' ')].filter(Boolean).join(' ').slice(0, 8000));
      options.onInterim(interim.join(' '));
      if (options.getText().length >= 8000)
        this.fail('Your draft is full. Review and submit it before another take.');
    };
    recognition.onerror = (event) => {
      if (!this.wanted || event.error === 'aborted') return;
      if (event.error === 'no-speech') return;
      this.fail(
        event.error === 'network'
          ? 'The speech connection was interrupted. Your transcript is preserved. Reconnect or use text.'
          : event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? 'Speech recognition permission was denied. Use text or enable speech access in browser settings.'
            : 'Speech recognition could not continue. Your transcript is preserved; try again or use text.',
      );
    };
    recognition.onend = () => {
      options.onInterim('');
      if (this.disposed || generation !== this.generation) return;
      if (this.wanted && this.retries++ < 3) {
        options.onState('reconnecting');
        this.restart = setTimeout(
          () => this.beginRecognition(Constructor, options, generation),
          800,
        );
      } else if (this.wanted)
        this.fail(
          'Speech recognition stopped repeatedly. Your transcript is preserved. Start a new take or use text.',
        );
      else {
        clearTimeout(this.restart);
        this.release();
        options.onState('idle');
      }
    };
    try {
      recognition.start();
    } catch {
      this.fail('Speech recognition could not start. Stop other microphone sessions and retry.');
    }
  }
  stop(immediate = false) {
    const wasWanted = this.wanted;
    this.wanted = false;
    clearTimeout(this.restart);
    if (immediate) {
      this.generation++;
      this.recognition?.abort();
      this.release();
      this.options?.onInterim('');
      this.options?.onState('idle');
    } else if (wasWanted && this.recognition) {
      this.options?.onState('stopping');
      this.restart = setTimeout(() => {
        this.generation++;
        this.recognition?.abort();
        this.release();
        this.options?.onInterim('');
        this.options?.onState('idle');
      }, 1500);
      this.recognition.stop();
      this.release();
    } else if (wasWanted) {
      this.generation++;
      this.release();
      this.options?.onState('idle');
    }
  }
  private release() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
  private fail(message: string) {
    if (this.disposed) return;
    this.options?.onError(message);
    this.stop(true);
  }
  dispose() {
    this.disposed = true;
    this.stop(true);
    this.options = null;
  }
}

export type PlaybackState = 'idle' | 'playing' | 'paused';
export class SpeechPlayback {
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private remaining = 0;
  private started = 0;
  private utterance: SpeechSynthesisUtterance | null = null;
  constructor(
    private onState: (state: PlaybackState) => void,
    private onError: (message: string) => void,
  ) {}
  play(text: string, options: { language: string; rate: number; voice: string; seconds: number }) {
    this.stop();
    if (!window.speechSynthesis) {
      this.onError('Speech playback is unavailable. Read the transcript instead.');
      return;
    }
    const generation = ++this.generation,
      parts = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
    const chunks = parts.flatMap(
      (part) => part.match(/[\s\S]{1,180}(?:\s|$)|[\s\S]{1,180}/g) || [],
    );
    const voice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.voiceURI === options.voice);
    this.remaining = options.seconds * 1000;
    this.started = Date.now();
    this.timer = setTimeout(() => {
      this.stop();
      this.onError('Playback reached the speaking allowance. You can replay the saved response.');
    }, this.remaining);
    const speak = (index: number) => {
      if (generation !== this.generation) return;
      if (index >= chunks.length) {
        clearTimeout(this.timer);
        this.onState('idle');
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      this.utterance = utterance;
      utterance.lang = options.language;
      utterance.rate = options.rate;
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        if (generation === this.generation) this.onState('playing');
      };
      utterance.onend = () => speak(index + 1);
      utterance.onerror = () => {
        if (generation === this.generation) {
          this.stop();
          this.onError(
            'Speech playback could not continue. Tap Play to retry or read the transcript.',
          );
        }
      };
      this.onState('playing');
      window.speechSynthesis.speak(utterance);
    };
    speak(0);
  }
  pause() {
    window.speechSynthesis?.pause();
    clearTimeout(this.timer);
    this.remaining = Math.max(0, this.remaining - (Date.now() - this.started));
    this.onState('paused');
  }
  resume() {
    window.speechSynthesis?.resume();
    this.started = Date.now();
    this.timer = setTimeout(() => this.stop(), this.remaining);
    this.onState('playing');
  }
  stop() {
    this.generation++;
    clearTimeout(this.timer);
    this.utterance = null;
    window.speechSynthesis?.cancel();
    this.onState('idle');
  }
}
