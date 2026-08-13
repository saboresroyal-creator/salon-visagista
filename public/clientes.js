let clientesState = { q: '' };

async function renderClientes(container) {
  container.innerHTML = `
    <div class="search-bar">
      <input type="text" id="cl-buscar" placeholder="Buscar por nombre o teléfono..." value="${clientesState.q}" />
      <button class="primary" id="cl-nueva">+ Nueva clienta</button>
    </div>
    <div id="cl-tabla" class="card"><p>Cargando...</p></div>
  `;

  container.querySelector('#cl-nueva').onclick = () => openClienteModal(null, container);

  let searchTimeout;
  container.querySelector('#cl-buscar').oninput = (e) => {
    clientesState.q = e.target.value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadClientesList(container), 250);
  };

  await loadClientesList(container);
}

async function loadClientesList(container) {
  const box = container.querySelector('#cl-tabla');
  try {
    const clientes = await api.clientes.list(clientesState.q);
    if (clientes.length === 0) {
      box.innerHTML = '<p>No se encontraron clientas.</p>';
      return;
    }
    box.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Nombre</th><th>Teléfono</th><th>Próxima cita</th><th>Cumpleaños</th></tr></thead>
        <tbody>
          ${clientes.map((c) => `
            <tr data-id="${c.id}">
              <td>${c.nombre}</td>
              <td>${c.telefono || ''}</td>
              <td>${c.proxima_cita_fecha ? `${c.proxima_cita_fecha} ${c.proxima_cita_hora || ''}` : '—'}</td>
              <td>${c.fecha_nacimiento || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    box.querySelectorAll('tr[data-id]').forEach((row) => {
      row.onclick = async () => {
        const cliente = await api.clientes.get(row.dataset.id);
        openClienteModal(cliente, container);
      };
    });
  } catch (e) {
    box.innerHTML = `<p>Error: ${e.message}</p>`;
  }
}

function openClienteModal(cliente, container) {
  const isEdit = !!cliente;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="width:560px;">
      <h2>${isEdit ? cliente.nombre : 'Nueva clienta'}</h2>

      <div class="field"><label>Nombre</label><input id="cm-nombre" value="${cliente?.nombre || ''}" /></div>
      <div class="row">
        <div class="field"><label>Teléfono</label><input id="cm-telefono" value="${cliente?.telefono || ''}" /></div>
        <div class="field"><label>Email</label><input id="cm-email" value="${cliente?.email || ''}" /></div>
      </div>
      <div class="field"><label>Dirección</label><input id="cm-direccion" value="${cliente?.direccion || ''}" /></div>
      <div class="row">
        <div class="field"><label>Fecha de nacimiento</label><input type="date" id="cm-nacimiento" value="${cliente?.fecha_nacimiento || ''}" /></div>
        <div class="field"><label>Días de aviso</label><input type="number" id="cm-dias-aviso" value="${cliente?.dias_aviso ?? 2}" /></div>
      </div>
      <div class="row">
        <div class="field"><label>Próxima cita - fecha</label><input type="date" id="cm-cita-fecha" value="${cliente?.proxima_cita_fecha || ''}" /></div>
        <div class="field"><label>Próxima cita - hora</label><input type="time" id="cm-cita-hora" value="${(cliente?.proxima_cita_hora || '').slice(0, 5)}" /></div>
      </div>
      <div class="field"><label>Notas</label><textarea id="cm-notas" rows="2">${cliente?.notas || ''}</textarea></div>
      <div class="field"><label>Mensaje de recordatorio</label><textarea id="cm-msg-recordatorio" rows="2">${cliente?.msg_recordatorio || ''}</textarea></div>
      <div class="field"><label>Mensaje de cumpleaños</label><textarea id="cm-msg-cumple" rows="2">${cliente?.msg_cumpleanos || ''}</textarea></div>

      ${isEdit ? `
        <hr style="border-color:var(--border); margin:16px 0;" />
        <h3 style="font-size:0.95rem;">Historial de tratamientos</h3>
        <div id="cm-tratamientos"></div>
        <button class="secondary" id="cm-add-tratamiento" type="button" style="margin-top:8px;">+ Agregar tratamiento</button>
      ` : ''}

      <div class="modal-actions">
        ${isEdit ? '<button class="danger" id="cm-eliminar">Eliminar clienta</button>' : ''}
        <button class="secondary" id="cm-cancelar">Cancelar</button>
        <button class="primary" id="cm-guardar">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  function closeModal() { backdrop.remove(); }
  backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };
  backdrop.querySelector('#cm-cancelar').onclick = closeModal;

  if (isEdit) {
    renderTratamientos(backdrop, cliente);
    backdrop.querySelector('#cm-add-tratamiento').onclick = () => openTratamientoModal(cliente, backdrop);
    backdrop.querySelector('#cm-eliminar').onclick = async () => {
      if (!confirm(`¿Eliminar a ${cliente.nombre}? Esta acción no se puede deshacer.`)) return;
      try {
        await api.clientes.remove(cliente.id);
        toast('Clienta eliminada');
        closeModal();
        loadClientesList(container);
      } catch (e) { toast(e.message, 'err'); }
    };
  }

  backdrop.querySelector('#cm-guardar').onclick = async () => {
    const payload = {
      nombre: backdrop.querySelector('#cm-nombre').value.trim(),
      telefono: backdrop.querySelector('#cm-telefono').value.trim(),
      email: backdrop.querySelector('#cm-email').value.trim(),
      direccion: backdrop.querySelector('#cm-direccion').value.trim(),
      fecha_nacimiento: backdrop.querySelector('#cm-nacimiento').value || null,
      dias_aviso: Number(backdrop.querySelector('#cm-dias-aviso').value) || 0,
      proxima_cita_fecha: backdrop.querySelector('#cm-cita-fecha').value || null,
      proxima_cita_hora: backdrop.querySelector('#cm-cita-hora').value || null,
      notas: backdrop.querySelector('#cm-notas').value.trim(),
      msg_recordatorio: backdrop.querySelector('#cm-msg-recordatorio').value.trim(),
      msg_cumpleanos: backdrop.querySelector('#cm-msg-cumple').value.trim()
    };
    if (!payload.nombre) { toast('El nombre es obligatorio', 'err'); return; }
    try {
      if (isEdit) await api.clientes.update(cliente.id, payload);
      else await api.clientes.create(payload);
      toast('Clienta guardada');
      closeModal();
      loadClientesList(container);
    } catch (e) { toast(e.message, 'err'); }
  };
}

function renderTratamientos(backdrop, cliente) {
  const box = backdrop.querySelector('#cm-tratamientos');
  if (!cliente.tratamientos || cliente.tratamientos.length === 0) {
    box.innerHTML = '<p style="color:var(--muted); font-size:0.85rem;">Sin tratamientos registrados.</p>';
    return;
  }
  box.innerHTML = cliente.tratamientos.map((t) => `
    <div class="card" style="margin-bottom:8px; padding:10px;">
      <b>${t.fecha}</b> — ${t.servicio || ''}
      ${t.productos ? `<div style="font-size:0.82rem; color:var(--muted);">Productos: ${t.productos}</div>` : ''}
      ${t.obs ? `<div style="font-size:0.82rem;">${t.obs}</div>` : ''}
    </div>
  `).join('');
}

function openTratamientoModal(cliente, parentBackdrop) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.style.zIndex = '200';
  backdrop.innerHTML = `
    <div class="modal">
      <h2>Nuevo tratamiento</h2>
      <div class="field"><label>Fecha</label><input type="date" id="tr-fecha" value="${new Date().toISOString().slice(0, 10)}" /></div>
      <div class="field"><label>Servicio</label><input id="tr-servicio" /></div>
      <div class="field"><label>Productos usados</label><input id="tr-productos" /></div>
      <div class="field"><label>Observaciones</label><textarea id="tr-obs" rows="2"></textarea></div>
      <div class="modal-actions">
        <button class="secondary" id="tr-cancelar">Cancelar</button>
        <button class="primary" id="tr-guardar">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#tr-cancelar').onclick = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };

  backdrop.querySelector('#tr-guardar').onclick = async () => {
    try {
      const nuevo = await api.clientes.addTratamiento(cliente.id, {
        fecha: backdrop.querySelector('#tr-fecha').value,
        servicio: backdrop.querySelector('#tr-servicio').value,
        productos: backdrop.querySelector('#tr-productos').value,
        obs: backdrop.querySelector('#tr-obs').value
      });
      cliente.tratamientos = [nuevo, ...(cliente.tratamientos || [])];
      renderTratamientos(parentBackdrop, cliente);
      toast('Tratamiento agregado');
      backdrop.remove();
    } catch (e) { toast(e.message, 'err'); }
  };
}
