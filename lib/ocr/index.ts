import { preprocess } from './preprocess';
import { ocrDigits, ocrText } from './tesseract';
import { bestCode, extractCodeCandidates } from './extractCode';
import { extractMetadata } from './extractMetadata';
import type { OcrResult } from '../types';

/** Full OCR pipeline for one receipt photo. */
export async function ocrReceipt(image: Buffer): Promise<OcrResult> {
  const variants = await preprocess(image);
  const [textPass, digitPass] = await Promise.all([
    ocrText(variants.text),
    ocrDigits(variants.digits),
  ]);

  const codeCandidates = extractCodeCandidates(textPass, digitPass);

  return {
    rawText: textPass,
    codeCandidates,
    bestCode: bestCode(codeCandidates),
    metadata: extractMetadata(textPass),
  };
}

export * from './extractCode';
export * from './extractMetadata';
