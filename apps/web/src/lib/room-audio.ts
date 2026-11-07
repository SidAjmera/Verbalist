import type { RoomDetail, RoomPeer, RoomWireFrame } from '@verbalist/shared-types';
interface Peer {
  connection: string;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  making: boolean;
  ignore: boolean;
  answering: boolean;
  pending: RTCIceCandidateInit[];
  processing: Promise<void>;
}
/** Media stays in WebRTC. Only the participant's own microphone can reach the local recorder. */
export class RoomAudio {
  private peers = new Map<string, Peer>();
  private present: RoomPeer[] = [];
  private detail: RoomDetail | null = null;
  private configuration: RTCConfiguration = {};
  private stream: MediaStream | null = null;
  private joined = false;
  private generation = 0;
  private floor = false;
  private muted = false;
  private recorder: MediaRecorder | null = null;
  private recordNext = false;
  constructor(
    private ownConnection: () => string,
    private send: (value: unknown) => boolean,
    private changed: (message: string) => void,
    private recording: (blob: Blob) => void,
  ) {}
  async join(configuration: RTCConfiguration, player: boolean) {
    this.leave();
    const generation = this.generation;
    this.configuration = configuration;
    try {
      const stream = player
        ? await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        : null;
      if (generation !== this.generation) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      stream?.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
      this.joined = true;
      if (!this.send({ type: 'voice', enabled: true }))
        throw Error('Live connection is unavailable.');
      this.changed('Joined live audio');
      this.sync();
    } catch (e) {
      this.leave();
      throw e;
    }
  }
  setRoom(detail: RoomDetail, floor: boolean) {
    this.detail = detail;
    this.floor = floor;
    this.sync();
  }
  setMuted(value: boolean) {
    this.muted = value;
    this.sync();
  }
  armRecording(value: boolean) {
    this.recordNext = value;
  }
  isRecording() {
    return this.recorder !== null;
  }
  play() {
    for (const p of this.peers.values())
      void p.audio.play().catch(() => this.changed('Use Play room audio to allow playback.'));
  }
  frame(frame: RoomWireFrame) {
    if (frame.type === 'state') {
      this.present = frame.peers;
      this.sync();
    } else if (frame.type === 'signal' && this.joined) {
      const peer = this.peers.get(frame.sender_id);
      if (peer && peer.connection === frame.sender_connection)
        peer.processing = peer.processing
          .then(() => this.signal(frame))
          .catch(() => this.changed('Audio negotiation failed. Leave and rejoin audio.'));
    }
  }
  private sync() {
    if (!this.joined || !this.detail) return;
    const detail = this.detail,
      self = detail.members.find((m) => m.user_id === detail.self_id);
    if (!self || !['lobby', 'active', 'paused'].includes(detail.room.status)) {
      this.leave();
      this.changed('Audio left');
      return;
    }
    const ownPresence = this.present.find((p) => p.user_id === detail.self_id);
    if (ownPresence && ownPresence.connection_id !== this.ownConnection()) {
      this.leave();
      this.changed('Audio left');
      return;
    }
    const enabled = this.floor && !this.muted && !self.voice_muted && !ownPresence?.muted;
    this.stream?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
    if (!enabled) this.stopRecording();
    else if (this.recordNext && this.stream && !this.recorder) {
      this.recordNext = false;
      this.startRecording();
    }
    const current = detail.room.turn_count % 2 === 0 ? 'proposition' : 'opposition';
    for (const [id, p] of this.peers) {
      const member = detail.members.find((m) => m.user_id === id),
        presence = this.present.find((m) => m.user_id === id);
      if (!presence?.voice || presence.connection_id !== p.connection || !member) {
        this.close(id);
        continue;
      }
      p.audio.muted =
        detail.room.status !== 'active' ||
        detail.room.clock_phase !== 'speaking' ||
        member.role !== current ||
        member.voice_muted ||
        presence.muted;
    }
    for (const presence of this.present) {
      if (
        !presence.voice ||
        presence.user_id === detail.self_id ||
        this.peers.has(presence.user_id)
      )
        continue;
      const member = detail.members.find((m) => m.user_id === presence.user_id);
      if (
        !member ||
        (!['proposition', 'opposition'].includes(self.role) &&
          !['proposition', 'opposition'].includes(member.role))
      )
        continue;
      this.create(presence);
    }
  }
  private create(presence: RoomPeer) {
    const pc = new RTCPeerConnection(this.configuration),
      audio = new Audio();
    audio.autoplay = true;
    audio.muted = true;
    const p: Peer = {
      connection: presence.connection_id,
      pc,
      audio,
      making: false,
      ignore: false,
      answering: false,
      pending: [],
      processing: Promise.resolve(),
    };
    this.peers.set(presence.user_id, p);
    if (this.stream) for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    const send = (kind: string, payload: unknown) => {
      if (this.peers.get(presence.user_id) !== p) return;
      this.send({
        type: 'signal',
        target_id: presence.user_id,
        target_connection: p.connection,
        kind,
        payload,
      });
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) send('candidate', e.candidate.toJSON());
    };
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      void audio.play().catch(() => this.changed('Use Play room audio to allow playback.'));
      this.sync();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed')
        this.changed('A peer audio connection failed. Leave and rejoin audio.');
    };
    pc.onnegotiationneeded = async () => {
      // Fixed mesh: one deterministic initial offer avoids gathering/rollback glare.
      // Perfect negotiation still handles later offers, and SDP/ICE are processed in order.
      if ((this.detail?.self_id || '') > presence.user_id) return;
      try {
        p.making = true;
        await pc.setLocalDescription();
        if (pc.localDescription) send('description', pc.localDescription.toJSON());
      } catch {
        if (pc.signalingState !== 'closed')
          this.changed('Audio negotiation failed. Leave and rejoin audio.');
      } finally {
        p.making = false;
      }
    };
  }
  private async signal(frame: Extract<RoomWireFrame, { type: 'signal' }>) {
    const p = this.peers.get(frame.sender_id);
    if (!p || p.connection !== frame.sender_connection) return;
    const pc = p.pc;
    if (frame.kind === 'description') {
      const description = frame.payload as RTCSessionDescriptionInit;
      const collision =
        description.type === 'offer' &&
        (p.making || (pc.signalingState !== 'stable' && !p.answering));
      const polite = (this.detail?.self_id || '') > frame.sender_id;
      p.ignore = !polite && collision;
      if (p.ignore) return;
      p.answering = description.type === 'answer';
      try {
        await pc.setRemoteDescription(description);
      } finally {
        p.answering = false;
      }
      for (const candidate of p.pending.splice(0)) await pc.addIceCandidate(candidate);
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        if (pc.localDescription)
          this.send({
            type: 'signal',
            target_id: frame.sender_id,
            target_connection: p.connection,
            kind: 'description',
            payload: pc.localDescription.toJSON(),
          });
      }
    } else {
      if (p.ignore) return;
      if (!pc.remoteDescription) {
        if (p.pending.length < 100) p.pending.push(frame.payload as RTCIceCandidateInit);
        return;
      }
      await pc.addIceCandidate(frame.payload as RTCIceCandidateInit);
    }
  }
  private startRecording() {
    if (!this.stream || typeof MediaRecorder === 'undefined') {
      this.changed('Local recording is unavailable in this browser.');
      return;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    try {
      const recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined),
        chunks: Blob[] = [];
      let size = 0;
      this.recorder = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size) {
          if (size + e.data.size > 25 * 1024 * 1024) {
            this.changed('Recording reached the 25 MB limit.');
            this.stopRecording();
            return;
          }
          chunks.push(e.data);
          size += e.data.size;
        }
      };
      recorder.onstop = () => {
        if (chunks.length) this.recording(new Blob(chunks, { type: recorder.mimeType }));
        if (this.recorder === recorder) this.recorder = null;
        this.changed('Own-microphone recording ready');
      };
      recorder.onerror = () => {
        this.changed('Local recording failed.');
        this.stopRecording();
      };
      recorder.start(1000);
      this.changed('Recording your own microphone');
    } catch {
      this.recorder = null;
      this.changed('Local recording is unavailable.');
    }
  }
  private stopRecording() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
  }
  private close(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.onnegotiationneeded = null;
    p.pc.ontrack = null;
    p.pc.onicecandidate = null;
    p.pc.close();
    p.audio.pause();
    p.audio.srcObject = null;
    this.peers.delete(id);
  }
  leave() {
    this.generation++;
    this.joined = false;
    this.recordNext = false;
    this.stopRecording();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    for (const id of this.peers.keys()) this.close(id);
    this.send({ type: 'voice', enabled: false });
  }
}
