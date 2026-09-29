'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth as useClerkAuth } from '@clerk/nextjs';
import { useAuth } from './AuthContext';

interface OfflineMessage {
  eventName: string;
  data: any;
  timestamp: number;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  emitThrottledTyping: (partnerSocketId?: string) => void;
  sendBufferedMessage: (eventName: string, data: any) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  emitThrottledTyping: () => {},
  sendBufferedMessage: () => {},
});

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const storageKey = useMemo(() => `cupidx_offline_queue_${user?.id || 'anon'}`, [user?.id]);

  // Offline message buffer queue backed by sessionStorage (BUG-002)
  const offlineQueueRef = useRef<OfflineMessage[]>([]);
  const lastTypingEmitRef = useRef<number>(0);

  // Restore queued messages from sessionStorage on mount/user change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          offlineQueueRef.current = parsed;
        }
      }
    } catch (e) {
      console.warn('[SocketContext] Could not restore offline queue:', e);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let activeSocket: Socket | null = null;
    let isDisposed = false;

    const flushQueue = (sock: Socket) => {
      const queue: OfflineMessage[] = [...offlineQueueRef.current];
      if (typeof window !== 'undefined') {
        try {
          const stored = sessionStorage.getItem(storageKey);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              const existingTimestamps = new Set(queue.map((q) => q.timestamp));
              parsed.forEach((item) => {
                if (!existingTimestamps.has(item.timestamp)) {
                  queue.push(item);
                }
              });
            }
          }
        } catch (e) {}
      }

      if (queue.length > 0 && sock.connected) {
        queue.sort((a, b) => a.timestamp - b.timestamp);
        console.log(`[SocketContext] Flushing ${queue.length} buffered offline messages in chronological order...`);
        offlineQueueRef.current = [];
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(storageKey);
        }
        queue.forEach((item) => {
          sock.emit(item.eventName, item.data);
        });
      }
    };

    const initSocket = async () => {
      try {
        let socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
        const isClientInBrowser = typeof window !== 'undefined';
        const isLocalHost =
          isClientInBrowser &&
          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

        if (!socketUrl) {
          if (isLocalHost) {
            socketUrl = 'http://localhost:3001';
          } else {
            console.log('[SocketContext] NEXT_PUBLIC_SOCKET_URL not configured for remote socket host; operating in resilient HTTP mode.');
            return;
          }
        }

        if (
          isClientInBrowser &&
          !isLocalHost &&
          socketUrl &&
          (socketUrl.includes('localhost') || socketUrl.includes('127.0.0.1'))
        ) {
          console.warn('[SocketContext] Public domain detected with localhost socket URL. Set NEXT_PUBLIC_SOCKET_URL in Vercel to your socket server host (e.g. Render/Railway/Fly).');
          return;
        }

        if (!socketUrl || isDisposed) {
          return;
        }

        const clerkToken = await getToken().catch(() => null);
        const res = await fetch('/api/auth/token', {
          headers: {
            ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}),
          },
        });
        if (!res.ok || isDisposed) {
          console.warn('[SocketContext] Failed to retrieve authentication token for socket connection (status:', res.status, ')');
          return;
        }
        const { token } = await res.json();

        activeSocket = io(socketUrl, {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          randomizationFactor: 0.3,
          timeout: 10000,
        });

        activeSocket.on('connect', () => {
          if (isDisposed) return;
          setIsConnected(true);
          console.log('⚡ Connected to CupidX Real-Time WebSocket at', socketUrl);
          if (activeSocket) {
            flushQueue(activeSocket);
          }
        });

        activeSocket.on('disconnect', (reason) => {
          if (isDisposed) return;
          setIsConnected(false);
          console.log('Socket disconnected:', reason);
          if (reason === 'io server disconnect' && activeSocket) {
            activeSocket.connect();
          }
        });

        activeSocket.on('connect_error', async (err) => {
          if (isDisposed) return;
          console.error('[Socket Error] Connection to socket server failed:', err.message);
          // Proactively refresh auth token for subsequent reconnect attempts
          try {
            const freshClerkToken = await getToken().catch(() => null);
            const tokenRes = await fetch('/api/auth/token', {
              headers: {
                ...(freshClerkToken ? { Authorization: `Bearer ${freshClerkToken}` } : {}),
              },
            });
            if (tokenRes.ok) {
              const fresh = await tokenRes.json();
              if (fresh?.token && activeSocket) {
                activeSocket.auth = { token: fresh.token };
              }
            }
          } catch (e) {}
        });

        setSocket(activeSocket);
      } catch (err) {
        console.error('Socket initialization failed:', err);
      }
    };

    initSocket();

    // Browser online / offline listeners for instant network recovery (BUG-002)
    const handleOnline = () => {
      console.log('[SocketContext] Network restored (online). Triggering immediate socket reconnection...');
      if (activeSocket) {
        getToken()
          .then((freshClerkToken) =>
            fetch('/api/auth/token', {
              headers: freshClerkToken ? { Authorization: `Bearer ${freshClerkToken}` } : {},
            })
          )
          .then((r) => r.json())
          .then(({ token }) => {
            if (token && activeSocket) {
              activeSocket.auth = { token };
            }
          })
          .catch(() => {})
          .finally(() => {
            if (activeSocket && !activeSocket.connected) {
              activeSocket.connect();
            }
          });
      }
    };

    const handleOffline = () => {
      console.log('[SocketContext] Network disconnected (offline).');
      setIsConnected(false);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      isDisposed = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
      if (activeSocket) {
        (activeSocket as Socket).disconnect();
      }
    };
  }, [user?.id, storageKey]);

  // Throttled typing indicator emit (at most once every 300ms)
  const emitThrottledTyping = useCallback(
    (partnerSocketId?: string) => {
      const now = Date.now();
      if (now - lastTypingEmitRef.current >= 300) {
        lastTypingEmitRef.current = now;
        try {
          if (socket && isConnected) {
            socket.emit('typing', { partnerSocketId });
          }
        } catch (e) {}
      }
    },
    [socket, isConnected]
  );

  // Buffer messages in sessionStorage so they survive refreshes and send upon reconnection (BUG-002)
  const sendBufferedMessage = useCallback(
    (eventName: string, data: any) => {
      try {
        if (socket && isConnected && socket.connected) {
          socket.emit(eventName, data);
        } else {
          console.log(`Socket offline. Buffering message to sessionStorage: ${eventName}`);
          const item: OfflineMessage = { eventName, data, timestamp: Date.now() };
          offlineQueueRef.current.push(item);
          if (typeof window !== 'undefined') {
            try {
              sessionStorage.setItem(storageKey, JSON.stringify(offlineQueueRef.current));
            } catch (e) {}
          }
        }
      } catch (e) {
        console.warn('sendBufferedMessage notice:', e);
      }
    },
    [socket, isConnected, storageKey]
  );

  const contextValue = useMemo(
    () => ({
      socket,
      isConnected,
      emitThrottledTyping,
      sendBufferedMessage,
    }),
    [socket, isConnected, emitThrottledTyping, sendBufferedMessage]
  );

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
