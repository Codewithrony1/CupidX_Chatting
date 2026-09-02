'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import AppShell from '@/components/AppShell';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
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
  Radio,
  Eye,
} from 'lucide-react';
import SelfHostedVipModal from '@/components/payment/SelfHostedVipModal';

// Firestore matchmaking
import {
  ensureFirebaseAuth,
  joinQueue,
  heartbeatQueue,
  leaveQueue,
  findAndMatch,
  listenToMyQueueEntry,
  listenToMatch,
  listenToMessages,
  sendFirestoreMessage,
  cleanupSession,
  resolveTimestamp,
  type MatchDoc,
  type FirestoreMessage,
} from '@/lib/firestoreMatchmaking';

const ProfilePreviewSheet = dynamic(() => import('@/components/chat/ProfilePreviewSheet'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface RandomPartner {
  id: string;
  username: string;
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
}

interface RandomMessage {
  id: string;
  clientMessageId?: string | null;
  senderId: string;
  senderUsername: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
  status?: 'SENDING' | 'SENT' | 'FAILED';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KnotChatRandomPage() {
  const router = useRouter();
  const { user, firebaseUser, loading, refreshUser } = useAuth();
  const { socket, isConnected: socketConnected } = useSocket();

  // ── Core state ──
  const [matchStatus, setMatchStatus] = useState<'idle' | 'searching' | 'connected' | 'ended'>('idle');
  const [partner, setPartner] = useState<RandomPartner | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RandomMessage[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ── Input & messaging ──
  const [inputText, setInputText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);

  // ── Intro modal ──
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(true);

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
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCurrentlyTypingRef = useRef(false);

  // Matchmaking control refs
  const queueListenerRef = useRef<(() => void) | null>(null);
  const matchListenerRef = useRef<(() => void) | null>(null);
  const messagesListenerRef = useRef<(() => void) | null>(null);
  const matchingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const matchStatusRef = useRef(matchStatus);
  const currentUidRef = useRef<string | null>(null);
  const activeMatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    matchStatusRef.current = matchStatus;
  }, [matchStatus]);

  const isVIP =
    user?.membershipTier === 'VIP' ||
    (user?.subscription?.isActive === true && user?.subscription?.plan === 'VIP');

  // ─── Auto scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partnerTyping, matchStatus]);

  // ─── Auth redirect guard ───────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // ─── Socket typing indicator ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handlePartnerTyping = (data: { isTyping: boolean }) => setPartnerTyping(data.isTyping);
    socket.on('partner_typing_status', handlePartnerTyping);
    return () => {
      socket.off('partner_typing_status', handlePartnerTyping);
    };
  }, [socket]);

  // ─── Cleanup helper ───────────────────────────────────────────────────────
  const cleanupAllListeners = useCallback(() => {
    queueListenerRef.current?.();
    matchListenerRef.current?.();
    messagesListenerRef.current?.();
    if (matchingIntervalRef.current) clearInterval(matchingIntervalRef.current);
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
  }, []);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupAllListeners();
      if (currentUidRef.current) {
        leaveQueue(currentUidRef.current).catch(() => {});
      }
    };
  }, [cleanupAllListeners]);

  // ─── Build partner object ─────────────────────────────────────────────────
  function buildPartner(matchDoc: MatchDoc, myUid: string): RandomPartner {
    const isUser1 = matchDoc.user1Uid === myUid;
    return {
      id: isUser1 ? matchDoc.user2Uid : matchDoc.user1Uid,
      username: isUser1 ? matchDoc.user2Username : matchDoc.user1Username,
      fullName: isUser1 ? matchDoc.user2DisplayName : matchDoc.user1DisplayName,
      displayName: isUser1 ? matchDoc.user2DisplayName : matchDoc.user1DisplayName,
      avatarUrl: isUser1 ? matchDoc.user2AvatarUrl : matchDoc.user1AvatarUrl,
      avatarEmoji: isUser1 ? matchDoc.user2AvatarEmoji : matchDoc.user1AvatarEmoji,
      gender: isUser1 ? matchDoc.user2Gender : matchDoc.user1Gender,
      isVIP: isUser1 ? matchDoc.user2IsVIP : matchDoc.user1IsVIP,
    };
  }

  // ─── Attach active match ──────────────────────────────────────────────────
  const attachActiveMatch = useCallback((mid: string, myUid: string) => {
    activeMatchIdRef.current = mid;
    setMatchId(mid);

    // Stop searching intervals immediately
    if (matchingIntervalRef.current) clearInterval(matchingIntervalRef.current);
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

    // 1. Listen to match status & partner details
    matchListenerRef.current?.();
    matchListenerRef.current = listenToMatch(mid, (matchDoc: MatchDoc) => {
      if (matchDoc.status === 'ended') {
        setMatchStatus('ended');
        activeMatchIdRef.current = null;
        return;
      }
      setPartner(buildPartner(matchDoc, myUid));
      setMatchStatus('connected');
    });

    // 2. Listen to real-time messages
    messagesListenerRef.current?.();
    messagesListenerRef.current = listenToMessages(
      mid,
      (firestoreMsgs: FirestoreMessage[]) => {
        const mapped: RandomMessage[] = firestoreMsgs.map((m) => ({
          id: m.id,
          senderId: m.senderUid,
          senderUsername: m.senderUsername,
          content: m.content,
          imageUrl: m.imageUrl,
          createdAt: resolveTimestamp(m.createdAt),
          status: 'SENT' as const,
        }));
        setMessages(mapped);
        setReconnecting(false);
      },
      () => setReconnecting(true)
    );
  }, []);

  // ─── START MATCHMAKING ────────────────────────────────────────────────────
  const handleStartMatch = useCallback(async () => {
    if (!user) return;

    setMatchStatus('searching');
    setPartner(null);
    setMessages([]);
    setMatchId(null);
    setSearchError(null);
    setReconnecting(false);
    activeMatchIdRef.current = null;

    cleanupAllListeners();

    try {
      const fbUid = (await ensureFirebaseAuth()) || user.firebaseUid || user.id;
      currentUidRef.current = fbUid;

      const prefs = {
        firebaseUid: fbUid,
        userId: user.id,
        username: user.username,
        displayName: user.displayName || user.fullName || user.username,
        avatarUrl: user.profile?.avatarUrl || '',
        avatarEmoji: user.profile?.avatarEmoji || '😊',
        gender: user.profile?.gender || 'unspecified',
        genderPref: user.profile?.preferredGender || 'auto',
        mood: user.profile?.mood || '',
        isVIP,
      };

      // 1. Join queue with current session timestamp
      const sessionStartedAt = await joinQueue(prefs);

      // 2. Heartbeat every 4 seconds to maintain active online presence
      heartbeatIntervalRef.current = setInterval(() => {
        if (matchStatusRef.current === 'searching') {
          heartbeatQueue(fbUid);
        }
      }, 4000);

      // 3. Listen to own queue doc for incoming matches
      queueListenerRef.current = listenToMyQueueEntry(fbUid, sessionStartedAt, (mid) => {
        if (activeMatchIdRef.current) return; // Already matched
        attachActiveMatch(mid, fbUid);
      });

      // 4. Attempt immediate scan
      const immediateMatchId = await findAndMatch(prefs);
      if (immediateMatchId) {
        attachActiveMatch(immediateMatchId, fbUid);
        return;
      }

      // 5. Continuous match scanner every 2s while searching
      matchingIntervalRef.current = setInterval(async () => {
        if (matchStatusRef.current !== 'searching' || activeMatchIdRef.current) {
          if (matchingIntervalRef.current) clearInterval(matchingIntervalRef.current);
          return;
        }
        try {
          const mid = await findAndMatch(prefs);
          if (mid) {
            attachActiveMatch(mid, fbUid);
          }
        } catch (e) {
          console.warn('Match scan error:', e);
        }
      }, 2000);
    } catch (err: any) {
      console.error('Matchmaking error:', err);
      setSearchError(err?.message || 'Could not connect to matchmaking queue.');
    }
  }, [user, isVIP, cleanupAllListeners, attachActiveMatch]);

  // ─── Auto-start on mount when user is ready ───────────────────────────────
  useEffect(() => {
    if (user?.id) {
      const hasSeenIntro = (user as any)?.profile?.randomChatIntroSeen;
      if (!hasSeenIntro) {
        setShowIntroModal(true);
      } else {
        handleStartMatch();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ─── CANCEL SEARCH ────────────────────────────────────────────────────────
  const handleCancelSearch = async () => {
    cleanupAllListeners();
    activeMatchIdRef.current = null;

    if (currentUidRef.current) {
      await leaveQueue(currentUidRef.current).catch(() => {});
    }
    if (socket && socketConnected) socket.emit('leave_random_queue');
    setMatchStatus('idle');
  };

  // ─── NEXT PARTNER ─────────────────────────────────────────────────────────
  const handleNextPartner = async () => {
    const fbUid = currentUidRef.current;
    const currentMid = activeMatchIdRef.current || matchId;

    cleanupAllListeners();
    activeMatchIdRef.current = null;

    if (fbUid && currentMid) {
      await cleanupSession(fbUid, currentMid).catch(() => {});
    } else if (fbUid) {
      await leaveQueue(fbUid).catch(() => {});
    }

    if (socket && socketConnected) socket.emit('next_partner');

    handleStartMatch();
  };

  // ─── SEND MESSAGE ─────────────────────────────────────────────────────────
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !selectedImageFile) || matchStatus !== 'connected' || sendingMsg) return;
    const activeMid = activeMatchIdRef.current || matchId;
    if (!activeMid) return;

    const senderUid = currentUidRef.current || user?.firebaseUid || user?.id || 'me';
    const textToSend = inputText.trim();
    const imageToSend = selectedImageFile;

    const tempId = `temp_${Date.now()}`;
    const tempMessage: RandomMessage = {
      id: tempId,
      clientMessageId: tempId,
      senderId: senderUid,
      senderUsername: user?.username || 'me',
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

    if (socket && socketConnected) socket.emit('random_typing_status', { isTyping: false });
    isCurrentlyTypingRef.current = false;

    try {
      await sendFirestoreMessage(
        activeMid,
        senderUid,
        user?.username || 'user',
        textToSend,
        imageToSend
      );
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } catch (err) {
      console.error('Send message error:', err);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'FAILED' as const } : m))
      );
    } finally {
      setSendingMsg(false);
    }
  };

  // ─── TYPING INDICATOR ─────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (socket && socketConnected && matchStatus === 'connected') {
      if (!isCurrentlyTypingRef.current) {
        isCurrentlyTypingRef.current = true;
        socket.emit('random_typing_status', { isTyping: true });
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isCurrentlyTypingRef.current = false;
        socket.emit('random_typing_status', { isTyping: false });
      }, 1800);
    }
  };

  // ─── IMAGE ATTACHMENT ─────────────────────────────────────────────────────
  const handleImageAttachmentClick = () => {
    if (!isVIP) {
      setShowVipModal(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size exceeds 5MB limit.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setSelectedImageFile(result);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  // ─── INTRO MODAL ──────────────────────────────────────────────────────────
  const handleDismissIntro = async () => {
    setShowIntroModal(false);
    if (dontShowAgain) {
      fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ randomChatIntroSeen: true }),
      }).catch(() => {});
    }
    handleStartMatch();
  };

  // ─── REPORT & BLOCK ───────────────────────────────────────────────────────
  const handleReportPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partner || !reportReason.trim()) return;
    setReportSubmitting(true);
    try {
      const res = await fetch('/api/chat/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportedUserId: partner.id,
          reason: reportReason,
          chatSessionId: activeMatchIdRef.current || matchId,
        }),
      });
      if (res.ok) {
        setReportSuccess(true);
        setTimeout(() => {
          setShowReportModal(false);
          setReportSuccess(false);
          setReportReason('');
          handleNextPartner();
        }, 1500);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleBlockPartner = async () => {
    if (!partner) return;
    try {
      await fetch('/api/chat/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedUserId: partner.id }),
      });
      setShowOptionsMenu(false);
      handleNextPartner();
    } catch (e) {
      console.error(e);
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <AppShell showNav={matchStatus === 'idle'}>
      <div className="flex-1 flex flex-col h-[100dvh] max-h-[100dvh] bg-[#07000e] text-white overflow-hidden relative font-sans">
        {/* ================================================================= */}
        {/* 1. IDLE / START SCREEN                                            */}
        {/* ================================================================= */}
        {matchStatus === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8 max-w-md mx-auto">
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-pink-600 via-purple-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-pink-500/30 animate-pulse">
                <Heart className="w-12 h-12 text-white fill-white" />
              </div>
              <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-[#07000e] flex items-center justify-center text-[10px] font-bold">
                ●
              </span>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white">Live Random Chat</h2>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Connect instantly with verified people. Real-time, anonymous, safe.
              </p>
            </div>

            {searchError && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                {searchError}
              </div>
            )}

            <button
              onClick={handleStartMatch}
              className="w-full py-4 rounded-3xl bg-gradient-to-r from-pink-600 via-rose-500 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-black text-sm uppercase tracking-wider shadow-2xl shadow-pink-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-5 h-5" />
              <span>START RANDOM CHAT</span>
            </button>

            <div className="flex items-center space-x-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-pink-400" />
                <span>100% Authenticated</span>
              </span>
              <span className="flex items-center gap-1">
                <Crown className="w-4 h-4 text-yellow-400 fill-current" />
                <span>VIP Priority</span>
              </span>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 2. SEARCHING                                                       */}
        {/* ================================================================= */}
        {matchStatus === 'searching' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8 max-w-md mx-auto">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-pink-500/20 animate-ping" />
              <div className="absolute inset-3 rounded-full bg-purple-600/30 animate-pulse" />
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-pink-600 to-purple-600 flex items-center justify-center shadow-2xl shadow-pink-500/40 relative z-10">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-white">Finding someone...</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Scanning for another person to chat with. Connecting you in real time as soon as someone joins...
              </p>
            </div>

            {searchError && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                {searchError}
              </div>
            )}

            <button
              onClick={handleCancelSearch}
              className="px-6 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-bold transition-all cursor-pointer"
            >
              Cancel Search
            </button>
          </div>
        )}

        {/* ================================================================= */}
        {/* 3. CONNECTED — CHAT                                               */}
        {/* ================================================================= */}
        {matchStatus === 'connected' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* HEADER */}
            <header className="px-4 py-3 bg-[#0d0119]/95 backdrop-blur-xl border-b border-pink-500/20 flex items-center justify-between z-30 shrink-0 shadow-md">
              <div className="flex items-center space-x-3">
                <div onClick={() => setShowProfileSheet(true)} className="relative cursor-pointer">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-600 to-purple-600 flex items-center justify-center text-white font-black text-sm border-2 border-pink-400/50 shadow-md">
                    {partner?.avatarEmoji || (partner?.username ? partner.username.substring(0, 2).toUpperCase() : '👤')}
                  </div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0d0119]" />
                </div>

                <div onClick={() => setShowProfileSheet(true)} className="cursor-pointer">
                  <div className="flex items-center space-x-1.5">
                    <h3 className="text-sm font-black text-white truncate max-w-[140px] sm:max-w-[200px]">
                      @{partner?.username || 'stranger'}
                    </h3>
                    {partner?.isVIP && (
                      <Crown className="w-3.5 h-3.5 text-yellow-400 fill-current shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center space-x-1.5 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-emerald-400 font-bold">
                      {partnerTyping ? 'typing...' : 'Connected'}
                    </span>
                    {reconnecting && (
                      <span className="text-amber-400 font-bold">(reconnecting...)</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Header actions */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleNextPartner}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-black shadow-md shadow-pink-500/20 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                >
                  <span>NEXT</span>
                  <FastForward className="w-3.5 h-3.5" />
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {showOptionsMenu && (
                    <div className="absolute right-0 mt-2 w-44 rounded-2xl bg-[#140024] border border-pink-500/30 shadow-2xl p-1.5 z-50 space-y-1 text-xs font-bold">
                      <button
                        onClick={() => {
                          setShowOptionsMenu(false);
                          setShowReportModal(true);
                        }}
                        className="w-full px-3 py-2 rounded-xl text-left text-slate-300 hover:text-white hover:bg-white/5 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Flag className="w-3.5 h-3.5 text-amber-400" />
                        <span>Report Partner</span>
                      </button>
                      <button
                        onClick={handleBlockPartner}
                        className="w-full px-3 py-2 rounded-xl text-left text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5 text-rose-400" />
                        <span>Block &amp; Skip</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowOptionsMenu(false);
                          setMatchStatus('ended');
                        }}
                        className="w-full px-3 py-2 rounded-xl text-left text-slate-400 hover:text-white hover:bg-white/5 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>End Chat</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* MESSAGES */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="text-center my-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-pink-400" />
                  <span>Connected with @{partner?.username} • Be polite &amp; respectful</span>
                </span>
              </div>

              {messages.length === 0 && (
                <div className="text-center py-12 text-slate-500 text-xs space-y-1">
                  <p className="font-bold text-slate-400">You are connected!</p>
                  <p>Say hello to start the conversation 👋</p>
                </div>
              )}

              {messages.map((msg, index) => {
                const isMine =
                  msg.senderId === currentUidRef.current ||
                  msg.senderId === firebaseUser?.uid ||
                  msg.senderUsername === user?.username;

                return (
                  <motion.div
                    key={msg.id || index}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[80%] sm:max-w-[65%] rounded-3xl p-3.5 shadow-lg relative break-words ${
                        isMine
                          ? 'bg-gradient-to-br from-pink-600 via-rose-500 to-purple-600 text-white rounded-tr-sm shadow-pink-500/10'
                          : 'bg-slate-900/90 border border-slate-800 text-slate-100 rounded-tl-sm'
                      }`}
                    >
                      {msg.imageUrl && (
                        <div
                          onClick={() => setSelectedFullImage(msg.imageUrl!)}
                          className="mb-2 rounded-2xl overflow-hidden cursor-pointer group bg-black/40 border border-white/10 relative"
                        >
                          <img
                            src={msg.imageUrl}
                            alt="Chat Attachment"
                            className="max-h-60 w-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Eye className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      )}

                      {msg.content && <p className="text-xs leading-relaxed">{msg.content}</p>}

                      <div className="flex items-center justify-end space-x-1 mt-1 text-[9px] opacity-70">
                        <span>
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {isMine &&
                          (msg.status === 'FAILED' ? (
                            <span className="text-rose-300">!</span>
                          ) : (
                            <CheckCheck className="w-3 h-3 text-white" />
                          ))}
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {partnerTyping && (
                <div className="flex items-center space-x-2 text-xs text-slate-400 italic">
                  <div className="px-3 py-2 rounded-2xl bg-slate-900 border border-slate-800 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-bounce [animation-delay:0.4s]" />
                  </div>
                  <span className="text-[10px]">Partner is typing...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* IMAGE PREVIEW */}
            {imagePreview && (
              <div className="p-3 bg-[#10001f] border-t border-pink-500/20 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-12 h-12 rounded-xl object-cover border border-white/20"
                  />
                  <span className="text-xs font-bold text-pink-300">Ready to send photo</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setImagePreview(null);
                    setSelectedImageFile(null);
                  }}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* COMPOSER */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-[#0d0119]/95 backdrop-blur-xl border-t border-pink-500/20 flex items-center space-x-2 z-30 shrink-0"
            >
              <button
                type="button"
                onClick={handleImageAttachmentClick}
                className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-pink-300 hover:text-white border border-white/10 transition-all cursor-pointer shrink-0"
                title={isVIP ? 'Send photo' : 'Upgrade to VIP for photo sharing'}
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              <input
                type="text"
                placeholder="Type a message..."
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) handleSendMessage();
                }}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />

              <button
                type="submit"
                disabled={sendingMsg || (!inputText.trim() && !selectedImageFile)}
                className="p-2.5 rounded-2xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white shadow-md shadow-pink-500/30 transition-all active:scale-95 disabled:opacity-40 cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* ================================================================= */}
        {/* 4. ENDED                                                          */}
        {/* ================================================================= */}
        {matchStatus === 'ended' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-white">Connection Ended</h3>
              <p className="text-xs text-slate-400">
                {partner
                  ? `@${partner.username} has left the chat.`
                  : 'Your chat partner has disconnected or skipped.'}
              </p>
            </div>

            <button
              onClick={handleStartMatch}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-pink-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              <FastForward className="w-4 h-4" />
              <span>FIND NEXT PERSON ⏭</span>
            </button>
          </div>
        )}
      </div>

      {/* INTRO MODAL */}
      {showIntroModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-3xl bg-[#120021] border border-pink-500/30 p-6 space-y-5 shadow-2xl"
          >
            <div className="w-12 h-12 rounded-2xl bg-pink-500/20 border border-pink-500/30 text-pink-300 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-white">How CupidX Chat Works</h3>
              <p className="text-xs text-slate-400">Quick safety tips before starting your anonymous random chat:</p>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300 bg-black/40 p-4 rounded-2xl border border-white/5">
              <div className="flex items-start space-x-2">
                <span>🔒</span>
                <span>Your private details are never shared with your partner.</span>
              </div>
              <div className="flex items-start space-x-2">
                <span>⏭</span>
                <span>Click <strong>NEXT</strong> anytime to instantly disconnect and find someone new.</span>
              </div>
              <div className="flex items-start space-x-2">
                <span>🚩</span>
                <span>Report or block inappropriate behavior directly from the chat menu.</span>
              </div>
            </div>

            <label className="flex items-center space-x-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="rounded border-slate-700 text-pink-600 focus:ring-pink-500"
              />
              <span>Don&apos;t show this tutorial again</span>
            </label>

            <button
              type="button"
              onClick={handleDismissIntro}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-pink-500/20 cursor-pointer"
            >
              Continue &amp; Start Chat
            </button>
          </motion.div>
        </div>
      )}

      {/* REPORT MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#120021] border border-rose-500/30 p-6 space-y-4 shadow-2xl">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <Flag className="w-4 h-4 text-rose-400" />
              <span>Report @{partner?.username}</span>
            </h4>

            {reportSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-500/20 text-emerald-300 text-xs font-bold text-center">
                Report submitted. Finding you a new partner...
              </div>
            ) : (
              <form onSubmit={handleReportPartner} className="space-y-3">
                <textarea
                  rows={3}
                  required
                  placeholder="Describe the reason (e.g. harassment, inappropriate content)..."
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

      {/* LIGHTBOX */}
      {selectedFullImage && (
        <div
          onClick={() => setSelectedFullImage(null)}
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <img
            src={selectedFullImage}
            alt="Attachment"
            className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}

      {/* VIP MODAL */}
      <SelfHostedVipModal
        isOpen={showVipModal}
        onClose={() => setShowVipModal(false)}
        onSuccess={() => {
          refreshUser();
          setShowVipModal(false);
        }}
      />

      {/* PROFILE SHEET */}
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
