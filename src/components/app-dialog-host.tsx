"use client";

import { useEffect, useRef, useState } from "react";
import { showAlert, subscribeUiDialog } from "@/lib/ui-dialog";

type DialogState =
  | { open: false; mode: "alert" | "confirm" | "prompt"; message: string; resolve?: ((ok: boolean) => void) | ((value: string | null) => void); defaultValue?: string }
  | { open: true; mode: "alert" | "confirm" | "prompt"; message: string; resolve?: ((ok: boolean) => void) | ((value: string | null) => void); defaultValue?: string };

const INITIAL: DialogState = { open: false, mode: "alert", message: "" };

export function AppDialogHost() {
  const [state, setState] = useState<DialogState>(INITIAL);
  const [promptValue, setPromptValue] = useState("");
  const patchedRef = useRef(false);

  useEffect(() => {
    const unsub = subscribeUiDialog((detail) => {
      if (detail.kind === "alert") {
        setState({ open: true, mode: "alert", message: detail.message });
        return;
      }
      if (detail.kind === "prompt") {
        setPromptValue(detail.defaultValue || "");
        setState({ open: true, mode: "prompt", message: detail.message, resolve: detail.resolve, defaultValue: detail.defaultValue });
        return;
      }
      setState({ open: true, mode: "confirm", message: detail.message, resolve: detail.resolve });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (patchedRef.current) return;
    patchedRef.current = true;
    const nativeAlert = window.alert.bind(window);
    window.alert = (message?: unknown) => {
      try {
        showAlert(String(message ?? ""));
      } catch {
        nativeAlert(message as string);
      }
    };
  }, []);

  function closeAlert() {
    setState(INITIAL);
  }

  function answerConfirm(ok: boolean) {
    const resolve = state.resolve as ((ok: boolean) => void) | undefined;
    setState(INITIAL);
    resolve?.(ok);
  }

  function answerPrompt(value: string | null) {
    const resolve = state.resolve as ((value: string | null) => void) | undefined;
    setState(INITIAL);
    setPromptValue("");
    resolve?.(value);
  }

  if (!state.open) return null;

  return (
    <div className="ui-scrim fixed inset-0 z-[220] flex items-center justify-center p-4" onClick={() => (state.mode === "alert" ? closeAlert() : state.mode === "confirm" ? answerConfirm(false) : answerPrompt(null))}>
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={state.mode === "confirm" ? "Подтверждение" : state.mode === "prompt" ? "Ввод" : "Сообщение"}
      >
        <h2 className="text-base font-semibold text-[var(--text)]">{state.mode === "confirm" ? "Подтверждение" : state.mode === "prompt" ? "Введите значение" : "Сообщение"}</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--text)]">{state.message}</p>
        {state.mode === "prompt" ? (
          <input
            className="field-surface mt-3 w-full rounded-xl px-3 py-2 text-sm"
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            autoFocus
          />
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {state.mode === "confirm" ? (
            <>
              <button type="button" className="btn-secondary rounded-xl px-4 py-2" onClick={() => answerConfirm(false)}>
                Отмена
              </button>
              <button type="button" className="btn-primary rounded-xl px-4 py-2" onClick={() => answerConfirm(true)}>
                Подтвердить
              </button>
            </>
          ) : state.mode === "prompt" ? (
            <>
              <button type="button" className="btn-secondary rounded-xl px-4 py-2" onClick={() => answerPrompt(null)}>
                Отмена
              </button>
              <button type="button" className="btn-primary rounded-xl px-4 py-2" onClick={() => answerPrompt(promptValue)}>
                Ок
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary rounded-xl px-4 py-2" onClick={closeAlert}>
              Ок
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
