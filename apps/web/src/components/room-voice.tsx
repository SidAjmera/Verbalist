'use client';
import { useEffect, useRef, useState } from 'react';
import type { RoomDetail } from '@verbalist/shared-types';
import { useRoomAudio } from '@/hooks/use-room-audio';
import { Dictation, recognitionConstructor, type CaptureState } from '@/lib/speech';
import { Button } from './ui/button';
import { Card } from './ui/card';
export function RoomVoice({
  audio,
  detail,
  connected,
  player,
  floor,
}: {
  audio: ReturnType<typeof useRoomAudio>;
  detail: RoomDetail;
  connected: boolean;
  player: boolean;
  floor: boolean;
}) {
  const [consent, setConsent] = useState(false);
  return (
    <Card className="p-5">
      <h2 className="section-title">Live room audio</h2>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        Players share microphone audio during their speaking period. Judges and spectators listen.
        Joining shares connection information, including your IP, with peers or the configured
        relay. Other participants can record independently.
      </p>
      {!audio.joined ? (
        <>
          <label className="my-4 flex gap-3 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I agree to join live audio{player ? ' and share my microphone' : ''}.
          </label>
          <Button
            disabled={
              !consent ||
              !connected ||
              audio.joining ||
              !['lobby', 'active', 'paused'].includes(detail.room.status)
            }
            onClick={() => void audio.join(detail)}
          >
            {audio.joining ? 'Connecting…' : player ? 'Join live audio' : 'Listen to live audio'}
          </Button>
        </>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          {player && (
            <Button variant="outline" onClick={audio.toggleMute}>
              {audio.muted ? 'Unmute own microphone' : 'Mute own microphone'}
            </Button>
          )}
          <Button variant="outline" onClick={audio.play}>
            Play room audio
          </Button>
          <Button variant="outline" onClick={audio.leave}>
            Leave audio
          </Button>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground" role="status">
        {audio.message} · {floor ? 'Your microphone floor is open' : 'Microphone floor closed'}
      </p>
      {audio.relay === false && (
        <p className="notice mt-3 text-xs">
          No TURN relay is configured. Audio may fail across public networks. Text remains
          available.
        </p>
      )}
      {player && (
        <div className="mt-5 border-t border-border pt-4">
          <label className="flex gap-3 text-sm">
            <input
              type="checkbox"
              checked={audio.record}
              disabled={!audio.joined || floor || !!audio.blob}
              onChange={(e) => audio.toggleRecord(e.target.checked)}
            />
            Save my next speaking take as audio (optional)
          </label>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Off by default. Records only your own microphone to this page, up to 25 MB. It stops
            with the floor or audio connection. Download or discard before leaving; it is never
            uploaded.
          </p>
          {audio.blob && (
            <div className="mt-3 space-y-3">
              <audio
                controls
                src={audio.url}
                className="w-full"
                aria-label="Your local speaking take"
              />
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <a
                    href={audio.url}
                    download={`verbalist-own-take.${audio.blob.type.includes('mp4') ? 'm4a' : 'webm'}`}
                    onClick={audio.downloaded}
                  >
                    Download my audio
                  </a>
                </Button>
                <Button variant="outline" onClick={audio.discard}>
                  Discard my audio
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {audio.saved
                  ? 'Download requested. Verify the file before discarding.'
                  : 'Unsaved local recording'}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
export function RoomDictation({
  enabled,
  getText,
  onText,
  onActive,
}: {
  enabled: boolean;
  getText: () => string;
  onText: (text: string) => void;
  onActive: (active: boolean) => void;
}) {
  const dictation = useRef<Dictation | null>(null);
  const [consent, setConsent] = useState(false),
    [state, setState] = useState<CaptureState>('idle'),
    [interim, setInterim] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    dictation.current = new Dictation();
    const hide = () => {
      if (document.hidden) dictation.current?.stop();
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      dictation.current?.dispose();
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  useEffect(() => {
    if (!enabled) dictation.current?.stop();
  }, [enabled]);
  const active = state !== 'idle';
  return (
    <div className="mt-4 space-y-3">
      <label className="flex gap-3 text-xs leading-6">
        <input
          type="checkbox"
          checked={consent}
          disabled={active}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Allow browser dictation. Your browser provider may process speech. Dictation does not submit
        or save an audio file.
      </label>
      <Button
        variant="outline"
        size="sm"
        disabled={!active && (!enabled || !consent)}
        onClick={() => {
          if (active) {
            dictation.current?.stop();
            return;
          }
          setError('');
          if (!recognitionConstructor()) {
            setError('Dictation is unavailable in this browser. Type your speech instead.');
            return;
          }
          void dictation.current?.start({
            language: 'en-US',
            record: false,
            getText,
            onText,
            onInterim: setInterim,
            onState: (value) => {
              setState(value);
              onActive(value !== 'idle');
            },
            onError: setError,
            onRecording: () => {},
          });
        }}
      >
        {active ? 'Stop room dictation' : 'Dictate private draft'}
      </Button>
      {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}
      {active && (
        <p className="text-xs text-muted-foreground">
          Stop dictation and wait for the final words before submitting.
        </p>
      )}
      {error && (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      )}
    </div>
  );
}
