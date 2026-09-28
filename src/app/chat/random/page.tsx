'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useAuth as useClerkAuth } from '@clerk/nextjs';
import { useSocket } from '@/context/SocketContext';
import AppShell from '@/components/AppShell';
import nextDynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  Send,
  Paperclip,
  CheckCheck,
  Flag,
  Crown,
  FastForward,
  X,
  Sparkles,
  Ban,
  MoreVertical,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Eye,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  PhoneOff,
  MessageSquare,
  Volume2,
  VolumeX,
  RotateCcw,
  Wifi,
  WifiOff,
  Camera,
  Radio,
} from 'lucide-react';
import SelfHostedVipModal from '@/components/payment/SelfHostedVipModal';
import { useChatViewport } from '@/hooks/useChatViewport';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { sanitizeChatText } from '@/lib/sanitizeChatText';
import { useWebRTC, type WebRTCMode, type WebRTCConnectionState } from '@/hooks/useWebRTC';

const ProfilePreviewSheet = nextDynamic(() => import('@/components/chat/ProfilePreviewSheet'), { ssr: false });

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ConnectionState =
  | 'IDLE'
  | 'SELECTING_MODE'
  | 'SEARCHING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTING'
  | 'DISCONNECTED'
  | 'ERROR';

type ChatMode = 'TEXT' | 'AUDIO' | 'VIDEO';

interface RandomPartner {
  id: string;
  username?: string;
  vipUsername?: string | null;
  fullName: string;
  displayName?: string;
  avatarType?: string;
  avatarEmoji?: string;
  avatarUrl?: string | null;
  gender: string;
  mood?: string;
  personalityPreferences?: string;
  bio?: string;
  isVIP: boolean;
  plan?: string;
  countryCode?: string;
  countryName?: string;
  countryFlag?: string;
}

interface RandomMessage {
  id: string;
  clientMessageId?: string | null;
  chatSessionId?: string;
  senderId: string;
  senderUsername: string;
  content: string;
  imageUrl: string | null;
  sequenceNumber?: number;
  createdAt: string;
  status?: 'SENDING' | 'SENT' | 'DELIVERED' | 'FAILED';
  deliveredAt?: string | null;
}

// ─── Message Bubble ────────────────────────────────────────────────────────────

