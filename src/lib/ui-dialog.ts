"use client";

type DialogEventDetail =
  | { kind: "alert"; message: string }
  | { kind: "confirm"; message: string; resolve: (ok: boolean) => void }
  | { kind: "prompt"; message: string; defaultValue?: string; resolve: (value: string | null) => void };

const EVENT_NAME = "amx-ui-dialog";

export function showAlert(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DialogEventDetail>(EVENT_NAME, {
      detail: { kind: "alert", message: String(message || "") },
    }),
  );
}

export function showConfirm(message: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(
      new CustomEvent<DialogEventDetail>(EVENT_NAME, {
        detail: { kind: "confirm", message: String(message || ""), resolve },
      }),
    );
  });
}

export function showPrompt(message: string, defaultValue = ""): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise<string | null>((resolve) => {
    window.dispatchEvent(
      new CustomEvent<DialogEventDetail>(EVENT_NAME, {
        detail: { kind: "prompt", message: String(message || ""), defaultValue, resolve },
      }),
    );
  });
}

export function subscribeUiDialog(listener: (detail: DialogEventDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (ev: Event) => {
    const ce = ev as CustomEvent<DialogEventDetail>;
    if (!ce.detail) return;
    listener(ce.detail);
  };
  window.addEventListener(EVENT_NAME, handler as EventListener);
  return () => window.removeEventListener(EVENT_NAME, handler as EventListener);
}
