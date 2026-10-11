import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { X, Zap, ZapOff, Camera, ScanText, ImageUp, ZoomIn, ZoomOut, Volume2, VolumeX } from "lucide-react";

interface CameraScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  /** Lectura de texto impreso en el dispositivo (sin IA ni créditos). */
  onDetectedText?: (text: string) => void;
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

const OCR_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let scriptPromise: Promise<void> | null = null;
const cargarOcrLocal = async (): Promise<any> => {
  if ((window as any).Tesseract) return (window as any).Tesseract;
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = OCR_SCRIPT;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { script.remove(); reject(new Error("No se pudo cargar el lector de texto")); };
      document.head.appendChild(script);
    }).catch((error) => { scriptPromise = null; throw error; });
  }
  await scriptPromise;
  if (!(window as any).Tesseract) throw new Error("El lector de texto no está disponible");
  return (window as any).Tesseract;
};

const CameraScanner = ({ open, onClose, onDetected, onDetectedText, continuous = false, hint }: CameraScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const zoomRangeRef = useRef<{ min: number; max: number } | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const mutedRef = useRef(false);
  const readingTextRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [muted, setMuted] = useState(false);
  const [flash, setFlash] = useState(false);
  const [readingText, setReadingText] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [zoomAvailable, setZoomAvailable] = useState(false);
  const [readingImage, setReadingImage] = useState(false);

  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let nativeTimer: number | null = null;
    setError(null);
    setOcrError(null);
    setZoomAvailable(false);
    setZoom(1);
    zoomRangeRef.current = null;

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
        // Evitar lentes ultrawide o macro, que no enfocan bien QR térmicos.
        const backCameras = devices.filter((d) => /back|rear|trasera|posterior|atr[aá]s|environment/i.test(d.label));
        const mainCamera = backCameras.find((d) => !/ultra|wide|gran angular|macro|tele|depth|0\.5x/i.test(d.label));
        const deviceId = (mainCamera || backCameras[0])?.deviceId;
        permStream?.getTracks().forEach((t) => t.stop());

        const onDecode = (result: any, _err: any, ctrl: IScannerControls) => {
          if (cancelled || readingTextRef.current) return;
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

        // decodeFromVideoDevice abre otra cámara con resolución por defecto.
        // Conservar HD para que el QR de una etiqueta pequeña tenga suficientes píxeles.
        let controls: IScannerControls;
        try {
          controls = await reader.decodeFromConstraints({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 }, height: { ideal: 1080 },
              ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
            }, audio: false,
          }, videoRef.current!, onDecode);
        } catch (firstError) {
          if (!deviceId) throw firstError;
          controls = await reader.decodeFromConstraints({
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
          }, videoRef.current!, onDecode);
        }
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;
        // BarcodeDetector nativo, disponible en algunos Android: complementa ZXing
        // sin reemplazarlo ni depender de servicios externos.
        const NativeBarcodeDetector = (window as any).BarcodeDetector;
        if (NativeBarcodeDetector) {
          try {
            const formats = ["qr_code", "code_128", "ean_13", "ean_8", "code_39", "upc_a", "upc_e", "data_matrix", "pdf417"];
            const supported = await NativeBarcodeDetector.getSupportedFormats();
            const chosen = formats.filter((format) => supported.includes(format));
            if (chosen.length && !cancelled) {
              const detector = new NativeBarcodeDetector({ formats: chosen });
              const scanNative = async () => {
                if (cancelled) return;
                const video = videoRef.current;
                try {
                  if (video?.readyState && video.readyState >= 2 && !readingTextRef.current) {
                    const found = (await detector.detect(video)) as Array<{
                      rawValue: string;
                      boundingBox?: { width: number; height: number };
                    }>;
                    if (cancelled) return;
                    // Si hay varios QR, priorizar el más cercano / grande.
                    const best = found?.filter((x) => x.rawValue)
                      .sort((a, b) =>
                        ((b.boundingBox?.width || 0) * (b.boundingBox?.height || 0)) -
                        ((a.boundingBox?.width || 0) * (a.boundingBox?.height || 0)))[0];
                    if (best) {
                      onDecode({ getText: () => best.rawValue }, null, controls);
                      if (!continuous) return;
                    }
                  }
                } catch { /* ZXing sigue leyendo en paralelo. */ }
                if (!cancelled) nativeTimer = window.setTimeout(() => { void scanNative(); }, 350);
              };
              nativeTimer = window.setTimeout(() => { void scanNative(); }, 450);
            }
          } catch { /* El dispositivo continúa con ZXing. */ }
        }

        const stream = videoRef.current?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() as any) || {};
        setTorchSupported(!!caps.torch);
        if (typeof caps.zoom?.min === "number" && typeof caps.zoom?.max === "number"
            && caps.zoom.max > caps.zoom.min) {
          zoomRangeRef.current = { min: caps.zoom.min, max: caps.zoom.max };
          setZoomAvailable(true);
          setZoom(Math.max(caps.zoom.min, Math.min(caps.zoom.max, 1)));
        }
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
      if (nativeTimer !== null) window.clearTimeout(nativeTimer);
      controlsRef.current?.stop();
      controlsRef.current = null;
      lastCodeRef.current = null;
      zoomRangeRef.current = null;
    };
  }, [open, continuous]);

  const leerTexto = async () => {
    if (readingTextRef.current || !onDetectedText) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setOcrError("La cámara todavía no está lista.");
      return;
    }
    readingTextRef.current = true;
    setReadingText(true);
    setOcrError(null);
    try {
      // Tomamos la foto en resolución real, no la imagen reducida de la pantalla.
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo capturar la imagen");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      let texto = "";
      // Si Android dispone de OCR nativo, primero se utiliza sin descargar nada.
      const NativeTextDetector = (window as any).TextDetector;
      if (NativeTextDetector) {
        try {
          const blocks = await new NativeTextDetector().detect(canvas);
          texto = (blocks as Array<{ rawValue?: string }>).map((b) => b.rawValue || "").join("\n").trim();
        } catch { /* Usar el lector local alternativo. */ }
      }
      if (texto.length < 8) {
        // OCR en el propio teléfono; no subimos imágenes, no usamos IA de pago.
        const tesseract = await cargarOcrLocal();
        const result = await tesseract.recognize(canvas, "spa");
        texto = (result?.data?.text || "").trim();
      }
      if (!texto) {
        setOcrError("No se pudo leer. Acercá la cámara hasta que el nombre y número se vean grandes y probá otra vez.");
      } else {
        onDetectedText(texto);
      }
    } catch {
      setOcrError("No se pudo leer el texto en este dispositivo. Podés buscar el pedido manualmente.");
    } finally {
      readingTextRef.current = false;
      setReadingText(false);
    }
  };

  const changeZoom = async (factor: number) => {
    const track = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    const range = zoomRangeRef.current;
    if (!track || !range) return;
    const nextZoom = Math.min(range.max, Math.max(range.min, factor));
    try {
      await track.applyConstraints({ advanced: [{ zoom: nextZoom } as any] });
      setZoom(nextZoom);
    } catch {
      setOcrError("No se pudo ajustar el zoom. Acercá la cámara al código.");
    }
  };

  // Lee una foto de forma local cuando el autofocus del teléfono falla.
  // No sube imágenes al servidor ni utiliza servicios de pago.
  const readImageFile = async (file: File | null) => {
    if (!file || readingImage) return;
    setReadingImage(true);
    setOcrError(null);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Imagen inválida"));
      });
      img.src = url;
      await loaded;
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      const imageReader = new BrowserMultiFormatReader(hints);
      const result = await imageReader.decodeFromImageElement(img);
      const code = result.getText();
      if (!code) throw new Error("Código vacío");
      onDetectedRef.current(code);
    } catch {
      setOcrError("No pude leer el QR de la foto. Probá acercarte más y encuadrar una sola etiqueta.");
    } finally {
      URL.revokeObjectURL(url);
      if (fileRef.current) fileRef.current.value = "";
      setReadingImage(false);
    }
  };

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
            {onDetectedText
              ? "Apuntá al QR o código de barras. Para etiquetas con nombre o número impreso, acercate y tocá Leer texto."
              : "Apuntá la cámara al código de barras o QR del producto."}
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
                <div className={onDetectedText
                  ? "w-[85vw] max-w-[420px] aspect-[4/3] border-2 border-primary rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                  : "w-[72vw] max-w-72 aspect-square border-2 border-primary rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"} />
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

        {ocrError && (
          <p role="alert" className="px-4 pt-2 text-sm text-amber-400 text-center">{ocrError}</p>
        )}
        <div className="px-4 pt-2 flex flex-wrap gap-2 justify-center">
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(event) => { void readImageFile(event.target.files?.[0] || null); }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}
            disabled={readingImage || !!error}>
            <ImageUp className="w-4 h-4 mr-1" />
            {readingImage ? "Leyendo foto..." : "Leer desde foto"}
          </Button>
          {zoomAvailable && <>
            <Button variant="outline" size="sm" aria-label="Alejar código" onClick={() => { void changeZoom(zoom / 1.5); }}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground self-center">{zoom.toFixed(1)}×</span>
            <Button variant="outline" size="sm" aria-label="Acercar código" onClick={() => { void changeZoom(zoom * 1.5); }}>
              <ZoomIn className="w-4 h-4" />
            </Button>
          </>}
        </div>
        <div className="p-4 flex flex-wrap gap-2 justify-center">
          {onDetectedText && (
            <Button onClick={() => { void leerTexto(); }} disabled={readingText || !!error}>
              <ScanText className="w-4 h-4 mr-1" />
              {readingText ? "Leyendo etiqueta..." : "Leer texto impreso"}
            </Button>
          )}
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
