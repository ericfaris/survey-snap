// House app-icon standard (shared with redline/jambo): favicon.ico (16/32/48),
// apple-touch-icon (180), rounded 192/512 and a maskable 512, rendered from
// scripts/icons/icon.svg by scripts/icons/build.py. Next.js emits the head
// links from `metadata.icons` in app/layout.tsx.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const pub = (f: string) => readFileSync(path.join(ROOT, 'public', f));
const PNGS: Record<string, number> = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512, 'icon-maskable-512.png': 512 };

describe('app icons', () => {
  it('ships every PNG at its declared size', () => {
    for (const [file, size] of Object.entries(PNGS)) {
      const b = pub(file);
      expect(b.subarray(1, 4).toString(), file).toBe('PNG');
      expect([b.readUInt32BE(16), b.readUInt32BE(20)], file).toEqual([size, size]);
    }
  });

  it('favicon.ico holds 16, 32 and 48', () => {
    const ico = pub('favicon.ico');
    expect([...ico.subarray(0, 6)]).toEqual([0, 0, 1, 0, 3, 0]);
    expect([ico[6], ico[22], ico[38]]).toEqual([16, 32, 48]);
  });

  it('the manifest lists 192, 512 and the maskable 512', () => {
    const m: { icons: { src: string; purpose?: string }[] } = JSON.parse(pub('manifest.json').toString());
    expect(m.icons.map((i) => i.src)).toEqual(['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']);
    expect(m.icons[2].purpose).toBe('maskable');
  });

  it('layout metadata links the favicon, apple-touch icon and manifest', () => {
    const layout = readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
    expect(layout).toContain("manifest: '/manifest.json'");
    expect(layout).toContain("icon: [{ url: '/favicon.ico', sizes: 'any' }]");
    expect(layout).toContain("apple: [{ url: '/apple-touch-icon.png' }]");
    expect(layout).not.toContain('icon-32.png');
  });

  it('the master SVG has the bg and mark layers build.py expects', () => {
    const svg = readFileSync(path.join(ROOT, 'scripts/icons/icon.svg'), 'utf8');
    expect(svg).toContain('id="bg"');
    expect(svg).toContain('id="mark"');
  });
});
