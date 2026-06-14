"use client";

import { useEffect, useState } from "react";

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export function PushNotificationsControl() {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function detect() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setEnabled(false);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setEnabled(Boolean(sub));
      } catch {
        if (!cancelled) setEnabled(false);
      }
    }
    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enablePush() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
    if (!vapidKey) {
      alert("Не настроен NEXT_PUBLIC_VAPID_PUBLIC_KEY");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Уведомления не поддерживаются на этом устройстве/браузере.");
      return;
    }
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("Разрешите уведомления в браузере.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { error?: string }).error || "Не удалось сохранить подписку");
      setEnabled(true);
      alert("Push включен.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка включения уведомлений");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe().catch(() => {});
      }
      setEnabled(false);
      alert("Push выключен.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка выключения push");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-[var(--muted)]">
        Входящие внутри приложения работают всегда. Этот переключатель — только для push в шторку телефона.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void (enabled ? disablePush() : enablePush())}
        className="btn-secondary min-h-[44px] w-full justify-start rounded-xl px-3 text-sm font-medium"
      >
        {busy ? "..." : enabled ? "Выключить push на устройстве" : "Включить push на устройстве"}
      </button>
    </div>
  );
}

