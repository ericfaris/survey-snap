'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Receipt capture.
 *
 * Primary path is `<input type="file" capture="environment">` — it opens the
 * native camera app and works over plain HTTP, which matters because the app is
 * served on `http://<LAN-IP>:3000` and `getUserMedia` requires a secure context.
 * The live preview below is progressive enhancement only.
 */
export default function ReceiptCapture() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [liveOn, setLiveOn] = useState(false);

  useEffect(() => {
    setLiveAvailable(
      typeof window !== 'undefined' &&
        window.isSecureContext &&
        !!navigator.mediaDevices?.getUserMedia,
    );
    return () => stopStream();
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function attach(b: Blob) {
    setBlob(b);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(b);
    });
    setError(null);
  }

  async function startLive() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      setLiveOn(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      setError(`Camera unavailable: ${e instanceof Error ? e.message : String(e)}`);
      setLiveOn(false);
    }
  }

  async function shoot() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const b = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    if (b) attach(b);
    stopStream();
    setLiveOn(false);
  }

  async function upload() {
    if (!blob) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('image', blob, 'receipt.jpg');
      const res = await fetch('/api/receipts', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
      router.push(`/receipt/${json.receiptId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Photograph the receipt</h2>
        <p className="muted">
          Get the whole receipt in frame, flat and well lit. The 26-digit survey code is usually
          near the bottom.
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) attach(f);
          }}
        />

        <button className="btn block" onClick={() => fileInput.current?.click()} disabled={busy}>
          📷 Take / choose photo
        </button>

        {liveAvailable && !liveOn && (
          <button
            className="btn secondary block"
            style={{ marginTop: 10 }}
            onClick={startLive}
            disabled={busy}
          >
            Use live camera preview
          </button>
        )}

        {liveOn && (
          <div style={{ marginTop: 12 }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: '100%', borderRadius: 12, background: '#000' }}
            />
            <button className="btn block" style={{ marginTop: 10 }} onClick={shoot}>
              Capture
            </button>
          </div>
        )}

        {!liveAvailable && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Live in-page camera needs HTTPS. Over plain LAN HTTP the button above opens your
            phone&apos;s camera app instead — that works fine.
          </p>
        )}
      </div>

      {preview && (
        <div className="card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Receipt preview"
            style={{ width: '100%', borderRadius: 10, display: 'block' }}
          />
          <button className="btn block" style={{ marginTop: 12 }} onClick={upload} disabled={busy}>
            {busy ? 'Uploading…' : 'Use this photo →'}
          </button>
        </div>
      )}

      {error && <p className="err">{error}</p>}
    </div>
  );
}
