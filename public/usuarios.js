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
        <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Módulos</th><th>Estado</th></tr></thead>
        <tbody>
          ${usuarios.map((u) => `
            <tr data-id="${u.id}">
              <td>${u.nombre}</td>
              <td>${u.email || ''}</td>
              <td>${u.rol === 'admin' ? 'Administrador' : 'Usuario'}</td>
              <td>${u.rol === 'admin' ? 'Todos' : (u.permisos || []).map((p) => MODULES.find((m) => m.key === p)?.label || p).join(', ') || '—'}</td>
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

function openUsuarioModal(usuario, container) {
  const isEdit = !!usuario;
  const permisosActuales = usuario?.permisos || [];

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
          <option value="usuario" ${usuario?.rol !== 'admin' ? 'selected' : ''}>Usuario (acceso por módulo)</option>
          <option value="admin" ${usuario?.rol === 'admin' ? 'selected' : ''}>Administrador (acceso total)</option>
        </select>
      </div>

      <div class="field" id="um-permisos-field">
        <label>Módulos permitidos</label>
        ${MODULES.map((m) => `
          <label style="display:flex; align-items:center; gap:6px; font-size:0.88rem; font-weight:normal; margin-bottom:4px;">
            <input type="checkbox" data-modulo="${m.key}" ${permisosActuales.includes(m.key) ? 'checked' : ''} />
            ${m.label}
          </label>
        `).join('')}
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

  const permisosField = backdrop.querySelector('#um-permisos-field');
  const rolSelect = backdrop.querySelector('#um-rol');
  const toggleField = () => { permisosField.style.display = rolSelect.value === 'admin' ? 'none' : 'block'; };
  toggleField();
  rolSelect.onchange = toggleField;

  backdrop.querySelector('#um-guardar').onclick = async () => {
    const nombre = backdrop.querySelector('#um-nombre').value.trim();
    const email = backdrop.querySelector('#um-email').value.trim();
    const password = backdrop.querySelector('#um-password').value;
    const rol = rolSelect.value;
    const permisos = [...backdrop.querySelectorAll('[data-modulo]:checked')].map((el) => el.dataset.modulo);

    if (!nombre || (!isEdit && (!email || !password))) {
      toast('Completá nombre, email y contraseña', 'err');
      return;
    }

    try {
      if (isEdit) {
        const payload = { nombre, rol, permisos, activo: backdrop.querySelector('#um-activo').checked };
        if (password) payload.password = password;
        await api.usuarios.update(usuario.id, payload);
      } else {
        await api.usuarios.create({ nombre, email, password, rol, permisos });
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
