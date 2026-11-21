import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, RefreshCw, SwitchCamera, Upload } from 'lucide-react';

export interface ScannedQrPayload {
  raw: string;
  address: string;
  amount?: string;
  memo?: string;
}

interface QrScannerPanelProps {
  onDetected: (payload: ScannedQrPayload) => void;
}

export function parseDemoCoinQr(rawText: string): ScannedQrPayload {
  const trimmed = rawText.trim();
  if (trimmed.toLowerCase().startsWith('democoin:')) {
    const withoutScheme = trimmed.slice('democoin:'.length);
    const [addressPart, queryPart] = withoutScheme.split('?');
    const params = new URLSearchParams(queryPart || '');
    const amount = params.get('amount') || undefined;
    const memo = params.get('memo') || undefined;
    return {
      raw: trimmed,
      address: (addressPart || '').trim(),
      amount,
      memo,
    };
  }
  return {
    raw: trimmed,
    address: trimmed,
  };
}

export function QrScannerPanel({ onDetected }: QrScannerPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(
    async (preferredFacing: 'environment' | 'user' = facingMode) => {
      stopCamera();
      setCameraError(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Camera access is unavailable in this browser context. Use "Upload QR Image" below instead.',
        );
        return;
      }

      setStarting(true);
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: preferredFacing } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;

        if (navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices
            .enumerateDevices()
            .then((devices) => {
              const videoInputs = devices.filter((d) => d.kind === 'videoinput');
              setHasMultipleCameras(videoInputs.length > 1);
            })
            .catch(() => {});
        }

        const video = videoRef.current;
        if (!video) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        video.srcObject = stream;
        await video.play();
        setCameraActive(true);

        let lastScanTime = 0;
        const scanLoop = (timestamp: number) => {
          const vid = videoRef.current;
          const canvas = canvasRef.current;
          if (!vid || !canvas || !streamRef.current) return;

          if (timestamp - lastScanTime >= 90 && vid.readyState === vid.HAVE_ENOUGH_DATA) {
            lastScanTime = timestamp;
            const width = vid.videoWidth;
            const height = vid.videoHeight;
            if (width > 0 && height > 0) {
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(vid, 0, 0, width, height);
                const imgData = ctx.getImageData(0, 0, width, height);
                const code = jsQR(imgData.data, width, height, {
                  inversionAttempts: 'attemptBoth',
                });
                if (code && code.data && code.data.trim()) {
                  const parsed = parseDemoCoinQr(code.data);
                  stopCamera();
                  onDetected(parsed);
                  return;
                }
              }
            }
          }
          rafRef.current = requestAnimationFrame(scanLoop);
        };

        rafRef.current = requestAnimationFrame(scanLoop);
      } catch (err) {
        const msg =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Enable camera access in your browser settings or upload a QR image below.'
            : err instanceof DOMException && err.name === 'NotFoundError'
              ? 'No camera device was detected. You can still scan any QR image file below.'
              : 'Unable to start camera stream. Try again or upload a QR image file below.';
        setCameraError(msg);
      } finally {
        setStarting(false);
      }
    },
    [facingMode, onDetected, stopCamera],
  );

  useEffect(() => {
    void startCamera('environment');
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const handleFlipCamera = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    void startCamera(next);
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCameraError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          setCameraError('Unable to decode image in this browser.');
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, canvas.width, canvas.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (code && code.data && code.data.trim()) {
          stopCamera();
          onDetected(parseDemoCoinQr(code.data));
        } else {
          setCameraError('No readable QR code was found in that image. Try a clearer QR image.');
        }
      };
      img.onerror = () => {
        setCameraError('Could not load the selected image file.');
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-full w-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* Framing brackets */}
        {cameraActive && (
          <div className="pointer-events-none absolute inset-6">
            <span className="absolute left-0 top-0 h-5 w-5 border-l-2 border-t-2 border-emerald-400 rounded-tl-sm" />
            <span className="absolute right-0 top-0 h-5 w-5 border-r-2 border-t-2 border-emerald-400 rounded-tr-sm" />
            <span className="absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2 border-emerald-400 rounded-bl-sm" />
            <span className="absolute bottom-0 right-0 h-5 w-5 border-b-2 border-r-2 border-emerald-400 rounded-br-sm" />
          </div>
        )}

        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center text-slate-300">
            {starting ? (
              <>
                <RefreshCw className="h-7 w-7 animate-spin text-emerald-400 mb-2" />
                <span className="text-xs font-medium">Starting camera...</span>
              </>
            ) : (
              <>
                <CameraOff className="h-7 w-7 text-slate-400 mb-2" />
                <span className="text-xs text-slate-300">
                  {cameraError ? 'Camera preview paused' : 'Camera stopped'}
                </span>
              </>
            )}
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {cameraError && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900"
        >
          {cameraError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {cameraActive ? (
          <button
            type="button"
            onClick={stopCamera}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CameraOff className="h-3.5 w-3.5" />
            Stop Camera
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startCamera(facingMode)}
            disabled={starting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="h-3.5 w-3.5" />
            {starting ? 'Starting...' : 'Start Camera'}
          </button>
        )}

        {hasMultipleCameras && cameraActive && (
          <button
            type="button"
            onClick={handleFlipCamera}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SwitchCamera className="h-3.5 w-3.5" />
            Switch Camera
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
          aria-label="Upload QR code image"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload QR Image
        </button>
      </div>

      <p className="text-center text-xs text-slate-500">
        Point your camera at any DemoCoin QR code to capture and share the wallet address.
      </p>
    </div>
  );
}
