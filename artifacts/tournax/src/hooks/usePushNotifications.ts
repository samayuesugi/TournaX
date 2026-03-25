import { useEffect, useRef } from "react";
import { customFetch } from "@workspace/api-client-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications(isLoggedIn: boolean) {
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!isLoggedIn || subscribedRef.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    subscribedRef.current = true;

    async function subscribe() {
      try {
        const { publicKey } = await customFetch<{ publicKey: string }>("/api/push/vapid-key");
        if (!publicKey) return;

        const reg = await navigator.serviceWorker.ready;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          if (Notification.permission === "default") {
            const perm = await Notification.requestPermission();
            if (perm !== "granted") return;
          }
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }

        await customFetch("/api/push/subscribe", {
          method: "POST",
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
      } catch {
      }
    }

    subscribe();
  }, [isLoggedIn]);
}
