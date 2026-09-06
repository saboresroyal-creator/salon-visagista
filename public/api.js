async function apiRequest(method, url, body) {
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

const api = {
  clientes: {
    list: (q) => apiRequest('GET', `/api/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    get: (id) => apiRequest('GET', `/api/clientes/${id}`),
    create: (data) => apiRequest('POST', '/api/clientes', data),
    update: (id, data) => apiRequest('PUT', `/api/clientes/${id}`, data),
    remove: (id) => apiRequest('DELETE', `/api/clientes/${id}`),
    addTratamiento: (id, data) => apiRequest('POST', `/api/clientes/${id}/tratamientos`, data),
    puntosHistorial: (id) => apiRequest('GET', `/api/clientes/${id}/puntos`),
    ajustarPuntos: (id, data) => apiRequest('POST', `/api/clientes/${id}/puntos`, data),
    cuentaCorrienteHistorial: (id) => apiRequest('GET', `/api/clientes/${id}/cuenta-corriente`),
    ajustarCuentaCorriente: (id, data) => apiRequest('POST', `/api/clientes/${id}/cuenta-corriente`, data)
  },
  tratamientos: {
    remove: (id) => apiRequest('DELETE', `/api/tratamientos/${id}`)
  },
  agenda: {
    list: () => apiRequest('GET', '/api/agenda')
  },
  profesionales: {
    list: () => apiRequest('GET', '/api/profesionales'),
    create: (data) => apiRequest('POST', '/api/profesionales', data),
    update: (id, data) => apiRequest('PUT', `/api/profesionales/${id}`, data),
    remove: (id) => apiRequest('DELETE', `/api/profesionales/${id}`),
    horarios: (id) => apiRequest('GET', `/api/profesionales/${id}/horarios`),
    guardarHorarios: (id, horarios) => apiRequest('PUT', `/api/profesionales/${id}/horarios`, { horarios })
  },
  servicios: {
    list: () => apiRequest('GET', '/api/servicios'),
    create: (data) => apiRequest('POST', '/api/servicios', data),
    update: (id, data) => apiRequest('PUT', `/api/servicios/${id}`, data),
    remove: (id) => apiRequest('DELETE', `/api/servicios/${id}`)
  },
  listasPrecio: {
    list: () => apiRequest('GET', '/api/listas-precio'),
    create: (data) => apiRequest('POST', '/api/listas-precio', data),
    update: (id, data) => apiRequest('PUT', `/api/listas-precio/${id}`, data),
    remove: (id) => apiRequest('DELETE', `/api/listas-precio/${id}`)
  },
  productos: {
    list: () => apiRequest('GET', '/api/productos'),
    create: (data) => apiRequest('POST', '/api/productos', data),
    update: (id, data) => apiRequest('PUT', `/api/productos/${id}`, data),
    remove: (id) => apiRequest('DELETE', `/api/productos/${id}`),
    buscarBarcode: (codigo) => apiRequest('GET', `/api/productos/buscar-barcode/${encodeURIComponent(codigo)}`)
  },
  stock: {
    alertas: () => apiRequest('GET', '/api/stock/alertas'),
    movimientos: {
      list: (producto_id) => apiRequest('GET', `/api/stock/movimientos${producto_id ? `?producto_id=${producto_id}` : ''}`),
      create: (data) => apiRequest('POST', '/api/stock/movimientos', data)
    }
  },
  config: {
    realtime: () => apiRequest('GET', '/api/realtime-config')
  },
  turnos: {
    list: (params) => apiRequest('GET', `/api/turnos?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/api/turnos/${id}`),
    create: (data) => apiRequest('POST', '/api/turnos', data),
    update: (id, data) => apiRequest('PUT', `/api/turnos/${id}`, data),
    remove: (id) => apiRequest('DELETE', `/api/turnos/${id}`)
  },
  ventas: {
    list: (params) => apiRequest('GET', `/api/ventas?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/api/ventas/${id}`),
    create: (data) => apiRequest('POST', '/api/ventas', data),
    update: (id, data) => apiRequest('PUT', `/api/ventas/${id}`, data),
    remove: (id) => apiRequest('DELETE', `/api/ventas/${id}`),
    cobrar: (id, data) => apiRequest('PUT', `/api/ventas/${id}/cobrar`, data)
  },
  misTurnos: {
    list: (fecha) => apiRequest('GET', `/api/mis-turnos${fecha ? `?fecha=${fecha}` : ''}`)
  },
  comandas: {
    crear: (data) => apiRequest('POST', '/api/comandas', data)
  },
  comisiones: {
    get: (params) => apiRequest('GET', `/api/comisiones?${new URLSearchParams(params)}`)
  },
  egresos: {
    list: (params) => apiRequest('GET', `/api/egresos?${new URLSearchParams(params)}`),
    create: (data) => apiRequest('POST', '/api/egresos', data),
    update: (id, data) => apiRequest('PUT', `/api/egresos/${id}`, data),
    remove: (id) => apiRequest('DELETE', `/api/egresos/${id}`)
  },
  resumen: {
    get: (fecha) => apiRequest('GET', `/api/resumen?fecha=${fecha}`)
  },
  reportes: {
    get: (desde, hasta) => apiRequest('GET', `/api/reportes?desde=${desde}&hasta=${hasta}`)
  },
  marketing: {
    recordatorios: () => apiRequest('GET', '/api/marketing/recordatorios'),
    cumpleanos: (dias) => apiRequest('GET', `/api/marketing/cumpleanos?dias=${dias || 7}`),
    registrarEnvio: (data) => apiRequest('POST', '/api/mensajes-enviados', data)
  },
  auth: {
    me: () => apiRequest('GET', '/api/auth/me'),
    login: (email, password) => apiRequest('POST', '/api/auth/login', { email, password }),
    logout: () => apiRequest('POST', '/api/auth/logout')
  },
  usuarios: {
    list: () => apiRequest('GET', '/api/usuarios'),
    create: (data) => apiRequest('POST', '/api/usuarios', data),
    update: (id, data) => apiRequest('PUT', `/api/usuarios/${id}`, data),
    remove: (id) => apiRequest('DELETE', `/api/usuarios/${id}`)
  },
  rolPermisos: {
    list: () => apiRequest('GET', '/api/rol-permisos'),
    create: (data) => apiRequest('POST', '/api/rol-permisos', data),
    remove: (id) => apiRequest('DELETE', `/api/rol-permisos/${id}`)
  }
};

function toast(msg, type = 'ok') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:8px;color:white;z-index:999;font-size:0.9rem;transition:opacity .2s;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = type === 'err' ? '#c0504d' : '#4a7c59';
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}
