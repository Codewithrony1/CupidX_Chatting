/**
 * useWebRTC — CupidX Random Chat WebRTC Hook
 *
 * Manages WebRTC peer connections for Audio/Video random chat.
 * Signaling is done via Socket.IO events.
 * This hook does NOT manage matchmaking state — only the media/peer layer.
 *
 * Architecture:
 *   Offerer (userA) creates offer → socket → Answerer (userB) creates answer
 *   ICE candidates exchanged bidirectionally via socket
 *   Actual media streams go P2P (no relay through server)
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { Socket } from 'socket.io-client';

export type WebRTCMode = 'TEXT' | 'AUDIO' | 'VIDEO';
export type WebRTCConnectionState =
  | 'idle'
  | 'acquiring_media'
  | 'media_ready'
  | 'creating_offer'
  | 'waiting_answer'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'closed';

export interface MediaPermissionState {
  camera: 'unknown' | 'granted' | 'denied' | 'unavailable';
  microphone: 'unknown' | 'granted' | 'denied' | 'unavailable';
}

interface UseWebRTCOptions {
  socket: Socket | null;
  mode: WebRTCMode;
  matchId: string | null;
  isOfferer: boolean | null; // null = not yet determined
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: WebRTCConnectionState) => void;
  onError?: (message: string) => void;
}

// ICE server config — STUN only (free). For production add TURN.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export function useWebRTC({
  socket,
  mode,
  matchId,
  isOfferer,
  onRemoteStream,
  onConnectionStateChange,
  onError,
}: UseWebRTCOptions) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const isCleaningUp = useRef(false);
  const matchIdRef = useRef<string | null>(matchId);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<WebRTCConnectionState>('idle');
  const [permissions, setPermissions] = useState<MediaPermissionState>({
    camera: 'unknown',
    microphone: 'unknown',
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // Keep matchId ref in sync
  useEffect(() => {
    matchIdRef.current = matchId;
  }, [matchId]);

  const notifyState = useCallback(
    (state: WebRTCConnectionState) => {
      setConnectionState(state);
      onConnectionStateChange?.(state);
    },
    [onConnectionStateChange]
  );

  // ── Acquire local media ──────────────────────────────────────────────────────
  const acquireMedia = useCallback(async (): Promise<MediaStream | null> => {
    if (mode === 'TEXT') return null;

    notifyState('acquiring_media');

    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video:
        mode === 'VIDEO'
          ? {
              width: { ideal: 1280, max: 1280 },
              height: { ideal: 720, max: 720 },
              frameRate: { ideal: 30, max: 30 },
              facingMode: 'user',
            }
          : false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
      setPermissions({
        camera: mode === 'VIDEO' ? 'granted' : 'unknown',
        microphone: 'granted',
      });
      notifyState('media_ready');
      return stream;
    } catch (err: any) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setPermissions({
          camera: mode === 'VIDEO' ? 'denied' : 'unknown',
          microphone: 'denied',
        });
        onError?.(
          mode === 'VIDEO'
            ? 'Camera and microphone access denied. Please allow permissions and try again.'
            : 'Microphone access denied. Please allow permissions and try again.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setPermissions({
          camera: mode === 'VIDEO' ? 'unavailable' : 'unknown',
          microphone: 'unavailable',
        });
        onError?.(
          mode === 'VIDEO'
            ? 'No camera or microphone found. Please connect a device.'
            : 'No microphone found. Please connect a device.'
        );
      } else {
        onError?.('Could not access media devices. Please try again.');
      }
      notifyState('failed');
      return null;
    }
  }, [mode, notifyState, onError]);

  // ── Create peer connection ───────────────────────────────────────────────────
  const createPeerConnection = useCallback(
    (stream: MediaStream | null): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Add local tracks to peer connection
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }

      // ICE candidate → send via socket
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        if (!socket?.connected || !matchIdRef.current) return;
        socket.emit('webrtc:ice-candidate', {
          matchId: matchIdRef.current,
          candidate: event.candidate,
        });
      };

      // Remote stream received
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          onRemoteStream?.(event.streams[0]);
        }
      };

      // Connection state changes
      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', pc.connectionState);
        switch (pc.connectionState) {
          case 'connecting':
            notifyState('connecting');
            break;
          case 'connected':
            notifyState('connected');
            break;
          case 'disconnected':
          case 'failed':
            notifyState('reconnecting');
            // Attempt ICE restart
            if (pc.connectionState === 'failed') {
              pc.restartIce();
              socket?.emit('webrtc:restart', { matchId: matchIdRef.current });
            }
            break;
          case 'closed':
            notifyState('closed');
            break;
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          pc.restartIce();
        }
      };

      peerRef.current = pc;
      return pc;
    },
    [socket, onRemoteStream, notifyState]
  );

  // ── Create offer (offerer side) ──────────────────────────────────────────────
  const createOffer = useCallback(
    async (pc: RTCPeerConnection) => {
      if (!socket?.connected || !matchIdRef.current) return;
      notifyState('creating_offer');
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:offer', {
          matchId: matchIdRef.current,
          sdp: pc.localDescription,
        });
        notifyState('waiting_answer');
      } catch (err) {
        console.error('[WebRTC] createOffer failed:', err);
        onError?.('Failed to start video/audio connection.');
        notifyState('failed');
      }
    },
    [socket, notifyState, onError]
  );

  // ── Handle incoming offer (answerer side) ────────────────────────────────────
  const handleOffer = useCallback(
    async (sdp: RTCSessionDescriptionInit) => {
      const pc = peerRef.current;
      if (!pc || !socket?.connected || !matchIdRef.current) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        // Drain pending ICE candidates
        for (const cand of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        pendingCandidatesRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', {
          matchId: matchIdRef.current,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error('[WebRTC] handleOffer failed:', err);
        onError?.('Failed to establish audio/video connection.');
        notifyState('failed');
      }
    },
    [socket, notifyState, onError]
  );

  // ── Handle incoming answer (offerer side) ────────────────────────────────────
  const handleAnswer = useCallback(async (sdp: RTCSessionDescriptionInit) => {
    const pc = peerRef.current;
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Drain pending ICE candidates
      for (const cand of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
      }
      pendingCandidatesRef.current = [];
    } catch (err) {
      console.error('[WebRTC] handleAnswer failed:', err);
    }
  }, []);

  // ── Handle incoming ICE candidate ────────────────────────────────────────────
  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = peerRef.current;
    if (!pc) return;

    if (!pc.remoteDescription) {
      // Queue until remote description is set
      pendingCandidatesRef.current.push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[WebRTC] addIceCandidate failed:', err);
    }
  }, []);

  // ── Initialize WebRTC session (called when match is found) ───────────────────
  const initSession = useCallback(
    async (offerer: boolean) => {
      if (mode === 'TEXT') return;
      if (isCleaningUp.current) return;

      const stream = await acquireMedia();
      if (!stream) {
        // Media acquisition failed — error already shown
        return;
      }

      const pc = createPeerConnection(stream);

      if (offerer) {
        await createOffer(pc);
      }
      // Answerer waits for offer from socket event
    },
    [mode, acquireMedia, createPeerConnection, createOffer]
  );

  // ── Cleanup — MUST be called on Next/Leave ───────────────────────────────────
  const cleanup = useCallback(() => {
    isCleaningUp.current = true;

    // Stop all local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log('[WebRTC] Stopped track:', track.kind);
      });
      localStreamRef.current = null;
    }

    // Close peer connection
    if (peerRef.current) {
      peerRef.current.ontrack = null;
      peerRef.current.onicecandidate = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.oniceconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    pendingCandidatesRef.current = [];
    setLocalStream(null);
    setIsMuted(false);
    setIsCameraOff(false);
    notifyState('closed');

    setTimeout(() => {
      isCleaningUp.current = false;
    }, 500);
  }, [notifyState]);

  // ── Toggle mute ──────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    const newMuted = !isMuted;
    audioTracks.forEach((t) => {
      t.enabled = !newMuted;
    });
    setIsMuted(newMuted);
    // Notify partner
    socket?.emit('partner_media_state', {
      matchId: matchIdRef.current,
      isMuted: newMuted,
      isCameraOff,
    });
  }, [isMuted, isCameraOff, socket]);

  // ── Toggle camera ────────────────────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    const newCameraOff = !isCameraOff;
    videoTracks.forEach((t) => {
      t.enabled = !newCameraOff;
    });
    setIsCameraOff(newCameraOff);
    // Notify partner
    socket?.emit('partner_media_state', {
      matchId: matchIdRef.current,
      isMuted,
      isCameraOff: newCameraOff,
    });
  }, [isCameraOff, isMuted, socket]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    localStream,
    connectionState,
    permissions,
    isMuted,
    isCameraOff,
    initSession,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    cleanup,
    toggleMute,
    toggleCamera,
  };
}
