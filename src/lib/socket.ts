'use client';

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 10000,
    });

    // When user switches back to the app/tab, force reconnect if disconnected
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && socket && !socket.connected) {
          socket.connect();
        }
      });
    }
  }
  return socket;
}
