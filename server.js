import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const port = process.env.PORT || 3000;

if (!supabaseUrl || !supabaseServiceRole || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRole);
const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);
const app = express();

// ── Sincronización en vivo ──
// El hosting es una función serverless (sin proceso persistente), así que no
// podemos mantener un socket propio abierto entre dispositivos. En cambio,
// después de cada escritura relevante mandamos un mensaje corto (sin datos,
// solo "cambió esta tabla") por un canal de Supabase Realtime Broadcast; el
// browser se conecta directo a Supabase (bypassea esta función) y al recibirlo
// vuelve a pedir los datos por la API normal, que ya respeta permisos.
const syncChannel = supabase.channel('stock-sync');
syncChannel.subscribe();
function notifyChange(table) {
  syncChannel.send({ type: 'broadcast', event: 'change', payload: { table } }).catch(() => {});
}

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// ── Autenticación (Supabase Auth + perfiles con permisos por módulo) ──
const AUTH_COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 3600 * 1000 };

function setAuthCookies(res, session) {
  res.cookie('sb_at', session.access_token, AUTH_COOKIE_OPTS);
  res.cookie('sb_rt', session.refresh_token, AUTH_COOKIE_OPTS);
}

async function requireAuth(req, res, next) {
  const at = req.cookies?.sb_at;
  const rt = req.cookies?.sb_rt;
  if (!at) return res.status(401).json({ error: 'No autenticado' });

  let { data: userData, error } = await supabaseAuthClient.auth.getUser(at);
  if (error || !userData?.user) {
    if (!rt) return res.status(401).json({ error: 'Sesión expirada' });
    const { data: refreshed, error: refreshError } = await supabaseAuthClient.auth.refreshSession({ refresh_token: rt });
    if (refreshError || !refreshed?.session) return res.status(401).json({ error: 'Sesión expirada' });
    setAuthCookies(res, refreshed.session);
    userData = { user: refreshed.session.user };
  }

  const { data: perfil, error: perfilError } = await supabase.from('perfiles').select('*').eq('id', userData.user.id).single();
  if (perfilError || !perfil || perfil.activo === false) {
    return res.status(401).json({ error: 'Tu usuario no tiene un perfil activo en el sistema' });
  }

  req.user = { id: userData.user.id, email: userData.user.email, nombre: perfil.nombre, rol: perfil.rol, permisos: perfil.permisos || [] };
  next();
}

function requireModule(key) {
  return (req, res, next) => {
    if (req.user.rol === 'admin' || (req.user.permisos || []).includes(key)) return next();
    res.status(403).json({ error: 'No tenés permiso para acceder a este módulo' });
  };
}

// Para acciones que ambos módulos necesitan (ej: gestionar productos desde
// Stock además de desde Catálogo), alcanza con tener el permiso de cualquiera.
function requireAnyModule(...keys) {
  return (req, res, next) => {
    if (req.user.rol === 'admin' || keys.some((k) => (req.user.permisos || []).includes(k))) return next();
    res.status(403).json({ error: 'No tenés permiso para acceder a este módulo' });
  };
}

function requireAdmin(req, res, next) {
  if (req.user.rol === 'admin') return next();
  res.status(403).json({ error: 'Solo el administrador puede hacer esto' });
}

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son obligatorios' });

  const { data, error } = await supabaseAuthClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) return res.status(401).json({ error: 'Credenciales inválidas' });

  const { data: perfil, error: perfilError } = await supabase.from('perfiles').select('*').eq('id', data.user.id).single();
  if (perfilError || !perfil || perfil.activo === false) {
    return res.status(403).json({ error: 'Tu usuario no tiene un perfil activo en el sistema. Contactá al administrador.' });
  }

  setAuthCookies(res, data.session);
  res.json({ id: perfil.id, email: data.user.email, nombre: perfil.nombre, rol: perfil.rol, permisos: perfil.permisos });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('sb_at', AUTH_COOKIE_OPTS);
  res.clearCookie('sb_rt', AUTH_COOKIE_OPTS);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));

