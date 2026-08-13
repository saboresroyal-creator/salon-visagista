const MODULES = [
  { key: 'dashboard', label: 'Panel de Control', render: renderDashboard },
  { key: 'calendario', label: 'Calendario', render: renderCalendario },
  { key: 'clientes', label: 'Clientes', render: renderClientes },
  { key: 'catalogo', label: 'Servicios & Equipo', render: renderCatalogo },
  { key: 'facturacion', label: 'Facturación', render: renderFacturacion },
  { key: 'egresos', label: 'Egresos', render: renderEgresos },
  { key: 'reportes', label: 'Reportes', render: renderReportes },
  { key: 'marketing', label: 'Marketing', render: renderMarketing }
];

let currentUser = null;
let currentView = null;

function visibleModulesFor(user) {
  const mods = user.rol === 'admin' ? MODULES.slice() : MODULES.filter((m) => (user.permisos || []).includes(m.key));
  if (user.rol === 'admin') mods.push({ key: 'usuarios', label: 'Usuarios', render: renderUsuarios });
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
  const container = document.getElementById('view');
  const mod = visibleModulesFor(currentUser).find((m) => m.key === key);
  if (mod) mod.render(container);
}

async function boot() {
  document.getElementById('logout-btn')?.remove();
  const container = document.getElementById('view');
  try {
    currentUser = await api.auth.me();
    const mods = visibleModulesFor(currentUser);
    currentView = mods[0]?.key || null;
    renderNav();
    if (currentView) switchView(currentView);
    else container.innerHTML = '<p>Tu usuario no tiene módulos habilitados. Pedile al administrador que te asigne acceso.</p>';
  } catch (e) {
    currentUser = null;
    renderLogin(container, () => boot());
  }
}

boot();
