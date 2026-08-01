'use client';

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socket;
}
