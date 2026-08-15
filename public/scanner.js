/* Escáner de código de barras por cámara, reusable desde cualquier módulo.
   Mismo motor de dos pasos que ya funciona en producción en sabores-royal
   (caja-venta.html): BarcodeDetector nativo cuando está disponible, con
   @zxing/browser por CDN como respaldo (Safari / navegadores sin soporte nativo). */

const BARCODE_FORMATS_NATIVE = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'codabar', 'itf', 'qr_code'];
let _scanStream = null;
let _scanPollTimer = null;
let _zxingControls = null;
let _zxingLoadPromise = null;

function loadZXingLib() {
  if (window.ZXingBrowser) return Promise.resolve();
  if (_zxingLoadPromise) return _zxingLoadPromise;
  _zxingLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@zxing/browser@0.1.5/umd/index.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar el lector de códigos'));
    document.head.appendChild(s);
  });
  return _zxingLoadPromise;
}

// onDetected(codigo) se llama una sola vez con el código leído; el modal se
// cierra solo apenas detecta algo. Devuelve una función para cerrar/cancelar.
function openBarcodeScanner(onDetected) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="width:420px;">
      <h2 style="margin-top:0;">Escanear código de barras</h2>
      <video id="scan-video" autoplay playsinline muted style="width:100%; border-radius:8px; background:#000; display:block;"></video>
      <p id="scan-status" style="font-size:0.8rem; color:var(--muted); text-align:center; margin:10px 0 0;">Apuntá la cámara al código de barras…</p>
      <div class="modal-actions"><button class="secondary" id="scan-cancelar">Cancelar</button></div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => { stopScanner(); backdrop.remove(); };
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  backdrop.querySelector('#scan-cancelar').onclick = close;

  const setStatus = (msg) => {
    const el = backdrop.querySelector('#scan-status');
    if (el) el.textContent = msg;
  };
  const handleDetected = (code) => {
    if (!code) return;
    close();
    onDetected(code);
  };

  startScanner(handleDetected, setStatus);
  return close;
}

function startScanner(onDetected, setStatus) {
  let decided = false;
  const fallbackTimer = setTimeout(() => { if (!decided) { decided = true; startScannerZXing(onDetected, setStatus); } }, 2500);
  if (window.BarcodeDetector) {
    BarcodeDetector.getSupportedFormats().then((supported) => {
      if (decided) return; decided = true; clearTimeout(fallbackTimer);
      const wanted = BARCODE_FORMATS_NATIVE.filter((f) => supported.includes(f));
      if (wanted.length) startScannerNative(wanted, onDetected, setStatus);
      else startScannerZXing(onDetected, setStatus);
    }).catch(() => { if (decided) return; decided = true; clearTimeout(fallbackTimer); startScannerZXing(onDetected, setStatus); });
  } else {
    decided = true; clearTimeout(fallbackTimer);
    startScannerZXing(onDetected, setStatus);
  }
}

function startScannerNative(formats, onDetected, setStatus) {
  const video = document.getElementById('scan-video');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } }).then((stream) => {
    _scanStream = stream;
    video.srcObject = stream;
    video.play().catch(() => {});
    try {
      const detector = new BarcodeDetector({ formats });
      _scanPollTimer = setInterval(() => {
        if (!video || video.readyState < 2) return;
        detector.detect(video).then((codes) => {
          if (codes && codes.length) onDetected(codes[0].rawValue);
        }).catch(() => {});
      }, 180);
    } catch (e) {
      stopScanner();
      startScannerZXing(onDetected, setStatus);
    }
  }).catch((err) => setStatus('No se pudo abrir la cámara: ' + (err.message || err)));
}

function startScannerZXing(onDetected, setStatus) {
  const video = document.getElementById('scan-video');
  loadZXingLib().then(() => {
    const codeReader = new ZXingBrowser.BrowserMultiFormatReader();
    codeReader.decodeFromConstraints(
      { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
      video,
      (result) => { if (result) onDetected(result.getText()); }
    ).then((controls) => { _zxingControls = controls; })
      .catch((err) => setStatus('No se pudo abrir la cámara: ' + (err.message || err)));
  }).catch((err) => setStatus(err.message));
}

function stopScanner() {
  if (_scanPollTimer) { clearInterval(_scanPollTimer); _scanPollTimer = null; }
  if (_zxingControls) { try { _zxingControls.stop(); } catch (e) {} _zxingControls = null; }
  if (_scanStream) { _scanStream.getTracks().forEach((t) => t.stop()); _scanStream = null; }
  const video = document.getElementById('scan-video');
  if (video) video.srcObject = null;
}
