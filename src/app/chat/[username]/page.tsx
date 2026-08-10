'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import {
  Send,
  Image as ImageIcon,
  Smile,
  Trash2,
  Flag,
  Ban,
  ArrowLeft,
  Sparkles,
  MoreVertical,
  X,
  AlertCircle,
  MessageSquare,
  User,
  Lock,
  Crown
} from 'lucide-react';

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  imageUrl: string | null;
  isRead: boolean;
  isDeleted: boolean;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    fullName: string;
  };
}

interface TargetUserProfile {
  id: string;
  username: string;
  fullName: string;
  displayName?: string;
  avatarUrl: string;
  isOnline: boolean;
  isVIP?: boolean;
  bio: string;
  age: number;
  gender: string;
  interests: string;
}

export default function ChatWindow() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();

  const targetUsername = params?.username as string;

  // Profile and Message States
  const [targetUser, setTargetUser] = useState<TargetUserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Moderation States
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // VIP Ban & Profile View States
  const [showBanModal, setShowBanModal] = useState(false);
  const [showVipLockModal, setShowVipLockModal] = useState(false);
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [banSubmitting, setBanSubmitting] = useState(false);

  const isVIP = user?.membershipTier === 'VIP' || (user?.subscription?.isActive === true && user?.subscription?.plan === 'VIP');

  const handleBanUser = async () => {
    if (!targetUser) return;
    setBanSubmitting(true);
    try {
      const res = await fetch('/api/chat/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: targetUser.id, action: 'ban' }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert(`@${targetUser.username} has been personally banned. They can no longer connect or match with you.`);
        setShowBanModal(false);
        router.push('/dashboard');
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

  // Input states
  const [inputText, setInputText] = useState('');
  const [imageFile, setImageFile] = useState<string>('');
  const [isTyping, setIsTyping] = useState(false);
  const [targetUserTyping, setTargetUserTyping] = useState(false);

  // Scroll references
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Typing debounce timer
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCurrentlyTypingRef = useRef(false);

  // Fetch initial history
  const fetchChatHistory = async () => {
    try {
      const res = await fetch(`/api/chat/history?username=${encodeURIComponent(targetUsername)}`);
      if (!res.ok) {
        if (res.status === 404) {
          alert('User not found');
          router.push('/dashboard');
        }
        return;
      }
      const data = await res.json();
      setTargetUser(data.targetUser);
      setMessages(data.messages);
      setIsBlocked(data.isBlocked);
      setBlockedByMe(data.blockedByMe);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (targetUsername) {
      fetchChatHistory();
    }
  }, [targetUsername]);

  // Scroll to bottom helper
  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, [loading]);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages, targetUserTyping]);

  // Socket.IO event registrations
  useEffect(() => {
    if (!socket || !targetUser) return;

    // Join room & Read receipts
    socket.emit('mark_messages_read', { senderId: targetUser.id });

    // Handle new messages
    const handleReceiveMessage = (message: ChatMessage) => {
      if (
        (message.senderId === targetUser.id && message.receiverId === user?.id) ||
        (message.senderId === user?.id && message.receiverId === targetUser.id)
      ) {
        setMessages((prev) => [...prev, message]);

        // If message is from target user, mark as read instantly
        if (message.senderId === targetUser.id) {
          socket.emit('mark_messages_read', { senderId: targetUser.id });
        }
      }
    };

    // Handle online/offline updates
    const handleStatusChange = (data: { userId: string; isOnline: boolean }) => {
      if (data.userId === targetUser.id) {
        setTargetUser((prev) => (prev ? { ...prev, isOnline: data.isOnline } : null));
      }
    };

    // Handle typing indicator
    const handleTypingStatus = (data: { senderId: string; isTyping: boolean }) => {
      if (data.senderId === targetUser.id) {
        setTargetUserTyping(data.isTyping);
      }
    };

    // Handle read receipts
    const handleReadReceipt = (data: { readerId: string }) => {
      if (data.readerId === targetUser.id) {
        setMessages((prev) => prev.map((m) => (m.senderId === user?.id ? { ...m, isRead: true } : m)));
      }
    };

    // Handle deleted messages
    const handleMessageDeleted = (data: { messageId: string; updatedMessage: ChatMessage }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, content: data.updatedMessage.content, isDeleted: true } : m))
      );
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('user_status_changed', handleStatusChange);
    socket.on('typing_status_changed', handleTypingStatus);
    socket.on('messages_read_receipt', handleReadReceipt);
    socket.on('message_deleted', handleMessageDeleted);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('user_status_changed', handleStatusChange);
      socket.off('typing_status_changed', handleTypingStatus);
      socket.off('messages_read_receipt', handleReadReceipt);
      socket.off('message_deleted', handleMessageDeleted);
    };
  }, [socket, targetUser, user]);

  // Handle typing input updates
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (!socket || !targetUser) return;

    if (!isCurrentlyTypingRef.current) {
      isCurrentlyTypingRef.current = true;
      socket.emit('typing_status', { receiverId: targetUser.id, isTyping: true });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      isCurrentlyTypingRef.current = false;
      socket.emit('typing_status', { receiverId: targetUser.id, isTyping: false });
    }, 2000);
  };

  // Image Upload handler
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert('File size exceeds 1MB limit');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Send Message trigger
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !targetUser || (!inputText.trim() && !imageFile)) return;

    // Clear typing indicator instantly
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isCurrentlyTypingRef.current = false;
    socket.emit('typing_status', { receiverId: targetUser.id, isTyping: false });

    const payload = {
      receiverId: targetUser.id,
      content: inputText,
      imageUrl: imageFile || null
    };

    socket.emit('send_message', payload, (response: any) => {
      if (response.error) {
        alert(response.error);
      } else {
        setInputText('');
        setImageFile('');
      }
    });
  };

  // Message Delete (Soft Delete) trigger
  const handleDeleteMessage = (messageId: string) => {
    if (!socket) return;
    if (confirm('Are you sure you want to delete this message?')) {
      socket.emit('delete_message', { messageId }, (res: any) => {
        if (res.error) {
          alert(res.error);
        }
      });
    }
  };

  // Block Action trigger
  const handleBlockUser = async () => {
    if (!targetUser) return;
    const action = blockedByMe ? 'unblock' : 'block';
    
    if (confirm(`Are you sure you want to ${action} @${targetUser.username}?`)) {
      try {
        const res = await fetch('/api/chat/block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: targetUser.id, action })
        });
        if (res.ok) {
          setBlockedByMe(!blockedByMe);
          setIsBlocked(!blockedByMe);
          setShowMenu(false);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Report Action trigger
  const handleReportUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser || !reportReason.trim()) return;

    setReportSubmitting(true);
    try {
      const res = await fetch('/api/chat/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: targetUser.id, reason: reportReason })
      });
      if (res.ok) {
        alert('User reported successfully.');
        setShowReportModal(false);
        setReportReason('');
        setShowMenu(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-full border-t-2 border-r-2 border-purple-500 animate-spin" />
          <span className="text-slate-400 text-sm">Opening conversation secure tunnel...</span>
        </div>
      </div>
    );
  }

  if (!targetUser) return null;

  return (
    <div className="flex-grow flex flex-col h-full bg-[#040118] relative">
      {/* Header */}
      <header className="px-6 py-4 glass border-b border-white/5 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer block md:hidden"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="relative">
            <img
              src={targetUser.avatarUrl}
              alt={targetUser.fullName}
              className="w-10 h-10 rounded-full object-cover bg-slate-800"
            />
            {targetUser.isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-slate-950" />
            )}
          </div>

          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>{targetUser.fullName}</span>
              <span className="text-sm leading-none" title="Location: India">🇮🇳</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5 font-normal">
                @{targetUser.username}
              </span>
            </h4>
            <span className="text-[10px] text-slate-400 font-light block mt-0.5">
              {targetUser.isOnline ? 'Active Online' : 'Offline'}
            </span>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {showMenu && (
            <div className="absolute right-0 mt-2 w-52 glass rounded-2xl p-2 border border-white/10 shadow-2xl z-30 space-y-1 animate-in fade-in zoom-in-95 duration-150">
              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowUserProfileModal(true);
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/5 transition-all text-left cursor-pointer"
              >
                <User className="w-4 h-4 text-purple-400" />
                <span>View Profile</span>
              </button>

              <button
                onClick={() => {
                  setShowMenu(false);
                  handleBlockUser();
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-pink-400 hover:bg-pink-500/10 transition-all text-left cursor-pointer"
              >
                <Ban className="w-4 h-4" />
                <span>{blockedByMe ? 'Unblock User' : 'Block User'}</span>
              </button>

              <button
                onClick={() => {
                  setShowMenu(false);
                  if (isVIP) {
                    setShowBanModal(true);
                  } else {
                    setShowVipLockModal(true);
                  }
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-yellow-400 hover:bg-yellow-500/10 transition-all text-left cursor-pointer"
              >
                <div className="flex items-center space-x-2.5">
                  <Sparkles className="w-4 h-4 text-yellow-400 fill-current" />
                  <span>Ban User</span>
                </div>
                {!isVIP && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-extrabold border border-yellow-500/30 flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> VIP
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setShowReportModal(true);
                  setShowMenu(false);
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-amber-400 hover:bg-amber-500/10 transition-all text-left cursor-pointer"
              >
                <Flag className="w-4 h-4" />
                <span>Report User</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Messages Feed */}
      <div className="flex-grow overflow-y-auto p-6 space-y-4 flex flex-col" ref={chatContainerRef}>
        {messages.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <MessageSquare className="w-8 h-8" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-white">Your secure chat with @{targetUser.username}</h5>
              <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                This dialog is fully monitored. Type a message below to start communicating.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === user?.id;
            return (
              <div
                key={msg.id}
                className={`flex group max-w-[85%] md:max-w-[70%] flex-col ${
                  isMe ? 'self-end items-end' : 'self-start items-start'
                }`}
              >
                <div
                  className={`relative p-3.5 rounded-2xl text-sm leading-relaxed overflow-hidden ${
                    isMe
                      ? 'bg-gradient-to-tr from-purple-600 to-pink-500 text-white rounded-br-none shadow-md shadow-purple-950/20'
                      : 'bg-white/5 border border-white/5 text-slate-100 rounded-bl-none'
                  } ${msg.isDeleted ? 'italic text-slate-500 opacity-60' : ''}`}
                >
                  {msg.imageUrl && !msg.isDeleted && (
                    <img
                      src={msg.imageUrl}
                      alt="Shared attachment"
                      className="rounded-xl max-h-60 object-cover mb-2 border border-black/20 w-full"
                    />
                  )}
                  <p>{msg.content}</p>

                  {/* Message hover delete trigger */}
                  {isMe && !msg.isDeleted && (
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="absolute top-1 right-1 p-1 rounded bg-black/40 text-pink-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Delete message"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-1.5 mt-1 text-[9px] text-slate-500 px-1">
                  <span>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMe && (
                    <span>
                      • {msg.isRead ? <span className="text-purple-400 font-bold">Read</span> : 'Sent'}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Live typing Indicator */}
        {targetUserTyping && (
          <div className="self-start flex items-center space-x-2 bg-white/5 border border-white/5 p-3 rounded-2xl rounded-bl-none text-xs text-slate-400">
            <div className="flex space-x-1 items-center h-2">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
            </div>
            <span>@{targetUser.username} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Footer / Input Bar */}
      <footer className="p-4 md:p-6 glass border-t border-white/5 shrink-0 z-10">
        {isBlocked ? (
          <div className="flex items-center justify-center space-x-2 p-3 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-xs text-pink-400 text-center font-medium animate-pulse">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {blockedByMe
                ? 'You have blocked this user. Unblock them to resume messaging.'
                : 'You have been blocked from messaging this user.'}
            </span>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="space-y-3">
            {/* Attachment preview banner */}
            {imageFile && (
              <div className="flex items-center space-x-2 p-2 rounded-xl bg-white/5 border border-white/5 inline-flex relative">
                <img src={imageFile} alt="Attach Preview" className="w-12 h-12 object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={() => setImageFile('')}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-slate-900 border border-white/10 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <label className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer">
                  <ImageIcon className="w-5 h-5" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="relative flex-grow">
                <input
                  type="text"
                  placeholder="Type a message spark..."
                  value={inputText}
                  onChange={handleInputChange}
                  className="w-full pl-4 pr-10 py-3 rounded-2xl glass-input text-sm"
                />
                <button
                  type="button"
                  onClick={() => setInputText(prev => prev + ' Spark! ✨')}
                  className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <Smile className="w-4 h-4" />
                </button>
              </div>

              <button
                type="submit"
                disabled={!inputText.trim() && !imageFile}
                className="p-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
        )}
      </footer>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md glass-premium rounded-3xl p-8 space-y-6 relative border border-yellow-500/20">
            <button
              onClick={() => setShowReportModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-500 border border-yellow-500/30">
                <Flag className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white">Report User</h3>
                <p className="text-xs text-slate-400">File a report against @{targetUser?.username}</p>
              </div>
            </div>

            <form onSubmit={handleReportUser} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Reason for Report</label>
                <textarea
                  required
                  rows={4}
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Describe the inappropriate behavior, harassment, or violation..."
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={reportSubmitting || !reportReason.trim()}
                className="w-full py-3 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-slate-950 font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {reportSubmitting ? 'Submitting Report...' : 'Submit Report'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* VIP User Personal Ban Confirmation Modal */}
      {showBanModal && targetUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="w-full max-w-sm glass-premium rounded-3xl p-6 space-y-5 text-center relative border border-yellow-500/30 shadow-2xl">
            <button
              onClick={() => setShowBanModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-yellow-500 to-amber-600 flex items-center justify-center mx-auto text-slate-950 shadow-lg shadow-yellow-500/20">
              <Sparkles className="w-6 h-6 fill-current" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-black text-white">Ban @{targetUser.username}?</h3>
              <p className="text-xs text-pink-200/80 leading-relaxed px-2">
                This will prevent this user from connecting or matching with you across Cupidx discovery features.
              </p>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => setShowBanModal(false)}
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={handleBanUser}
                disabled={banSubmitting}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {banSubmitting ? 'Banning...' : 'Ban User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Public User Profile View Modal (Requirement 13 & 14) */}
      {showUserProfileModal && targetUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="w-full max-w-sm glass-premium rounded-3xl p-6 space-y-5 text-center relative border border-pink-500/30 shadow-2xl">
            <button
              onClick={() => setShowUserProfileModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative w-20 h-20 mx-auto">
              <img
                src={targetUser.avatarUrl || '/default-avatar.png'}
                alt={targetUser.username}
                className="w-20 h-20 rounded-full object-cover bg-slate-900 border-2 border-pink-400 shadow-lg"
              />
              {targetUser.isOnline && (
                <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-950" title="Online" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-center space-x-1.5">
                <h3 className="text-lg font-black text-white">@{targetUser.username}</h3>
                <Crown className="w-4 h-4 text-yellow-400 fill-current" />
              </div>
              <p className="text-xs text-pink-200/70">{targetUser.displayName || targetUser.fullName}</p>
              
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-[10px] font-extrabold uppercase mt-1">
                💎 VIP MEMBER
              </span>
            </div>

            {/* Current Mood Display */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-200 font-semibold flex items-center justify-center space-x-2">
              <Smile className="w-4 h-4 text-amber-400" />
              <span>Current Mood: 😎 Attitude</span>
            </div>

            {/* Personality Badges */}
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold text-pink-300 uppercase tracking-wider block">Personality</span>
              <div className="flex flex-wrap justify-center gap-1.5">
                {['💬 Talkative', '😂 Funny', '😊 Friendly'].map((tag) => (
                  <span key={tag} className="px-2.5 py-1 rounded-xl bg-pink-500/15 text-pink-200 text-[11px] font-bold border border-pink-500/30">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowUserProfileModal(false)}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
              >
                Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Free User VIP Feature Lock Modal */}
      {showVipLockModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="w-full max-w-sm glass-premium rounded-3xl p-6 space-y-5 text-center relative border border-pink-500/30 shadow-2xl">
            <button
              onClick={() => setShowVipLockModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-yellow-400 via-amber-500 to-yellow-600 flex items-center justify-center mx-auto text-slate-950 shadow-xl shadow-yellow-500/30 animate-pulse">
              <Crown className="w-7 h-7 fill-current" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[11px] font-extrabold uppercase tracking-wide">
                💎 VIP FEATURE
              </span>
              <h3 className="text-lg font-black text-white">This feature is available with Cupidx VIP.</h3>
              <p className="text-xs text-pink-200/70 leading-relaxed px-2">
                Unlock custom DP uploads, targeted gender discovery, talkative matchmaking & VIP profile badge.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <Link
                href="/vip"
                onClick={() => setShowVipLockModal(false)}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 hover:from-yellow-400 hover:to-amber-400 text-slate-950 font-black text-xs shadow-lg transition-all active:scale-95 cursor-pointer block text-center"
              >
                EXPLORE VIP
              </Link>

              <button
                onClick={() => setShowVipLockModal(false)}
                className="w-full py-2.5 rounded-2xl text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
