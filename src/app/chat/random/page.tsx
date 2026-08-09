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
  ArrowRight
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCurrentlyTypingRef = useRef(false);

  const isVIP = user?.subscription?.isActive || false;

  // Auto-scroll helper
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, partnerTyping, matchStatus]);

  // Initial Match Trigger
  useEffect(() => {
    if (user && socket && matchStatus === 'idle') {
      handleStartMatch();
    }
  }, [user, socket]);

  // Socket Registrations
  useEffect(() => {
    if (!socket) return;

    const handleQueueJoined = () => {
      setMatchStatus('searching');
      setPartner(null);
      setMessages([]);
    };

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
      setMessages([]); // Server-side wipe
      setInputText('');
      setImageFile('');
    };

    socket.on('queue_joined', handleQueueJoined);
    socket.on('random_match_found', handleMatchFound);
    socket.on('receive_random_message', handleReceiveMessage);
    socket.on('partner_typing_status', handlePartnerTyping);
    socket.on('partner_left', handlePartnerLeft);

    return () => {
      socket.off('queue_joined', handleQueueJoined);
      socket.off('random_match_found', handleMatchFound);
      socket.off('receive_random_message', handleReceiveMessage);
      socket.off('partner_typing_status', handlePartnerTyping);
      socket.off('partner_left', handlePartnerLeft);
    };
  }, [socket]);

  // Match Handlers
  const handleStartMatch = () => {
    if (!socket) return;
    setMessages([]);
    setInputText('');
    setImageFile('');
    socket.emit('join_random_queue', {
      gender,
      preferredGender: isVIP ? preferredGender : 'auto',
      language,
    });
  };

  const handleNextClick = () => {
    // Check if user saved "don't ask again"
    const skipConfirm = typeof window !== 'undefined' && localStorage.getItem('cupidx_skip_next_confirm') === 'true';
    if (skipConfirm) {
      executeNextPartner();
    } else {
      setShowNextModal(true);
    }
  };

  const executeNextPartner = () => {
    setShowNextModal(false);
    if (!socket) return;
    setMessages([]); // Wipe messages
    setInputText('');
    setImageFile('');
    socket.emit('next_partner', {
      gender,
      preferredGender: isVIP ? preferredGender : 'auto',
      language,
    });
  };

  const handleEndChat = () => {
    if (!socket) return;
    socket.emit('end_random_chat');
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

    // Local message object for optimistic update
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
        imageUrl: currentImg || null
      });
    } else if (matchStatus === 'idle') {
      handleStartMatch();
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
        handleNextPartnerDirect();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleNextPartnerDirect = () => {
    if (!socket) return;
    setMessages([]);
    socket.emit('next_partner', { gender, preferredGender: isVIP ? preferredGender : 'auto', language });
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
        
        {/* Compact Native Mobile Chat Header */}
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
                    'Looking for someone...'
                  ) : (
                    'Random Chat'
                  )}
                </h3>
                {partner?.isVIP && <Crown className="w-3.5 h-3.5 text-yellow-400 fill-current" />}
              </div>
              <p className="text-[11px] text-pink-200/60 font-medium">
                {matchStatus === 'connected' ? 'Connected • Temporary Chat' : matchStatus === 'searching' ? 'Matching queue active...' : 'Press Start to Match'}
              </p>
            </div>
          </div>

          {matchStatus === 'connected' && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleBlockUser}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-rose-300 transition-colors"
                title="Block User"
              >
                <Ban className="w-4 h-4" />
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

        {/* Scrollable Message Feed Area */}
        <div className="flex-grow overflow-y-auto p-4 space-y-3 z-10">
          
          {/* Searching State Screen */}
          {matchStatus === 'searching' && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-12">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-pink-500/20 border border-pink-400/40 flex items-center justify-center animate-ping absolute inset-0" />
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-pink-600 to-rose-500 flex items-center justify-center shadow-xl shadow-pink-500/30 relative">
                  <Heart className="w-10 h-10 text-white fill-white animate-bounce" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Searching for someone...</h3>
                <p className="text-xs text-pink-200/70 mt-1">We're finding a random romantic partner for you.</p>
              </div>
            </div>
          )}

          {/* Connected State Welcome Banner */}
          {matchStatus === 'connected' && partner && messages.length === 0 && (
            <div className="glass-romantic rounded-3xl p-4 text-center space-y-1.5 border border-pink-500/20 max-w-sm mx-auto my-4">
              <Sparkles className="w-5 h-5 text-pink-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">✨ You are connected with @{partner.username}!</h4>
              <p className="text-[11px] text-pink-200/70">
                Say hello 👋 All messages are temporary and will be deleted when either person clicks NEXT.
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

        {/* Bottom Native Composer & NEXT Action Row */}
        <div className="p-3 bg-slate-950/80 backdrop-blur-xl border-t border-pink-500/20 space-y-2 shrink-0 z-20 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          
          {/* Form Composer */}
          <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
            <input
              type="text"
              placeholder={matchStatus === 'connected' ? 'Type a message...' : 'Connect to a partner to type...'}
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

          {/* Action Row: NEXT Button */}
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

      {/* Confirmation & Bottom Sheet Modals */}
      <NextConfirmModal
        isOpen={showNextModal}
        onClose={() => setShowNextModal(false)}
        onConfirm={executeNextPartner}
        isNext={true}
      />

      {/* Report User Bottom Sheet */}
      <BottomSheet isOpen={showReportModal} onClose={() => setShowReportModal(false)} title={`Report @${partner?.username}`}>
        <form onSubmit={handleReportUser} className="space-y-4">
          <p className="text-xs text-pink-200/70">
            Please state the reason for reporting @{partner?.username}. Reports are handled confidentially by our moderation team.
          </p>
          <textarea
            rows={3}
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="Specify reason (Spam, Harassment, Inappropriate behavior...)"
            className="w-full p-3 rounded-2xl glass-input text-xs"
            required
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowReportModal(false)}
              className="w-full py-3 rounded-2xl bg-white/5 text-pink-200 font-bold text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reportSubmitting}
              className="w-full py-3 rounded-2xl bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-500/30"
            >
              {reportSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </BottomSheet>
    </AppShell>
  );
}
