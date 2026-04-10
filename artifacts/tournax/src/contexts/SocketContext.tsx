import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "./useAuth";

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (!token) {
      setSocket(null);
      return;
    }

    const socketUrl = import.meta.env.VITE_API_URL || "/";
    const s = io(socketUrl, {
      path: "/api/socket.io/",
      auth: { token },
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    s.on("connect", () => {
      socketRef.current = s;
      setSocket(s);
    });

    s.on("connect_error", (err) => {
      console.warn("[socket] connection error:", err.message);
      setSocket(null);
    });

    s.on("disconnect", (reason) => {
      console.warn("[socket] disconnected:", reason);
      setSocket(null);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [token]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
