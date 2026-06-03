import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { X, Zap, ZapOff, Camera } from "lucide-react";

interface CameraScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

const beep = () => {
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

const CameraScanner = ({ open, onClose, onDetected }: CameraScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

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
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.ITF,
    ]);
    const reader = new BrowserMultiFormatReader(hints);

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        // Preferimos cámara trasera
        const back = devices.find((d) => /back|rear|trasera|environment/i.test(d.label));
        const deviceId = back?.deviceId ?? devices[0]?.deviceId;

        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result, _err, ctrl) => {
            if (cancelled) return;
            if (result) {
              const text = result.getText();
              if (text) {
                beep();
                ctrl.stop();
                onDetectedRef.current(text);
              }
            }
          },
        );
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;

        // Detectar soporte de linterna
        const stream = videoRef.current?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() as any) || {};
        setTorchSupported(!!caps.torch);
      } catch (e: any) {
        setError(e?.message || "No se pudo iniciar la cámara");
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open]);

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
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          <DrawerDescription>
            Apuntá la cámara al código de barras o QR del producto.
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
              {/* Marco de guía */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[80%] max-w-md h-32 border-2 border-primary rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
              </div>
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
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default CameraScanner;
