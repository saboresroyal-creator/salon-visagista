// Cada módulo se muestra si el usuario tiene su permiso de "ver"; los
// permisos en sí (uno o varios por módulo) se administran centralizados
// en Permisos por Rol, ya no se tildan por usuario.
const MODULES = [
  { key: 'dashboard', label: 'Panel de Control', verPermiso: 'dashboard:ver', render: renderDashboard },
  { key: 'calendario', label: 'Calendario', verPermiso: 'calendario:ver', render: renderCalendario },
  { key: 'clientes', label: 'Clientes', verPermiso: 'clientes:ver', render: renderClientes },
  { key: 'catalogo', label: 'Servicios & Equipo', verPermiso: 'catalogo:ver', render: renderCatalogo },
  { key: 'stock', label: 'Stock', verPermiso: 'stock:ver', render: renderStock },
  { key: 'comandas', label: 'Comandas', verPermiso: 'comandas:crear', render: renderComandas },
  { key: 'mis-turnos', label: 'Mis turnos', verPermiso: 'comandas:cargar_propia', render: renderMisTurnos },
  { key: 'facturacion', label: 'Facturación', verPermiso: 'facturacion:ver', render: renderFacturacion },
  { key: 'egresos', label: 'Egresos', verPermiso: 'egresos:ver', render: renderEgresos },
  { key: 'reportes', label: 'Reportes', verPermiso: 'reportes:ver', render: renderReportes },
  { key: 'marketing', label: 'Marketing', verPermiso: 'marketing:ver', render: renderMarketing },
  { key: 'comisiones', label: 'Comisiones', verPermiso: ['comisiones:ver', 'comisiones:ver_propias'], render: renderComisiones }
];

let currentUser = null;
let currentView = null;

function tienePermisoModulo(user, verPermiso) {
  const claves = Array.isArray(verPermiso) ? verPermiso : [verPermiso];
  return claves.some((c) => (user.permisos || []).includes(c));
}

function visibleModulesFor(user) {
  const mods = user.rol === 'admin' ? MODULES.slice() : MODULES.filter((m) => tienePermisoModulo(user, m.verPermiso));
  if (user.rol === 'admin') {
    mods.push({ key: 'usuarios', label: 'Usuarios', render: renderUsuarios });
    mods.push({ key: 'permisos-roles', label: 'Permisos por Rol', render: renderPermisosRoles });
  }
  return mods;
}

function renderNav() {
  const nav = document.getElementById('tabs');
  const mods = visibleModulesFor(currentUser);
  nav.innerHTML = mods.map((m) =>
    `<button data-view="${m.key}" class="${m.key === currentView ? 'active' : ''}">${m.label}</button>`
  ).join('');
  nav.querySelectorAll('button').forEach((btn) => {
    btn.onclick = () => switchView(btn.dataset.view);
  });

  if (!document.getElementById('logout-btn')) {
    const btn = document.createElement('button');
    btn.id = 'logout-btn';
    btn.className = 'secondary';
    btn.style.marginLeft = '10px';
    btn.textContent = `Salir (${currentUser.nombre})`;
    btn.onclick = async () => { await api.auth.logout(); boot(); };
    document.querySelector('header.topbar').appendChild(btn);
  }
}

function switchView(key) {
  currentView = key;
  renderNav();

  // Cada vista recibe un nodo propio y descartable: si una vista anterior
  // todavía tiene un fetch en vuelo cuando cambiamos de pestaña, su
  // renderizado tardío termina escribiendo en un nodo ya desprendido del
  // DOM en vez de pisar la pantalla actual.
  const outer = document.getElementById('view');
  outer.innerHTML = '';
  const inner = document.createElement('div');
  outer.appendChild(inner);

  const mod = visibleModulesFor(currentUser).find((m) => m.key === key);
  if (mod) mod.render(inner);
}

async function boot() {
  document.getElementById('logout-btn')?.remove();
  stopRealtime();
  const container = document.getElementById('view');
  try {
    currentUser = await api.auth.me();
    const mods = visibleModulesFor(currentUser);
    currentView = mods[0]?.key || null;
    renderNav();
    if (currentView) switchView(currentView);
    else container.innerHTML = '<p>Tu usuario no tiene módulos habilitados. Pedile al administrador que te asigne acceso.</p>';
    initRealtime();
  } catch (e) {
    currentUser = null;
    renderLogin(container, () => boot());
  }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
boot();
