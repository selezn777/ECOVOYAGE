"use client";

import { useState } from "react";

export function UserAvatar({
  fullName,
  url,
  size = 48,
  className = "",
}: {
  fullName: string;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const letter = fullName.trim().slice(0, 1).toUpperCase() || "?";
  const showImg = Boolean(url && !broken);

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-[var(--accent-soft)] to-[var(--surface-soft)] shadow-sm ring-2 ring-[var(--border)] ${className}`}
      style={{ width: size, height: size }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- произвольные URL из профиля
        <img
          src={url!}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-semibold text-[var(--accent)]"
          style={{ fontSize: Math.round(size * 0.38) }}
        >
          {letter}
        </span>
      )}
    </div>
  );
}
