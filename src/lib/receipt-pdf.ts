import { PDFDocument, PDFFont, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/** Текст для печатной квитанции — коротко (полная оферта у клиента отдельно). */
export const RECEIPT_PDF_POLICY_PARAGRAPHS: string[] = [
  "Отмена / перенос: до 17:00 накануне выезда — удержание 30%; в день тура или неявка — 100%.",
  "",
  "Форс-мажор (стихия и т.п.): тур может быть отменён; возврат до 5 раб. дней. Лёгкий дождь — не отмена. Чек сохраните.",
];

export type ReceiptPdfInput = {
  /** Вместо «Квитанция» и № AMX - основной заголовок, например «ON ON000010» */
  receiptHeaderTitle: string;
  tourName: string;
  tourDateLabel: string;
  pickupWindow: string;
  guideName: string;
  customerName: string;
  hotelName: string;
  room: string;
  paxLabel: string;
  /** Строки из booking_prices (несколько услуг); иначе одна «Стоимость» */
  priceLineItems?: { label: string; amountVnd: number }[];
  totalVnd: number;
  paidVnd: number;
  dueVnd: number;
  isFullPaid: boolean;
  managerName: string;
  managerPhone?: string;
  createdAtLabel: string;
};

function formatVndPlain(n: number): string {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} đ`;
}

export type ReceiptPdfAssets = {
  logoPngBytes?: Uint8Array | null;
  paidStampPngBytes?: Uint8Array | null;
  fontRegularBytes: Uint8Array;
  fontMonoBytes: Uint8Array;
};

function clampText(raw: string, max = 120): string {
  const s = String(raw ?? "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function wrapWordsToLines(text: string, pdfFont: PDFFont, fontSize: number, maxWidth: number): string[] {
  const t = String(text ?? "").trim();
  if (!t) return [];
  const words = t.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (pdfFont.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      line = next;
    } else {
      if (line) out.push(line);
      line = pdfFont.widthOfTextAtSize(w, fontSize) <= maxWidth ? w : w;
    }
  }
  if (line) out.push(line);
  return out;
}

export async function buildReceiptPdfBytes(
  input: ReceiptPdfInput,
  assets: ReceiptPdfAssets,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  /** Высота как у короткого листа A5 по высоте — без лишней «простыни»; при переполнении — вторая страница. */
  let page = doc.addPage([320, 780]);
  let { width, height } = page.getSize();
  const font = await doc.embedFont(assets.fontRegularBytes, { subset: true });
  const fontMono = await doc.embedFont(assets.fontMonoBytes, { subset: true });

  const left = 18;
  let right = width - 18;
  let y = height - 18;

  function startNewPage(h = 780) {
    page = doc.addPage([320, h]);
    const sz = page.getSize();
    width = sz.width;
    height = sz.height;
    right = width - 18;
    y = height - 28;
  }

  const line = 13;
  const subtle = rgb(0.35, 0.38, 0.45);
  const ink = rgb(0.1, 0.1, 0.14);

  /** Воздух над линией и под ней (под линией больше - до заголовков «Тур» / «Клиент» / «Оплата»). */
  const hrGapAbove = 10;
  const hrGapBelow = 20;

  function hr() {
    const insetX = 6;
    y -= hrGapAbove;
    page.drawLine({
      start: { x: left + insetX, y },
      end: { x: right - insetX, y },
      thickness: 1,
      color: rgb(0.9, 0.91, 0.94),
    });
    y -= hrGapBelow;
  }

  function row(label: string, value: string) {
    const lbl = clampText(label, 18);
    const val = clampText(value, 42);
    page.drawText(lbl, { x: left, y, size: 9.5, font: fontMono, color: subtle });
    const valueWidth = fontMono.widthOfTextAtSize(val, 10);
    page.drawText(val, { x: Math.max(left + 90, right - valueWidth), y, size: 10, font: fontMono, color: ink });
    y -= line;
  }

  function title(text: string) {
    y -= 3;
    page.drawText(text, { x: left, y, size: 12.5, font, color: ink });
    y -= line + 2;
  }

  // Header with logo + company
  let logoRenderedH = 0;
  if (assets.logoPngBytes && assets.logoPngBytes.length > 0) {
    const img = await doc.embedPng(assets.logoPngBytes);
    const logoW = 64;
    const logoH = (img.height / img.width) * logoW;
    logoRenderedH = logoH;
    page.drawImage(img, { x: left, y: y - logoH + 3, width: logoW, height: logoH });
  } else {
    // If logo is missing, just render the receipt title with a safe offset.
  }
  // After logo we need enough vertical space so the next lines don't overlap.
  // Extra top breathing room so the receipt header is not cramped.
  y -= logoRenderedH > 0 ? Math.round(logoRenderedH + 34) : 34;
  const header = clampText(input.receiptHeaderTitle, 42);
  page.drawText(header, { x: left, y, size: 11.5, font, color: ink });
  y -= 14;
  page.drawText(input.createdAtLabel, { x: left, y, size: 9.5, font: fontMono, color: subtle });
  y -= 10;
  hr();

  title("Тур");
  row("Название", input.tourName);
  row("Дата", input.tourDateLabel);
  row("Сбор", input.pickupWindow);
  row("Гид", input.guideName || "-");
  hr();

  title("Клиент");
  row("Имя", input.customerName);
  row("Отель", input.hotelName || "-");
  row("Комната", input.room || "-");
  row("Группа", input.paxLabel);
  hr();

  title("Оплата");
  const lines = input.priceLineItems?.filter((x) => x.amountVnd > 0) ?? [];
  if (lines.length > 1) {
    for (const it of lines) {
      row(it.label, formatVndPlain(it.amountVnd));
    }
    row("Итого по услугам", formatVndPlain(input.totalVnd));
  } else {
    row("Стоимость", formatVndPlain(input.totalVnd));
  }
  row("Оплачено", formatVndPlain(input.paidVnd));
  row("К доплате", formatVndPlain(input.dueVnd));
  y -= 4;
  page.drawText(`Менеджер: ${clampText(input.managerName, 42)}`, { x: left, y, size: 9.5, font: fontMono, color: subtle });
  y -= 10;
  hr();

  const policyFontSize = 8;
  const policyLead = 9;
  const policyMaxW = right - left;
  /** Равномерный небольшой отступ между блоками «оплата» → «правила» → низ. */
  const sectionGapSmall = 12;

  const policyRows = RECEIPT_PDF_POLICY_PARAGRAPHS.map((raw) => {
    if (raw === "") return { raw, lines: [] as string[], isBlank: true };
    return {
      raw,
      lines: wrapWordsToLines(raw, font, policyFontSize, policyMaxW),
      isBlank: false,
    };
  });
  const policyBlankGap = 6;

  y -= sectionGapSmall;
  title("Правила и контакты");
  y -= 2;
  if (input.managerPhone && input.managerPhone.trim()) {
    const managerContactLine = `Менеджер: ${input.managerPhone.trim()}`;
    page.drawText(managerContactLine, { x: left, y, size: policyFontSize, font, color: subtle });
    y -= policyLead + 2;
  }

  for (const rowDef of policyRows) {
    const raw = rowDef.raw;
    if (rowDef.isBlank) {
      y -= policyBlankGap;
      continue;
    }
    for (const ln of rowDef.lines) {
      if (y < 72) {
        startNewPage(780);
      }
      page.drawText(ln, { x: left, y, size: policyFontSize, font, color: subtle });
      y -= policyLead;
    }
  }

  y -= sectionGapSmall;

  const stampW = 120;
  const stampH = 70;
  const stampX = right - stampW;
  const gapPolicyToStamp = 10;
  const gapStampToCity = 8;

  let stampImg: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  let drawW = 0;
  let drawH = 0;
  let dx = 0;
  if (input.isFullPaid && assets.paidStampPngBytes && assets.paidStampPngBytes.length > 0) {
    const bytes = assets.paidStampPngBytes;
    const isPng =
      bytes.length > 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 && // P
      bytes[2] === 0x4e && // N
      bytes[3] === 0x47 && // G
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;
    stampImg = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const s = Math.min(stampW / stampImg.width, stampH / stampImg.height);
    drawW = stampImg.width * s;
    drawH = stampImg.height * s;
    dx = stampX + (stampW - drawW) / 2;
  }

  /** Высота полосы: отступ + штамп + зазор + строка города (~12pt по вертикали). */
  const footerBandHeight = gapPolicyToStamp + (stampImg ? drawH + gapStampToCity : 6) + 12;
  const minPageBottom = 16;

  if (y < footerBandHeight + minPageBottom) {
    /** Не помещается под текст правил — только штамп и подвал на короткой странице, без «дыры». */
    startNewPage(Math.max(200, footerBandHeight + 48));
    const footerBaseline = 22;
    if (stampImg) {
      const imgBottom = footerBaseline + 10 + (stampH - drawH) / 2;
      page.drawImage(stampImg, { x: dx, y: imgBottom, width: drawW, height: drawH });
    }
    page.drawText("Nha Trang, Vietnam", { x: left, y: footerBaseline, size: 8, font: fontMono, color: subtle });
  } else {
    let cur = y - gapPolicyToStamp;
    if (stampImg) {
      const imgBottom = cur - drawH;
      page.drawImage(stampImg, { x: dx, y: imgBottom, width: drawW, height: drawH });
      cur = imgBottom - gapStampToCity;
    } else {
      cur -= 6;
    }
    page.drawText("Nha Trang, Vietnam", {
      x: left,
      y: Math.max(minPageBottom, cur - 4),
      size: 8,
      font: fontMono,
      color: subtle,
    });
  }

  return doc.save();
}
