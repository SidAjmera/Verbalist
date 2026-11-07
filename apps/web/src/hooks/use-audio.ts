'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Preferences } from '@verbalist/shared-types';
import {
  Dictation,
  SpeechPlayback,
  recognitionConstructor,
  type CaptureState,
  type PlaybackState,
} from '@/lib/speech';
const subscribe = () => () => {};
export function useSpeechSupport() {
  const recognition = useSyncExternalStore(
    subscribe,
    () => Boolean(recognitionConstructor()),
    () => false,
  );
  const synthesis = useSyncExternalStore(
    subscribe,
    () =>
      typeof window !== 'undefined' &&
      Boolean(window.speechSynthesis) &&
      typeof SpeechSynthesisUtterance !== 'undefined',
    () => false,
  );
  const recording = useSyncExternalStore(
    subscribe,
    () => typeof MediaRecorder !== 'undefined',
    () => false,
  );
  return { recognition, synthesis, recording };
}
export function useBrowserVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    void Promise.resolve().then(update);
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}
export function useAudio() {
  const support = useSpeechSupport();
  const [capture, setCapture] = useState<CaptureState>('idle'),
    [playback, setPlayback] = useState<PlaybackState>('idle'),
    [interim, setInterim] = useState(''),
    [notice, setNotice] = useState(''),
    [recording, setRecording] = useState<{ url: string; type: string } | null>(null);
  const dictation = useRef<Dictation | null>(null),
    speech = useRef<SpeechPlayback | null>(null),
    recordingURL = useRef(''),
    recordingSaved = useRef(false);
  const discardRecording = useCallback(() => {
    if (recordingURL.current) URL.revokeObjectURL(recordingURL.current);
    recordingURL.current = '';
    setRecording(null);
    recordingSaved.current = false;
  }, []);
  const markRecordingSaved = useCallback(() => {
    recordingSaved.current = true;
  }, []);
  const allowNavigation = useCallback(() => {
    if (recordingURL.current && !recordingSaved.current) {
      setNotice(
        'Save or discard your optional audio before leaving. It is not stored in your account.',
      );
      return false;
    }
    return true;
  }, []);
  useEffect(() => {
    dictation.current = new Dictation();
    speech.current = new SpeechPlayback(setPlayback, setNotice);
    const interrupt = () => {
      dictation.current?.stop(true);
      speech.current?.stop();
      setNotice(
        navigator.onLine
          ? 'Audio stopped while this tab was hidden. Your transcript is preserved.'
          : 'Audio connection lost. Your transcript is preserved; reconnect and start the microphone again.',
      );
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') interrupt();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('offline', interrupt);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (recordingURL.current && !recordingSaved.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('offline', interrupt);
      window.removeEventListener('beforeunload', beforeUnload);
      dictation.current?.dispose();
      speech.current?.stop();
      if (recordingURL.current) URL.revokeObjectURL(recordingURL.current);
    };
  }, []);
  const stopCapture = useCallback(() => dictation.current?.stop(), []);
  const stopPlayback = useCallback(() => speech.current?.stop(), []);
  const pausePlayback = useCallback(() => speech.current?.pause(), []);
  const resumePlayback = useCallback(() => speech.current?.resume(), []);
  const startCapture = useCallback(
    (options: {
      preferences: Preferences;
      record: boolean;
      getText: () => string;
      onText: (text: string) => void;
    }) => {
      if (recordingURL.current) {
        setNotice('Save or discard the current recording before starting another take.');
        return;
      }
      setNotice('');
      speech.current?.stop();
      void dictation.current?.start({
        language: options.preferences.speech_language || 'en-US',
        record: options.record,
        getText: options.getText,
        onText: options.onText,
        onInterim: setInterim,
        onState: setCapture,
        onError: setNotice,
        onRecording: (blob) => {
          if (recordingURL.current) URL.revokeObjectURL(recordingURL.current);
          const url = URL.createObjectURL(blob);
          recordingURL.current = url;
          recordingSaved.current = false;
          setRecording({ url, type: blob.type });
        },
      });
    },
    [],
  );
  const play = useCallback((text: string, preferences: Preferences, seconds: number) => {
    dictation.current?.stop();
    setNotice('');
    speech.current?.play(text, {
      language: preferences.speech_language || 'en-US',
      rate: preferences.speech_rate || 1,
      voice: preferences.speech_voice || '',
      seconds,
    });
  }, []);
  return {
    support,
    capture,
    playback,
    interim,
    notice,
    recording,
    startCapture,
    stopCapture,
    stopPlayback,
    pausePlayback,
    resumePlayback,
    discardRecording,
    play,
    allowNavigation,
    markRecordingSaved,
  };
}
export type AudioControls = ReturnType<typeof useAudio>;
