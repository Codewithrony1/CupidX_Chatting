'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import AppShell from '@/components/AppShell';
import dynamic from 'next/dynamic';

const ProfilePreviewSheet = dynamic(() => import('@/components/chat/ProfilePreviewSheet'), { ssr: false });
const NextConfirmModal = dynamic(() => import('@/components/chat/NextConfirmModal'), { ssr: false });
const BottomSheet = dynamic(() => import('@/components/ui/BottomSheet'), { ssr: false });
import {
  Heart,
  Globe,
  User,
  Shield,
  Send,
  Smile,
  Image as ImageIcon,
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
  UserCheck,
  Loader2,
  AlertCircle,
  RefreshCw,
  Check
} from 'lucide-react';

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
  const { user } = useAuth();
  const { socket, isConnected: socketConnected } = useSocket();

  // Statuses: "idle" | "searching" | "connected" | "ended"
  const [matchStatus, setMatchStatus] = useState<'idle' | 'searching' | 'connected' | 'ended'>('idle');
  const [reconnecting, setReconnecting] = useState(false);
  const [partner, setPartner] = useState<RandomPartner | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RandomMessage[]>([]);

  // Input & Messaging states
  const [inputText, setInputText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);

  // Modals & Bottom Sheets
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showNextModal, setShowNextModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // VIP Ban States
  const [showBanModal, setShowBanModal] = useState(false);
  const [showVipLockModal, setShowVipLockModal] = useState(false);
  const [banSubmitting, setBanSubmitting] = useState(false);

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

  // Track latest message timestamp for incremental recovery
  useEffect(() => {
    if (messages.length > 0) {
      lastMessageTimestampRef.current = messages[messages.length - 1].createdAt;
    }
  }, [messages]);

  // Initial Match Trigger on page load
  useEffect(() => {
    if (user && matchStatus === 'idle') {
      handleStartMatch();
    }
  }, [user]);

  // Handle Socket Reconnection Status
  useEffect(() => {
    if (matchStatus === 'connected') {
      if (!socketConnected) {
        setReconnecting(true);
      } else {
        setReconnecting(false);
      }
    }
  }, [socketConnected, matchStatus]);

  // 1. Persistent Queue Status Polling (Fallback during searching state)
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
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [matchStatus]);

  // 2. Realtime Active Chat Sync & Reconnection Recovery (Polling every 1.5s)
  useEffect(() => {
    if (matchStatus !== 'connected' || !chatSessionId) return;

    const chatSyncInterval = setInterval(async () => {
      try {
        const sinceParam = lastMessageTimestampRef.current ? `&since=${encodeURIComponent(lastMessageTimestampRef.current)}` : '';
        const res = await fetch(`/api/chat/messages?chatSessionId=${encodeURIComponent(chatSessionId)}${sinceParam}`);
        
        if (res.ok) {
          const data = await res.json();
          
          // Partner ended chat / session ended
          if (data.sessionStatus === 'ENDED') {
            setMatchStatus('searching');
            setPartner(null);
            setMessages([]);
            handleStartMatch(); // Automatically find next match!
            return;
          }

          if (data.messages && data.messages.length > 0) {
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id || m.clientMessageId));
              const newMsgs = data.messages.filter((m: any) => !existingIds.has(m.id) && !existingIds.has(m.clientMessageId));
              if (newMsgs.length === 0) return prev;
              
              // Replace any temporary sending messages with confirmed server messages
              const updated = prev.map((m) => {
                const match = data.messages.find((serverMsg: any) => serverMsg.clientMessageId && serverMsg.clientMessageId === m.clientMessageId);
                return match ? { ...match, status: 'SENT' as const } : m;
              });

              const merged = [...updated, ...newMsgs.map((m: any) => ({ ...m, status: 'SENT' as const }))];
              return merged;
            });
          }

          if (data.partner) {
            setPartner(data.partner);
          }
          setReconnecting(false);
        } else if (res.status === 404) {
          // Chat session ended by partner via NEXT
          setMatchStatus('searching');
          setPartner(null);
          setMessages([]);
          handleStartMatch();
        }
      } catch (e) {
        console.error('Chat sync error:', e);
        setReconnecting(true);
      }
    }, 1500);

    return () => clearInterval(chatSyncInterval);
  }, [matchStatus, chatSessionId]);

  // 3. Socket Realtime Event Listeners
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
      // Partner clicked NEXT: automatically restart matchmaking!
      setMatchStatus('searching');
      setPartner(null);
      setMessages([]);
      handleStartMatch();
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

  // Persistent Server-Side Matchmaking Join
  const handleStartMatch = async () => {
    setMessages([]);
    setInputText('');
    setMatchStatus('searching');
    setPartner(null);

    const userInterests = user?.profile?.interests ? user.profile.interests.split(',').map((s) => s.trim().toLowerCase()) : [];
    const payload = {
      gender: user?.profile?.gender || 'unspecified',
      preferredGender: isVIP ? user?.profile?.preferredGender || 'auto' : 'auto',
      genderPref: isVIP ? user?.profile?.preferredGender || 'auto' : 'auto',
      mood: user?.profile?.mood || 'chill',
      tags: userInterests,
      language: user?.profile?.language || 'english',
    };

    if (socket && socketConnected) {
      socket.emit('join_random_queue', payload);
    }

    try {
      const res = await fetch('/api/matchmaking/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.matched && data.chatSessionId) {
        setMatchStatus('connected');
        setPartner(data.partner);
        setChatSessionId(data.chatSessionId);
      } else {
        setMatchStatus('searching');
      }
    } catch (e) {
      console.error('Matchmaking error:', e);
      setMatchStatus('searching');
    }
  };

  // Cancel Matchmaking
  const handleCancelMatch = async () => {
    try {
      await fetch('/api/matchmaking/cancel', { method: 'POST' });
    } catch (e) {
      console.error(e);
    } finally {
      setMatchStatus('idle');
      router.push('/dashboard');
    }
  };

  // Core NEXT Functionality
  const handleNextClick = () => {
    const skipConfirm = typeof window !== 'undefined' && localStorage.getItem('cupidx_skip_next_confirm') === 'true';
    if (skipConfirm) {
      executeNextPartner();
    } else {
      setShowNextModal(true);
    }
  };

  const executeNextPartner = async () => {
    setShowNextModal(false);
    if (chatSessionId) {
      try {
        await fetch(`/api/chat/${chatSessionId}/next`, { method: 'POST' });
      } catch (e) {
        console.error(e);
      }
    }
    if (socket) {
      socket.emit('next_partner');
    }
    handleStartMatch();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    setInputText(e.target.value);
    if (!socket) return;

    if (!isCurrentlyTypingRef.current) {
      isCurrentlyTypingRef.current = true;
      socket.emit('random_typing_status', { isTyping: true });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      isCurrentlyTypingRef.current = false;
      socket.emit('random_typing_status', { isTyping: false });
    }, 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // Message Sending with Idempotency (clientMessageId) & Retry Support
  const sendSingleMessage = async (contentToSend: string, clientMsgId: string) => {
    if (!chatSessionId) return;

    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatSessionId,
          content: contentToSend,
          clientMessageId: clientMsgId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.message) {
        // Update local message state to SENT
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === clientMsgId
              ? { ...data.message, status: 'SENT' as const }
              : m
          )
        );

        if (socket && matchStatus === 'connected') {
          socket.emit('send_random_message', {
            content: contentToSend,
            clientMessageId: clientMsgId,
            imageUrl: null,
          });
        }
      } else if (res.status === 429) {
        alert("You're sending messages too quickly. Please wait a moment.");
        setMessages((prev) =>
          prev.map((m) => (m.clientMessageId === clientMsgId ? { ...m, status: 'FAILED' as const } : m))
        );
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.clientMessageId === clientMsgId ? { ...m, status: 'FAILED' as const } : m))
        );
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setMessages((prev) =>
        prev.map((m) => (m.clientMessageId === clientMsgId ? { ...m, status: 'FAILED' as const } : m))
      );
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sendingMsg || !chatSessionId) return;

    const currentText = inputText.trim();
    const clientMsgId = `cmsg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    setInputText('');
    setSendingMsg(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isCurrentlyTypingRef.current = false;
    if (socket) socket.emit('random_typing_status', { isTyping: false });

    // Local optimistic message with SENDING status
    const localMsg: RandomMessage = {
      id: clientMsgId,
      clientMessageId: clientMsgId,
      senderId: user?.id || 'me',
      senderUsername: user?.username || 'me',
      content: currentText,
      imageUrl: null,
      createdAt: new Date().toISOString(),
      status: 'SENDING',
    };

    setMessages((prev) => [...prev, localMsg]);

    await sendSingleMessage(currentText, clientMsgId);
    setSendingMsg(false);
  };

  // Retry Failed Message
  const handleRetryMessage = async (msg: RandomMessage) => {
    if (!msg.clientMessageId || !msg.content) return;
    setMessages((prev) =>
      prev.map((m) => (m.clientMessageId === msg.clientMessageId ? { ...m, status: 'SENDING' as const } : m))
    );
    await sendSingleMessage(msg.content, msg.clientMessageId);
  };

  const handleBlockUser = async () => {
    if (!partner) return;
    if (confirm(`Block @${partner.username}? This will end the chat and delete all temporary messages.`)) {
      try {
        await fetch('/api/chat/block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: partner.id, action: 'block' }),
        });
        executeNextPartner();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleBanUser = async () => {
    if (!partner) return;
    setBanSubmitting(true);
    try {
      const res = await fetch('/api/chat/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: partner.id, action: 'ban' }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert(`@${partner.username} has been personally banned. You will no longer match with them.`);
        setShowBanModal(false);
        executeNextPartner();
      } else if (res.status === 403 && data.isVipRequired) {
        setShowBanModal(false);
        setShowVipLockModal(true);
      } else {
        alert(data.error || 'Failed to ban user.');
      }
    } catch (e) {
      console.error(e);
      alert('Error applying personal ban.');
    } finally {
      setBanSubmitting(false);
    }
  };

  const handleReportUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partner || !reportReason.trim()) return;

    setReportSubmitting(true);
    try {
      const res = await fetch('/api/chat/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: partner.id, reason: reportReason }),
      });
      if (res.ok) {
        alert('Report submitted. Thank you for keeping Cupidx safe!');
        setShowReportModal(false);
        setReportReason('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <AppShell showNav={false}>
      <div className="flex flex-col h-[100dvh] max-w-2xl mx-auto w-full relative bg-[#030014] text-white selection:bg-pink-500 selection:text-white">
        
        {/* KnotChat Header */}
        <div className="px-4 py-3 bg-slate-950/80 backdrop-blur-xl border-b border-pink-500/20 flex items-center justify-between z-30 shrink-0">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 rounded-2xl bg-white/5 hover:bg-white/10 text-pink-300 transition-colors"
              title="Back to Home"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {partner ? (
              <button
                onClick={() => setShowProfileSheet(true)}
                className="flex items-center space-x-2.5 text-left group cursor-pointer"
              >
                <div className="relative">
                  {partner.isVIP && partner.avatarType === 'IMAGE' && partner.avatarUrl ? (
                    <img
                      src={partner.avatarUrl}
                      alt={partner.username}
                      className="w-10 h-10 rounded-2xl border border-pink-400/50 object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-600/30 to-purple-600/30 border border-pink-400/50 flex items-center justify-center text-2xl select-none group-hover:scale-105 transition-transform">
                      {partner.avatarEmoji || '😊'}
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-950" />
                </div>

                <div>
                  <div className="flex items-center space-x-1.5">
                    <h3 className="font-black text-sm text-white tracking-tight flex items-center gap-1 group-hover:text-pink-300 transition-colors">
                      {partner.displayName || partner.fullName || partner.username}
                    </h3>
                    {partner.isVIP && <Crown className="w-3.5 h-3.5 text-yellow-400 fill-current" />}
                  </div>
                  <p className="text-[11px] text-pink-200/70 font-medium">
                    @{partner.username} {partner.mood ? `• ${partner.mood}` : ''}
                  </p>
                </div>
              </button>
            ) : (
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-pink-500/30">
                  <Heart className="w-5 h-5 fill-white animate-pulse" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white tracking-tight">
                    {matchStatus === 'searching' ? 'Finding someone...' : 'CupidX Random Chat'}
                  </h3>
                  <p className="text-[11px] text-pink-200/60 font-medium">
                    {matchStatus === 'searching' ? 'Looking for a person to chat with you' : '1-to-1 Ephemeral Chat'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Reconnecting Badge & Options Menu */}
          <div className="flex items-center space-x-2">
            {reconnecting && matchStatus === 'connected' && (
              <div className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold flex items-center space-x-1 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                <span>Reconnecting...</span>
              </div>
            )}

            {matchStatus === 'connected' && partner && (
              <button
                onClick={() => setShowOptionsMenu(true)}
                className="p-2 rounded-2xl bg-white/5 hover:bg-white/10 text-pink-200 transition-colors cursor-pointer"
                title="Options"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Message Feed Area */}
        <div className="flex-grow overflow-y-auto p-4 space-y-3.5 z-10">
          
          {/* SEARCHING / MATCHMAKING WAITING SCREEN */}
          {matchStatus === 'searching' && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-12 animate-in fade-in duration-300">
              <div className="relative">
                <div className="w-28 h-28 rounded-full bg-pink-500/20 border border-pink-400/40 flex items-center justify-center animate-ping absolute inset-0" />
                <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-pink-600 via-rose-500 to-fuchsia-500 flex items-center justify-center shadow-2xl shadow-pink-500/50 relative border-2 border-pink-300/40">
                  <Heart className="w-14 h-14 text-white fill-white animate-bounce" />
                </div>
              </div>
              
              <div className="space-y-2 max-w-xs">
                <h2 className="text-2xl font-black text-white tracking-tight">Finding someone...</h2>
                <p className="text-xs font-semibold text-pink-200/80 leading-relaxed">
                  Looking for a person to chat with you.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCancelMatch}
                className="px-8 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition-all cursor-pointer shadow-lg active:scale-95"
              >
                Cancel Matchmaking
              </button>
            </div>
          )}

          {/* CONNECTED STATE WELCOME BANNER */}
          {matchStatus === 'connected' && partner && messages.length === 0 && (
            <div className="glass-romantic rounded-3xl p-4 text-center space-y-1.5 border border-pink-500/30 max-w-sm mx-auto my-4 animate-in fade-in zoom-in duration-300">
              <Sparkles className="w-5 h-5 text-pink-400 mx-auto" />
              <h4 className="text-sm font-black text-white">✨ Match Found! Connected with @{partner.username}</h4>
              <p className="text-[11px] text-pink-200/70">
                Say hello 👋 All messages are temporary and deleted when either person presses NEXT.
              </p>
            </div>
          )}

          {/* MESSAGES LIST WITH DELIVERY STATES & RETRY */}
          {messages.map((msg) => {
            const isMe = msg.senderId === user?.id || msg.senderUsername === user?.username;
            return (
              <div key={msg.id || msg.clientMessageId} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-sm ${
                    isMe
                      ? 'bg-gradient-to-r from-pink-600 via-rose-500 to-fuchsia-600 text-white rounded-br-none font-medium'
                      : 'bg-white/10 backdrop-blur-md text-pink-50 border border-white/10 rounded-bl-none font-medium'
                  }`}
                >
                  {msg.content}
                </div>

                <div className="flex items-center space-x-1.5 px-1">
                  <span className="text-[9px] text-pink-200/40 font-mono">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {isMe && (
                    <span className="text-[9px] font-bold">
                      {msg.status === 'SENDING' && <span className="text-pink-300/60 animate-pulse">Sending...</span>}
                      {msg.status === 'SENT' && <Check className="w-3 h-3 text-emerald-400 inline" />}
                      {msg.status === 'FAILED' && (
                        <button
                          onClick={() => handleRetryMessage(msg)}
                          className="text-rose-400 font-bold underline cursor-pointer hover:text-rose-300 flex items-center gap-0.5"
                        >
                          Failed (Retry)
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* PARTNER TYPING INDICATOR */}
          {partnerTyping && (
            <div className="flex items-center space-x-2 text-pink-300 text-xs py-1.5">
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce [animation-delay:0.4s]" />
              <span className="text-[11px] italic font-semibold">@{partner?.username} is typing...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* BOTTOM FIXED COMPOSER & PROMINENT NEXT BUTTON */}
        <div className="p-3 bg-slate-950/90 backdrop-blur-2xl border-t border-pink-500/20 space-y-2.5 shrink-0 z-20 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          
          {/* Elastic Text Area Input Bar */}
          <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
            <textarea
              rows={1}
              placeholder={matchStatus === 'connected' ? 'Type a message...' : 'Finding someone...'}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={matchStatus !== 'connected'}
              className="flex-grow px-4 py-3 rounded-2xl glass-input text-xs sm:text-sm placeholder:text-pink-300/40 disabled:opacity-50 disabled:cursor-not-allowed resize-none max-h-24 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
            />
            <button
              type="submit"
              disabled={matchStatus !== 'connected' || !inputText.trim() || sendingMsg}
              className="p-3.5 rounded-2xl bg-gradient-to-r from-pink-600 via-rose-500 to-fuchsia-600 hover:from-pink-500 hover:to-fuchsia-500 text-white shadow-xl shadow-pink-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0 active:scale-95"
            >
              <Send className="w-4 h-4 fill-current" />
            </button>
          </form>

          {/* Prominent KnotChat NEXT CHAT Button */}
          <button
            type="button"
            onClick={handleNextClick}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 via-rose-500 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-black text-sm tracking-wider uppercase shadow-xl shadow-pink-500/30 flex items-center justify-center space-x-2 cursor-pointer active:scale-95 border border-pink-400/40"
          >
            <span>NEXT CHAT</span>
            <FastForward className="w-5 h-5 fill-current" />
          </button>
        </div>

      </div>

      {/* Matched Partner Profile Preview Sheet */}
      <ProfilePreviewSheet
        isOpen={showProfileSheet}
        onClose={() => setShowProfileSheet(false)}
        partner={partner}
      />

      {/* Options Menu Bottom Sheet (⋮) */}
      <BottomSheet isOpen={showOptionsMenu} onClose={() => setShowOptionsMenu(false)} title="Chat Options">
        <div className="space-y-2 py-2 text-white">
          <button
            type="button"
            onClick={() => {
              setShowOptionsMenu(false);
              setShowProfileSheet(true);
            }}
            className="w-full p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 font-bold text-xs flex items-center space-x-3 text-left transition-colors cursor-pointer"
          >
            <User className="w-4 h-4 text-pink-400" />
            <span>View @{partner?.username}'s Profile</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowOptionsMenu(false);
              setShowReportModal(true);
            }}
            className="w-full p-3.5 rounded-2xl bg-white/5 hover:bg-amber-500/20 text-amber-300 font-bold text-xs flex items-center space-x-3 text-left transition-colors cursor-pointer"
          >
            <Flag className="w-4 h-4" />
            <span>Report @{partner?.username}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowOptionsMenu(false);
              handleBlockUser();
            }}
            className="w-full p-3.5 rounded-2xl bg-white/5 hover:bg-rose-500/20 text-rose-300 font-bold text-xs flex items-center space-x-3 text-left transition-colors cursor-pointer"
          >
            <Ban className="w-4 h-4" />
            <span>Block @{partner?.username}</span>
          </button>

          {isVIP ? (
            <button
              type="button"
              onClick={() => {
                setShowOptionsMenu(false);
                setShowBanModal(true);
              }}
              className="w-full p-3.5 rounded-2xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 font-bold text-xs flex items-center space-x-3 text-left transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 fill-current text-yellow-400" />
              <span>Personal Ban User (VIP Feature)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowOptionsMenu(false);
                setShowVipLockModal(true);
              }}
              className="w-full p-3.5 rounded-2xl bg-white/5 text-pink-200/40 font-bold text-xs flex items-center justify-between text-left cursor-pointer"
            >
              <div className="flex items-center space-x-3">
                <Sparkles className="w-4 h-4 text-yellow-400" />
                <span>Personal Ban User</span>
              </div>
              <Lock className="w-3.5 h-3.5 text-yellow-400" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowOptionsMenu(false)}
            className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors cursor-pointer mt-2"
          >
            Cancel
          </button>
        </div>
      </BottomSheet>

      {/* Confirmation Modals */}
      {showNextModal && (
        <NextConfirmModal
          isOpen={showNextModal}
          onClose={() => setShowNextModal(false)}
          onConfirm={executeNextPartner}
        />
      )}
    </AppShell>
  );
}
