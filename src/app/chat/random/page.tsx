'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import AppShell from '@/components/AppShell';
import nextDynamic from 'next/dynamic';
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
  ensureMatchmakingUid,
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

const ProfilePreviewSheet = nextDynamic(() => import('@/components/chat/ProfilePreviewSheet'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface RandomPartner {
  id: string;
  username?: string;
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
  const { user, loading, refreshUser } = useAuth();
  const { socket, isConnected: socketConnected } = useSocket();

  // Effective authenticated user
  const currentUser = user;

  // ── Core state ──
  const [matchStatus, setMatchStatus] = useState<'idle' | 'searching' | 'connected' | 'ended'>('idle');
  const [partner, setPartner] = useState<RandomPartner | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RandomMessage[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [randomChatDisabled, setRandomChatDisabled] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(true);

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
  const lastMessageSentTimeRef = useRef<number>(0);
  const queueListenerRef = useRef<(() => void) | null>(null);
  const matchListenerRef = useRef<(() => void) | null>(null);
  const messagesListenerRef = useRef<(() => void) | null>(null);
  const matchingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chatSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isScanningRef = useRef(false);
  const isSkippingRef = useRef(false);
  const currentUidRef = useRef<string | null>(null);
  const activeMatchIdRef = useRef<string | null>(null);

  const isVIP =
    currentUser?.membershipTier === 'VIP' ||
    (currentUser?.subscription?.isActive === true && currentUser?.subscription?.plan === 'VIP');

  // Sync current user ID into ref
  useEffect(() => {
    currentUidRef.current = currentUser?.id || null;
  }, [currentUser?.id]);

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

  // ─── Cleanup helpers ──────────────────────────────────────────────────────
  const stopAllTimers = () => {
    if (matchingIntervalRef.current) {
      clearInterval(matchingIntervalRef.current);
      matchingIntervalRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (chatSyncIntervalRef.current) {
      clearInterval(chatSyncIntervalRef.current);
      chatSyncIntervalRef.current = null;
    }
  };

  const stopAllListeners = () => {
    queueListenerRef.current?.();
    queueListenerRef.current = null;
    matchListenerRef.current?.();
    matchListenerRef.current = null;
    messagesListenerRef.current?.();
    messagesListenerRef.current = null;
  };

  // ─── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopAllTimers();
      stopAllListeners();
      if (currentUidRef.current) {
        leaveQueue(currentUidRef.current).catch(() => {});
      }
    };
  }, []);

  // ─── Build partner object ─────────────────────────────────────────────────
  function buildPartner(matchDoc: MatchDoc, myUid: string): RandomPartner {
    const isUser1 = matchDoc.user1Uid === myUid || (matchDoc as any).user1ClerkId === myUid;
    return {
      id: isUser1 ? matchDoc.user2Uid : matchDoc.user1Uid,
      username: isUser1 ? (matchDoc.user2DisplayName || 'Stranger') : (matchDoc.user1DisplayName || 'Stranger'),
      displayName: isUser1 ? matchDoc.user2DisplayName : matchDoc.user1DisplayName,
      fullName: isUser1 ? matchDoc.user2DisplayName : matchDoc.user1DisplayName,
      avatarUrl: isUser1 ? matchDoc.user2AvatarUrl : matchDoc.user1AvatarUrl,
      avatarEmoji: isUser1 ? matchDoc.user2AvatarEmoji : matchDoc.user1AvatarEmoji,
      gender: isUser1 ? matchDoc.user2Gender : matchDoc.user1Gender,
      isVIP: isUser1 ? matchDoc.user2IsVIP : matchDoc.user1IsVIP,
    };
  }

  // ─── Active Chat Realtime Synchronizer ────────────────────────────────────
  const syncActiveChat = useCallback(async (mid: string) => {
    if (!mid || activeMatchIdRef.current !== mid) return;

    try {
      const res = await fetch(`/api/chat/messages?chatSessionId=${encodeURIComponent(mid)}`);

      // If session ended, deleted, or unauthorized
      if (!res.ok || res.status === 404) {
        const data = await res.json().catch(() => ({}));
        if (data.sessionStatus === 'ENDED' || res.status === 404) {
          stopAllTimers();
          stopAllListeners();
          activeMatchIdRef.current = null;
          setMatchStatus('ended');
          return;
        }
      }

      const data = await res.json();
      if (data.sessionStatus === 'ENDED') {
        stopAllTimers();
        stopAllListeners();
        activeMatchIdRef.current = null;
        setMatchStatus('ended');
        return;
      }

      if (data.partner && !partner) {
        setPartner({
          id: data.partner.id,
          displayName: data.partner.displayName || 'Stranger',
          fullName: data.partner.displayName || 'Stranger',
          avatarUrl: data.partner.avatarUrl || null,
          avatarEmoji: data.partner.avatarEmoji || '😊',
          gender: data.partner.gender || 'unspecified',
          isVIP: Boolean(data.partner.isVIP),
        });
      }

      if (Array.isArray(data.messages)) {
        setMessages((prev) => {
          // Keep locally in-flight SENDING messages that haven't been confirmed yet
          const pendingSending = prev.filter(
            (local) =>
              local.status === 'SENDING' &&
              !data.messages.some(
                (srv: any) =>
                  (srv.clientMessageId && srv.clientMessageId === local.clientMessageId) ||
                  srv.id === local.id
              )
          );

          // Map server authoritative messages
          const serverMapped: RandomMessage[] = data.messages.map((m: any) => ({
            id: m.id,
            clientMessageId: m.clientMessageId || null,
            senderId: m.senderId,
            senderUsername: m.senderUsername || 'Stranger',
            content: m.content || '',
            imageUrl: m.imageUrl || null,
            createdAt: m.createdAt,
            status: 'SENT' as const,
          }));

          // Merge server messages + pending in-flight messages
          const combined = [...serverMapped, ...pendingSending];
          combined.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );

          // Deduplicate by message signature to prevent re-render thrashing
          const prevSig = prev.map((m) => `${m.id}:${m.status}`).join(',');
          const nextSig = combined.map((m) => `${m.id}:${m.status}`).join(',');
          if (prevSig === nextSig) return prev;

          return combined;
        });
      }
    } catch (err) {
      console.warn('[CHAT] Active chat sync notice:', err);
    }
  }, [partner]);

  // ─── Attach active match ──────────────────────────────────────────────────
  const attachActiveMatch = useCallback((mid: string, partnerData?: any) => {
    if (activeMatchIdRef.current === mid) return;
    activeMatchIdRef.current = mid;
    setMatchId(mid);
    if (partnerData) {
      setPartner(partnerData);
    }
    setMatchStatus('connected');

    stopAllTimers();
    if (queueListenerRef.current) {
      queueListenerRef.current();
      queueListenerRef.current = null;
    }

    const myUid = currentUser?.id || '';

    // 1. High-frequency, server-authoritative message & match sync (every 650ms)
    syncActiveChat(mid);
    chatSyncIntervalRef.current = setInterval(() => {
      syncActiveChat(mid);
    }, 650);

    // 2. Firestore match status fallback (if active)
    try {
      matchListenerRef.current?.();
      matchListenerRef.current = listenToMatch(mid, (matchDoc: MatchDoc) => {
        if (matchDoc.status === 'ended') {
          stopAllTimers();
          stopAllListeners();
          activeMatchIdRef.current = null;
          setMatchStatus('ended');
          return;
        }
        if (!partnerData && myUid) {
          setPartner(buildPartner(matchDoc, myUid));
        }
        setMatchStatus('connected');
      });
    } catch (e) {}

    // 3. Firestore messages push listener fallback (if active)
    try {
      messagesListenerRef.current?.();
      messagesListenerRef.current = listenToMessages(
        mid,
        (firestoreMsgs: FirestoreMessage[]) => {
          if (!firestoreMsgs || firestoreMsgs.length === 0) return;
          setMessages((prev) => {
            const pendingSending = prev.filter(
              (local) =>
                local.status === 'SENDING' &&
                !firestoreMsgs.some(
                  (fm) => fm.id === local.id || (local.clientMessageId && local.clientMessageId === fm.id)
                )
            );
            const mapped: RandomMessage[] = firestoreMsgs.map((m) => ({
              id: m.id,
              senderId: m.senderUid,
              senderUsername: m.senderUsername || 'Stranger',
              content: m.content,
              imageUrl: m.imageUrl,
              createdAt: resolveTimestamp(m.createdAt),
              status: 'SENT' as const,
            }));
            const merged = [...mapped, ...pendingSending];
            merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            return merged;
          });
          setReconnecting(false);
        },
        () => setReconnecting(true)
      );
    } catch (e) {}
  }, [currentUser?.id, syncActiveChat]);

  // ─── START MATCHMAKING (Server-Controlled) ─────────────────────────────────
  const handleStartMatch = useCallback(
    async (skipCurrent = false, excludePartnerId?: string | null) => {
      setMatchStatus('searching');
      setPartner(null);
      setMessages([]);
      setMatchId(null);
      setSearchError(null);
      setReconnecting(false);
      activeMatchIdRef.current = null;

      stopAllTimers();
      stopAllListeners();

      try {
        const currentUserId = currentUser?.id;
        if (!currentUserId) return;

        // Call server-controlled matchmaking API
        const res = await fetch('/api/matchmaking/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skipCurrentMatch: skipCurrent,
            excludePartnerId: excludePartnerId || null,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 503 || errData.disabled) {
            setRandomChatDisabled(true);
            setSearchError('Random Chat is currently unavailable. Please try again later.');
            setMatchStatus('idle');
            return;
          }
          throw new Error(errData.error || 'Failed to join matchmaking.');
        }

        const data = await res.json();

        // Case 1: Immediately matched by server
        if (data.matched && data.chatSessionId) {
          attachActiveMatch(data.chatSessionId, data.partner);
          return;
        }

        // Case 2: In waiting queue -> dual push & polling
        const sessionStartedAt = Date.now();

        // 1. Push: Listen to own queue doc in Firestore for instant notification
        queueListenerRef.current = listenToMyQueueEntry(currentUserId, sessionStartedAt, async (mid) => {
          if (activeMatchIdRef.current) return;
          try {
            const statusRes = await fetch('/api/matchmaking/status');
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.matched && statusData.chatSessionId) {
                attachActiveMatch(statusData.chatSessionId, statusData.partner);
              }
            }
          } catch (e) {
            console.warn('Push match status error:', e);
          }
        });

        // 2. Infallible Polling: Poll /api/matchmaking/status every 1200ms
        matchingIntervalRef.current = setInterval(async () => {
          if (activeMatchIdRef.current) {
            if (matchingIntervalRef.current) clearInterval(matchingIntervalRef.current);
            return;
          }

          try {
            const statusRes = await fetch('/api/matchmaking/status');
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.matched && statusData.chatSessionId) {
                if (matchingIntervalRef.current) clearInterval(matchingIntervalRef.current);
                attachActiveMatch(statusData.chatSessionId, statusData.partner);
              }
            }
          } catch (e) {
            console.warn('Status poll error:', e);
          }
        }, 1200);
      } catch (err: any) {
        console.error('Matchmaking error:', err);
        setSearchError(err?.message || 'Could not connect to matchmaking queue.');
        setMatchStatus('idle');
      }
    },
    [currentUser?.id, attachActiveMatch]
  );

  // ─── Check availability & auto-start on mount when user is ready ──────────
  useEffect(() => {
    let isMounted = true;
    if (currentUser?.id) {
      fetch('/api/settings/random-chat')
        .then((res) => res.json())
        .then((data) => {
          if (!isMounted) return;
          setCheckingAvailability(false);
          if (data && data.enabled === false) {
            setRandomChatDisabled(true);
            setSearchError('Random Chat is currently unavailable. Please try again later.');
            setMatchStatus('idle');
          } else {
            setRandomChatDisabled(false);
            const hasSeenIntro = (currentUser as any)?.profile?.randomChatIntroSeen;
            if (!hasSeenIntro) {
              setShowIntroModal(true);
            } else {
              handleStartMatch();
            }
          }
        })
        .catch(() => {
          if (isMounted) {
            setCheckingAvailability(false);
            handleStartMatch();
          }
        });
    }
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // ─── CANCEL SEARCH (Server-Side + Race-Safe) ───────────────────────────────
  const handleCancelSearch = async () => {
    stopAllTimers();
    stopAllListeners();
    activeMatchIdRef.current = null;
    setMatchStatus('idle');

    try {
      const res = await fetch('/api/matchmaking/cancel', { method: 'POST' });
      const data = await res.json();
      if (data.matched && data.chatSessionId) {
        // Match won the race condition right before cancellation
        const statusRes = await fetch('/api/matchmaking/status');
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.matched && statusData.chatSessionId) {
            attachActiveMatch(statusData.chatSessionId, statusData.partner);
          }
        }
      }
    } catch (e) {
      console.warn('Cancel error:', e);
    }
  };

  // ─── NEXT PARTNER ─────────────────────────────────────────────────────────
  const handleNextPartner = async () => {
    if (isSkippingRef.current) return;
    isSkippingRef.current = true;
    setTimeout(() => {
      isSkippingRef.current = false;
    }, 800);

    const currentMid = activeMatchIdRef.current || matchId;
    const currentPartnerId = partner?.id;

    stopAllTimers();
    stopAllListeners();
    activeMatchIdRef.current = null;
    setPartner(null);
    setMessages([]);

    if (currentMid) {
      fetch(`/api/chat/${currentMid}/next`, { method: 'POST' }).catch(() => {});
    }

    handleStartMatch(true, currentPartnerId);
  };

  const handleEndChat = async () => {
    setShowOptionsMenu(false);
    const currentMid = activeMatchIdRef.current || matchId;

    stopAllTimers();
    stopAllListeners();
    activeMatchIdRef.current = null;

    if (currentMid) {
      fetch(`/api/chat/${currentMid}/end`, { method: 'POST' }).catch(() => {});
    }

    setMatchStatus('ended');
  };

  // ─── SEND MESSAGE ─────────────────────────────────────────────────────────
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !selectedImageFile) || matchStatus !== 'connected' || sendingMsg) return;
    const activeMid = activeMatchIdRef.current || matchId;
    if (!activeMid) return;

    // Rate-limiting: prevent spam flooding (max 1 message per 400ms)
    const now = Date.now();
    if (now - lastMessageSentTimeRef.current < 400) {
      return;
    }
    lastMessageSentTimeRef.current = now;

    // Length limit: 2,000 characters
    const textToSend = inputText.trim();
    if (textToSend.length > 2000) {
      alert('Message exceeds the maximum limit of 2,000 characters.');
      return;
    }

    const senderUid = currentUser?.id || 'me';
    const senderDisplayName = currentUser?.displayName || currentUser?.fullName || 'Stranger';
    const imageToSend = selectedImageFile;

    const tempId = `temp_${Date.now()}`;
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

    if (socket && socketConnected) socket.emit('random_typing_status', { isTyping: false });
    isCurrentlyTypingRef.current = false;

    try {
      if (imageToSend) {
        const effectiveClerkId = currentUser?.clerkUserId || currentUser?.id || '';
        const uploadRes = await fetch('/api/chat/upload-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(effectiveClerkId ? { 'x-clerk-user-id': effectiveClerkId } : {}),
          },
          body: JSON.stringify({
            matchId: activeMid,
            content: textToSend,
            imageData: imageToSend,
          }),
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          if (uploadRes.status === 403 || uploadData.isVipRequired) {
            setShowVipModal(true);
            throw new Error(uploadData.error || 'Photo sharing is a VIP feature. Upgrade to VIP to send photos in random chats.');
          }
          throw new Error(uploadData.error || 'Failed to upload photo.');
        }

        // Update optimistic image message to confirmed
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  id: uploadData.messageId || tempId,
                  imageUrl: uploadData.imageUrl || m.imageUrl,
                  status: 'SENT' as const,
                }
              : m
          )
        );
        syncActiveChat(activeMid);
      } else {
        // Send message via backend API with IDOR and participant verification
        const effectiveClerkId = currentUser?.clerkUserId || currentUser?.id || '';
        const msgRes = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(effectiveClerkId ? { 'x-clerk-user-id': effectiveClerkId } : {}),
          },
          body: JSON.stringify({
            chatSessionId: activeMid,
            content: textToSend,
            clientMessageId: tempId,
          }),
        });

        if (msgRes.ok) {
          const msgData = await msgRes.json();
          const serverMsg = msgData.message;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    id: serverMsg?.id || tempId,
                    createdAt: serverMsg?.createdAt || m.createdAt,
                    status: 'SENT' as const,
                  }
                : m
            )
          );
          syncActiveChat(activeMid);
        } else {
          // Fallback direct send
          try {
            await sendFirestoreMessage(
              activeMid,
              senderUid,
              senderDisplayName,
              textToSend,
              null
            );
            setMessages((prev) =>
              prev.map((m) => (m.id === tempId ? { ...m, status: 'SENT' as const } : m))
            );
          } catch (e) {
            throw new Error('Failed to deliver message');
          }
        }
      }
    } catch (err: any) {
      console.error('Send message error:', err);
      alert(err?.message || 'Failed to send message.');
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

    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const fileName = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!validImageTypes.includes(file.type.toLowerCase()) || !hasValidExt) {
      alert('Only image files (JPG, JPEG, PNG, WEBP, GIF) are allowed. PDFs, documents, archives, and scripts are strictly rejected.');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size exceeds 5MB limit.');
      e.target.value = '';
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

            {randomChatDisabled ? (
              <div className="w-full space-y-3">
                <div className="p-4 rounded-3xl bg-rose-500/10 border border-rose-500/30 text-center space-y-1.5">
                  <div className="text-sm font-black text-rose-300 uppercase tracking-wider flex items-center justify-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span>Random Chat Unavailable</span>
                  </div>
                  <p className="text-xs text-rose-200/90 font-medium">
                    Random Chat is currently unavailable. Please try again later.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setCheckingAvailability(true);
                    try {
                      const res = await fetch('/api/settings/random-chat');
                      const data = await res.json();
                      if (data.enabled) {
                        setRandomChatDisabled(false);
                        setSearchError(null);
                        handleStartMatch();
                      } else {
                        setRandomChatDisabled(true);
                        setSearchError('Random Chat is currently unavailable. Please try again later.');
                      }
                    } catch (e) {}
                    setCheckingAvailability(false);
                  }}
                  disabled={checkingAvailability}
                  className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-wider border border-white/10 transition-all cursor-pointer disabled:opacity-50"
                >
                  {checkingAvailability ? 'Checking Availability...' : 'Check Availability Again'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleStartMatch()}
                className="w-full py-4 rounded-3xl bg-gradient-to-r from-pink-600 via-rose-500 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-black text-sm uppercase tracking-wider shadow-2xl shadow-pink-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <Sparkles className="w-5 h-5" />
                <span>START RANDOM CHAT</span>
              </button>
            )}

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
                    {partner?.avatarEmoji || (partner?.displayName ? partner.displayName.substring(0, 2).toUpperCase() : '👤')}
                  </div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0d0119]" />
                </div>

                <div onClick={() => setShowProfileSheet(true)} className="cursor-pointer">
                  <div className="flex items-center space-x-1.5">
                    <h3 className="text-sm font-black text-white truncate max-w-[140px] sm:max-w-[200px]">
                      {partner?.displayName || partner?.fullName || 'Stranger'}
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
                        onClick={handleEndChat}
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
                  <span>Connected with {partner?.displayName || partner?.fullName || 'Stranger'} • Be polite &amp; respectful</span>
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
                  msg.senderId === currentUser?.id ||
                  msg.senderUsername === currentUser?.username;

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
              {!isVIP ? (
                <button
                  type="button"
                  onClick={() => setShowVipModal(true)}
                  className="px-2.5 py-1.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 flex items-center gap-1 transition-all cursor-pointer shrink-0 shadow-sm"
                  title="Photo sharing is a VIP feature. Upgrade to VIP to send photos in random chats."
                >
                  <span className="text-sm leading-none">📷</span>
                  <span className="text-xs leading-none">🔒</span>
                  <span className="hidden sm:inline font-extrabold uppercase text-[10px] tracking-wider text-yellow-400">VIP Only</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleImageAttachmentClick}
                  className="p-2.5 rounded-2xl bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 hover:text-white border border-pink-500/30 transition-all cursor-pointer shrink-0"
                  title="Send photo"
                >
                  <span className="text-base leading-none">📷</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
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
              <AlertCircle className="w-8 h-8 text-pink-400" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-white">Connection Ended</h3>
              <p className="text-sm font-bold text-pink-400">
                Your stranger has disconnected.
              </p>
              <p className="text-xs text-slate-400">
                Your ephemeral chat has ended. Click below to start a new random conversation.
              </p>
            </div>

            <button
              onClick={() => handleStartMatch()}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-pink-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              <FastForward className="w-4 h-4" />
              <span>Find Someone New</span>
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
        reason="photo"
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
