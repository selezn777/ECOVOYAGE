"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useRef } from "react";

type SaveFn = () => Promise<boolean>;

type Ctx = {
  registerManifestSave: (handlers: { saveDraft: SaveFn; saveFinal: SaveFn } | null) => void;
  runManifestSaveDraft: () => Promise<boolean>;
  runManifestSaveFinal: () => Promise<boolean>;
};

const AccountingActionsContext = createContext<Ctx | null>(null);

export function AccountingActionsProvider({ children }: { children: ReactNode }) {
  const draftRef = useRef<SaveFn | null>(null);
  const finalRef = useRef<SaveFn | null>(null);

  const registerManifestSave = useCallback((handlers: { saveDraft: SaveFn; saveFinal: SaveFn } | null) => {
    if (!handlers) {
      draftRef.current = null;
      finalRef.current = null;
      return;
    }
    draftRef.current = handlers.saveDraft;
    finalRef.current = handlers.saveFinal;
  }, []);

  const runManifestSaveDraft = useCallback(async () => {
    const fn = draftRef.current;
    if (!fn) return true;
    return fn();
  }, []);

  const runManifestSaveFinal = useCallback(async () => {
    const fn = finalRef.current;
    if (!fn) return true;
    return fn();
  }, []);

  const value = useMemo(
    () => ({ registerManifestSave, runManifestSaveDraft, runManifestSaveFinal }),
    [registerManifestSave, runManifestSaveDraft, runManifestSaveFinal],
  );

  return <AccountingActionsContext.Provider value={value}>{children}</AccountingActionsContext.Provider>;
}

export function useAccountingActions(): Ctx {
  const c = useContext(AccountingActionsContext);
  if (!c) {
    return {
      registerManifestSave: () => {},
      runManifestSaveDraft: async () => true,
      runManifestSaveFinal: async () => true,
    };
  }
  return c;
}
