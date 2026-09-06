// Roles disponibles. Los permisos de cada rol ya no se tildan por usuario:
// se administran centralizados en la pantalla "Permisos por Rol".
const ROLES = [
  { key: 'admin', label: 'Administrador' },
  { key: 'profesional', label: 'Profesional' },
  { key: 'recepcionista', label: 'Recepcionista' },
  { key: 'cajero', label: 'Cajero' },
  { key: 'encargada', label: 'Encargada / Gerencia' }
];

async function renderUsuarios(container) {
  container.innerHTML = `
    <div class="cal-toolbar">
      <div style="flex:1"></div>
      <button class="primary" id="us-nuevo">+ Nuevo usuario</button>
    </div>
    <div id="us-lista" class="card"><p>Cargando...</p></div>
  `;
  container.querySelector('#us-nuevo').onclick = () => openUsuarioModal(null, container);
  await loadUsuarios(container);
}

async function loadUsuarios(container) {
  const box = container.querySelector('#us-lista');
  try {
    const usuarios = await api.usuarios.list();
    box.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th></tr></thead>
        <tbody>
          ${usuarios.map((u) => `
            <tr data-id="${u.id}">
              <td>${u.nombre}</td>
              <td>${u.email || ''}</td>
              <td>${ROLES.find((r) => r.key === u.rol)?.label || u.rol}</td>
              <td>${u.activo === false ? 'Inactivo' : 'Activo'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    box.querySelectorAll('tr[data-id]').forEach((row) => {
      row.onclick = () => {
        const u = usuarios.find((x) => x.id === row.dataset.id);
        openUsuarioModal(u, container);
      };
    });
  } catch (e) {
    box.innerHTML = `<p>Error: ${e.message}</p>`;
  }
}

async function openUsuarioModal(usuario, container) {
  const isEdit = !!usuario;
  const profesionales = (await api.profesionales.list()).filter((p) => p.activo !== false);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h2>${isEdit ? usuario.nombre : 'Nuevo usuario'}</h2>

      <div class="field"><label>Nombre</label><input id="um-nombre" value="${usuario?.nombre || ''}" /></div>
      <div class="field">
        <label>Email</label>
        <input id="um-email" type="email" value="${usuario?.email || ''}" ${isEdit ? 'disabled' : ''} />
      </div>
      <div class="field">
        <label>${isEdit ? 'Nueva contraseña (dejar vacío para no cambiarla)' : 'Contraseña'}</label>
        <input id="um-password" type="password" />
      </div>

      <div class="field">
        <label>Rol</label>
        <select id="um-rol">
          ${ROLES.map((r) => `<option value="${r.key}" ${(usuario?.rol || 'profesional') === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
        <p style="font-size:0.78rem; color:var(--muted); margin:4px 0 0;">Qué puede hacer cada rol se administra en "Permisos por Rol".</p>
      </div>

      <div class="field" id="um-vinculo-field" style="display:none;">
        <label>Vincular a profesional (equipo)</label>
        <select id="um-profesional-id">
          <option value="">— Sin vincular —</option>
          ${profesionales.map((p) => `<option value="${p.id}" ${usuario?.profesional_id === p.id ? 'selected' : ''}>${p.nombre}</option>`).join('')}
        </select>
        <p style="font-size:0.78rem; color:var(--muted); margin:4px 0 0;">Necesario para que vea sus propios turnos en "Mis turnos" y su comisión.</p>
      </div>

      ${isEdit ? `
        <div class="field"><label><input type="checkbox" id="um-activo" ${usuario.activo !== false ? 'checked' : ''} /> Usuario activo</label></div>
      ` : ''}

      <div class="modal-actions">
        ${isEdit ? '<button class="danger" id="um-eliminar">Eliminar</button>' : ''}
        <button class="secondary" id="um-cancelar">Cancelar</button>
        <button class="primary" id="um-guardar">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  backdrop.querySelector('#um-cancelar').onclick = close;

  const rolSelect = backdrop.querySelector('#um-rol');
  const vinculoField = backdrop.querySelector('#um-vinculo-field');
  const toggleVinculo = () => { vinculoField.style.display = rolSelect.value === 'profesional' ? 'flex' : 'none'; };
  rolSelect.onchange = toggleVinculo;
  toggleVinculo();

  backdrop.querySelector('#um-guardar').onclick = async () => {
    const nombre = backdrop.querySelector('#um-nombre').value.trim();
    const email = backdrop.querySelector('#um-email').value.trim();
    const password = backdrop.querySelector('#um-password').value;
    const rol = rolSelect.value;
    const profesionalId = backdrop.querySelector('#um-profesional-id').value || null;

    if (!nombre || (!isEdit && (!email || !password))) {
      toast('Completá nombre, email y contraseña', 'err');
      return;
    }

    try {
      if (isEdit) {
        const payload = { nombre, rol, activo: backdrop.querySelector('#um-activo').checked, profesional_id: profesionalId };
        if (password) payload.password = password;
        await api.usuarios.update(usuario.id, payload);
      } else {
        await api.usuarios.create({ nombre, email, password, rol, profesional_id: profesionalId });
      }
      toast('Usuario guardado');
      close();
      loadUsuarios(container);
    } catch (e) { toast(e.message, 'err'); }
  };

  if (isEdit) {
    backdrop.querySelector('#um-eliminar').onclick = async () => {
      if (!confirm(`¿Eliminar a ${usuario.nombre}? Perderá el acceso al sistema.`)) return;
      try {
        await api.usuarios.remove(usuario.id);
        toast('Usuario eliminado');
        close();
        loadUsuarios(container);
      } catch (e) { toast(e.message, 'err'); }
    };
  }
}
