import { useEffect } from "react";
import { setToken } from "@/lib/auth";

export default function AuthCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const error = params.get("error");

    if (error || !token) {
      window.location.href = "/auth";
      return;
    }

    setToken(token);
    window.location.href = "/";
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
