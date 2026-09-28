/**
 * useWebRTC — CupidX Random Chat WebRTC Hook
 *
 * Manages WebRTC peer connections for Audio/Video random chat.
 * Signaling works over BOTH Socket.IO (primary) AND HTTP REST fallback (/api/chat/random/webrtc).
 * This ensures audio/video calls connect seamlessly on Vercel serverless even without an active socket server.
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

// ICE server config — multiple reliable public STUN servers
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
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
  const processedCandidateKeysRef = useRef<Set<string>>(new Set());
  const isCleaningUp = useRef(false);
  const matchIdRef = useRef<string | null>(matchId);
  const isOffererRef = useRef<boolean | null>(isOfferer);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<WebRTCConnectionState>('idle');
  const [permissions, setPermissions] = useState<MediaPermissionState>({
    camera: 'unknown',
    microphone: 'unknown',
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // Keep matchId & isOfferer refs in sync
  useEffect(() => {
    matchIdRef.current = matchId;
  }, [matchId]);

  useEffect(() => {
    isOffererRef.current = isOfferer;
  }, [isOfferer]);

  const notifyState = useCallback(
    (state: WebRTCConnectionState) => {
      setConnectionState(state);
      onConnectionStateChange?.(state);
    },
    [onConnectionStateChange]
  );

  // ── Helper to POST signals to HTTP fallback ─────────────────────────────────
  const postSignal = useCallback(async (action: string, payload: any) => {
    const currentMid = matchIdRef.current;
    if (!currentMid) return;
    try {
      await fetch('/api/chat/random/webrtc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatSessionId: currentMid, action, ...payload }),
      });
    } catch (e) {
      console.warn('[WebRTC] REST signal post error:', e);
    }
  }, []);

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
            ? 'Camera and microphone access denied. Please allow permissions in your browser and try again.'
            : 'Microphone access denied. Please allow microphone permission in your browser and try again.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setPermissions({
          camera: mode === 'VIDEO' ? 'unavailable' : 'unknown',
          microphone: 'unavailable',
        });
        onError?.(
          mode === 'VIDEO'
            ? 'No camera or microphone found. Please connect a device.'
            : 'No microphone found. Please connect a microphone.'
        );
      } else {
        onError?.('Could not access media devices. Please check permissions and try again.');
      }
      notifyState('failed');
      return null;
    }
  }, [mode, notifyState, onError]);

  // ── Create peer connection ───────────────────────────────────────────────────
  const createPeerConnection = useCallback(
    (stream: MediaStream | null): RTCPeerConnection => {
      if (peerRef.current) {
        try {
          peerRef.current.close();
        } catch {}
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Add local tracks to peer connection
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }

      // ICE candidate → send via socket AND/OR HTTP
      pc.onicecandidate = (event) => {
        if (!event.candidate || !matchIdRef.current) return;

        if (socket?.connected) {
          socket.emit('webrtc:ice-candidate', {
            matchId: matchIdRef.current,
            candidate: event.candidate,
          });
        }
        // Always persist candidate to REST endpoint so both transport modes work
        postSignal('ice', { candidate: event.candidate });
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
            // Clear polling once connected
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            break;
          case 'disconnected':
          case 'failed':
            notifyState('reconnecting');
            if (pc.connectionState === 'failed') {
              try {
                pc.restartIce();
                if (socket?.connected) {
                  socket.emit('webrtc:restart', { matchId: matchIdRef.current });
                }
                postSignal('restart', {});
              } catch {}
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
          try {
            pc.restartIce();
          } catch {}
        }
      };

      peerRef.current = pc;
      return pc;
    },
    [socket, onRemoteStream, notifyState, postSignal]
  );

  // ── Create offer (offerer side) ──────────────────────────────────────────────
  const createOffer = useCallback(
    async (pc: RTCPeerConnection) => {
      const currentMid = matchIdRef.current;
      if (!currentMid) return;
      notifyState('creating_offer');
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: mode === 'VIDEO',
        });
        await pc.setLocalDescription(offer);

        if (socket?.connected) {
          socket.emit('webrtc:offer', {
            matchId: currentMid,
            sdp: pc.localDescription,
          });
        }
        await postSignal('offer', { sdp: pc.localDescription });
        notifyState('waiting_answer');
      } catch (err) {
        console.error('[WebRTC] createOffer failed:', err);
        onError?.('Failed to start call connection.');
        notifyState('failed');
      }
    },
    [socket, mode, notifyState, postSignal, onError]
  );

  // ── Handle incoming offer (answerer side) ────────────────────────────────────
  const handleOffer = useCallback(
    async (sdp: RTCSessionDescriptionInit) => {
      let pc = peerRef.current;
      const currentMid = matchIdRef.current;
      if (!currentMid) return;

      if (!pc) {
        // If peer connection not ready, create it with local media first
        let stream = localStreamRef.current;
        if (!stream) {
          stream = await acquireMedia();
        }
        pc = createPeerConnection(stream);
      }

      // Check if remote description already set to avoid InvalidStateError
      if (pc.remoteDescription) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        // Drain pending ICE candidates
        for (const cand of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        pendingCandidatesRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (socket?.connected) {
          socket.emit('webrtc:answer', {
            matchId: currentMid,
            sdp: pc.localDescription,
          });
        }
        await postSignal('answer', { sdp: pc.localDescription });
      } catch (err) {
        console.error('[WebRTC] handleOffer failed:', err);
        onError?.('Failed to establish audio/video connection.');
        notifyState('failed');
      }
    },
    [socket, acquireMedia, createPeerConnection, postSignal, notifyState, onError]
  );

  // ── Handle incoming answer (offerer side) ────────────────────────────────────
  const handleAnswer = useCallback(async (sdp: RTCSessionDescriptionInit) => {
    const pc = peerRef.current;
    if (!pc) return;
    if (pc.remoteDescription) return; // Already set
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

    const candKey = `${candidate.candidate}_${candidate.sdpMid}_${candidate.sdpMLineIndex}`;
    if (processedCandidateKeysRef.current.has(candKey)) return;
    processedCandidateKeysRef.current.add(candKey);

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
        // Media acquisition failed — error handled in acquireMedia
        return;
      }

      const pc = createPeerConnection(stream);

      if (offerer) {
        await createOffer(pc);
      }
    },
    [mode, acquireMedia, createPeerConnection, createOffer]
  );

  // ── REST-based Polling for Signaling (Automatic fallback when socket down) ─
  useEffect(() => {
    if (mode === 'TEXT' || !matchId) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // Poll for signaling if not yet connected
    pollingIntervalRef.current = setInterval(async () => {
      const pc = peerRef.current;
      const currentMid = matchIdRef.current;
      if (!currentMid) return;

      // If already connected, stop polling
      if (pc && pc.connectionState === 'connected') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        return;
      }

      try {
        const res = await fetch(`/api/chat/random/webrtc?chatSessionId=${currentMid}`);
        if (!res.ok) return;
        const data = await res.json();

        // 1. Answerer receives offer from Offerer
        if (!isOffererRef.current && data.offerSdp && (!pc || !pc.remoteDescription)) {
          console.log('[WebRTC Polling] Received offer from partner via REST');
          await handleOffer(data.offerSdp);
        }

        // 2. Offerer receives answer from Answerer
        if (isOffererRef.current && data.answerSdp && pc && !pc.remoteDescription) {
          console.log('[WebRTC Polling] Received answer from partner via REST');
          await handleAnswer(data.answerSdp);
        }

        // 3. Process any new ICE candidates from partner
        if (Array.isArray(data.candidates)) {
          for (const cand of data.candidates) {
            await handleIceCandidate(cand);
          }
        }
      } catch (e) {
        // Silent catch for background poll
      }
    }, 750);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [mode, matchId, handleOffer, handleAnswer, handleIceCandidate]);

  // ── Cleanup — MUST be called on Next/Leave ───────────────────────────────────
  const cleanup = useCallback(() => {
    isCleaningUp.current = true;

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

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
    processedCandidateKeysRef.current.clear();
    setLocalStream(null);
    setIsMuted(false);
    setIsCameraOff(false);
    notifyState('closed');

    setTimeout(() => {
      isCleaningUp.current = false;
    }, 400);
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

    if (socket?.connected) {
      socket.emit('partner_media_state', {
        matchId: matchIdRef.current,
        isMuted: newMuted,
        isCameraOff,
      });
    }
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

    if (socket?.connected) {
      socket.emit('partner_media_state', {
        matchId: matchIdRef.current,
        isMuted,
        isCameraOff: newCameraOff,
      });
    }
  }, [isCameraOff, isMuted, socket]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

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