app.get('/api/realtime-config', requireAuth, (req, res) => {
  res.json({ url: supabaseUrl, anonKey: supabaseAnonKey });
});

app.use('/api', requireAuth);
// Igual que productos/clientes: la alerta de stock bajo la puede leer
// cualquier usuario logueado (por ejemplo, para la card del Dashboard),
// aunque no tenga permiso de edición del módulo Stock.
app.get('/api/stock/alertas', async (req, res) => {
  const { data, error } = await supabase
    .from('productos').select('*')
    .eq('activo', true)
    .order('nombre', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).filter((p) => p.stock <= (p.stock_minimo || 0)));
});
// Clientes, profesionales, servicios y productos son datos de referencia que
// necesitan leerse desde varios módulos (Calendario, Facturación, etc.), así
// que su lectura queda disponible para cualquier usuario logueado. Solo las
// operaciones de edición quedan detrás del permiso del módulo dueño del dato.
app.use('/api/agenda', requireModule('calendario'));
app.use('/api/turnos', requireModule('calendario'));
app.use('/api/ventas', requireModule('facturacion'));
app.use('/api/egresos', requireModule('egresos'));
app.use('/api/resumen', requireModule('dashboard'));
app.use('/api/reportes', requireModule('reportes'));
app.use('/api/marketing', requireModule('marketing'));
app.use('/api/mensajes-enviados', requireModule('marketing'));
app.use('/api/stock', requireModule('stock'));
app.use('/api/usuarios', requireAdmin);

function normalizePhone(raw) {
  let digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('54')) digits = digits.slice(2);
  if (digits.startsWith('9')) digits = digits.slice(1);
  return '+549' + digits;
}

const CLIENTE_FIELDS = [
  'nombre', 'telefono', 'email', 'direccion', 'notas', 'fecha_nacimiento',
  'proxima_cita_fecha', 'proxima_cita_hora', 'dias_aviso', 'msg_recordatorio', 'msg_cumpleanos'
];

