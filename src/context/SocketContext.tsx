'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

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
        const res = await fetch('/api/auth/token');
        if (!res.ok) return;
        const { token } = await res.json();

        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
        
        activeSocket = io(socketUrl, {
          auth: { token },
          transports: ['websocket'],
          reconnectionAttempts: 5,
        });

        activeSocket.on('connect', () => {
          setIsConnected(true);
          console.log('Connected to CupidX Socket Server');
        });

        activeSocket.on('disconnect', () => {
          setIsConnected(false);
          console.log('Disconnected from CupidX Socket Server');
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

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
