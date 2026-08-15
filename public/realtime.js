/* Sincronización en vivo entre dispositivos.
   El hosting es serverless (Vercel), así que no hay servidor propio con el
   que mantener un socket abierto. En cambio el browser se conecta directo a
   Supabase Realtime (bypassea nuestra función) y escucha un canal de tipo
   Broadcast: server.js manda un mensaje corto ("cambió esta tabla", sin
   datos) después de cada escritura de stock/productos, y acá simplemente
   reaccionamos volviendo a pedir los datos por la API normal. */

let _rtClient = null;
let _rtChannel = null;
let _rtListeners = [];
let _rtLoadPromise = null;

function loadSupabaseLib() {
  if (window.supabase) return Promise.resolve();
  if (_rtLoadPromise) return _rtLoadPromise;
  _rtLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar el cliente de sincronización'));
    document.head.appendChild(s);
  });
  return _rtLoadPromise;
}

async function initRealtime() {
  if (_rtChannel) return;
  try {
    const { url, anonKey } = await api.config.realtime();
    await loadSupabaseLib();
    _rtClient = window.supabase.createClient(url, anonKey);
    _rtChannel = _rtClient.channel('stock-sync');
    _rtChannel.on('broadcast', { event: 'change' }, (msg) => {
      const table = msg.payload && msg.payload.table;
      _rtListeners.forEach((fn) => { try { fn(table); } catch (e) {} });
    });
    _rtChannel.subscribe();
  } catch (e) {
    console.warn('No se pudo iniciar la sincronización en vivo:', e.message);
  }
}

function stopRealtime() {
  if (_rtChannel && _rtClient) { try { _rtClient.removeChannel(_rtChannel); } catch (e) {} }
  _rtClient = null;
  _rtChannel = null;
  _rtListeners = [];
}

// callback(table) se dispara cada vez que otro dispositivo cambia 'productos' o 'stock_movimientos'.
function onStockChange(callback) {
  _rtListeners.push(callback);
}
