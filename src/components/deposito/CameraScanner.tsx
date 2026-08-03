import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { X, Zap, ZapOff, Camera, Volume2, VolumeX } from "lucide-react";

interface CameraScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  /** Si true, no cierra el escáner al detectar; ideal para escanear varios ítems seguidos. */
  continuous?: boolean;
  /** Texto/nodo opcional bajo el marco (ej. contador de escaneos). */
  hint?: React.ReactNode;
}

const doBeep = (muted: boolean) => {
  if (muted) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 120);
  } catch {}
  if ("vibrate" in navigator) navigator.vibrate(80);
};

const CameraScanner = ({ open, onClose, onDetected, continuous = false, hint }: CameraScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const mutedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [muted, setMuted] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.AZTEC,
      BarcodeFormat.PDF_417,
      BarcodeFormat.ITF,
      BarcodeFormat.CODABAR,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });

    (async () => {
      try {
        // Pedir permiso primero para que listVideoInputDevices devuelva labels
        let permStream: MediaStream | null = null;
        try {
          permStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch (permErr: any) {
          throw new Error(
            permErr?.name === "NotAllowedError"
              ? "Permiso de cámara denegado. Habilitalo en el navegador."
              : permErr?.message || "No se pudo acceder a la cámara",
          );
        }

        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        // En varios Android/iPhone en español la cámara figura como "posterior" o
        // "mirando hacia atrás". Si no hay etiqueta, la trasera suele ser la última.
        const back = devices.find((d) => /back|rear|trasera|posterior|atr[aá]s|environment/i.test(d.label));
        const deviceId = back?.deviceId ?? devices.at(-1)?.deviceId;

        // Cerrar el stream temporal antes de que ZXing abra el suyo
        permStream?.getTracks().forEach((t) => t.stop());

        const onDecode = (result: any, _err: any, ctrl: IScannerControls) => {
          if (cancelled) return;
          if (!result) return;
          const text = result.getText?.() ?? String(result);
          if (!text) return;
          const now = Date.now();
          const last = lastCodeRef.current;
          if (last && last.code === text && now - last.at < 1500) return;
          lastCodeRef.current = { code: text, at: now };
          doBeep(mutedRef.current);
          setFlash(true);
          setTimeout(() => setFlash(false), 200);
          if (!continuous) ctrl.stop();
          onDetectedRef.current(text);
        };

        let controls: IScannerControls;
        if (deviceId) {
          controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current!, onDecode);
        } else {
          controls = await reader.decodeFromConstraints(
            {
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
              audio: false,
            },
            videoRef.current!,
            onDecode,
          );
        }
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;

        const stream = videoRef.current?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() as any) || {};
        setTorchSupported(!!caps.torch);
        // Las etiquetas Niimbot se leen a corta distancia: mantener autofocus
        // continuo evita que el QR quede visible pero borroso.
        if (track && Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
          try {
            await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] });
          } catch {}
        }
      } catch (e: any) {
        setError(e?.message || "No se pudo iniciar la cámara");
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      lastCodeRef.current = null;
    };
  }, [open, continuous]);

  const toggleTorch = async () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn(!torchOn);
    } catch {}
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="h-[95vh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DrawerTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" /> Escanear código
            </DrawerTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Activar sonido" : "Silenciar"}
              >
                {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <DrawerDescription>
            Apuntá la cámara al código de barras o QR del producto.
            {continuous && " Podés escanear varios seguidos."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="relative flex-1 bg-black overflow-hidden">
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-destructive">
              {error}
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[72vw] max-w-72 aspect-square border-2 border-primary rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
              </div>
              {flash && (
                <div className="absolute inset-0 pointer-events-none bg-primary/30 animate-pulse" />
              )}
              {hint && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                  <div className="bg-black/70 text-white text-xs px-3 py-1.5 rounded-full">
                    {hint}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 flex gap-2 justify-center">
          {torchSupported && (
            <Button variant="outline" onClick={toggleTorch}>
              {torchOn ? <ZapOff className="w-4 h-4 mr-1" /> : <Zap className="w-4 h-4 mr-1" />}
              Linterna
            </Button>
          )}
          <Button variant="outline" onClick={() => setMuted((m) => !m)}>
            {muted ? <VolumeX className="w-4 h-4 mr-1" /> : <Volume2 className="w-4 h-4 mr-1" />}
            {muted ? "Silenciado" : "Sonido"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default CameraScanner;
