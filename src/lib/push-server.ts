import webpush from "web-push";

type PushSubscriptionLike = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function ensureConfigured() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "";
  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID env не настроены: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function sendWebPush(
  subscription: PushSubscriptionLike,
  payload: { title: string; body?: string; url?: string },
) {
  ensureConfigured();
  return webpush.sendNotification(subscription as unknown as webpush.PushSubscription, JSON.stringify(payload));
}

