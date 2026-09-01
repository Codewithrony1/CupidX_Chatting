'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import AppShell from '@/components/AppShell';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  Send,
  Image as ImageIcon,
  Paperclip,
  CheckCheck,
  Flag,
  Crown,
  FastForward,
  X,
  Sparkles,
  Lock,
  Ban,
  ArrowLeft,
  MoreVertical,
  Loader2,
  AlertCircle,
  RefreshCw,
  Check,
  ShieldCheck,
  User,
  Radio,
  Eye,
} from 'lucide-react';
import SelfHostedVipModal from '@/components/payment/SelfHostedVipModal';

const ProfilePreviewSheet = dynamic(() => import('@/components/chat/ProfilePreviewSheet'), { ssr: false });

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

export default function KnotChatRandomPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { socket, isConnected: socketConnected } = useSocket();

  // Matchmaking State: "idle" | "searching" | "connected" | "ended"
  const [matchStatus, setMatchStatus] = useState<'idle' | 'searching' | 'connected' | 'ended'>('idle');
  const [partner, setPartner] = useState<RandomPartner | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RandomMessage[]>([]);
  const [reconnecting, setReconnecting] = useState(false);

  // Input & Messaging states
  const [inputText, setInputText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);

  // "Don't show again" Tutorial Modal
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(true);

  // VIP Image Attachment States
  const [showVipModal, setShowVipModal] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Options & Safety Modals
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCurrentlyTypingRef = useRef(false);
  const lastMessageTimestampRef = useRef<string | null>(null);

  const isVIP = user?.membershipTier === 'VIP' || (user?.subscription?.isActive === true && user?.subscription?.plan === 'VIP');

  // Auto-scroll helper
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, partnerTyping, matchStatus]);

  // Track latest message timestamp for recovery
  useEffect(() => {
    if (messages.length > 0) {
      lastMessageTimestampRef.current = messages[messages.length - 1].createdAt;
    }
  }, [messages]);

  // Check whether to show Intro Modal or start immediately
  useEffect(() => {
    if (user) {
      const hasSeenIntro = (user as any)?.profile?.randomChatIntroSeen;
      if (!hasSeenIntro) {
        setShowIntroModal(true);
      } else {
        handleStartMatch();
      }
    }
  }, [user]);

  // Persistent Queue Status Polling during searching state
  useEffect(() => {
    if (matchStatus !== 'searching') return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/matchmaking/status');
        if (res.ok) {
          const data = await res.json();
          if (data.matched && data.chatSessionId) {
            setMatchStatus('connected');
            setPartner(data.partner);
            setChatSessionId(data.chatSessionId);
            setMessages([]);
            clearInterval(pollInterval);
          }
        }
      } catch (e) {
        console.error('Matchmaking poll error:', e);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [matchStatus]);

  // Realtime Active Chat Sync
  useEffect(() => {
    if (matchStatus !== 'connected' || !chatSessionId) return;

    const chatSyncInterval = setInterval(async () => {
      try {
        const sinceParam = lastMessageTimestampRef.current ? `&since=${encodeURIComponent(lastMessageTimestampRef.current)}` : '';
        const res = await fetch(`/api/chat/messages?chatSessionId=${encodeURIComponent(chatSessionId)}${sinceParam}`);

        if (res.ok) {
          const data = await res.json();

          if (data.sessionStatus === 'ENDED') {
            setMatchStatus('ended');
            return;
          }

          if (data.messages && data.messages.length > 0) {
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id || m.clientMessageId));
              const newMsgs = data.messages.filter((m: any) => !existingIds.has(m.id) && !existingIds.has(m.clientMessageId));
              if (newMsgs.length === 0) return prev;

              const updated = prev.map((m) => {
                const match = data.messages.find((serverMsg: any) => serverMsg.clientMessageId && serverMsg.clientMessageId === m.clientMessageId);
                return match ? { ...match, status: 'SENT' as const } : m;
              });

              return [...updated, ...newMsgs.map((m: any) => ({ ...m, status: 'SENT' as const }))];
            });
          }

          if (data.partner) {
            setPartner(data.partner);
          }
          setReconnecting(false);
        } else if (res.status === 404) {
          setMatchStatus('ended');
        }
      } catch (e) {
        setReconnecting(true);
      }
    }, 1500);

    return () => clearInterval(chatSyncInterval);
  }, [matchStatus, chatSessionId]);

  // Socket Realtime Event Listeners
  useEffect(() => {
    if (!socket) return;

    const handleMatchFound = (data: { roomId: string; partner: RandomPartner }) => {
      setMatchStatus('connected');
      setPartner(data.partner);
      setMessages([]);
    };

    const handleReceiveMessage = (msg: RandomMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id || (m.clientMessageId && m.clientMessageId === msg.clientMessageId))) {
          return prev.map((m) => (m.clientMessageId && m.clientMessageId === msg.clientMessageId ? { ...msg, status: 'SENT' } : m));
        }
        return [...prev, { ...msg, status: 'SENT' }];
      });
    };

    const handlePartnerTyping = (data: { isTyping: boolean }) => {
      setPartnerTyping(data.isTyping);
    };

    const handlePartnerLeft = () => {
      setMatchStatus('ended');
    };

    socket.on('random_match_found', handleMatchFound);
    socket.on('receive_random_message', handleReceiveMessage);
    socket.on('partner_typing_status', handlePartnerTyping);
    socket.on('partner_left', handlePartnerLeft);

    return () => {
      socket.off('random_match_found', handleMatchFound);
      socket.off('receive_random_message', handleReceiveMessage);
      socket.off('partner_typing_status', handlePartnerTyping);
      socket.off('partner_left', handlePartnerLeft);
    };
  }, [socket]);

  // START MATCHMAKING
  const handleStartMatch = async () => {
    setMatchStatus('searching');
    setPartner(null);
    setMessages([]);
    setChatSessionId(null);

    // 1. Socket join queue
    if (socket && socketConnected) {
      socket.emit('join_random_queue', {
        gender: user?.profile?.gender,
        preferredGender: user?.profile?.preferredGender,
        mood: user?.profile?.mood,
      });
    }

    // 2. HTTP Join Queue Fallback
    try {
      const res = await fetch('/api/matchmaking/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredGender: user?.profile?.preferredGender || 'auto',
          mood: user?.profile?.mood,
          tags: user?.profile?.personalityPreferences ? user.profile.personalityPreferences.split(',') : [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.matched && data.chatSessionId) {
          setMatchStatus('connected');
          setPartner(data.partner);
          setChatSessionId(data.chatSessionId);
        }
      }
    } catch (e) {
      console.error('Matchmaking join error:', e);
    }
  };

  // NEXT PARTNER (Instant 1-Click skip & auto-reconnect)
  const handleNextPartner = async () => {
    // 1. Inform socket
    if (socket && socketConnected) {
      socket.emit('next_partner');
    }

    // 2. End current HTTP session if active
    if (chatSessionId) {
      fetch(`/api/chat/${chatSessionId}/next`, { method: 'POST' }).catch(() => {});
    }

    // 3. Immediately transition to searching next user
    handleStartMatch();
  };

  // CANCEL SEARCHING
  const handleCancelSearch = async () => {
    if (socket && socketConnected) {
      socket.emit('leave_random_queue');
    }
    fetch('/api/matchmaking/cancel', { method: 'POST' }).catch(() => {});
    setMatchStatus('idle');
  };

  // SEND MESSAGE
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !selectedImageFile) || matchStatus !== 'connected' || sendingMsg) return;

    const clientMsgId = `cmsg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const textToSend = inputText.trim();
    const imageToSend = selectedImageFile;

    // Optimistic message bubble
    const tempMessage: RandomMessage = {
      id: clientMsgId,
      clientMessageId: clientMsgId,
      senderId: user?.id || 'me',
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

    // Broadcast typing stopped
    if (socket && socketConnected) {
      socket.emit('random_typing_status', { isTyping: false });
    }
    isCurrentlyTypingRef.current = false;

    // 1. Send via WebSocket
    if (socket && socketConnected) {
      socket.emit(
        'send_random_message',
        { content: textToSend, imageUrl: imageToSend, clientMessageId: clientMsgId },
        (res: any) => {
          if (res?.success) {
            setMessages((prev) =>
              prev.map((m) => (m.clientMessageId === clientMsgId ? { ...m, status: 'SENT' } : m))
            );
          }
        }
      );
    }

    // 2. Persist via HTTP API
    if (chatSessionId) {
      try {
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatSessionId,
            clientMessageId: clientMsgId,
            content: textToSend,
            imageData: imageToSend,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setMessages((prev) =>
            prev.map((m) => (m.clientMessageId === clientMsgId ? { ...data.message, status: 'SENT' } : m))
          );
        }
      } catch (e) {
        console.error('HTTP message persist error:', e);
      }
    }

    setSendingMsg(false);
  };

  // TYPING INDICATOR HANDLER
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

  // HANDLE IMAGE ATTACHMENT CLICK (VIP Gate)
  const handleImageAttachmentClick = () => {
    if (!isVIP) {
      setShowVipModal(true);
      return;
    }
    fileInputRef.current?.click();
  };

  // HANDLE IMAGE FILE SELECTED
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

  // DISMISS INTRO MODAL & PERSIST "DON'T SHOW AGAIN"
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

  // REPORT PARTNER
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
          chatSessionId,
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

  // BLOCK PARTNER
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

  return (
    <AppShell showNav={matchStatus === 'idle'}>
      <div className="flex-1 flex flex-col h-[100dvh] max-h-[100dvh] bg-[#07000e] text-white overflow-hidden relative font-sans">
        {/* ========================================================================= */}
        {/* 1. STATE: IDLE / START SCREEN */}
        {/* ========================================================================= */}
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
                Connect instantly with verified people nearby. No names revealed unless you choose to.
              </p>
            </div>

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

        {/* ========================================================================= */}
        {/* 2. STATE: SEARCHING / FINDING SOMEONE */}
        {/* ========================================================================= */}
        {matchStatus === 'searching' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8 max-w-md mx-auto">
            {/* Pulsing Radar Animation */}
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
                Looking for another authenticated person to chat with. Connecting you in real-time...
              </p>
            </div>

            <button
              onClick={handleCancelSearch}
              className="px-6 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-bold transition-all cursor-pointer"
            >
              Cancel Search
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. STATE: CONNECTED / WHATSAPP-LIKE ACTIVE CHAT */}
        {/* ========================================================================= */}
        {matchStatus === 'connected' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* WHATSAPP-STYLE CHAT HEADER */}
            <header className="px-4 py-3 bg-[#0d0119]/95 backdrop-blur-xl border-b border-pink-500/20 flex items-center justify-between z-30 shrink-0 shadow-md">
              <div className="flex items-center space-x-3">
                <div
                  onClick={() => setShowProfileSheet(true)}
                  className="relative cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-600 to-purple-600 flex items-center justify-center text-white font-black text-sm border-2 border-pink-400/50 shadow-md">
                    {partner?.avatarEmoji || (partner?.username ? partner.username.substring(0, 2).toUpperCase() : '👤')}
                  </div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0d0119]" />
                </div>

                <div
                  onClick={() => setShowProfileSheet(true)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center space-x-1.5">
                    <h3 className="text-sm font-black text-white truncate max-w-[140px] sm:max-w-[200px]">
                      {partner?.displayName || partner?.fullName || 'Anonymous Partner'}
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

              {/* Header Action Buttons */}
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

                  {/* 3-Dots Dropdown Menu */}
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
                        <span>Block & Skip</span>
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

            {/* CHAT MESSAGES SCROLL CONTAINER */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Security Header Banner */}
              <div className="text-center my-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-pink-400" />
                  <span>Encrypted Transport Connection • Be polite & respectful</span>
                </span>
              </div>

              {messages.length === 0 && (
                <div className="text-center py-12 text-slate-500 text-xs space-y-1">
                  <p className="font-bold text-slate-400">You are connected!</p>
                  <p>Say hello to start the conversation 👋</p>
                </div>
              )}

              {/* Message Bubbles */}
              {messages.map((msg, index) => {
                const isMine = msg.senderId === user?.id || msg.senderUsername === user?.username;

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
                      {/* Image Message */}
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

                      {/* Text Content */}
                      {msg.content && <p className="text-xs leading-relaxed">{msg.content}</p>}

                      {/* Timestamp & Delivery State */}
                      <div className="flex items-center justify-end space-x-1 mt-1 text-[9px] opacity-70">
                        <span>
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {isMine && (
                          <CheckCheck className="w-3 h-3 text-white" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {/* Typing Indicator Bubble */}
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

            {/* IMAGE PREVIEW DRAWER (Before Sending) */}
            {imagePreview && (
              <div className="p-3 bg-[#10001f] border-t border-pink-500/20 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img src={imagePreview} alt="Preview" className="w-12 h-12 rounded-xl object-cover border border-white/20" />
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

            {/* WHATSAPP-STYLE MOBILE STICKY COMPOSER */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-[#0d0119]/95 backdrop-blur-xl border-t border-pink-500/20 flex items-center space-x-2 z-30 shrink-0"
            >
              {/* Image Attachment Button */}
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

              {/* Message Input Box */}
              <input
                type="text"
                placeholder="Type a message..."
                value={inputText}
                onChange={handleInputChange}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />

              {/* Send Button */}
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

        {/* ========================================================================= */}
        {/* 4. STATE: ENDED / PARTNER LEFT */}
        {/* ========================================================================= */}
        {matchStatus === 'ended' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-white">Connection Ended</h3>
              <p className="text-xs text-slate-400">
                Your chat partner has disconnected or skipped to the next person.
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

      {/* ========================================================================= */}
      {/* INTRO POPUP WITH PERSISTENT "DON'T SHOW AGAIN" */}
      {/* ========================================================================= */}
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
              <p className="text-xs text-slate-400">
                Quick safety tips before starting your anonymous random chat:
              </p>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300 bg-black/40 p-4 rounded-2xl border border-white/5">
              <div className="flex items-start space-x-2">
                <span>🔒</span>
                <span>Your private details (email, Clerk ID, IP) are never shared with your partner.</span>
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
              Continue & Start Chat
            </button>
          </motion.div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REPORT MODAL */}
      {/* ========================================================================= */}
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

      {/* FULL IMAGE LIGHTBOX */}
      {selectedFullImage && (
        <div
          onClick={() => setSelectedFullImage(null)}
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <img src={selectedFullImage} alt="Attachment" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" />
        </div>
      )}

      {/* VIP UPGRADE MODAL */}
      <SelfHostedVipModal
        isOpen={showVipModal}
        onClose={() => setShowVipModal(false)}
        onSuccess={() => {
          refreshUser();
          setShowVipModal(false);
        }}
      />

      {/* Profile Preview Sheet */}
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
