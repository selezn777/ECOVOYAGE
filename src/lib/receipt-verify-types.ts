export type ReceiptVerifySeverity = "danger" | "warn" | "info";

export type ReceiptVerifyIssue = {
  /** Для дедупликации и тестов */
  code: string;
  severity: ReceiptVerifySeverity;
  title: string;
  detail: string;
};

export type ReceiptVerifyExtracted = {
  totalVnd: number | null;
  /** Даты, найденные в тексте записи / OCR */
  datesYmd: string[];
  paxInText: number | null;
};

export type ReceiptVerifyPayload = {
  source: "gemini" | "local" | "merged";
  /** Что сработало: разбор фото (Gemini) и/или текст в записи */
  methods: ("image" | "text")[];
  issues: ReceiptVerifyIssue[];
  extractedFromText: ReceiptVerifyExtracted;
  /** Если был разбор изображения */
  extractedFromImage?: {
    totalVnd: number | null;
    receiptDateYmd: string | null;
    paxInReceipt: number | null;
  } | null;
  error?: string;
};
