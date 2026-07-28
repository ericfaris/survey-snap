import sharp from 'sharp';

/**
 * Thermal-paper receipts are low-contrast, curled and often shot at an angle.
 * Most of the OCR accuracy comes from this step, not from tesseract tuning.
 */

/** General-purpose variant: readable text for metadata parsing. */
export async function preprocessForText(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate() // honour EXIF
    .greyscale()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: false })
    .normalise()
    .linear(1.25, -20)
    .sharpen()
    .png()
    .toBuffer();
}

/**
 * Digits variant: harder contrast + a binary threshold, aimed at the 26-digit
 * survey code, which is the single highest-value extraction on the receipt.
 */
export async function preprocessForDigits(input: Buffer, threshold = 140): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .greyscale()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: false })
    .normalise()
    .linear(1.6, -45)
    .sharpen()
    .threshold(threshold)
    .png()
    .toBuffer();
}

export interface PreprocessedVariants {
  text: Buffer;
  digits: Buffer;
}

export async function preprocess(input: Buffer): Promise<PreprocessedVariants> {
  const [text, digits] = await Promise.all([
    preprocessForText(input),
    preprocessForDigits(input),
  ]);
  return { text, digits };
}