const RandomChatMessageItem = React.memo(function RandomChatMessageItem({
  msg,
  isMine,
  onImageClick,
  onRetry,
}: {
  msg: RandomMessage;
  isMine: boolean;
  onImageClick: (url: string) => void;
  onRetry?: (msg: RandomMessage) => void;
}) {
  const formattedTime = useMemo(() => {
    try {
      return new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, [msg.createdAt]);

  return (
    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-full`}>
      <div
        className={`max-w-[85%] sm:max-w-[70%] md:max-w-[65%] min-w-[72px] rounded-3xl p-3 sm:p-3.5 shadow-lg relative break-words [overflow-wrap:anywhere] [word-break:break-word] ${
          isMine
            ? 'bg-gradient-to-br from-pink-600 via-rose-500 to-purple-600 text-white rounded-tr-sm shadow-pink-500/10'
            : 'bg-slate-900/90 border border-slate-800 text-slate-100 rounded-tl-sm'
        }`}
      >
        {msg.imageUrl && (
          <div
            onClick={() => onImageClick(msg.imageUrl!)}
            className="mb-2 rounded-2xl overflow-hidden cursor-pointer group bg-black/40 border border-white/10 relative"
          >
            <img
              src={msg.imageUrl}
              alt={`Attachment from ${isMine ? 'you' : 'partner'}`}
              className="max-h-60 w-full max-w-full object-cover rounded-xl group-hover:scale-105 transition-transform"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Eye className="w-5 h-5 text-white" />
            </div>
          </div>
        )}

        {msg.content && (
          <bdi className="block break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap text-xs sm:text-[13px] leading-relaxed select-text">
            {sanitizeChatText(msg.content)}
          </bdi>
        )}

        <div className="flex items-center justify-end space-x-1 mt-1 text-[9px] opacity-75 whitespace-nowrap select-none shrink-0">
          <span className="shrink-0">{formattedTime}</span>
          {isMine &&
            (msg.status === 'FAILED' ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRetry?.(msg); }}
                className="inline-flex items-center gap-0.5 text-rose-300 hover:text-rose-200 font-bold cursor-pointer transition-colors shrink-0"
                title="Failed to deliver. Click to retry."
              >
                <span>!</span>
                <span className="underline text-[8px]">Retry</span>
              </button>
            ) : msg.status === 'DELIVERED' ? (
              <span title="Delivered" className="inline-flex items-center shrink-0"><CheckCheck className="w-3.5 h-3.5 text-pink-300" /></span>
            ) : msg.status === 'SENT' ? (
              <span title="Sent" className="inline-flex items-center shrink-0"><CheckCheck className="w-3 h-3 text-white/80" /></span>
            ) : (
              <span className="text-[9px] text-white/60 inline-flex items-center shrink-0" title="Sending...">🕒</span>
            ))}
        </div>
      </div>
    </div>
  );
});

// ─── Mode Selection Landing ────────────────────────────────────────────────────

function ModeLanding({
  onSelect,
  isVIP,
}: {
  onSelect: (mode: ChatMode) => void;
  isVIP: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 select-none">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm space-y-6 text-center"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-pink-600 via-rose-500 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-pink-500/30">
            <Heart className="w-8 h-8 text-white fill-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Random Chat</h1>
            <p className="text-xs text-slate-400 mt-1">Connect with a stranger instantly</p>
          </div>
        </div>

        {/* Mode Cards */}
        <div className="space-y-3">
          {/* Text Chat */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('TEXT')}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-pink-500/50 hover:bg-slate-800/80 transition-all group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-600 to-purple-600 flex items-center justify-center shrink-0 shadow-lg shadow-pink-500/20 group-hover:shadow-pink-500/40 transition-shadow">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <div className="font-black text-white text-sm">Text Chat</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Chat anonymously via messages</div>
            </div>
            <div className="ml-auto">
              <div className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Free</div>
            </div>
          </motion.button>

          {/* Audio Chat */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('AUDIO')}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/80 transition-all group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow">
              <Mic className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <div className="font-black text-white text-sm">Voice Chat</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Talk with a stranger via voice</div>
            </div>
            <div className="ml-auto">
              {isVIP ? (
                <div className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Crown className="w-2.5 h-2.5" /> VIP
                </div>
              ) : (
                <div className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Crown className="w-2.5 h-2.5" /> VIP
                </div>
              )}
            </div>
          </motion.button>

          {/* Video Chat */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('VIDEO')}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-rose-500/50 hover:bg-slate-800/80 transition-all group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-600 to-orange-500 flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/20 group-hover:shadow-rose-500/40 transition-shadow">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <div className="font-black text-white text-sm">Video Chat</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Face-to-face with a stranger</div>
            </div>
            <div className="ml-auto">
              <div className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Crown className="w-2.5 h-2.5" /> VIP
              </div>
            </div>
          </motion.button>
        </div>

        {/* Info */}
        <div className="flex items-center gap-1.5 justify-center text-[10px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Anonymous • Safe • Ephemeral sessions</span>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Video UI ──────────────────────────────────────────────────────────────────

function VideoArea({
  localStream,
  remoteStream,
  partner,
  webrtcState,
  isMuted,
  isCameraOff,
  partnerMuted,
  partnerCameraOff,
  mode,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  partner: RandomPartner | null;
  webrtcState: WebRTCConnectionState;
  isMuted: boolean;
  isCameraOff: boolean;
  partnerMuted: boolean;
  partnerCameraOff: boolean;
  mode: ChatMode;
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    } else if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    } else if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, [remoteStream]);

  if (mode === 'AUDIO') {
    // Audio mode: show avatars, no video
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-8">
        {/* Partner avatar */}
        <div className="relative">
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-2xl shadow-blue-500/30">
            {partner?.avatarType === 'IMAGE' && partner?.avatarUrl ? (
              <img src={partner.avatarUrl} alt="Partner" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-5xl">{partner?.avatarEmoji || '😊'}</span>
            )}
          </div>
          {/* Audio wave animation when connected */}
          {webrtcState === 'connected' && (
            <div className="absolute -inset-2 rounded-full border-2 border-blue-400/40 animate-ping" />
          )}
          {partnerMuted && (
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
              <MicOff className="w-3.5 h-3.5 text-white" />
            </div>
          )}
        </div>
        <div className="text-center">
          <div className="text-white font-bold text-sm">
            {partner?.displayName || partner?.fullName || 'Stranger'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {webrtcState === 'connected' ? (
              <span className="text-emerald-400 flex items-center gap-1 justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Voice connected
              </span>
            ) : webrtcState === 'connecting' || webrtcState === 'creating_offer' || webrtcState === 'waiting_answer' ? (
              <span className="text-blue-400 flex items-center gap-1 justify-center">
                <Loader2 className="w-3 h-3 animate-spin" /> Connecting voice...
              </span>
            ) : webrtcState === 'reconnecting' ? (
              <span className="text-yellow-400 flex items-center gap-1 justify-center">
                <RotateCcw className="w-3 h-3 animate-spin" /> Reconnecting...
              </span>
            ) : (
              <span className="text-slate-400">Connecting...</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // VIDEO mode
  return (
    <div className="relative w-full bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: '50vh' }}>
      {/* Remote video (main) */}
      {remoteStream && !partnerCameraOff ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
          <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mb-2">
            <span className="text-4xl">{partner?.avatarEmoji || '😊'}</span>
          </div>
          <p className="text-slate-400 text-xs">
            {partnerCameraOff ? 'Camera off' : (
              webrtcState === 'connecting' || webrtcState === 'creating_offer' ? 'Connecting...' : 'Waiting for video...'
            )}
          </p>
        </div>
      )}

      {/* WebRTC state overlay */}
      {(webrtcState === 'connecting' || webrtcState === 'creating_offer' || webrtcState === 'waiting_answer') && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-white">
            <Loader2 className="w-8 h-8 animate-spin text-pink-400" />
            <p className="text-xs font-bold">Connecting video...</p>
          </div>
        </div>
      )}
      {webrtcState === 'reconnecting' && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-white">
            <RotateCcw className="w-7 h-7 animate-spin text-yellow-400" />
            <p className="text-xs font-bold text-yellow-300">Reconnecting...</p>
          </div>
        </div>
      )}

      {/* Local video (picture-in-picture) */}
      <div className="absolute bottom-3 right-3 w-24 h-16 sm:w-32 sm:h-20 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg bg-slate-900">
        {localStream && !isCameraOff ? (
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-800">
            <VideoOff className="w-5 h-5 text-slate-500" />
          </div>
        )}
      </div>

      {/* Status badges */}
      <div className="absolute top-3 left-3 flex flex-col gap-1">
        {partnerMuted && (
          <div className="flex items-center gap-1 text-[9px] font-bold text-white bg-black/60 px-2 py-0.5 rounded-full">
            <MicOff className="w-2.5 h-2.5" /> Muted
          </div>
        )}
        {webrtcState === 'connected' && (
          <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-300 bg-black/60 px-2 py-0.5 rounded-full">
            <Wifi className="w-2.5 h-2.5" /> Connected
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function RandomChatPage() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();
  const { getToken } = useClerkAuth();
  const { socket, isConnected: socketConnected } = useSocket();

  const currentUser = user;

  // ── Core state ──
  const [chatMode, setChatMode] = useState<ChatMode>('TEXT');
  const [matchStatus, setMatchStatus] = useState<'idle' | 'mode_select' | 'searching' | 'connected' | 'ended'>('idle');
  const [connectionState, setConnectionState] = useState<ConnectionState>('IDLE');
  const [partner, setPartner] = useState<RandomPartner | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RandomMessage[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [randomChatDisabled, setRandomChatDisabled] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(true);

  // ── WebRTC state ──
  const [isOfferer, setIsOfferer] = useState<boolean | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [partnerMuted, setPartnerMuted] = useState(false);
  const [partnerCameraOff, setPartnerCameraOff] = useState(false);
  const [webrtcError, setWebrtcError] = useState<string | null>(null);

  // ── Input & messaging ──
  const [inputText, setInputText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);

  // ── Image attachment ──
  const [showVipModal, setShowVipModal] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Options & safety modals ──
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  // ── Refs ──
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCurrentlyTypingRef = useRef(false);
  const lastMessageSentTimeRef = useRef<number>(0);
  const isSkippingRef = useRef(false);
  const currentUidRef = useRef<string | null>(null);
  const activeMatchIdRef = useRef<string | null>(null);
  const autoStartExecutedRef = useRef(false);
  const serverlessPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMatchmakingStartingRef = useRef(false);
  const isOffererRef = useRef<boolean | null>(null);
  const chatModeRef = useRef<ChatMode>('TEXT');

  // Modal focus traps
  const reportModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(reportModalRef, showReportModal, () => setShowReportModal(false));

  // Dynamic viewport for mobile keyboard
  const { containerStyle } = useChatViewport({ scrollRef: messagesEndRef });

  const isVIP = Boolean(
    (!currentUser?.vip_expires_at || new Date(currentUser.vip_expires_at).getTime() > Date.now()) &&
    (currentUser?.membershipTier === 'VIP' ||
      currentUser?.is_vip ||
      (currentUser?.subscription?.isActive === true && currentUser?.subscription?.plan === 'VIP'))
  );

  // Keep refs in sync
  useEffect(() => {
    currentUidRef.current = currentUser?.clerkUserId || currentUser?.id || null;
  }, [currentUser?.id, currentUser?.clerkUserId]);

  useEffect(() => {
    chatModeRef.current = chatMode;
  }, [chatMode]);

  useEffect(() => {
    isOffererRef.current = isOfferer;
  }, [isOfferer]);

  // ── WebRTC hook ──
  const webrtc = useWebRTC({
    socket,
    mode: chatMode as WebRTCMode,
    matchId,
    isOfferer,
    onRemoteStream: useCallback((stream: MediaStream) => {
      setRemoteStream(stream);
    }, []),
    onConnectionStateChange: useCallback((state: WebRTCConnectionState) => {
      // Don't clear UI state on WebRTC state changes
    }, []),
    onError: useCallback((msg: string) => {
      setWebrtcError(msg);
    }, []),
  });

  const handleImageClick = useCallback((url: string) => {
    setSelectedFullImage(url);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    if (typeof window === 'undefined') return;
    requestAnimationFrame(() => {
      const container = chatScrollContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
      }
    });
  }, []);

  // Auto scroll
  useEffect(() => {
    if (matchStatus !== 'connected') return;
    const container = chatScrollContainerRef.current;
    if (!container) { scrollToBottom(false); return; }
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 250;
    const lastMsg = messages[messages.length - 1];
    const isMine = Boolean(
      lastMsg &&
      ((currentUidRef.current && lastMsg.senderId === currentUidRef.current) ||
        (currentUser?.username && lastMsg.senderUsername === currentUser.username))
    );
    if (isMine || isNearBottom) scrollToBottom(true);
  }, [messages.length, partnerTyping, matchStatus, scrollToBottom, currentUser?.username]);

  // Auth redirect
  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  // ── Cleanup helper ──────────────────────────────────────────────────────────
  const cleanupSession = useCallback(() => {
    activeMatchIdRef.current = null;
    setMatchId(null);
    setPartner(null);
    setMessages([]);
    setPartnerTyping(false);
    setInputText('');
    setSelectedImageFile(null);
    setImagePreview(null);
    setRemoteStream(null);
    setPartnerMuted(false);
    setPartnerCameraOff(false);
    setWebrtcError(null);
    setIsOfferer(null);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    isCurrentlyTypingRef.current = false;
    // Cleanup WebRTC resources
    if (chatModeRef.current !== 'TEXT') {
      webrtc.cleanup();
    }
  }, [webrtc]);

  // ── Socket Event Listeners ──────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleQueueJoined = () => {
      setConnectionState('SEARCHING');
      setMatchStatus('searching');
      setSearchError(null);
      setReconnecting(false);
    };

    const handleRandomMatchFound = (data: {
      matchId: string;
      roomId: string;
      partner: RandomPartner;
      mode?: ChatMode;
      isOfferer?: boolean;
      reconnected?: boolean;
    }) => {
      console.log('[RANDOM_CHAT] Match found:', data.matchId, 'mode:', data.mode, 'offerer:', data.isOfferer);
      isMatchmakingStartingRef.current = false;
      if (serverlessPollIntervalRef.current) {
        clearInterval(serverlessPollIntervalRef.current);
        serverlessPollIntervalRef.current = null;
      }
      setConnectionState('CONNECTING');
      activeMatchIdRef.current = data.matchId;
      setMatchId(data.matchId);
      setPartner(data.partner);
      setMatchStatus('connected');
      setConnectionState('CONNECTED');
      setReconnecting(false);

      if (!data.reconnected) {
        setMessages([]);
        setRemoteStream(null);
        setPartnerMuted(false);
        setPartnerCameraOff(false);
      }

      // Initialize WebRTC for audio/video modes
      if (data.mode && data.mode !== 'TEXT') {
        const offerer = Boolean(data.isOfferer);
        setIsOfferer(offerer);
        isOffererRef.current = offerer;
        // Small delay to let state settle
        setTimeout(() => {
          webrtc.initSession(offerer);
        }, 300);
      }
    };

    const handleReceiveRandomMessage = (message: RandomMessage) => {
      const currentMid = activeMatchIdRef.current;
      if (!currentMid) return;
      if (message.chatSessionId && message.chatSessionId !== currentMid) {
        console.warn('[RANDOM_CHAT] Dropped message from mismatched session');
        return;
      }

      setMessages((prev) => {
        let nextState: RandomMessage[];
        if (message.clientMessageId) {
          const exists = prev.some((m) => m.clientMessageId === message.clientMessageId);
          if (exists) {
            nextState = prev.map((m) =>
              m.clientMessageId === message.clientMessageId ? { ...message, status: message.status || 'SENT' } : m
            );
          } else if (prev.some((m) => m.id === message.id)) {
            return prev;
          } else {
            nextState = [...prev, { ...message, status: message.status || 'SENT' }];
          }
        } else if (prev.some((m) => m.id === message.id)) {
          return prev;
        } else {
          nextState = [...prev, { ...message, status: message.status || 'SENT' }];
        }
        return nextState.sort((a, b) => {
          const seqA = a.sequenceNumber || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const seqB = b.sequenceNumber || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return seqA - seqB;
        });
      });

      const isFromPartner = message.senderId !== currentUidRef.current;
      if (isFromPartner) {
        if (socket?.connected) {
          socket.emit('ack_random_message_delivered', {
            messageId: message.id,
            clientMessageId: message.clientMessageId,
            chatSessionId: currentMid,
          });
        }
        fetch('/api/chat/messages/ack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: message.id, clientMessageId: message.clientMessageId, chatSessionId: currentMid }),
        }).catch(() => {});
      }
    };

    const handleMessageDelivered = (data: { messageId?: string; clientMessageId?: string; chatSessionId?: string; deliveredAt?: string }) => {
      if (data.chatSessionId && data.chatSessionId !== activeMatchIdRef.current) return;
      setMessages((prev) =>
        prev.map((m) => {
          if ((data.messageId && m.id === data.messageId) || (data.clientMessageId && m.clientMessageId === data.clientMessageId)) {
            return { ...m, status: 'DELIVERED', deliveredAt: data.deliveredAt || new Date().toISOString() };
          }
          return m;
        })
      );
    };

    const handlePartnerTyping = (data: { isTyping: boolean }) => {
      setPartnerTyping(Boolean(data.isTyping));
    };

    const handlePartnerLeft = () => {
      console.log('[RANDOM_CHAT] Partner left');
      cleanupSession();
      setConnectionState('DISCONNECTED');
      setMatchStatus('ended');
    };

    const handleChatEndedConfirm = () => {
      cleanupSession();
      setConnectionState('DISCONNECTED');
      setMatchStatus('ended');
    };

    const handleDisconnect = () => {
      setConnectionState('DISCONNECTED');
      if (activeMatchIdRef.current) setReconnecting(true);
    };

    const handleConnect = () => {
      setReconnecting(false);
      if (activeMatchIdRef.current) setConnectionState('CONNECTED');
      else setConnectionState('IDLE');
    };

    // ── WebRTC signaling passthrough ──
    const handleWebRtcOffer = (data: { matchId: string; sdp: RTCSessionDescriptionInit }) => {
      if (data.matchId !== activeMatchIdRef.current) return;
      webrtc.handleOffer(data.sdp);
    };

    const handleWebRtcAnswer = (data: { matchId: string; sdp: RTCSessionDescriptionInit }) => {
      if (data.matchId !== activeMatchIdRef.current) return;
      webrtc.handleAnswer(data.sdp);
    };

    const handleWebRtcIce = (data: { matchId: string; candidate: RTCIceCandidateInit }) => {
      if (data.matchId !== activeMatchIdRef.current) return;
      webrtc.handleIceCandidate(data.candidate);
    };

    const handlePartnerMediaState = (data: { matchId: string; isMuted: boolean; isCameraOff: boolean }) => {
      if (data.matchId !== activeMatchIdRef.current) return;
      setPartnerMuted(Boolean(data.isMuted));
      setPartnerCameraOff(Boolean(data.isCameraOff));
    };

    socket.on('queue_joined', handleQueueJoined);
    socket.on('random_match_found', handleRandomMatchFound);
    socket.on('receive_random_message', handleReceiveRandomMessage);
    socket.on('random_message_delivered', handleMessageDelivered);
    socket.on('partner_typing_status', handlePartnerTyping);
    socket.on('partner_left', handlePartnerLeft);
    socket.on('chat_ended_confirm', handleChatEndedConfirm);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleConnect);
    socket.on('webrtc:offer', handleWebRtcOffer);
    socket.on('webrtc:answer', handleWebRtcAnswer);
    socket.on('webrtc:ice-candidate', handleWebRtcIce);
    socket.on('partner_media_state', handlePartnerMediaState);

    return () => {
      socket.off('queue_joined', handleQueueJoined);
      socket.off('random_match_found', handleRandomMatchFound);
      socket.off('receive_random_message', handleReceiveRandomMessage);
      socket.off('random_message_delivered', handleMessageDelivered);
      socket.off('partner_typing_status', handlePartnerTyping);
      socket.off('partner_left', handlePartnerLeft);
      socket.off('chat_ended_confirm', handleChatEndedConfirm);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleConnect);
      socket.off('webrtc:offer', handleWebRtcOffer);
      socket.off('webrtc:answer', handleWebRtcAnswer);
      socket.off('webrtc:ice-candidate', handleWebRtcIce);
      socket.off('partner_media_state', handlePartnerMediaState);
    };
  }, [socket, webrtc, cleanupSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (serverlessPollIntervalRef.current) clearInterval(serverlessPollIntervalRef.current);
      if (socket?.connected && !activeMatchIdRef.current) {
        socket.emit('leave_random_queue');
      }
      webrtc.cleanup();
    };
  }, [socket, webrtc]);

  // ── START MATCHMAKING ────────────────────────────────────────────────────────
  const handleStartMatch = useCallback(
    async (skipCurrent = false, mode: ChatMode = chatModeRef.current) => {
      if (isMatchmakingStartingRef.current) return;
      isMatchmakingStartingRef.current = true;

      // VIP gate for audio/video
      if ((mode === 'AUDIO' || mode === 'VIDEO') && !isVIP) {
        setShowVipModal(true);
        isMatchmakingStartingRef.current = false;
        return;
      }

      setConnectionState('SEARCHING');
      setMatchStatus('searching');
      setPartner(null);
      setMessages([]);
      setMatchId(null);
      setSearchError(null);
      setReconnecting(false);
      setRemoteStream(null);
      setWebrtcError(null);
      activeMatchIdRef.current = null;

      if (serverlessPollIntervalRef.current) {
        clearInterval(serverlessPollIntervalRef.current);
        serverlessPollIntervalRef.current = null;
      }

      const preferences = {
        gender: currentUser?.profile?.gender || 'unspecified',
        preferredGender: currentUser?.profile?.preferredGender || 'auto',
        mood: currentUser?.profile?.mood || 'chill',
        language: currentUser?.profile?.language || 'english',
        mode,
      };

      // Socket path
      if (socket?.connected) {
        socket.emit('join_random_queue', preferences);
        isMatchmakingStartingRef.current = false;
        return;
      }

      // HTTP fallback (text only)
      try {
        const effectiveClerkId = currentUidRef.current || currentUser?.clerkUserId || currentUser?.id || '';
        const token = await getToken().catch(() => null);
        const res = await fetch('/api/matchmaking/join', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(effectiveClerkId ? { 'x-clerk-user-id': effectiveClerkId } : {}),
          },
          body: JSON.stringify({ skipCurrentMatch: skipCurrent, ...preferences }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 503 || errData.disabled) {
            setRandomChatDisabled(true);
            setSearchError('Random Chat is currently unavailable. Please try again later.');
            setConnectionState('ERROR');
            setMatchStatus('idle');
            isMatchmakingStartingRef.current = false;
            return;
          }
        } else {
          const data = await res.json();
          if (data.matched && data.chatSessionId) {
            if (serverlessPollIntervalRef.current) {
              clearInterval(serverlessPollIntervalRef.current);
              serverlessPollIntervalRef.current = null;
            }
            activeMatchIdRef.current = data.chatSessionId;
            setMatchId(data.chatSessionId);
            setPartner(data.partner);
            setMatchStatus('connected');
            setConnectionState('CONNECTED');
            setReconnecting(false);
            setMessages([]);
            isMatchmakingStartingRef.current = false;
            return;
          }
        }
      } catch (e) {
        console.warn('API matchmaking join notice:', e);
      } finally {
        isMatchmakingStartingRef.current = false;
      }

      // Status polling fallback
      if (!socket?.connected) {
        serverlessPollIntervalRef.current = setInterval(async () => {
          if (activeMatchIdRef.current) {
            if (serverlessPollIntervalRef.current) {
              clearInterval(serverlessPollIntervalRef.current);
              serverlessPollIntervalRef.current = null;
            }
            return;
          }
          try {
            const effectiveClerkId = currentUidRef.current || currentUser?.clerkUserId || currentUser?.id || '';
            const statusRes = await fetch('/api/matchmaking/status', {
              headers: effectiveClerkId ? { 'x-clerk-user-id': effectiveClerkId } : {},
            });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.matched && statusData.chatSessionId) {
                if (serverlessPollIntervalRef.current) {
                  clearInterval(serverlessPollIntervalRef.current);
                  serverlessPollIntervalRef.current = null;
                }
                activeMatchIdRef.current = statusData.chatSessionId;
                setMatchId(statusData.chatSessionId);
                setPartner(statusData.partner);
                setMatchStatus('connected');
                setConnectionState('CONNECTED');
                setReconnecting(false);
                setMessages([]);
              }
            }
          } catch (e) {}
        }, 1200);
      }
    },
    [socket, currentUser, getToken, isVIP]
  );

  // ── Check availability & auto-start ─────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    if (currentUser?.id && !autoStartExecutedRef.current) {
      autoStartExecutedRef.current = true;
      fetch('/api/settings/random-chat')
        .then((res) => res.json())
        .then((data) => {
          if (!isMounted) return;
          setCheckingAvailability(false);
          if (data?.enabled === false) {
            setRandomChatDisabled(true);
            setSearchError('Random Chat is currently unavailable. Please try again later.');
            setConnectionState('ERROR');
            setMatchStatus('idle');
          } else {
            setRandomChatDisabled(false);
            // Show mode selection first
            setMatchStatus('mode_select');
          }
        })
        .catch(() => {
          if (isMounted) {
            setCheckingAvailability(false);
            setMatchStatus('mode_select');
          }
        });
    }
    return () => { isMounted = false; };
  }, [currentUser?.id]);

  // ── Mode selected ────────────────────────────────────────────────────────────
  const handleModeSelect = useCallback((mode: ChatMode) => {
    setChatMode(mode);
    chatModeRef.current = mode;
    handleStartMatch(false, mode);
  }, [handleStartMatch]);

  // ── CANCEL SEARCH ────────────────────────────────────────────────────────────
  const handleCancelSearch = async () => {
    isMatchmakingStartingRef.current = false;
    activeMatchIdRef.current = null;
    setConnectionState('IDLE');
    setMatchStatus('mode_select');
    if (serverlessPollIntervalRef.current) {
      clearInterval(serverlessPollIntervalRef.current);
      serverlessPollIntervalRef.current = null;
    }
    if (socket?.connected) socket.emit('leave_random_queue');
    const effectiveClerkId = currentUidRef.current || currentUser?.clerkUserId || currentUser?.id || '';
    const token = await getToken().catch(() => null);
    fetch('/api/matchmaking/cancel', {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(effectiveClerkId ? { 'x-clerk-user-id': effectiveClerkId } : {}),
      },
    }).catch(() => {});
  };

  // ── NEXT PARTNER ─────────────────────────────────────────────────────────────
  const handleNextPartner = async () => {
    if (isSkippingRef.current) return;
    isSkippingRef.current = true;
    setTimeout(() => { isSkippingRef.current = false; }, 400);

    const oldMid = activeMatchIdRef.current || matchId;
    cleanupSession();
    setConnectionState('DISCONNECTING');

    if (serverlessPollIntervalRef.current) {
      clearInterval(serverlessPollIntervalRef.current);
      serverlessPollIntervalRef.current = null;
    }

    if (oldMid) {
      const effectiveClerkId = currentUidRef.current || currentUser?.clerkUserId || currentUser?.id || '';
      const token = await getToken().catch(() => null);
      fetch(`/api/chat/${oldMid}/next`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(effectiveClerkId ? { 'x-clerk-user-id': effectiveClerkId } : {}),
        },
      }).catch(() => {});
    }

    setConnectionState('SEARCHING');
    setMatchStatus('searching');

    if (socket?.connected) {
      socket.emit('next_partner', {
        gender: currentUser?.profile?.gender || 'unspecified',
        preferredGender: currentUser?.profile?.preferredGender || 'auto',
        mode: chatModeRef.current,
      });
    } else {
      handleStartMatch(true, chatModeRef.current);
    }
  };

  // ── END CHAT ─────────────────────────────────────────────────────────────────
  const handleEndChat = async () => {
    setShowOptionsMenu(false);
    const oldMid = activeMatchIdRef.current || matchId;
    cleanupSession();
    setConnectionState('DISCONNECTING');

    if (serverlessPollIntervalRef.current) {
      clearInterval(serverlessPollIntervalRef.current);
      serverlessPollIntervalRef.current = null;
    }

    if (socket?.connected) socket.emit('end_random_chat');
    if (oldMid) {
      const effectiveClerkId = currentUidRef.current || currentUser?.clerkUserId || currentUser?.id || '';
      const token = await getToken().catch(() => null);
      fetch(`/api/chat/${oldMid}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(effectiveClerkId ? { 'x-clerk-user-id': effectiveClerkId } : {}),
        },
      }).catch(() => {});
    }
    setConnectionState('DISCONNECTED');
    setMatchStatus('ended');
  };

  // ── SEND MESSAGE ──────────────────────────────────────────────────────────────
  const handleSendMessage = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) { e.preventDefault(); if ('stopPropagation' in e) e.stopPropagation(); }
    if ((!inputText.trim() && !selectedImageFile) || matchStatus !== 'connected' || sendingMsg) return;
    const activeMid = activeMatchIdRef.current || matchId;
    if (!activeMid) return;

    const now = Date.now();
    if (now - lastMessageSentTimeRef.current < 250) return;
    lastMessageSentTimeRef.current = now;

    const textToSend = inputText.trim();
    if (textToSend.length > 2000) {
      alert('Message exceeds the maximum limit of 2,000 characters.');
      return;
    }

    const senderUid = currentUser?.id || currentUidRef.current || 'me';
    const senderDisplayName = currentUser?.displayName || currentUser?.fullName || 'Stranger';
    const imageToSend = selectedImageFile;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const tempMessage: RandomMessage = {
      id: tempId,
      clientMessageId: tempId,
      senderId: senderUid,
      senderUsername: senderDisplayName,
      content: textToSend,
      imageUrl: imagePreview || null,
      createdAt: new Date().toISOString(),
      status: 'SENDING',
    };

    setMessages((prev) => [...prev, tempMessage]);
    setInputText('');
    setSelectedImageFile(null);
    setImagePreview(null);
    setSendingMsg(true);

    // 15-second watchdog
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          (m.id === tempId || m.clientMessageId === tempId) && m.status === 'SENDING'
            ? { ...m, status: 'FAILED' as const }
            : m
        )
      );
    }, 15000);

    if (isCurrentlyTypingRef.current) {
      isCurrentlyTypingRef.current = false;
      if (socket?.connected) socket.emit('random_typing_status', { isTyping: false });
    }

    try {
      if (imageToSend) {
        const token = await getToken().catch(() => null);
        const effectiveClerkId = currentUidRef.current || currentUser?.clerkUserId || currentUser?.id || '';
        const uploadRes = await fetch('/api/chat/upload-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(effectiveClerkId ? { 'x-clerk-user-id': effectiveClerkId } : {}),
          },
          body: JSON.stringify({ matchId: activeMid, content: textToSend, imageData: imageToSend, clientMessageId: tempId }),
        });

        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) {
          if (uploadRes.status === 403 || uploadData.isVipRequired) setShowVipModal(true);
          throw new Error(uploadData.error || 'Failed to upload photo.');
        }

        if (socket?.connected) {
          socket.emit('send_random_message', {
            chatSessionId: activeMid,
            content: textToSend,
            imageUrl: uploadData.imageUrl || null,
            clientMessageId: tempId,
          }, (res: any) => {
            setMessages((prev) => prev.map((m) =>
              m.clientMessageId === tempId || m.id === tempId
                ? { ...m, id: res?.message?.id || tempId, status: res?.success ? 'SENT' as const : 'FAILED' as const }
                : m
            ));
          });
        }
      } else {
        if (socket?.connected) {
          socket.emit('send_random_message', {
            chatSessionId: activeMid,
            content: textToSend,
            clientMessageId: tempId,
          }, (res: any) => {
            if (res?.success) {
              setMessages((prev) => prev.map((m) =>
                m.clientMessageId === tempId || m.id === tempId
                  ? { ...m, id: res.message?.id || tempId, sequenceNumber: res.message?.sequenceNumber || Date.now(), status: 'SENT' as const }
                  : m
              ));
            } else {
              setMessages((prev) => prev.map((m) =>
                m.clientMessageId === tempId || m.id === tempId ? { ...m, status: 'FAILED' as const } : m
              ));
            }
          });
        } else {
          // HTTP fallback
          const token = await getToken().catch(() => null);
          const effectiveClerkId = currentUidRef.current || currentUser?.clerkUserId || currentUser?.id || '';
          const postRes = await fetch('/api/chat/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(effectiveClerkId ? { 'x-clerk-user-id': effectiveClerkId } : {}),
            },
            body: JSON.stringify({ chatSessionId: activeMid, content: textToSend, clientMessageId: tempId }),
          });
          if (postRes.ok) {
            const postData = await postRes.json().catch(() => ({}));
            setMessages((prev) => prev.map((m) =>
              m.id === tempId || m.clientMessageId === tempId
                ? { ...m, id: postData.message?.id || tempId, sequenceNumber: postData.message?.sequenceNumber || Date.now(), status: 'SENT' as const }
                : m
            ));
          } else {
            setMessages((prev) => prev.map((m) =>
              m.id === tempId || m.clientMessageId === tempId ? { ...m, status: 'FAILED' as const } : m
            ));
          }
        }
      }
    } catch (err: any) {
      console.warn('Send message notice:', err?.message || err);
      setMessages((prev) => prev.map((m) =>
        m.id === tempId || m.clientMessageId === tempId ? { ...m, status: 'FAILED' as const } : m
      ));
    } finally {
      setSendingMsg(false);
    }
  };

  // ── RETRY ────────────────────────────────────────────────────────────────────
  const handleRetryMessage = useCallback(async (failedMsg: RandomMessage) => {
    const activeMid = activeMatchIdRef.current || matchId;
    if (!activeMid || matchStatus !== 'connected') return;

    const retryKey = failedMsg.clientMessageId || failedMsg.id;
    setMessages((prev) => prev.map((m) =>
      m.id === failedMsg.id || m.clientMessageId === retryKey ? { ...m, status: 'SENDING' as const } : m
    ));

    setTimeout(() => {
      setMessages((prev) => prev.map((m) =>
        (m.id === retryKey || m.clientMessageId === retryKey) && m.status === 'SENDING'
          ? { ...m, status: 'FAILED' as const } : m
      ));
    }, 15000);

    try {
      if (socket?.connected) {
        socket.emit('send_random_message', {
          chatSessionId: activeMid,
          content: failedMsg.content,
          imageUrl: failedMsg.imageUrl,
          clientMessageId: retryKey,
        }, (res: any) => {
          setMessages((prev) => prev.map((m) =>
            m.id === failedMsg.id || m.clientMessageId === retryKey
              ? { ...m, id: res?.message?.id || failedMsg.id, status: res?.success ? 'SENT' as const : 'FAILED' as const }
              : m
          ));
        });
      }
    } catch (err) {
      setMessages((prev) => prev.map((m) =>
        m.id === failedMsg.id || m.clientMessageId === retryKey ? { ...m, status: 'FAILED' as const } : m
      ));
    }
  }, [socket, matchId, matchStatus]);

  // ── TYPING ───────────────────────────────────────────────────────────────────
  const handleTyping = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (!socket?.connected || !activeMatchIdRef.current) return;
    if (!isCurrentlyTypingRef.current) {
      isCurrentlyTypingRef.current = true;
      socket.emit('random_typing_status', { isTyping: true });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isCurrentlyTypingRef.current) {
        isCurrentlyTypingRef.current = false;
        socket.emit('random_typing_status', { isTyping: false });
      }
    }, 2000);
  }, [socket]);

  // ── IMAGE SELECTION ───────────────────────────────────────────────────────────
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Image too large. Maximum size is 5MB.');
      return;
    }
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      alert('Only JPG, PNG, WEBP, and GIF images are allowed.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setSelectedImageFile(result);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── REPORT ────────────────────────────────────────────────────────────────────
  const handleReportPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partner || !reportReason.trim() || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      const token = await getToken().catch(() => null);
      const effectiveClerkId = currentUidRef.current || currentUser?.clerkUserId || currentUser?.id || '';
      const activeMid = activeMatchIdRef.current || matchId;
      await fetch('/api/chat/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(effectiveClerkId ? { 'x-clerk-user-id': effectiveClerkId } : {}),
        },
        body: JSON.stringify({
          reportedUserId: partner.id,
          chatSessionId: activeMid,
          reason: reportReason.trim(),
        }),
      });
      setReportSuccess(true);
      setTimeout(() => {
        setShowReportModal(false);
        setReportReason('');
        setReportSuccess(false);
        handleNextPartner();
      }, 1500);
    } catch (err) {
      console.warn('Report error:', err);
    } finally {
      setReportSubmitting(false);
    }
  };

  // ── BLOCK ─────────────────────────────────────────────────────────────────────
  const handleBlockPartner = async () => {
    if (!partner) return;
    setShowOptionsMenu(false);
    try {
      const token = await getToken().catch(() => null);
      const effectiveClerkId = currentUidRef.current || currentUser?.clerkUserId || currentUser?.id || '';
      await fetch('/api/chat/block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(effectiveClerkId ? { 'x-clerk-user-id': effectiveClerkId } : {}),
        },
        body: JSON.stringify({ blockedUserId: partner.id }),
      });
    } catch (err) {}
    await handleNextPartner();
  };

  // ─── Derived UI ───────────────────────────────────────────────────────────────
  const modeLabel = chatMode === 'VIDEO' ? 'Video Chat' : chatMode === 'AUDIO' ? 'Voice Chat' : 'Text Chat';
  const modeIcon = chatMode === 'VIDEO' ? <Video className="w-3.5 h-3.5" /> : chatMode === 'AUDIO' ? <Mic className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />;
  const modeColor = chatMode === 'VIDEO' ? 'text-rose-400' : chatMode === 'AUDIO' ? 'text-blue-400' : 'text-pink-400';

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading || checkingAvailability) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
            <p className="text-slate-400 text-sm">Loading...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="flex-1 flex flex-col min-h-0" style={containerStyle}>

        {/* ── MODE SELECTION ───────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {matchStatus === 'mode_select' && (
            <motion.div
              key="mode_select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              {randomChatDisabled || searchError ? (
                <div className="flex-1 flex items-center justify-center p-6">
                  <div className="text-center space-y-3 max-w-sm">
                    <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
                    <p className="text-white font-bold">Random Chat Unavailable</p>
                    <p className="text-slate-400 text-sm">{searchError || 'Please try again later.'}</p>
                  </div>
                </div>
              ) : (
                <ModeLanding onSelect={handleModeSelect} isVIP={isVIP} />
              )}
            </motion.div>
          )}

          {/* ── SEARCHING ──────────────────────────────────────────────────── */}
          {matchStatus === 'searching' && (
            <motion.div
              key="searching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center p-6 gap-6"
            >
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-pink-600 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-pink-500/30">
                  <Heart className="w-10 h-10 text-white fill-white animate-pulse" />
                </div>
                <div className="absolute -inset-3 rounded-full border-2 border-pink-500/30 animate-ping" />
                <div className="absolute -inset-6 rounded-full border border-pink-500/10 animate-ping [animation-delay:0.4s]" />
              </div>

              <div className="text-center space-y-2">
                <div className={`flex items-center gap-1.5 text-xs font-bold justify-center ${modeColor}`}>
                  {modeIcon} {modeLabel}
                </div>
                <h2 className="text-white font-black text-xl">Finding someone...</h2>
                <p className="text-slate-400 text-sm">Looking for a compatible stranger</p>
              </div>

              <button
                onClick={handleCancelSearch}
                className="px-6 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </motion.div>
          )}

          {/* ── CONNECTED ──────────────────────────────────────────────────── */}
          {matchStatus === 'connected' && partner && (
            <motion.div
              key="connected"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Avatar */}
                  <button
                    onClick={() => setShowProfileSheet(true)}
                    className="relative shrink-0 cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-lg overflow-hidden">
                      {partner.avatarType === 'IMAGE' && partner.avatarUrl ? (
                        <img src={partner.avatarUrl} alt="Partner" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl">{partner.avatarEmoji || '😊'}</span>
                      )}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-950" />
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-white font-bold text-sm truncate max-w-[120px]">
                        {partner.displayName || partner.fullName || 'Stranger'}
                      </span>
                      {partner.isVIP && <Crown className="w-3 h-3 text-yellow-400 shrink-0" />}
                      {partner.countryFlag && <span className="text-xs">{partner.countryFlag}</span>}
                    </div>
                    <div className={`flex items-center gap-1 text-[10px] ${modeColor}`}>
                      {modeIcon} <span>{modeLabel}</span>
                      {reconnecting && <span className="text-yellow-400">(reconnecting...)</span>}
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* WebRTC controls for audio/video */}
                  {chatMode !== 'TEXT' && (
                    <>
                      <button
                        onClick={webrtc.toggleMute}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${webrtc.isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
                        title={webrtc.isMuted ? 'Unmute' : 'Mute'}
                      >
                        {webrtc.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>
                      {chatMode === 'VIDEO' && (
                        <button
                          onClick={webrtc.toggleCamera}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${webrtc.isCameraOff ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
                          title={webrtc.isCameraOff ? 'Turn on camera' : 'Turn off camera'}
                        >
                          {webrtc.isCameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                        </button>
                      )}
                    </>
                  )}

                  {/* Options menu */}
                  <button
                    onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-400 transition-colors relative cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                    {showOptionsMenu && (
                      <div className="absolute top-10 right-0 z-30 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-1 w-44 text-left">
                        <button
                          onClick={() => { setShowOptionsMenu(false); setShowReportModal(true); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          <Flag className="w-3.5 h-3.5 text-yellow-400" /> Report
                        </button>
                        <button
                          onClick={handleBlockPartner}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-rose-400 hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" /> Block & Skip
                        </button>
                        <div className="h-px bg-slate-800 my-1" />
                        <button
                          onClick={handleEndChat}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-slate-400 hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> End Chat
                        </button>
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Main content area */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

                {/* Video/Audio area (only for non-text modes) */}
                {chatMode !== 'TEXT' && (
                  <div className="shrink-0 p-3 pb-0">
                    {webrtcError ? (
                      <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                        <div>
                          <p className="text-red-300 text-xs font-bold">{webrtcError}</p>
                          <p className="text-slate-400 text-[10px] mt-1">You can still use text chat below.</p>
                        </div>
                      </div>
                    ) : (
                      <VideoArea
                        localStream={webrtc.localStream}
                        remoteStream={remoteStream}
                        partner={partner}
                        webrtcState={webrtc.connectionState}
                        isMuted={webrtc.isMuted}
                        isCameraOff={webrtc.isCameraOff}
                        partnerMuted={partnerMuted}
                        partnerCameraOff={partnerCameraOff}
                        mode={chatMode}
                      />
                    )}
                  </div>
                )}

                {/* Text chat area */}
                <div
                  ref={chatScrollContainerRef}
                  className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 overscroll-contain min-h-0 select-text"
                >
                  {/* Connected info banner */}
                  <div className="text-center my-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-slate-400 max-w-full truncate">
                      <ShieldCheck className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                      <span className="truncate">
                        Connected with {partner?.displayName || partner?.fullName || 'Stranger'} • Be polite & respectful
                      </span>
                    </span>
                  </div>

                  {messages.length === 0 && chatMode === 'TEXT' && (
                    <div className="text-center py-8 text-slate-500 text-xs space-y-1 select-none">
                      <p className="font-bold text-slate-400">You are connected!</p>
                      <p>Say hello to start the conversation 👋</p>
                    </div>
                  )}

                  {messages.map((msg, index) => {
                    const isMine =
                      Boolean(currentUidRef.current && msg.senderId === currentUidRef.current) ||
                      Boolean(currentUser?.username && msg.senderUsername === currentUser.username);
                    return (
                      <RandomChatMessageItem
                        key={msg.id || msg.clientMessageId || index}
                        msg={msg}
                        isMine={isMine}
                        onImageClick={handleImageClick}
                        onRetry={handleRetryMessage}
                      />
                    );
                  })}

                  {partnerTyping && (
                    <div className="flex items-center space-x-2 text-xs text-slate-400 italic shrink-0 select-none">
                      <div className="px-3 py-2 rounded-2xl bg-slate-900 border border-slate-800 flex items-center space-x-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-bounce [animation-delay:0.4s]" />
                      </div>
                      <span className="text-[10px] truncate">Partner is typing...</span>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input + Action bar */}
              <div className="shrink-0 border-t border-slate-800/60 bg-slate-950/80 backdrop-blur-sm p-3 space-y-2">
                {/* Image preview */}
                {imagePreview && (
                  <div className="flex items-center gap-2 px-1">
                    <div className="relative">
                      <img src={imagePreview} alt="Preview" className="h-14 w-14 rounded-xl object-cover border border-slate-700" />
                      <button
                        onClick={() => { setSelectedImageFile(null); setImagePreview(null); }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Message input row */}
                <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                    ref={fileInputRef}
                    onChange={handleImageSelect}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-400 shrink-0 transition-colors cursor-pointer"
                    title={isVIP ? 'Attach image (VIP)' : 'VIP only'}
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    value={inputText}
                    onChange={handleTyping}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Type a message..."
                    className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/30 transition-all"
                    maxLength={2000}
                    autoComplete="off"
                    spellCheck
                  />

                  <button
                    type="submit"
                    disabled={(!inputText.trim() && !selectedImageFile) || sendingMsg}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white shrink-0 disabled:opacity-40 transition-all cursor-pointer"
                  >
                    {sendingMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>

                {/* Next / Leave buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleNextPartner}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-gradient-to-r from-pink-600/20 to-purple-600/20 border border-pink-500/30 hover:from-pink-600/30 hover:to-purple-600/30 text-pink-300 text-xs font-bold transition-all cursor-pointer"
                  >
                    <FastForward className="w-3.5 h-3.5" />
                    Next
                  </button>
                  <button
                    onClick={handleEndChat}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white/5 border border-slate-800 hover:bg-white/10 text-slate-400 text-xs font-bold transition-all cursor-pointer"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                    Leave
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── ENDED / DISCONNECTED ─────────────────────────────────────── */}
          {(matchStatus === 'ended' || matchStatus === 'idle') && (
            <motion.div
              key="ended"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center p-6 gap-6"
            >
              <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                <Heart className="w-10 h-10 text-slate-600" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-white font-black text-xl">
                  {matchStatus === 'ended' ? 'Chat Ended' : 'Ready to Chat?'}
                </h2>
                <p className="text-slate-400 text-sm">
                  {matchStatus === 'ended' ? 'Your partner left. Start a new chat?' : 'Find a random stranger to talk to.'}
                </p>
              </div>
              <button
                onClick={() => setMatchStatus('mode_select')}
                className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-black text-sm shadow-lg shadow-pink-500/20 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Start New Chat
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── REPORT MODAL ──────────────────────────────────────────────────── */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowReportModal(false)}>
          <div
            ref={reportModalRef}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-slate-950 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-black text-base">Report User</h3>
              <button onClick={() => setShowReportModal(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {reportSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-500/20 text-emerald-300 text-xs font-bold text-center">
                Report submitted. Finding you a new partner...
              </div>
            ) : (
              <form onSubmit={handleReportPartner} className="space-y-3">
                <textarea
                  rows={3}
                  required
                  placeholder="Describe the issue (e.g. harassment, inappropriate content)..."
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full p-3 rounded-2xl bg-black/60 border border-slate-800 text-xs text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
                <div className="flex items-center space-x-2">
                  <button
                    type="submit"
                    disabled={reportSubmitting || !reportReason.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {reportSubmitting ? 'Submitting...' : 'Submit Report & Skip'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── LIGHTBOX ─────────────────────────────────────────────────────── */}
      {selectedFullImage && (
        <div
          onClick={() => setSelectedFullImage(null)}
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <img
            src={selectedFullImage}
            alt="Full size attachment"
            className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}

      {/* ── VIP MODAL ────────────────────────────────────────────────────── */}
      <SelfHostedVipModal
        isOpen={showVipModal}
        onClose={() => {
          setShowVipModal(false);
          if (matchStatus === 'searching') {
            setMatchStatus('mode_select');
            setConnectionState('IDLE');
          }
        }}
        reason="photo"
        onSuccess={() => {
          refreshUser();
          setShowVipModal(false);
        }}
      />

      {/* ── PROFILE SHEET ────────────────────────────────────────────────── */}
      {showProfileSheet && partner && (
        <ProfilePreviewSheet
          isOpen={showProfileSheet}
          onClose={() => setShowProfileSheet(false)}
          partner={partner}
        />
      )}
    </AppShell>
  );
}

