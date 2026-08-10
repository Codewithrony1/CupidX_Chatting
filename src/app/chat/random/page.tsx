'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import AppShell from '@/components/AppShell';
import NextConfirmModal from '@/components/chat/NextConfirmModal';
import BottomSheet from '@/components/ui/BottomSheet';
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
  ArrowRight,
  Loader2
} from 'lucide-react';

interface RandomPartner {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  gender: string;
  isVIP: boolean;
}

interface RandomMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

export default function RandomChatPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { socket } = useSocket();

  // Statuses: "idle" | "searching" | "connected" | "ended"
  const [matchStatus, setMatchStatus] = useState<'idle' | 'searching' | 'connected' | 'ended'>('idle');
  const [partner, setPartner] = useState<RandomPartner | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RandomMessage[]>([]);

  // Input states
  const [inputText, setInputText] = useState('');
  const [imageFile, setImageFile] = useState<string>('');
  const [partnerTyping, setPartnerTyping] = useState(false);

  // Preference Filter States
  const [language, setLanguage] = useState(user?.profile?.language || 'english');
  const [gender, setGender] = useState(user?.profile?.gender || 'male');
  const [preferredGender, setPreferredGender] = useState(user?.profile?.preferredGender || 'auto');

  // Modals & Bottom Sheets
  const [showNextModal, setShowNextModal] = useState(false);
  const [showVIPModal, setShowVIPModal] = useState(false);
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

  const isVIP = user?.membershipTier === 'VIP' || (user?.subscription?.isActive === true && user?.subscription?.plan === 'VIP');

  // Auto-scroll helper
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, partnerTyping, matchStatus]);

  // Initial Match Trigger
  useEffect(() => {
    if (user && matchStatus === 'idle') {
      handleStartMatch();
    }
  }, [user]);

  // Server-Side Persistent Queue Polling (Fallback for Vercel Multi-Instance Execution)
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

  // Socket Event Listeners (Realtime Boost)
  useEffect(() => {
    if (!socket) return;

    const handleMatchFound = (data: { roomId: string; partner: RandomPartner }) => {
      setMatchStatus('connected');
      setPartner(data.partner);
      setMessages([]);
    };

    const handleReceiveMessage = (msg: RandomMessage) => {
      setMessages((prev) => [...prev, msg]);
    };

    const handlePartnerTyping = (data: { isTyping: boolean }) => {
      setPartnerTyping(data.isTyping);
    };

    const handlePartnerLeft = () => {
      setMatchStatus('ended');
      setPartnerTyping(false);
      setMessages([]);
      setInputText('');
      setImageFile('');
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
    setImageFile('');
    setMatchStatus('searching');

    try {
      const res = await fetch('/api/matchmaking/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gender,
          preferredGender: isVIP ? preferredGender : 'auto',
          language,
        }),
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
      socket.emit('next_partner', { gender, preferredGender: isVIP ? preferredGender : 'auto', language });
    }
    handleStartMatch();
  };

  const handleEndChat = async () => {
    if (chatSessionId) {
      try {
        await fetch(`/api/chat/${chatSessionId}/next`, { method: 'POST' });
      } catch (e) {
        console.error(e);
      }
    }
    if (socket) {
      socket.emit('end_random_chat');
    }
    setMessages([]);
    setInputText('');
    setImageFile('');
    setMatchStatus('ended');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !imageFile) return;

    const currentText = inputText;
    const currentImg = imageFile;
    setInputText('');
    setImageFile('');

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isCurrentlyTypingRef.current = false;
    if (socket) socket.emit('random_typing_status', { isTyping: false });

    const localMsg: RandomMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      senderId: user?.id || 'me',
      senderUsername: user?.username || 'me',
      content: currentText,
      imageUrl: currentImg || null,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, localMsg]);

    if (socket && matchStatus === 'connected') {
      socket.emit('send_random_message', {
        content: currentText,
        imageUrl: currentImg || null,
      });
    }
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
    <AppShell showNav={matchStatus !== 'connected'}>
      <div className="flex flex-col h-[calc(100dvh-4rem)] sm:h-[calc(100vh-6rem)] max-w-2xl mx-auto w-full relative">
        
        {/* Compact Mobile Chat Header */}
        <div className="px-4 py-2.5 bg-slate-950/60 backdrop-blur-md border-b border-pink-500/15 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center space-x-3">
            {partner ? (
              <div className="relative">
                <img
                  src={partner.avatarUrl || '/default-avatar.png'}
                  alt={partner.username}
                  className="w-9 h-9 rounded-full border border-pink-400/50 object-cover"
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-950" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-full bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
                <Heart className="w-4 h-4 fill-pink-400 animate-pulse" />
              </div>
            )}

            <div>
              <div className="flex items-center space-x-1.5">
                <h3 className="font-extrabold text-sm text-white tracking-tight flex items-center gap-1.5">
                  {partner ? (
                    <>
                      <span>@{partner.username}</span>
                      <span className="text-sm leading-none" title="Location: India">🇮🇳</span>
                    </>
                  ) : matchStatus === 'searching' ? (
                    'Finding someone...'
                  ) : (
                    'Random Chat'
                  )}
                </h3>
                {partner?.isVIP && <Crown className="w-3.5 h-3.5 text-yellow-400 fill-current" />}
              </div>
              <p className="text-[11px] text-pink-200/60 font-medium">
                {matchStatus === 'connected' ? 'Connected • Temporary Chat' : matchStatus === 'searching' ? 'Looking for a person to chat with you...' : 'Press Start to Match'}
              </p>
            </div>
          </div>

          {matchStatus === 'connected' && (
            <div className="flex items-center space-x-1.5">
              <button
                onClick={handleBlockUser}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-rose-300 transition-colors"
                title="Block User"
              >
                <Ban className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (isVIP) {
                    setShowBanModal(true);
                  } else {
                    setShowVipLockModal(true);
                  }
                }}
                className="p-1.5 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                title={isVIP ? 'Personal Ban User (VIP)' : 'Personal Ban User (VIP Feature)'}
              >
                <Sparkles className="w-4 h-4 fill-current" />
                {!isVIP && <Lock className="w-2.5 h-2.5" />}
              </button>

              <button
                onClick={() => setShowReportModal(true)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-amber-500/20 text-amber-300 transition-colors"
                title="Report User"
              >
                <Flag className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Feed Area */}
        <div className="flex-grow overflow-y-auto p-4 space-y-3 z-10">
          
          {/* Waiting Screen UI */}
          {matchStatus === 'searching' && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-5 py-12">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-pink-500/20 border border-pink-400/40 flex items-center justify-center animate-ping absolute inset-0" />
                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-pink-600 to-rose-500 flex items-center justify-center shadow-xl shadow-pink-500/40 relative">
                  <Heart className="w-12 h-12 text-white fill-white animate-bounce" />
                </div>
              </div>
              
              <div className="space-y-1.5 max-w-xs">
                <h3 className="text-2xl font-black text-white">Finding someone...</h3>
                <p className="text-xs text-pink-200/80">Looking for a person to chat with you.</p>
              </div>

              <button
                type="button"
                onClick={handleCancelMatch}
                className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition-all cursor-pointer shadow-md"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Connected State Welcome Banner */}
          {matchStatus === 'connected' && partner && messages.length === 0 && (
            <div className="glass-romantic rounded-3xl p-4 text-center space-y-1.5 border border-pink-500/20 max-w-sm mx-auto my-4 animate-in fade-in zoom-in duration-300">
              <Sparkles className="w-5 h-5 text-pink-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">✨ Match Found! Connected with @{partner.username}</h4>
              <p className="text-[11px] text-pink-200/70">
                Say hello 👋 Messages are temporary and erased when either person presses NEXT.
              </p>
            </div>
          )}

          {/* Messages Feed */}
          {messages.map((msg) => {
            const isMe = msg.senderId === user?.id || msg.senderUsername === user?.username;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm ${
                    isMe
                      ? 'bg-gradient-to-r from-pink-600 to-rose-500 text-white rounded-br-none'
                      : 'bg-white/10 backdrop-blur-md text-pink-50 border border-white/10 rounded-bl-none'
                  }`}
                >
                  {msg.content}
                </div>
                <span className="text-[9px] text-pink-200/40 px-1">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })}

          {/* Partner Typing Indicator */}
          {partnerTyping && (
            <div className="flex items-center space-x-2 text-pink-300 text-xs py-1">
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce [animation-delay:0.4s]" />
              <span className="text-[11px] italic">@{partner?.username} is typing...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Composer & Actions */}
        <div className="p-3 bg-slate-950/80 backdrop-blur-xl border-t border-pink-500/20 space-y-2 shrink-0 z-20 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          
          <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
            <input
              type="text"
              placeholder={matchStatus === 'connected' ? 'Type a message...' : 'Waiting for a match to type...'}
              value={inputText}
              onChange={handleInputChange}
              disabled={matchStatus !== 'connected'}
              className="flex-grow px-4 py-3 rounded-full glass-input text-xs sm:text-sm placeholder:text-pink-300/40 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={matchStatus !== 'connected' || !inputText.trim()}
              className="p-3 rounded-full bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white shadow-lg shadow-pink-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4 fill-current" />
            </button>
          </form>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleNextClick}
              className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-pink-600 via-rose-500 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-black text-xs shadow-md shadow-pink-500/20 flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 border border-pink-400/30"
            >
              <span>NEXT CHAT</span>
              <FastForward className="w-4 h-4" />
            </button>

            {matchStatus === 'connected' && (
              <button
                type="button"
                onClick={handleEndChat}
                className="px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-rose-500/20 text-rose-300 font-bold text-xs border border-white/10 shrink-0 cursor-pointer"
              >
                End
              </button>
            )}
          </div>
        </div>

      </div>

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
