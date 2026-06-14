"use client";

import { useEffect } from "react";

type TelegramWebAppApi = {
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
};

/**
 * Внутри Telegram открывается встроенный браузер (WebApp).
 * Вызываем expand/ready, чтобы интерфейс занимал доступную высоту без лишней «шторки».
 */
export function TelegramWebAppInit() {
  useEffect(() => {
    const tg = (
      window as unknown as {
        Telegram?: { WebApp?: TelegramWebAppApi };
      }
    ).Telegram?.WebApp;
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      tg.disableVerticalSwipes?.();
    } catch {
      // игнорируем старые клиенты Telegram без части методов
    }
  }, []);
  return null;
}
