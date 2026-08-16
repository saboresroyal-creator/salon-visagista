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
const syncChannel = supabase.channel('app-sync');
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

  // Los permisos se administran por rol (pantalla "Permisos por Rol"), no
  // por usuario: admin no necesita filas, bypasea todo en requirePermiso.
  let permisos = [];
  if (perfil.rol !== 'admin') {
    const { data: rp } = await supabase.from('rol_permisos').select('permiso').eq('rol', perfil.rol);
    permisos = (rp || []).map((r) => r.permiso);
  }

  req.user = { id: userData.user.id, email: userData.user.email, nombre: perfil.nombre, rol: perfil.rol, permisos };
  next();
}

function requirePermiso(clave) {
  return (req, res, next) => {
    if (req.user.rol === 'admin' || req.user.permisos.includes(clave)) return next();
    res.status(403).json({ error: 'No tenés permiso para hacer esto' });
  };
}

// Para acciones que más de un permiso habilita (ej: gestionar productos
// desde Stock además de desde Catálogo), alcanza con tener cualquiera.
function requireAnyPermiso(...claves) {
  return (req, res, next) => {
    if (req.user.rol === 'admin' || claves.some((c) => req.user.permisos.includes(c))) return next();
    res.status(403).json({ error: 'No tenés permiso para hacer esto' });
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
// que su lectura queda disponible para cualquier usuario logueado. El resto
// de las rutas de cada módulo se gatean individualmente más abajo, con el
// permiso granular que corresponda (ver/gestionar/eliminar/etc).
app.use('/api/resumen', requirePermiso('dashboard:ver'));
app.use('/api/reportes', requirePermiso('reportes:ver'));
app.use('/api/usuarios', requireAdmin);
app.use('/api/rol-permisos', requireAdmin);

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

app.put('/api/clientes/:id', requirePermiso('clientes:gestionar'), async (req, res) => {
  const { id } = req.params;
  const payload = pickClienteFields(req.body);
  if (payload.nombre !== undefined && !payload.nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  const { data, error } = await supabase.from('clientes').update(payload).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/clientes/:id', requirePermiso('clientes:eliminar'), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Agenda ──
app.get('/api/agenda', requirePermiso('calendario:ver'), async (req, res) => {
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
app.post('/api/clientes/:id/tratamientos', requirePermiso('clientes:gestionar'), async (req, res) => {
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

app.delete('/api/tratamientos/:id', requirePermiso('clientes:gestionar'), async (req, res) => {
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

app.post('/api/clientes/:id/puntos', requirePermiso('clientes:puntos'), async (req, res) => {
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

// ── Cuenta corriente ──
app.get('/api/clientes/:id/cuenta-corriente', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('cuenta_corriente_movimientos').select('*').eq('cliente_id', id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/clientes/:id/cuenta-corriente', requirePermiso('clientes:cuenta_corriente'), async (req, res) => {
  const { id } = req.params;
  const monto = Number(req.body.monto);
  if (!Number.isFinite(monto) || monto === 0) {
    return res.status(400).json({ error: 'El monto debe ser un número distinto de cero' });
  }
  const tipo = ['cargo', 'pago', 'ajuste'].includes(req.body.tipo) ? req.body.tipo : 'ajuste';
  // Un pago reduce lo que debe la clienta; un cargo/ajuste positivo lo aumenta.
  const delta = tipo === 'pago' ? -Math.abs(monto) : monto;

  const { data: cliente, error: clienteError } = await supabase.from('clientes').select('saldo_cta_cte').eq('id', id).single();
  if (clienteError) return res.status(404).json({ error: 'Cliente no encontrado' });

  const nuevoBalance = (cliente.saldo_cta_cte || 0) + delta;
  const { error: updateError } = await supabase.from('clientes').update({ saldo_cta_cte: nuevoBalance }).eq('id', id);
  if (updateError) return res.status(500).json({ error: updateError.message });

  const { data: movimiento, error: movError } = await supabase
    .from('cuenta_corriente_movimientos')
    .insert([{ cliente_id: id, tipo, monto: delta, motivo: req.body.motivo || null }])
    .select().single();
  if (movError) return res.status(500).json({ error: movError.message });

  res.json({ saldo_cta_cte: nuevoBalance, movimiento });
});

// ── Profesionales ──
app.get('/api/profesionales', async (req, res) => {
  const { data, error } = await supabase
    .from('profesionales').select('*').order('nombre', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/profesionales', requirePermiso('catalogo:gestionar'), async (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const payload = { nombre, color: req.body.color || '#5b8def', activo: req.body.activo !== false };
  const { data, error } = await supabase.from('profesionales').insert([payload]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/profesionales/:id', requirePermiso('catalogo:gestionar'), async (req, res) => {
  const { id } = req.params;
  const payload = {};
  for (const key of ['nombre', 'color', 'activo']) {
    if (req.body[key] !== undefined) payload[key] = req.body[key];
  }
  const { data, error } = await supabase.from('profesionales').update(payload).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/profesionales/:id', requirePermiso('catalogo:eliminar'), async (req, res) => {
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

app.post('/api/servicios', requirePermiso('catalogo:gestionar'), async (req, res) => {
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

app.put('/api/servicios/:id', requirePermiso('catalogo:gestionar'), async (req, res) => {
  const { id } = req.params;
  const payload = {};
  for (const key of ['nombre', 'categoria', 'duracion_min', 'precio', 'activo']) {
    if (req.body[key] !== undefined) payload[key] = req.body[key];
  }
  const { data, error } = await supabase.from('servicios').update(payload).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/servicios/:id', requirePermiso('catalogo:eliminar'), async (req, res) => {
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

app.post('/api/productos', requireAnyPermiso('catalogo:gestionar', 'stock:movimientos'), async (req, res) => {
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

app.put('/api/productos/:id', requireAnyPermiso('catalogo:gestionar', 'stock:movimientos'), async (req, res) => {
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

app.delete('/api/productos/:id', requireAnyPermiso('catalogo:eliminar', 'stock:eliminar'), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('productos').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  notifyChange('productos');
  res.json({ ok: true });
});

// ── Stock (movimientos con historial + alertas de stock bajo) ──
app.get('/api/stock/movimientos', requirePermiso('stock:ver'), async (req, res) => {
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

app.post('/api/stock/movimientos', requirePermiso('stock:movimientos'), async (req, res) => {
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

app.get('/api/turnos', requirePermiso('calendario:ver'), async (req, res) => {
  const { desde, hasta, profesional_id } = req.query;
  let query = supabase.from('turnos').select(TURNO_SELECT).order('fecha', { ascending: true }).order('hora_inicio', { ascending: true });
  if (desde) query = query.gte('fecha', desde);
  if (hasta) query = query.lte('fecha', hasta);
  if (profesional_id) query = query.eq('profesional_id', profesional_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/turnos/:id', requirePermiso('calendario:ver'), async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.from('turnos').select(TURNO_SELECT).eq('id', id).single();
  if (error) return res.status(404).json({ error: 'Turno no encontrado' });
  res.json(data);
});

app.post('/api/turnos', requirePermiso('calendario:gestionar'), async (req, res) => {
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

app.put('/api/turnos/:id', requirePermiso('calendario:gestionar'), async (req, res) => {
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

app.delete('/api/turnos/:id', requirePermiso('calendario:gestionar'), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('turnos').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Ventas (facturación) ──
const VENTA_SELECT = '*, clientes(id,nombre,telefono), venta_items(*), venta_pagos(*)';

async function descontarStockItems(itemRows) {
  for (const it of itemRows) {
    if (it.tipo === 'producto' && it.referencia_id) {
      const { data: prod } = await supabase.from('productos').select('stock').eq('id', it.referencia_id).single();
      if (prod) {
        await supabase.from('productos').update({ stock: Math.max(0, prod.stock - it.cantidad) }).eq('id', it.referencia_id);
        notifyChange('productos');
      }
    }
  }
}

async function reponerStockItems(items) {
  for (const it of items || []) {
    if (it.tipo === 'producto' && it.referencia_id) {
      const { data: prod } = await supabase.from('productos').select('stock').eq('id', it.referencia_id).single();
      if (prod) {
        await supabase.from('productos').update({ stock: prod.stock + it.cantidad }).eq('id', it.referencia_id);
        notifyChange('productos');
      }
    }
  }
}

async function otorgarPuntosPorVenta(clienteId, total, ventaId) {
  const puntosGanados = Math.floor(total / 1000);
  if (puntosGanados <= 0) return;
  const { data: cliente } = await supabase.from('clientes').select('puntos').eq('id', clienteId).single();
  if (!cliente) return;
  await supabase.from('clientes').update({ puntos: (cliente.puntos || 0) + puntosGanados }).eq('id', clienteId);
  await supabase.from('puntos_movimientos').insert([{
    cliente_id: clienteId, tipo: 'ganado', puntos: puntosGanados, motivo: 'Venta', venta_id: ventaId
  }]);
}

async function aplicarCargoCtaCte(clienteId, monto, ventaId) {
  const { data: cliente } = await supabase.from('clientes').select('saldo_cta_cte').eq('id', clienteId).single();
  if (!cliente) return;
  await supabase.from('clientes').update({ saldo_cta_cte: (cliente.saldo_cta_cte || 0) + monto }).eq('id', clienteId);
  await supabase.from('cuenta_corriente_movimientos').insert([{
    cliente_id: clienteId, tipo: 'cargo', monto, motivo: 'Venta', venta_id: ventaId
  }]);
}

// Valida los pagos de una venta antes de escribir nada en la base: que sumen
// el total, y que si hay un pago "Cta Cte" haya una clienta elegida. Se
// llama ANTES de crear la venta cuando se cobra en el momento (para no dejar
// una venta "cobrada" a medio armar si el pago no cierra), y antes de
// guardar los pagos al confirmar el cobro de una comanda pendiente.
function validarPagos(pagos, clienteId, total) {
  if (!Array.isArray(pagos) || pagos.length === 0) {
    throw new Error('Tenés que indicar al menos un método de pago');
  }
  const sumaPagos = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  if (Math.abs(sumaPagos - total) > 0.01) {
    throw new Error(`Los pagos suman $${sumaPagos.toFixed(2)} pero el total es $${total.toFixed(2)}`);
  }
  if (pagos.some((p) => p.metodo === 'Cta Cte') && !clienteId) {
    throw new Error('Para pagar con Cta Cte hay que elegir una clienta');
  }
}

// Inserta venta_pagos y aplica el cargo a cuenta corriente por los pagos
// "Cta Cte". Asume que validarPagos() ya se llamó con éxito.
async function guardarPagos(ventaId, pagos, clienteId) {
  const { error: pagosError } = await supabase.from('venta_pagos').insert(
    pagos.map((p) => ({ venta_id: ventaId, metodo: p.metodo, monto: Number(p.monto) || 0 }))
  );
  if (pagosError) throw new Error(pagosError.message);

  for (const p of pagos) {
    if (p.metodo === 'Cta Cte' && Number(p.monto) > 0) {
      await aplicarCargoCtaCte(clienteId, Number(p.monto), ventaId);
    }
  }

  return pagos.length > 1 ? 'Mixto' : pagos[0].metodo;
}

app.get('/api/ventas', requirePermiso('facturacion:ver'), async (req, res) => {
  const { desde, hasta, estado } = req.query;
  let query = supabase.from('ventas').select(VENTA_SELECT).order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (desde) query = query.gte('fecha', desde);
  if (hasta) query = query.lte('fecha', hasta);
  if (estado) query = query.eq('estado', estado);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/ventas/:id', requirePermiso('facturacion:ver'), async (req, res) => {
  const { data, error } = await supabase.from('ventas').select(VENTA_SELECT).eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Venta no encontrada' });
  res.json(data);
});

app.post('/api/ventas', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La venta necesita al menos un ítem' });
  }
  const estado = req.body.estado === 'pendiente' ? 'pendiente' : 'cobrada';
  // El permiso depende de qué se está creando: una comanda pendiente (la
  // carga cualquiera con permiso de Comandas) o una venta ya cobrada en el
  // momento (requiere permiso de Facturación para crear directo).
  const permisoRequerido = estado === 'pendiente' ? 'comandas:crear' : 'facturacion:crear';
  if (req.user.rol !== 'admin' && !req.user.permisos.includes(permisoRequerido)) {
    return res.status(403).json({ error: 'No tenés permiso para hacer esto' });
  }

  const itemRows = items.map((it) => ({
    tipo: it.tipo,
    referencia_id: it.referencia_id || null,
    descripcion: it.descripcion,
    cantidad: it.cantidad || 1,
    precio_unitario: it.precio_unitario || 0,
    subtotal: (it.cantidad || 1) * (it.precio_unitario || 0),
    profesional_diag_id: it.profesional_diag_id || null,
    profesional_asist_id: it.profesional_asist_id || null
  }));
  const total = itemRows.reduce((sum, it) => sum + it.subtotal, 0);
  const ventaPayload = {
    turno_id: req.body.turno_id || null,
    cliente_id: req.body.cliente_id || null,
    fecha: req.body.fecha || new Date().toISOString().slice(0, 10),
    estado,
    metodo_pago: null,
    total
  };

  // Si se cobra en el momento, se valida el pago ANTES de escribir nada:
  // así un pago que no cierra no deja una venta "cobrada" a medio armar
  // (sin método de pago) que igual contaría en el total del día.
  if (estado === 'cobrada') {
    try {
      validarPagos(req.body.pagos, ventaPayload.cliente_id, total);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  const { data: venta, error: ventaError } = await supabase.from('ventas').insert([ventaPayload]).select().single();
  if (ventaError) return res.status(500).json({ error: ventaError.message });

  const { error: itemsError } = await supabase
    .from('venta_items')
    .insert(itemRows.map((it) => ({ ...it, venta_id: venta.id })));
  if (itemsError) return res.status(500).json({ error: itemsError.message });

  // El producto se descuenta del stock apenas se usa, sea cual sea el
  // estado de cobro: si la venta queda pendiente y después se rechaza,
  // DELETE /api/ventas/:id lo repone.
  await descontarStockItems(itemRows);

  if (estado === 'cobrada') {
    const metodoResumen = await guardarPagos(venta.id, req.body.pagos, ventaPayload.cliente_id);
    await supabase.from('ventas').update({ metodo_pago: metodoResumen }).eq('id', venta.id);
    if (ventaPayload.cliente_id) await otorgarPuntosPorVenta(ventaPayload.cliente_id, total, venta.id);
  }

  notifyChange('ventas');
  const { data: full, error: fullError } = await supabase.from('ventas').select(VENTA_SELECT).eq('id', venta.id).single();
  if (fullError) return res.status(500).json({ error: fullError.message });
  res.json(full);
});

app.put('/api/ventas/:id/cobrar', requirePermiso('facturacion:cobrar'), async (req, res) => {
  const { id } = req.params;
  const { data: venta, error: ventaError } = await supabase.from('ventas').select('*').eq('id', id).single();
  if (ventaError || !venta) return res.status(404).json({ error: 'Venta no encontrada' });
  if (venta.estado !== 'pendiente') return res.status(400).json({ error: 'Esta venta ya fue cobrada' });

  try {
    validarPagos(req.body.pagos, venta.cliente_id, Number(venta.total));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const metodoResumen = await guardarPagos(id, req.body.pagos, venta.cliente_id);
  await supabase.from('ventas').update({ estado: 'cobrada', metodo_pago: metodoResumen }).eq('id', id);
  if (venta.cliente_id) await otorgarPuntosPorVenta(venta.cliente_id, Number(venta.total), id);

  notifyChange('ventas');
  const { data: full, error: fullError } = await supabase.from('ventas').select(VENTA_SELECT).eq('id', id).single();
  if (fullError) return res.status(500).json({ error: fullError.message });
  res.json(full);
});

app.delete('/api/ventas/:id', requirePermiso('facturacion:eliminar'), async (req, res) => {
  const { id } = req.params;

  const { data: movimientos } = await supabase
    .from('puntos_movimientos').select('cliente_id, puntos').eq('venta_id', id).eq('tipo', 'ganado');
  for (const m of movimientos || []) {
    const { data: cliente } = await supabase.from('clientes').select('puntos').eq('id', m.cliente_id).single();
    if (cliente) {
      await supabase.from('clientes').update({ puntos: Math.max(0, (cliente.puntos || 0) - m.puntos) }).eq('id', m.cliente_id);
    }
  }

  const { data: cargosCtaCte } = await supabase
    .from('cuenta_corriente_movimientos').select('cliente_id, monto').eq('venta_id', id).eq('tipo', 'cargo');
  for (const c of cargosCtaCte || []) {
    const { data: cliente } = await supabase.from('clientes').select('saldo_cta_cte').eq('id', c.cliente_id).single();
    if (cliente) {
      await supabase.from('clientes').update({ saldo_cta_cte: (cliente.saldo_cta_cte || 0) - c.monto }).eq('id', c.cliente_id);
    }
  }

  const { data: items } = await supabase.from('venta_items').select('tipo, referencia_id, cantidad').eq('venta_id', id);
  await reponerStockItems(items);

  const { error } = await supabase.from('ventas').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  notifyChange('ventas');
  res.json({ ok: true });
});

// ── Egresos / Compras ──
app.get('/api/egresos', requirePermiso('egresos:ver'), async (req, res) => {
  const { desde, hasta } = req.query;
  let query = supabase.from('egresos').select('*').order('fecha', { ascending: false });
  if (desde) query = query.gte('fecha', desde);
  if (hasta) query = query.lte('fecha', hasta);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/egresos', requirePermiso('egresos:gestionar'), async (req, res) => {
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

app.put('/api/egresos/:id', requirePermiso('egresos:gestionar'), async (req, res) => {
  const payload = {};
  for (const key of ['concepto', 'monto', 'categoria', 'fecha']) {
    if (req.body[key] !== undefined) payload[key] = req.body[key];
  }
  const { data, error } = await supabase.from('egresos').update(payload).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/egresos/:id', requirePermiso('egresos:eliminar'), async (req, res) => {
  const { error } = await supabase.from('egresos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Resumen / Reportes ──
app.get('/api/resumen', async (req, res) => {
  const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);

  const [turnosRes, ventasRes, egresosRes, pendientesRes] = await Promise.all([
    supabase.from('turnos').select(TURNO_SELECT).eq('fecha', fecha).order('hora_inicio', { ascending: true }),
    supabase.from('ventas').select('total').eq('fecha', fecha).eq('estado', 'cobrada'),
    supabase.from('egresos').select('monto').eq('fecha', fecha),
    supabase.from('ventas').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')
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
    cantidadVentas: ventasRes.data.length,
    pendientesDeCobro: pendientesRes.count || 0
  });
});

app.get('/api/reportes', async (req, res) => {
  const desde = req.query.desde || new Date().toISOString().slice(0, 10);
  const hasta = req.query.hasta || new Date().toISOString().slice(0, 10);

  const [ventasRes, egresosRes, clientesNuevosRes, clientesTotalRes] = await Promise.all([
    supabase.from('ventas').select('id,fecha,total,cliente_id').eq('estado', 'cobrada').gte('fecha', desde).lte('fecha', hasta),
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

  const ventaIds = ventasRes.data.map((v) => v.id);
  const porMetodo = {};
  if (ventaIds.length > 0) {
    const { data: pagos, error: pagosError } = await supabase.from('venta_pagos').select('metodo,monto').in('venta_id', ventaIds);
    if (pagosError) return res.status(500).json({ error: pagosError.message });
    for (const p of pagos || []) {
      const m = p.metodo || 'Sin especificar';
      porMetodo[m] = (porMetodo[m] || 0) + Number(p.monto);
    }
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
app.get('/api/marketing/recordatorios', requirePermiso('marketing:ver'), async (req, res) => {
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

// Sin gate: el Dashboard también usa este endpoint para la card de
// cumpleaños próximos, y no todos los roles con acceso al Dashboard tienen
// por qué tener permiso de Marketing.
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

app.post('/api/mensajes-enviados', requirePermiso('marketing:enviar'), async (req, res) => {
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
      rol: ['admin', 'profesional', 'recepcionista', 'encargada', 'cajero'].includes(req.body.rol) ? req.body.rol : 'usuario',
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
  for (const key of ['nombre', 'rol', 'activo']) {
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

// ── Permisos por rol ──
app.get('/api/rol-permisos', async (req, res) => {
  const { data, error } = await supabase.from('rol_permisos').select('*').order('rol', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/rol-permisos', async (req, res) => {
  const { rol, permiso } = req.body;
  if (!rol || !permiso) return res.status(400).json({ error: 'Rol y permiso son obligatorios' });

  const { data, error } = await supabase
    .from('rol_permisos')
    .insert([{ rol, permiso }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/rol-permisos/:id', async (req, res) => {
  const { error } = await supabase.from('rol_permisos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

export default app;
