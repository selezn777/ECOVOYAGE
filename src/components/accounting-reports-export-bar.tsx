"use client";

type Props = {
  fromYmd: string;
  toYmd: string;
  /** Подставляется в имя JSON-файла вместо `from_to`, если задан (например «за всё время»). */
  downloadBaseName?: string;
};

const btnBase =
  "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium transition-colors touch-manipulation active:opacity-90";

export function AccountingReportsExportBar({ fromYmd, toYmd, downloadBaseName }: Props) {
  const q = `from=${encodeURIComponent(fromYmd)}&to=${encodeURIComponent(toYmd)}`;
  const base = `/api/accounting/reports/export?${q}`;
  const jsonStem = downloadBaseName ?? `otchyot-${fromYmd}_${toYmd}`;

  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        Выгрузка строится по выбранному периоду
        {downloadBaseName ? " (включая режим «за всё время»)" : ""}. JSON - для скриптов и архива; Excel с цветовыми группами по
        налоговому статусу
        сотрудников. «Красный» файл - только ориентир МРОТ по зоне и банковские переводы в ₫ из ручного журнала (без наличных и
        валюты).
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          className={`${btnBase} border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] hover:bg-[var(--surface-soft)] dark:ring-white/[0.06]`}
          href={`${base}&file=json`}
          download={`${jsonStem}.json`}
        >
          Скачать JSON
        </a>
        <a
          className={`${btnBase} border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] hover:bg-[var(--surface-soft)] dark:ring-white/[0.06]`}
          href={`${base}&file=white`}
          download
        >
          Белый файл (Excel)
        </a>
        <a
          className={`${btnBase} border border-red-300/60 bg-red-50/90 text-red-950 shadow-[var(--shadow-sm)] ring-1 ring-red-200/70 hover:bg-red-100/90 dark:border-red-800/55 dark:bg-red-950/35 dark:text-red-100 dark:ring-red-900/40 dark:hover:bg-red-950/55`}
          href={`${base}&file=red`}
          download
        >
          Красный файл (Excel)
        </a>
      </div>
    </div>
  );
}
