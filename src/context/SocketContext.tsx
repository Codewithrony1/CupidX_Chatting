'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
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
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Offline message buffer queue for zero message drops during network blips
  const offlineQueueRef = useRef<OfflineMessage[]>([]);
  const lastTypingEmitRef = useRef<number>(0);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    let activeSocket: Socket | null = null;

    const initSocket = async () => {
      try {
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
        // Don't try to connect if no socket URL configured or it's localhost in production
        if (!socketUrl || (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && socketUrl.includes('localhost'))) {
          return;
        }

        const res = await fetch('/api/auth/token');
        if (!res.ok) {
          return;
        }
        const { token } = await res.json();

        activeSocket = io(socketUrl, {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,          // Limited retries — don't spam
          reconnectionDelay: 2000,
          reconnectionDelayMax: 10000,
          randomizationFactor: 0.5,
          timeout: 5000,
        });

        activeSocket.on('connect', () => {
          setIsConnected(true);
          console.log('⚡ Connected to CupidX Real-Time WebSocket');

          // Flush offline message buffer upon connection/reconnection
          if (offlineQueueRef.current.length > 0 && activeSocket) {
            console.log(`Flushing ${offlineQueueRef.current.length} buffered offline messages...`);
            const pending = [...offlineQueueRef.current];
            offlineQueueRef.current = [];
            pending.forEach((item) => {
              activeSocket?.emit(item.eventName, item.data);
            });
          }
        });

        activeSocket.on('disconnect', (reason) => {
          setIsConnected(false);
          console.log('Socket disconnected:', reason);
        });

        activeSocket.on('connect_error', (err) => {
          console.warn('Socket reconnection attempt error:', err.message);
        });

        setSocket(activeSocket);
      } catch (err) {
        console.error('Socket initialization failed:', err);
      }
    };

    initSocket();

    return () => {
      if (activeSocket) {
        (activeSocket as Socket).disconnect();
      }
    };
  }, [user]);

  // Throttled typing indicator emit (at most once every 300ms)
  const emitThrottledTyping = useCallback(
    (partnerSocketId?: string) => {
      const now = Date.now();
      if (now - lastTypingEmitRef.current >= 300) {
        lastTypingEmitRef.current = now;
        if (socket && isConnected) {
          socket.emit('typing', { partnerSocketId });
        }
      }
    },
    [socket, isConnected]
  );

  // Buffer messages if offline so they send the instant socket reconnects
  const sendBufferedMessage = useCallback(
    (eventName: string, data: any) => {
      if (socket && isConnected) {
        socket.emit(eventName, data);
      } else {
        console.log(`Socket offline. Buffering message: ${eventName}`);
        offlineQueueRef.current.push({ eventName, data, timestamp: Date.now() });
      }
    },
    [socket, isConnected]
  );

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        emitThrottledTyping,
        sendBufferedMessage,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
