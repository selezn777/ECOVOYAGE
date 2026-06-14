"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookingIntlPhoneRow } from "@/components/booking-intl-phone-row";
import { GoogleMapsUrlField } from "@/components/google-maps-url-field";
import { useNewBookingDraft } from "@/context/new-booking-draft-context";
import { normalizePhone } from "@/lib/format";

export type ManagerPreset = { id: string; fullName: string };

export type PrefillBookingFields = {
  customerName: string;
  phone: string;
  hotelName: string;
  hotelMapsUrl: string;
  room: string;
  adults: number;
  children: number;
  infants: number;
  note: string;
  telegramUsername: string;
  managerName: string;
  passportPhotoUrls: string[];
};

function validE164(s: string): boolean {
  const n = normalizePhone(String(s || "").trim());
  return n.replace(/\D/g, "").length >= 10;
}

export function IntentPaxHydrator({
  adults,
  children,
  infants,
}: {
  adults: number;
  children: number;
  infants: number;
}) {
  const { setIntentPax } = useNewBookingDraft();
  useEffect(() => {
    setIntentPax({
      adults: Math.max(0, adults),
      children: Math.max(0, children),
      infants: Math.max(0, infants),
    });
  }, [adults, children, infants, setIntentPax]);
  return null;
}

export function NewBookingStepContact({
  managerPreset,
  allowManagerPicker = false,
  prefillBooking = null,
  lockIdentity = Boolean(prefillBooking),
  paymentHrefOverride,
  backHrefOverride,
  backLabel,
}: {
  managerPreset?: ManagerPreset | null;
  allowManagerPicker?: boolean;
  prefillBooking?: PrefillBookingFields | null;
  lockIdentity?: boolean;
  paymentHrefOverride?: string;
  backHrefOverride?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const t = useTranslations("booking");
  const id = useId();
  const {
    tourId,
    intentPax,
    contact,
    setContact,
    setContactStepComplete,
  } = useNewBookingDraft();
  const [salesManagers, setSalesManagers] = useState<ManagerPreset[]>([]);

  const identityLocked = lockIdentity;
  const managerLocked = !!managerPreset || (!!contact.pickedManagerId && salesManagers.length > 0);

  useEffect(() => {
    if (!allowManagerPicker || managerPreset) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users/sales-managers");
        const json = (await res.json()) as { managers?: ManagerPreset[] };
        if (!cancelled && res.ok && Array.isArray(json.managers)) {
          setSalesManagers(json.managers);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowManagerPicker, managerPreset]);

  useEffect(() => {
    if (!prefillBooking) return;
    setContact({
      managerName: prefillBooking.managerName,
      pickedManagerId: managerPreset?.id ?? null,
      customerName: prefillBooking.customerName,
      hotelName: prefillBooking.hotelName,
      hotelMapsUrl: prefillBooking.hotelMapsUrl,
      room: prefillBooking.room,
      phones: [prefillBooking.phone, ""].filter(Boolean),
      telegramUsername: prefillBooking.telegramUsername,
      note: prefillBooking.note,
      prefilledPassportUrls: prefillBooking.passportPhotoUrls,
    });
  }, [prefillBooking, managerPreset?.id, setContact]);

  useEffect(() => {
    if (prefillBooking) return;
    if (managerPreset) {
      setContact({ managerName: managerPreset.fullName, pickedManagerId: managerPreset.id });
    }
  }, [prefillBooking, managerPreset, setContact]);

  const paxLine = useMemo(() => {
    if (!intentPax) return "—";
    const { adults: a, children: c, infants: i } = intentPax;
    const seats = a + c;
    return `${a} ${t("adultsShort")} · ${c} ${t("childrenShort")} · ${i} мл. · мест: ${seats}`;
  }, [intentPax, t]);

  const search = typeof window !== "undefined" ? window.location.search : "";
  const paymentHref = paymentHrefOverride || `/tours/${tourId}/new-booking/payment${search}`;
  const backHref = backHrefOverride || `/tours/${tourId}/new-booking${search}`;

  function goNext() {
    if (!contact.customerName.trim()) {
      alert(t("nameRequired"));
      return;
    }
    const phones = contact.phones.map((p) => normalizePhone(p.trim())).filter((p) => p.replace(/\D/g, "").length >= 6);
    if (!phones.length || !validE164(phones[0])) {
      alert(t("phoneRequired"));
      return;
    }
    if (phones.length > 1 && phones[1] && !validE164(phones[1])) {
      alert(t("phone2Invalid"));
      return;
    }
    setContact({
      phones: phones.length > 1 && phones[1] ? [phones[0], phones[1]] : [phones[0]],
    });
    setContactStepComplete(true);
    router.push(paymentHref);
  }

  return (
    <section className="card space-y-3">
      {allowManagerPicker && !managerPreset && salesManagers.length > 0 ? (
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">{t("managerLabel")}</label>
          <select
            className="field-surface w-full rounded-xl px-3 py-2"
            value={contact.pickedManagerId ?? ""}
            onChange={(e) => {
              const pid = e.target.value || null;
              const m = salesManagers.find((x) => x.id === pid);
              setContact({
                pickedManagerId: pid,
                managerName: m?.fullName ?? "",
              });
            }}
          >
            <option value="">{t("selectManager")}</option>
            {salesManagers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <input
        id={`${id}-mgr`}
        value={contact.managerName}
        readOnly={managerLocked}
        onChange={(e) => setContact({ managerName: e.target.value })}
        placeholder="Имя менеджера"
        className={`field-surface w-full rounded-xl px-3 py-2 ${managerLocked ? "cursor-not-allowed opacity-80" : ""}`}
      />

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text)]">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("groupInfo")}</span>
        <p className="mt-1 tabular-nums">{paxLine}</p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">{t("seatsBooked")}</p>
      </div>

      <input
        value={contact.customerName}
        readOnly={identityLocked}
        onChange={(e) => setContact({ customerName: e.target.value })}
        placeholder="Имя"
        className={`field-surface w-full rounded-xl px-3 py-2 text-sm ${identityLocked ? "cursor-not-allowed opacity-85" : ""}`}
      />

      {contact.phones.map((ph, idx) => (
        <div key={idx} className="flex flex-col gap-1">
          <BookingIntlPhoneRow
            label=""
            value={ph}
            disabled={identityLocked}
            onChange={(e164) => {
              const next = [...contact.phones];
              next[idx] = e164;
              setContact({ phones: next });
            }}
          />
          {idx > 0 && !identityLocked ? (
            <button
              type="button"
              className="self-start text-[12px] text-[var(--muted)] underline-offset-2 hover:underline"
              onClick={() => {
                const next = contact.phones.filter((_, i) => i !== idx);
                setContact({ phones: next.length ? next : [""] });
              }}
            >
              {t("deleteNumber")}
            </button>
          ) : null}
        </div>
      ))}
      {!identityLocked && contact.phones.length < 3 ? (
        <button
          type="button"
          className="text-[12px] font-medium text-[var(--accent)] hover:underline"
          onClick={() => setContact({ phones: [...contact.phones, ""] })}
        >
          {t("addNumber")}
        </button>
      ) : null}

      <input
        value={contact.telegramUsername}
        readOnly={identityLocked}
        onChange={(e) => setContact({ telegramUsername: e.target.value })}
        placeholder="Телеграм ник без @"
        autoComplete="off"
        className={`field-surface w-full rounded-xl px-3 py-2 text-sm ${identityLocked ? "cursor-not-allowed opacity-85" : ""}`}
      />

      <input
        value={contact.hotelName}
        onChange={(e) => setContact({ hotelName: e.target.value })}
        placeholder="Название отеля"
        className="field-surface w-full rounded-xl px-3 py-2 text-sm"
      />
      <GoogleMapsUrlField
        setValue={(v) => setContact({ hotelMapsUrl: v })}
        value={contact.hotelMapsUrl}
        onChange={(v) => setContact({ hotelMapsUrl: v })}
      />
      <input
        value={contact.room}
        onChange={(e) => setContact({ room: e.target.value })}
        placeholder="Номер в отеле"
        className="field-surface w-full rounded-xl px-3 py-2 text-sm"
      />

      <textarea
        value={contact.note}
        onChange={(e) => setContact({ note: e.target.value })}
        placeholder="Комментарий (необязательно)"
        className="field-surface w-full rounded-xl px-3 py-2 text-sm"
        rows={2}
      />

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 text-[12px] text-[var(--muted)]">
        {t("passportAfterSave")}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-elevated)]"
          onClick={() => router.push(backHref)}
        >
          {backLabel ?? t("backLabel")}
        </button>
        <button type="button" className="btn-primary rounded-xl px-4 py-2.5 text-sm font-medium" onClick={goNext}>
          {t("nextLabel")}
        </button>
      </div>
    </section>
  );
}
