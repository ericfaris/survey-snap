import { execFile } from 'node:child_process';

/** Binary the OCR pipeline shells out to. Override with TESSERACT_BIN. */
export const TESSERACT_BIN = process.env.TESSERACT_BIN || 'tesseract';

export interface TesseractOptions {
  /** Page segmentation mode. 6 = "assume a single uniform block of text". */
  psm?: number;
  /** Extra `-c key=value` config pairs. */
  config?: Record<string, string>;
  timeoutMs?: number;
}

/** Run tesseract over an image buffer via stdin, returning plain text. */
export function runTesseract(image: Buffer, options: TesseractOptions = {}): Promise<string> {
  const { psm = 6, config = {}, timeoutMs = 60_000 } = options;

  const args = ['stdin', 'stdout', '--psm', String(psm)];
  for (const [k, v] of Object.entries(config)) args.push('-c', `${k}=${v}`);

  return new Promise((resolve, reject) => {
    const child = execFile(
      TESSERACT_BIN,
      args,
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const hint =
            (err as NodeJS.ErrnoException).code === 'ENOENT'
              ? ' — tesseract not found on PATH. Run `npm run doctor`.'
              : '';
          reject(new Error(`tesseract failed: ${err.message}${hint}\n${stderr}`));
          return;
        }
        resolve(stdout);
      },
    );
    child.stdin?.on('error', () => {
      /* tesseract may exit before we finish writing; the exec callback reports it */
    });
    child.stdin?.end(image);
  });
}

/** Pass A — full receipt text, used for metadata parsing. */
export function ocrText(image: Buffer): Promise<string> {
  return runTesseract(image, { psm: 6 });
}

/** Pass B — digits only, dedicated to recovering the 26-digit survey code. */
export function ocrDigits(image: Buffer): Promise<string> {
  return runTesseract(image, {
    psm: 6,
    config: {
      tessedit_char_whitelist: '0123456789',
      classify_bln_numeric_mode: '1',
    },
  });
}
