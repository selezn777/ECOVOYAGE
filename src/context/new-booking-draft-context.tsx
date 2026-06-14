"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type NewBookingIntentPax = { adults: number; children: number; infants: number };

export type NewBookingContactDraft = {
  managerName: string;
  pickedManagerId: string | null;
  hotelName: string;
  hotelMapsUrl: string;
  room: string;
  customerName: string;
  /** E.164, минимум один */
  phones: string[];
  telegramUsername: string;
  note: string;
  prefilledPassportUrls?: string[];
};

const emptyContact = (): NewBookingContactDraft => ({
  managerName: "",
  pickedManagerId: null,
  hotelName: "",
  hotelMapsUrl: "",
  room: "",
  customerName: "",
  phones: [""],
  telegramUsername: "",
  note: "",
});

type Ctx = {
  tourId: string;
  /** false до первого чтения sessionStorage (чтобы не редиректить шаг 3 до восстановления черновика). */
  draftHydrated: boolean;
  intentPax: NewBookingIntentPax | null;
  setIntentPax: (p: NewBookingIntentPax | null) => void;
  contact: NewBookingContactDraft;
  setContact: (p: Partial<NewBookingContactDraft>) => void;
  resetContact: () => void;
  passportFiles: File[];
  setPassportFiles: (f: File[] | ((prev: File[]) => File[])) => void;
  contactStepComplete: boolean;
  setContactStepComplete: (v: boolean) => void;
};

const NewBookingDraftContext = createContext<Ctx | null>(null);

function draftStorageKey(tourId: string) {
  return `nb-draft-${tourId}`;
}

export function NewBookingDraftProvider({ tourId, children }: { tourId: string; children: ReactNode }) {
  const [intentPax, setIntentPax] = useState<NewBookingIntentPax | null>(null);
  const [contact, setContactState] = useState<NewBookingContactDraft>(() => emptyContact());
  const [passportFiles, setPassportFiles] = useState<File[]>([]);
  const [contactStepComplete, setContactStepComplete] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(draftStorageKey(tourId));
      if (raw) {
        const d = JSON.parse(raw) as { contact?: NewBookingContactDraft };
        if (d.contact && typeof d.contact === "object") {
          setContactState({ ...emptyContact(), ...d.contact });
        }
      }
    } catch {
      /* ignore */
    }
    setDraftHydrated(true);
  }, [tourId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(draftStorageKey(tourId), JSON.stringify({ contact }));
    } catch {
      /* ignore */
    }
  }, [tourId, contact]);

  const setContact = useCallback((p: Partial<NewBookingContactDraft>) => {
    setContactState((s) => ({ ...s, ...p }));
  }, []);

  const resetContact = useCallback(() => {
    setContactState(emptyContact());
    setPassportFiles([]);
    setContactStepComplete(false);
    try {
      sessionStorage.removeItem(draftStorageKey(tourId));
    } catch {
      /* ignore */
    }
  }, [tourId]);

  const value = useMemo(
    () =>
      ({
        tourId,
        draftHydrated,
        intentPax,
        setIntentPax,
        contact,
        setContact,
        resetContact,
        passportFiles,
        setPassportFiles,
        contactStepComplete,
        setContactStepComplete,
      }) satisfies Ctx,
    [tourId, draftHydrated, intentPax, contact, passportFiles, contactStepComplete, setContact, resetContact],
  );

  return <NewBookingDraftContext.Provider value={value}>{children}</NewBookingDraftContext.Provider>;
}

export function useNewBookingDraft(): Ctx {
  const x = useContext(NewBookingDraftContext);
  if (!x) throw new Error("useNewBookingDraft outside NewBookingDraftProvider");
  return x;
}