function pickClienteFields(body) {
  const out = {};
  for (const key of CLIENTE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  if (out.telefono) out.telefono = normalizePhone(out.telefono);
  return out;
}

// ── Clientes ──
app.get('/api/clientes', async (req, res) => {
  const q = (req.query.q || '').trim();
  let query = supabase.from('clientes').select('*').order('nombre', { ascending: true });
  if (q) {
    query = query.or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/clientes/:id', async (req, res) => {
  const { id } = req.params;
  const { data: cliente, error: clienteError } = await supabase
    .from('clientes').select('*').eq('id', id).single();
  if (clienteError) return res.status(404).json({ error: 'Cliente no encontrado' });

  const { data: tratamientos, error: tratamientosError } = await supabase
    .from('tratamientos').select('*').eq('cliente_id', id).order('fecha', { ascending: false });
  if (tratamientosError) return res.status(500).json({ error: tratamientosError.message });

  res.json({ ...cliente, tratamientos });
});

app.post('/api/clientes', async (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const payload = pickClienteFields(req.body);
  payload.nombre = nombre;

  const { data, error } = await supabase.from('clientes').insert([payload]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/clientes/:id', requireModule('clientes'), async (req, res) => {
  const { id } = req.params;
  const payload = pickClienteFields(req.body);
  if (payload.nombre !== undefined && !payload.nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  const { data, error } = await supabase.from('clientes').update(payload).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/clientes/:id', requireModule('clientes'), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Agenda ──
app.get('/api/agenda', async (req, res) => {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, telefono, proxima_cita_fecha, proxima_cita_hora, dias_aviso, msg_recordatorio')
    .not('proxima_cita_fecha', 'is', null)
    .order('proxima_cita_fecha', { ascending: true })
    .order('proxima_cita_hora', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Tratamientos ──
app.post('/api/clientes/:id/tratamientos', requireModule('clientes'), async (req, res) => {
  const { id } = req.params;
  const fecha = req.body.fecha;
  if (!fecha) return res.status(400).json({ error: 'La fecha es obligatoria' });

  const payload = {
    cliente_id: id,
    fecha,
    servicio: req.body.servicio || null,
    productos: req.body.productos || null,
    obs: req.body.obs || null,
    fotos: req.body.fotos || null
  };

  const { data, error } = await supabase.from('tratamientos').insert([payload]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/tratamientos/:id', requireModule('clientes'), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('tratamientos').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Puntos ──
app.get('/api/clientes/:id/puntos', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('puntos_movimientos').select('*').eq('cliente_id', id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/clientes/:id/puntos', requireModule('clientes'), async (req, res) => {
  const { id } = req.params;
  const puntos = Number(req.body.puntos);
  if (!Number.isInteger(puntos) || puntos === 0) {
    return res.status(400).json({ error: 'Los puntos deben ser un número entero distinto de cero' });
  }

  const { data: cliente, error: clienteError } = await supabase.from('clientes').select('puntos').eq('id', id).single();
  if (clienteError) return res.status(404).json({ error: 'Cliente no encontrado' });

  const nuevoBalance = Math.max(0, (cliente.puntos || 0) + puntos);
  const { error: updateError } = await supabase.from('clientes').update({ puntos: nuevoBalance }).eq('id', id);
  if (updateError) return res.status(500).json({ error: updateError.message });

  const { data: movimiento, error: movError } = await supabase
    .from('puntos_movimientos')
    .insert([{ cliente_id: id, tipo: 'ajuste', puntos, motivo: req.body.motivo || null }])
    .select().single();
  if (movError) return res.status(500).json({ error: movError.message });

  res.json({ puntos: nuevoBalance, movimiento });
});

// ── Profesionales ──
app.get('/api/profesionales', async (req, res) => {
  const { data, error } = await supabase
    .from('profesionales').select('*').order('nombre', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/profesionales', requireModule('catalogo'), async (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const payload = { nombre, color: req.body.color || '#5b8def', activo: req.body.activo !== false };
  const { data, error } = await supabase.from('profesionales').insert([payload]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/profesionales/:id', requireModule('catalogo'), async (req, res) => {
  const { id } = req.params;
  const payload = {};
  for (const key of ['nombre', 'color', 'activo']) {
    if (req.body[key] !== undefined) payload[key] = req.body[key];
  }
  const { data, error } = await supabase.from('profesionales').update(payload).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/profesionales/:id', requireModule('catalogo'), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('profesionales').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Servicios ──
app.get('/api/servicios', async (req, res) => {
  const { data, error } = await supabase
    .from('servicios').select('*').order('nombre', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/servicios', requireModule('catalogo'), async (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const payload = {
    nombre,
    categoria: req.body.categoria || null,
    duracion_min: req.body.duracion_min || 30,
    precio: req.body.precio || 0,
    activo: req.body.activo !== false
  };
  const { data, error } = await supabase.from('servicios').insert([payload]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/servicios/:id', requireModule('catalogo'), async (req, res) => {
  const { id } = req.params;
  const payload = {};
  for (const key of ['nombre', 'categoria', 'duracion_min', 'precio', 'activo']) {
    if (req.body[key] !== undefined) payload[key] = req.body[key];
  }
  const { data, error } = await supabase.from('servicios').update(payload).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/servicios/:id', requireModule('catalogo'), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('servicios').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Productos ──
app.get('/api/productos', async (req, res) => {
  const { data, error } = await supabase
    .from('productos').select('*').order('nombre', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/productos/buscar-barcode/:codigo', async (req, res) => {
  const { data, error } = await supabase.from('productos').select('*').eq('barcode', req.params.codigo).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'No hay ningún producto con ese código' });
  res.json(data);
});

app.post('/api/productos', requireAnyModule('catalogo', 'stock'), async (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const payload = {
    nombre,
    precio: req.body.precio || 0,
    costo: req.body.costo || 0,
    stock: req.body.stock || 0,
    stock_minimo: req.body.stock_minimo || 0,
    barcode: req.body.barcode || null,
    activo: req.body.activo !== false
  };
  const { data, error } = await supabase.from('productos').insert([payload]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  notifyChange('productos');
  res.json(data);
});

app.put('/api/productos/:id', requireAnyModule('catalogo', 'stock'), async (req, res) => {
  const { id } = req.params;
  const payload = {};
  for (const key of ['nombre', 'precio', 'costo', 'stock', 'stock_minimo', 'barcode', 'activo']) {
    if (req.body[key] !== undefined) payload[key] = req.body[key];
  }
  const { data, error } = await supabase.from('productos').update(payload).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  notifyChange('productos');
  res.json(data);
});

app.delete('/api/productos/:id', requireAnyModule('catalogo', 'stock'), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('productos').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  notifyChange('productos');
  res.json({ ok: true });
});

// ── Stock (movimientos con historial + alertas de stock bajo) ──
app.get('/api/stock/movimientos', async (req, res) => {
  let query = supabase
    .from('stock_movimientos')
    .select('*, productos(id,nombre,barcode)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (req.query.producto_id) query = query.eq('producto_id', req.query.producto_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/stock/movimientos', async (req, res) => {
  const { producto_id, tipo, cantidad, motivo } = req.body;
  if (!producto_id || !['entrada', 'salida', 'ajuste'].includes(tipo)) {
    return res.status(400).json({ error: 'Producto y tipo de movimiento son obligatorios' });
  }
  const cantidadNum = Number(cantidad);
  if (!Number.isFinite(cantidadNum) || cantidadNum < 0) {
    return res.status(400).json({ error: 'La cantidad debe ser un número válido' });
  }

  const { data: producto, error: prodError } = await supabase.from('productos').select('id, stock').eq('id', producto_id).single();
  if (prodError || !producto) return res.status(404).json({ error: 'Producto no encontrado' });

  const stockAnterior = producto.stock;
  let stockNuevo;
  if (tipo === 'entrada') stockNuevo = stockAnterior + cantidadNum;
  else if (tipo === 'salida') stockNuevo = stockAnterior - cantidadNum;
  else stockNuevo = cantidadNum;

  if (stockNuevo < 0) return res.status(400).json({ error: 'No hay stock suficiente para esa salida' });

  const { error: updateError } = await supabase.from('productos').update({ stock: stockNuevo }).eq('id', producto_id);
  if (updateError) return res.status(500).json({ error: updateError.message });

  const { data: movimiento, error: movError } = await supabase
    .from('stock_movimientos')
    .insert([{
      producto_id, tipo, cantidad: cantidadNum,
      stock_anterior: stockAnterior, stock_nuevo: stockNuevo,
      motivo: motivo || null, usuario_nombre: req.user.nombre
    }])
    .select('*, productos(id,nombre,barcode)')
    .single();
  if (movError) return res.status(500).json({ error: movError.message });

  notifyChange('stock_movimientos');
  notifyChange('productos');
  res.json(movimiento);
});

// ── Turnos (calendario) ──
const TURNO_SELECT = '*, clientes(id,nombre,telefono), profesionales(id,nombre,color), turno_servicios(id,precio,servicios(id,nombre,categoria))';

app.get('/api/turnos', async (req, res) => {
  const { desde, hasta, profesional_id } = req.query;
  let query = supabase.from('turnos').select(TURNO_SELECT).order('fecha', { ascending: true }).order('hora_inicio', { ascending: true });
  if (desde) query = query.gte('fecha', desde);
  if (hasta) query = query.lte('fecha', hasta);
  if (profesional_id) query = query.eq('profesional_id', profesional_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/turnos/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.from('turnos').select(TURNO_SELECT).eq('id', id).single();
  if (error) return res.status(404).json({ error: 'Turno no encontrado' });
  res.json(data);
});

app.post('/api/turnos', async (req, res) => {
  const { cliente_id, profesional_id, fecha, hora_inicio, hora_fin, servicios } = req.body;
  if (!cliente_id || !profesional_id || !fecha || !hora_inicio || !hora_fin) {
    return res.status(400).json({ error: 'cliente_id, profesional_id, fecha, hora_inicio y hora_fin son obligatorios' });
  }

  const payload = {
    cliente_id, profesional_id, fecha, hora_inicio, hora_fin,
    estado: req.body.estado || 'confirmado',
    notas: req.body.notas || null,
    creado_por: req.body.creado_por || null
  };

  const { data: turno, error: turnoError } = await supabase.from('turnos').insert([payload]).select().single();
  if (turnoError) return res.status(500).json({ error: turnoError.message });

  if (Array.isArray(servicios) && servicios.length > 0) {
    const rows = servicios.map((s) => ({ turno_id: turno.id, servicio_id: s.servicio_id, precio: s.precio || 0 }));
    const { error: servError } = await supabase.from('turno_servicios').insert(rows);
    if (servError) return res.status(500).json({ error: servError.message });
  }

  const { data: full, error: fullError } = await supabase.from('turnos').select(TURNO_SELECT).eq('id', turno.id).single();
  if (fullError) return res.status(500).json({ error: fullError.message });
  res.json(full);
});

app.put('/api/turnos/:id', async (req, res) => {
  const { id } = req.params;
  const payload = {};
  for (const key of ['cliente_id', 'profesional_id', 'fecha', 'hora_inicio', 'hora_fin', 'estado', 'notas']) {
    if (req.body[key] !== undefined) payload[key] = req.body[key];
  }

  if (Object.keys(payload).length > 0) {
    const { error: updateError } = await supabase.from('turnos').update(payload).eq('id', id);
    if (updateError) return res.status(500).json({ error: updateError.message });
  }

  if (Array.isArray(req.body.servicios)) {
    const { error: delError } = await supabase.from('turno_servicios').delete().eq('turno_id', id);
    if (delError) return res.status(500).json({ error: delError.message });

    if (req.body.servicios.length > 0) {
      const rows = req.body.servicios.map((s) => ({ turno_id: id, servicio_id: s.servicio_id, precio: s.precio || 0 }));
      const { error: insError } = await supabase.from('turno_servicios').insert(rows);
      if (insError) return res.status(500).json({ error: insError.message });
    }
  }

  const { data: full, error: fullError } = await supabase.from('turnos').select(TURNO_SELECT).eq('id', id).single();
  if (fullError) return res.status(500).json({ error: fullError.message });
  res.json(full);
});

app.delete('/api/turnos/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('turnos').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Ventas (facturación) ──
const VENTA_SELECT = '*, clientes(id,nombre,telefono), venta_items(*)';

app.get('/api/ventas', async (req, res) => {
  const { desde, hasta } = req.query;
  let query = supabase.from('ventas').select(VENTA_SELECT).order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (desde) query = query.gte('fecha', desde);
  if (hasta) query = query.lte('fecha', hasta);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/ventas/:id', async (req, res) => {
  const { data, error } = await supabase.from('ventas').select(VENTA_SELECT).eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Venta no encontrada' });
  res.json(data);
});

app.post('/api/ventas', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La venta necesita al menos un ítem' });
  }

  const itemRows = items.map((it) => ({
    tipo: it.tipo,
    referencia_id: it.referencia_id || null,
    descripcion: it.descripcion,
    cantidad: it.cantidad || 1,
    precio_unitario: it.precio_unitario || 0,
    subtotal: (it.cantidad || 1) * (it.precio_unitario || 0)
  }));
  const total = itemRows.reduce((sum, it) => sum + it.subtotal, 0);

  const ventaPayload = {
    turno_id: req.body.turno_id || null,
    cliente_id: req.body.cliente_id || null,
    fecha: req.body.fecha || new Date().toISOString().slice(0, 10),
    metodo_pago: req.body.metodo_pago || null,
    total
  };

  const { data: venta, error: ventaError } = await supabase.from('ventas').insert([ventaPayload]).select().single();
  if (ventaError) return res.status(500).json({ error: ventaError.message });

  const { error: itemsError } = await supabase
    .from('venta_items')
    .insert(itemRows.map((it) => ({ ...it, venta_id: venta.id })));
  if (itemsError) return res.status(500).json({ error: itemsError.message });

  for (const it of itemRows) {
    if (it.tipo === 'producto' && it.referencia_id) {
      const { data: prod } = await supabase.from('productos').select('stock').eq('id', it.referencia_id).single();
      if (prod) {
        await supabase.from('productos').update({ stock: Math.max(0, prod.stock - it.cantidad) }).eq('id', it.referencia_id);
      }
    }
  }

  if (ventaPayload.cliente_id) {
    const puntosGanados = Math.floor(total / 1000);
    if (puntosGanados > 0) {
      const { data: cliente } = await supabase.from('clientes').select('puntos').eq('id', ventaPayload.cliente_id).single();
      if (cliente) {
        await supabase.from('clientes').update({ puntos: (cliente.puntos || 0) + puntosGanados }).eq('id', ventaPayload.cliente_id);
        await supabase.from('puntos_movimientos').insert([{
          cliente_id: ventaPayload.cliente_id, tipo: 'ganado', puntos: puntosGanados, motivo: 'Venta', venta_id: venta.id
        }]);
      }
    }
  }

  const { data: full, error: fullError } = await supabase.from('ventas').select(VENTA_SELECT).eq('id', venta.id).single();
  if (fullError) return res.status(500).json({ error: fullError.message });
  res.json(full);
});

app.delete('/api/ventas/:id', async (req, res) => {
  const { id } = req.params;

  const { data: movimientos } = await supabase
    .from('puntos_movimientos').select('cliente_id, puntos').eq('venta_id', id).eq('tipo', 'ganado');
  for (const m of movimientos || []) {
    const { data: cliente } = await supabase.from('clientes').select('puntos').eq('id', m.cliente_id).single();
    if (cliente) {
      await supabase.from('clientes').update({ puntos: Math.max(0, (cliente.puntos || 0) - m.puntos) }).eq('id', m.cliente_id);
    }
  }

  const { error } = await supabase.from('ventas').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Egresos / Compras ──
app.get('/api/egresos', async (req, res) => {
  const { desde, hasta } = req.query;
  let query = supabase.from('egresos').select('*').order('fecha', { ascending: false });
  if (desde) query = query.gte('fecha', desde);
  if (hasta) query = query.lte('fecha', hasta);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/egresos', async (req, res) => {
  const concepto = (req.body.concepto || '').trim();
  const monto = Number(req.body.monto);
  if (!concepto || !monto) return res.status(400).json({ error: 'Concepto y monto son obligatorios' });

  const payload = {
    concepto,
    monto,
    categoria: req.body.categoria || null,
    fecha: req.body.fecha || new Date().toISOString().slice(0, 10)
  };
  const { data, error } = await supabase.from('egresos').insert([payload]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/egresos/:id', async (req, res) => {
  const payload = {};
  for (const key of ['concepto', 'monto', 'categoria', 'fecha']) {
    if (req.body[key] !== undefined) payload[key] = req.body[key];
  }
  const { data, error } = await supabase.from('egresos').update(payload).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/egresos/:id', async (req, res) => {
  const { error } = await supabase.from('egresos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Resumen / Reportes ──
app.get('/api/resumen', async (req, res) => {
  const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);

  const [turnosRes, ventasRes, egresosRes] = await Promise.all([
    supabase.from('turnos').select(TURNO_SELECT).eq('fecha', fecha).order('hora_inicio', { ascending: true }),
    supabase.from('ventas').select('total').eq('fecha', fecha),
    supabase.from('egresos').select('monto').eq('fecha', fecha)
  ]);

  if (turnosRes.error) return res.status(500).json({ error: turnosRes.error.message });
  if (ventasRes.error) return res.status(500).json({ error: ventasRes.error.message });
  if (egresosRes.error) return res.status(500).json({ error: egresosRes.error.message });

  const ventasTotal = ventasRes.data.reduce((s, v) => s + Number(v.total), 0);
  const egresosTotal = egresosRes.data.reduce((s, e) => s + Number(e.monto), 0);

  res.json({
    fecha,
    turnos: turnosRes.data,
    ventasTotal,
    egresosTotal,
    balance: ventasTotal - egresosTotal,
    cantidadVentas: ventasRes.data.length
  });
});

app.get('/api/reportes', async (req, res) => {
  const desde = req.query.desde || new Date().toISOString().slice(0, 10);
  const hasta = req.query.hasta || new Date().toISOString().slice(0, 10);

  const [ventasRes, egresosRes, clientesNuevosRes, clientesTotalRes] = await Promise.all([
    supabase.from('ventas').select('fecha,total,metodo_pago,cliente_id').gte('fecha', desde).lte('fecha', hasta),
    supabase.from('egresos').select('fecha,monto,categoria').gte('fecha', desde).lte('fecha', hasta),
    supabase.from('clientes').select('id', { count: 'exact', head: true }).gte('created_at', desde).lte('created_at', `${hasta}T23:59:59`),
    supabase.from('clientes').select('id', { count: 'exact', head: true })
  ]);

  if (ventasRes.error) return res.status(500).json({ error: ventasRes.error.message });
  if (egresosRes.error) return res.status(500).json({ error: egresosRes.error.message });
  if (clientesNuevosRes.error) return res.status(500).json({ error: clientesNuevosRes.error.message });
  if (clientesTotalRes.error) return res.status(500).json({ error: clientesTotalRes.error.message });

  const ventasTotal = ventasRes.data.reduce((s, v) => s + Number(v.total), 0);
  const egresosTotal = egresosRes.data.reduce((s, e) => s + Number(e.monto), 0);
  const cantidadVentas = ventasRes.data.length;
  const ticketPromedio = cantidadVentas > 0 ? ventasTotal / cantidadVentas : 0;

  const porMetodo = {};
  for (const v of ventasRes.data) {
    const m = v.metodo_pago || 'Sin especificar';
    porMetodo[m] = (porMetodo[m] || 0) + Number(v.total);
  }

  const porCategoria = {};
  for (const e of egresosRes.data) {
    const c = e.categoria || 'Sin categoría';
    porCategoria[c] = (porCategoria[c] || 0) + Number(e.monto);
  }

  const gastoPorCliente = {};
  for (const v of ventasRes.data) {
    if (!v.cliente_id) continue;
    gastoPorCliente[v.cliente_id] = (gastoPorCliente[v.cliente_id] || 0) + Number(v.total);
  }
  const topIds = Object.entries(gastoPorCliente).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
  let topClientes = [];
  if (topIds.length > 0) {
    const { data: nombres } = await supabase.from('clientes').select('id,nombre').in('id', topIds);
    const nombreById = Object.fromEntries((nombres || []).map((c) => [c.id, c.nombre]));
    topClientes = topIds.map((id) => ({ id, nombre: nombreById[id] || '—', total: gastoPorCliente[id] }));
  }

  const serieDiariaMap = {};
  for (const v of ventasRes.data) {
    (serieDiariaMap[v.fecha] ||= { fecha: v.fecha, ventas: 0, egresos: 0 }).ventas += Number(v.total);
  }
  for (const e of egresosRes.data) {
    (serieDiariaMap[e.fecha] ||= { fecha: e.fecha, ventas: 0, egresos: 0 }).egresos += Number(e.monto);
  }
  const serieDiaria = Object.values(serieDiariaMap).sort((a, b) => a.fecha.localeCompare(b.fecha));

  res.json({
    desde, hasta,
    ventasTotal, egresosTotal, balance: ventasTotal - egresosTotal,
    cantidadVentas, cantidadEgresos: egresosRes.data.length,
    ticketPromedio,
    clientesNuevos: clientesNuevosRes.count || 0,
    clientesTotal: clientesTotalRes.count || 0,
    porMetodo, porCategoria,
    topClientes,
    serieDiaria
  });
});

// ── Marketing ──
app.get('/api/marketing/recordatorios', async (req, res) => {
  const { data, error } = await supabase
    .from('clientes')
    .select('id,nombre,telefono,proxima_cita_fecha,proxima_cita_hora,dias_aviso,msg_recordatorio')
    .not('proxima_cita_fecha', 'is', null);
  if (error) return res.status(500).json({ error: error.message });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const pendientes = data.filter((c) => {
    const cita = new Date(c.proxima_cita_fecha + 'T00:00:00');
    const diffDias = Math.round((cita - hoy) / 86400000);
    return diffDias >= 0 && diffDias <= (c.dias_aviso ?? 2);
  });

  res.json(pendientes);
});

app.get('/api/marketing/cumpleanos', async (req, res) => {
  const dias = Number(req.query.dias) || 7;
  const { data, error } = await supabase
    .from('clientes')
    .select('id,nombre,telefono,fecha_nacimiento,msg_cumpleanos')
    .not('fecha_nacimiento', 'is', null);
  if (error) return res.status(500).json({ error: error.message });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const proximos = data
    .map((c) => {
      const nac = new Date(c.fecha_nacimiento + 'T00:00:00');
      const cumpleEsteAnio = new Date(hoy.getFullYear(), nac.getMonth(), nac.getDate());
      if (cumpleEsteAnio < hoy) cumpleEsteAnio.setFullYear(hoy.getFullYear() + 1);
      const diffDias = Math.round((cumpleEsteAnio - hoy) / 86400000);
      return { ...c, diasFaltantes: diffDias };
    })
    .filter((c) => c.diasFaltantes >= 0 && c.diasFaltantes <= dias)
    .sort((a, b) => a.diasFaltantes - b.diasFaltantes);

  res.json(proximos);
});

app.post('/api/mensajes-enviados', async (req, res) => {
  const { cliente_id, tipo, mensaje } = req.body;
  if (!cliente_id || !tipo) return res.status(400).json({ error: 'cliente_id y tipo son obligatorios' });

  const { data, error } = await supabase
    .from('mensajes_enviados')
    .insert([{ cliente_id, tipo, mensaje: mensaje || null }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Usuarios (solo admin) ──
app.get('/api/usuarios', async (req, res) => {
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) return res.status(500).json({ error: authError.message });

  const { data: perfiles, error: perfilesError } = await supabase.from('perfiles').select('*');
  if (perfilesError) return res.status(500).json({ error: perfilesError.message });

  const emailById = {};
  for (const u of authUsers.users) emailById[u.id] = u.email;

  res.json(perfiles.map((p) => ({ ...p, email: emailById[p.id] || null })));
});

app.post('/api/usuarios', async (req, res) => {
  const { email, password, nombre } = req.body;
  if (!email || !password || !nombre) {
    return res.status(400).json({ error: 'Email, contraseña y nombre son obligatorios' });
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true
  });
  if (createError) return res.status(500).json({ error: createError.message });

  const { data: perfil, error: perfilError } = await supabase
    .from('perfiles')
    .insert([{
      id: created.user.id,
      nombre,
      rol: req.body.rol === 'admin' ? 'admin' : 'usuario',
      permisos: Array.isArray(req.body.permisos) ? req.body.permisos : []
    }])
    .select().single();

  if (perfilError) {
    await supabase.auth.admin.deleteUser(created.user.id);
    return res.status(500).json({ error: perfilError.message });
  }

  res.json({ ...perfil, email });
});

app.put('/api/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const payload = {};
  for (const key of ['nombre', 'rol', 'permisos', 'activo']) {
    if (req.body[key] !== undefined) payload[key] = req.body[key];
  }

  if (Object.keys(payload).length > 0) {
    const { error: updateError } = await supabase.from('perfiles').update(payload).eq('id', id);
    if (updateError) return res.status(500).json({ error: updateError.message });
  }

  if (req.body.password) {
    const { error: pwError } = await supabase.auth.admin.updateUserById(id, { password: req.body.password });
    if (pwError) return res.status(500).json({ error: pwError.message });
  }

  const { data: perfil, error: perfilError } = await supabase.from('perfiles').select('*').eq('id', id).single();
  if (perfilError) return res.status(500).json({ error: perfilError.message });
  res.json(perfil);
});

app.delete('/api/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'No podés eliminar tu propio usuario' });

  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

export default app;
