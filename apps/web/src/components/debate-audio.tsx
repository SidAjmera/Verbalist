'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Download, Mic, MicOff, Pause, Play, Square, Trash2, Volume2 } from 'lucide-react';
import type { Preferences } from '@verbalist/shared-types';
import type { AudioControls } from '@/hooks/use-audio';
import { Button } from './ui/button';
import { Card } from './ui/card';
export function DebateAudio({
  audio,
  preferences,
  id,
  canSpeak,
  getText,
  onText,
}: {
  audio: AudioControls;
  preferences: Preferences;
  id: string;
  canSpeak: boolean;
  getText: () => string;
  onText: (text: string) => void;
}) {
  const [consent, setConsent] = useState(false),
    [record, setRecord] = useState(false),
    [textFallback, setTextFallback] = useState(false);
  const active = audio.capture !== 'idle',
    voice = preferences.input_mode === 'voice' && !textFallback;
  function stop() {
    audio.stopCapture();
    setRecord(false);
  }
  const extension = audio.recording?.type.includes('mp4')
    ? 'm4a'
    : audio.recording?.type.includes('ogg')
      ? 'ogg'
      : 'webm';
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title flex items-center gap-2">
          <Mic className="size-4 text-primary" />
          Voice & audio
        </h2>
        <Link href="/settings" className="text-xs text-primary">
          Voice preferences
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="pill">Input: {voice ? 'Voice' : 'Text'}</span>
        <span className="pill">
          Output:{' '}
          {preferences.output_mode === 'both'
            ? 'Text + voice'
            : preferences.output_mode === 'voice'
              ? 'Voice'
              : 'Text'}
        </span>
        <span className={`pill ${active ? 'pill-active' : ''}`} role="status">
          {audio.capture === 'speaking'
            ? 'Speaking'
            : audio.capture === 'listening'
              ? 'Microphone active'
              : audio.capture === 'requesting'
                ? 'Requesting permission'
                : audio.capture === 'reconnecting'
                  ? 'Reconnecting microphone'
                  : audio.capture === 'stopping'
                    ? 'Finishing transcript'
                    : 'Microphone off'}
        </span>
      </div>
      {voice && !audio.support.recognition && (
        <p className="notice mb-4">
          Live transcription isn’t supported by this browser. You can type your argument below. Your
          voice preference remains available on compatible devices.
        </p>
      )}
      {preferences.output_mode !== 'text' && !audio.support.synthesis && (
        <p className="notice mb-4">
          Speech playback is unavailable in this browser. The full text response is available below.
        </p>
      )}
      {voice && audio.support.recognition && (
        <>
          <label className="flex items-start gap-3 text-xs leading-6 text-muted-foreground">
            <input
              type="checkbox"
              checked={consent}
              disabled={active}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1.5 accent-blue-500"
            />
            <span>
              Allow browser speech processing for this microphone session. Your browser may send
              audio to its speech service. Verbalist saves the transcript to your private account.
            </span>
          </label>
          <fieldset className="mt-4 rounded-lg border border-border p-4" disabled={active}>
            <legend className="px-1 text-xs font-semibold">Save audio for this take?</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`record-${id}`}
                  checked={!record}
                  onChange={() => setRecord(false)}
                />
                Don’t save audio
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`record-${id}`}
                  checked={record}
                  disabled={!audio.support.recording}
                  onChange={() => setRecord(true)}
                />
                Record for download
              </label>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              Optional recordings stay in this page’s memory until you download or discard them. No
              audio uploads. Download before leaving or reloading.
            </p>
          </fieldset>
          <div className="mt-4 flex flex-wrap gap-2">
            {active ? (
              <Button variant="outline" onClick={stop}>
                <MicOff />
                Stop microphone
              </Button>
            ) : (
              <Button
                disabled={!consent || !canSpeak || Boolean(audio.recording)}
                onClick={() => audio.startCapture({ preferences, record, getText, onText })}
              >
                <Mic />
                Start microphone
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={active}
              onClick={() => {
                stop();
                setTextFallback(true);
              }}
            >
              Use text instead
            </Button>
          </div>
        </>
      )}
      {textFallback && preferences.input_mode === 'voice' && audio.support.recognition && (
        <Button variant="outline" size="sm" onClick={() => setTextFallback(false)}>
          Switch back to voice
        </Button>
      )}
      {preferences.input_mode === 'text' && (
        <p className="text-xs leading-6 text-muted-foreground">
          Choose Voice input in Settings to dictate your argument. Text editing is always available.
        </p>
      )}
      {audio.interim && (
        <div
          className="mt-4 rounded-lg bg-background p-4 text-sm leading-7 text-muted-foreground"
          aria-live="polite"
        >
          <span className="eyebrow mr-2">HEARING</span>
          {audio.interim}
        </div>
      )}
      {audio.recording && (
        <div className="mt-5 rounded-xl border border-primary/30 bg-accent/40 p-4">
          <h3 className="text-xs font-semibold">Your optional recording</h3>
          <audio
            className="mt-3 w-full"
            controls
            src={audio.recording.url}
            onPlay={audio.stopPlayback}
            preload="metadata"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a
                href={audio.recording.url}
                onClick={audio.markRecordingSaved}
                download={`verbalist-${id.slice(0, 8)}.${extension}`}
              >
                <Download />
                Save audio to device
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                audio.discardRecording();
                setRecord(false);
              }}
            >
              <Trash2 />
              Discard audio
            </Button>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            This file is not saved in your account or debate history.
          </p>
        </div>
      )}
      {audio.playback !== 'idle' && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-accent p-3">
          <span className="mr-auto flex items-center gap-2 text-xs" role="status">
            <Volume2 className="size-4 text-primary" />
            {audio.playback === 'playing' ? 'Opponent speaking' : 'Speech paused'}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={audio.playback === 'playing' ? audio.pausePlayback : audio.resumePlayback}
          >
            {audio.playback === 'playing' ? <Pause /> : <Play />}
            {audio.playback === 'playing' ? 'Pause audio' : 'Resume audio'}
          </Button>
          <Button variant="outline" size="sm" onClick={audio.stopPlayback}>
            <Square />
            Stop audio
          </Button>
        </div>
      )}
      {audio.notice && (
        <p className="notice mt-4" role="status">
          {audio.notice}
        </p>
      )}
    </Card>
  );
}
