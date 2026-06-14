/**
 * Распознавание текста с чека (Tesseract, офлайн в браузере). Только из клиентских компонентов.
 */
export async function recognizeReceiptText(file: File): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("rus+eng");
  try {
    const { data } = await worker.recognize(file);
    return String(data.text ?? "")
      .replace(/\s+/g, " ")
      .trim();
  } finally {
    await worker.terminate();
  }
}
