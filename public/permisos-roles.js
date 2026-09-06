// Catálogo de permisos granulares del sistema — tiene que reflejar 1:1 las
// claves que exige server.js en cada ruta (requirePermiso/requireAnyPermiso).
const PERMISOS_CATALOGO = [
  { grupo: 'Dashboard', clave: 'dashboard:ver', label: 'Ver panel de control' },
  { grupo: 'Calendario', clave: 'calendario:ver', label: 'Ver calendario' },
  { grupo: 'Calendario', clave: 'calendario:gestionar', label: 'Crear/editar/eliminar turnos' },
  { grupo: 'Clientes', clave: 'clientes:ver', label: 'Ver listado de clientas' },
  { grupo: 'Clientes', clave: 'clientes:gestionar', label: 'Crear/editar clientas' },
  { grupo: 'Clientes', clave: 'clientes:eliminar', label: 'Eliminar clientas' },
  { grupo: 'Clientes', clave: 'clientes:puntos', label: 'Ajustar puntos' },
  { grupo: 'Clientes', clave: 'clientes:cuenta_corriente', label: 'Ajustar cuenta corriente' },
  { grupo: 'Catálogo', clave: 'catalogo:ver', label: 'Ver catálogo' },
  { grupo: 'Catálogo', clave: 'catalogo:gestionar', label: 'Crear/editar profesionales, servicios y productos' },
  { grupo: 'Catálogo', clave: 'catalogo:eliminar', label: 'Eliminar profesionales, servicios y productos' },
  { grupo: 'Stock', clave: 'stock:ver', label: 'Ver stock e historial' },
  { grupo: 'Stock', clave: 'stock:movimientos', label: 'Registrar movimientos de stock' },
  { grupo: 'Stock', clave: 'stock:eliminar', label: 'Eliminar productos desde Stock' },
  { grupo: 'Comandas', clave: 'comandas:crear', label: 'Cargar comandas (con precios, para mostrador)' },
  { grupo: 'Comandas', clave: 'comandas:cargar_propia', label: 'Cargar comanda de sus propios turnos (sin precios)' },
  { grupo: 'Facturación', clave: 'facturacion:ver', label: 'Ver ventas' },
  { grupo: 'Facturación', clave: 'facturacion:cobrar', label: 'Cobrar comandas pendientes' },
  { grupo: 'Facturación', clave: 'facturacion:crear', label: 'Crear venta directa' },
  { grupo: 'Facturación', clave: 'facturacion:eliminar', label: 'Eliminar ventas' },
  { grupo: 'Egresos', clave: 'egresos:ver', label: 'Ver egresos' },
  { grupo: 'Egresos', clave: 'egresos:gestionar', label: 'Crear/editar egresos' },
  { grupo: 'Egresos', clave: 'egresos:eliminar', label: 'Eliminar egresos' },
  { grupo: 'Reportes', clave: 'reportes:ver', label: 'Ver reportes' },
  { grupo: 'Marketing', clave: 'marketing:ver', label: 'Ver recordatorios' },
  { grupo: 'Marketing', clave: 'marketing:enviar', label: 'Registrar mensajes enviados' },
  { grupo: 'Comisiones', clave: 'comisiones:ver', label: 'Ver comisiones de todo el equipo' },
  { grupo: 'Comisiones', clave: 'comisiones:ver_propias', label: 'Ver su propia comisión' }
];

// Administrador no aparece: bypasea todos los permisos, no necesita filas.
const ROLES_GESTIONABLES = [
  { key: 'profesional', label: 'Profesional' },
  { key: 'recepcionista', label: 'Recepcionista' },
  { key: 'cajero', label: 'Cajero' },
  { key: 'encargada', label: 'Encargada / Gerencia' }
];

let permisosRolesState = { rolSeleccionado: 'profesional' };

function labelPermiso(clave) {
  return PERMISOS_CATALOGO.find((p) => p.clave === clave)?.label || clave;
}

async function renderPermisosRoles(container) {
  container.innerHTML = '<p>Cargando...</p>';
  const grants = await api.rolPermisos.list();
  if (!container.isConnected) return;
  renderPermisosRolesView(container, grants);
}

function renderPermisosRolesView(container, grants) {
  const rol = permisosRolesState.rolSeleccionado;
  const yaAsignados = grants.filter((g) => g.rol === rol).map((g) => g.permiso);
  const disponibles = PERMISOS_CATALOGO.filter((p) => !yaAsignados.includes(p.clave));
  const gruposDisponibles = {};
  for (const p of disponibles) (gruposDisponibles[p.grupo] ||= []).push(p);

  container.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h2 style="margin-top:0; font-size:1rem;">Crear permiso por rol</h2>
      <div class="row">
        <div class="field">
          <label>Rol</label>
          <select id="pr-rol">
            ${ROLES_GESTIONABLES.map((r) => `<option value="${r.key}" ${r.key === rol ? 'selected' : ''}>${r.label}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Permiso</label>
          <select id="pr-permiso" ${disponibles.length === 0 ? 'disabled' : ''}>
            ${disponibles.length === 0 ? '<option value="">Ya tiene todos los permisos</option>' : Object.entries(gruposDisponibles).map(([grupo, items]) => `
              <optgroup label="${grupo}">
                ${items.map((p) => `<option value="${p.clave}">${p.label}</option>`).join('')}
              </optgroup>
            `).join('')}
          </select>
        </div>
      </div>
      <button class="primary" id="pr-guardar" type="button" ${disponibles.length === 0 ? 'disabled' : ''}>Guardar</button>
    </div>

    <div class="card">
      <h2 style="margin-top:0; font-size:1rem;">Permisos de ${ROLES_GESTIONABLES.find((r) => r.key === rol)?.label}</h2>
      ${yaAsignados.length === 0 ? '<p style="color:var(--muted)">Este rol todavía no tiene permisos asignados.</p>' : `
        <table class="data-table">
          <thead><tr><th>Módulo</th><th>Permiso</th><th></th></tr></thead>
          <tbody>
            ${grants.filter((g) => g.rol === rol).map((g) => `
              <tr>
                <td>${PERMISOS_CATALOGO.find((p) => p.clave === g.permiso)?.grupo || ''}</td>
                <td>${labelPermiso(g.permiso)}</td>
                <td><button class="danger" data-quitar="${g.id}" type="button">Quitar</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;

  container.querySelector('#pr-rol').onchange = (e) => {
    permisosRolesState.rolSeleccionado = e.target.value;
    renderPermisosRolesView(container, grants);
  };

  container.querySelector('#pr-guardar').onclick = async () => {
    const permiso = container.querySelector('#pr-permiso').value;
    if (!permiso) return;
    try {
      await api.rolPermisos.create({ rol, permiso });
      toast('Permiso agregado');
      renderPermisosRoles(container);
    } catch (e) { toast(e.message, 'err'); }
  };

  container.querySelectorAll('[data-quitar]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api.rolPermisos.remove(btn.dataset.quitar);
        toast('Permiso quitado');
        renderPermisosRoles(container);
      } catch (e) { toast(e.message, 'err'); }
    };
  });
}
