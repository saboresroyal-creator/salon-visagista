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
        <thead><tr><th>Nombre</th><th>Teléfono</th><th>Próxima cita</th><th>Cumpleaños</th><th>Puntos</th><th>Cta Cte</th></tr></thead>
        <tbody>
          ${clientes.map((c) => `
            <tr data-id="${c.id}">
              <td>${c.nombre}</td>
              <td>${c.telefono || ''}</td>
              <td>${c.proxima_cita_fecha ? `${c.proxima_cita_fecha} ${c.proxima_cita_hora || ''}` : '—'}</td>
              <td>${c.fecha_nacimiento || '—'}</td>
              <td>${c.puntos ?? 0}</td>
              <td style="${(c.saldo_cta_cte || 0) > 0 ? 'color:var(--danger); font-weight:600;' : ''}">$${Number(c.saldo_cta_cte || 0).toFixed(2)}</td>
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

      ${isEdit ? `
        <div class="card" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; padding:10px 14px;">
          <div><b style="font-size:1.3rem;">${cliente.puntos ?? 0}</b> puntos</div>
          <button class="secondary" id="cm-ajustar-puntos" type="button">Ajustar puntos</button>
        </div>
        <div class="card" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; padding:10px 14px;">
          <div><b style="font-size:1.3rem; ${(cliente.saldo_cta_cte || 0) > 0 ? 'color:var(--danger);' : ''}">$${Number(cliente.saldo_cta_cte || 0).toFixed(2)}</b> cuenta corriente</div>
          <button class="secondary" id="cm-ajustar-cta-cte" type="button">Ver / registrar pago</button>
        </div>
      ` : ''}

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
    backdrop.querySelector('#cm-ajustar-puntos').onclick = () => openAjustePuntosModal(cliente, backdrop, container);
    backdrop.querySelector('#cm-ajustar-cta-cte').onclick = () => openAjusteCtaCteModal(cliente, backdrop, container);
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

const PUNTOS_TIPO_LABEL = { ganado: 'Ganado por venta', canjeado: 'Canjeado', ajuste: 'Ajuste manual' };

async function openAjustePuntosModal(cliente, parentBackdrop, container) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.style.zIndex = '200';
  backdrop.innerHTML = `
    <div class="modal">
      <h2>Puntos de ${cliente.nombre}</h2>
      <p style="margin-top:-8px;">Balance actual: <b>${cliente.puntos ?? 0}</b></p>

      <div class="row">
        <div class="field"><label>Puntos a sumar/restar</label><input type="number" id="ap-puntos" placeholder="Ej: 10 o -5" /></div>
        <div class="field"><label>Motivo</label><input id="ap-motivo" placeholder="Opcional" /></div>
      </div>
      <button class="primary" id="ap-guardar" type="button">Aplicar ajuste</button>

      <hr style="border-color:var(--border); margin:16px 0;" />
      <h3 style="font-size:0.95rem;">Historial</h3>
      <div id="ap-historial"><p style="color:var(--muted); font-size:0.85rem;">Cargando...</p></div>

      <div class="modal-actions">
        <button class="secondary" id="ap-cerrar">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#ap-cerrar').onclick = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };

  let historialRequestId = 0;
  async function loadHistorial() {
    const requestId = ++historialRequestId;
    const box = backdrop.querySelector('#ap-historial');
    const movimientos = await api.clientes.puntosHistorial(cliente.id);
    if (requestId !== historialRequestId) return; // una carga más nueva ya empezó/terminó
    box.innerHTML = movimientos.length === 0
      ? '<p style="color:var(--muted); font-size:0.85rem;">Sin movimientos todavía.</p>'
      : `
        <table class="data-table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Puntos</th><th>Motivo</th></tr></thead>
          <tbody>
            ${movimientos.map((m) => `
              <tr>
                <td>${new Date(m.created_at).toLocaleDateString('es-AR')}</td>
                <td>${PUNTOS_TIPO_LABEL[m.tipo] || m.tipo}</td>
                <td>${m.puntos > 0 ? '+' : ''}${m.puntos}</td>
                <td>${m.motivo || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
  }
  loadHistorial();

  backdrop.querySelector('#ap-guardar').onclick = async () => {
    const puntos = Number(backdrop.querySelector('#ap-puntos').value);
    if (!Number.isInteger(puntos) || puntos === 0) { toast('Ingresá un número entero distinto de cero', 'err'); return; }
    try {
      const res = await api.clientes.ajustarPuntos(cliente.id, { puntos, motivo: backdrop.querySelector('#ap-motivo').value.trim() });
      cliente.puntos = res.puntos;
      backdrop.querySelector('p').innerHTML = `Balance actual: <b>${res.puntos}</b>`;
      backdrop.querySelector('#ap-puntos').value = '';
      backdrop.querySelector('#ap-motivo').value = '';
      loadHistorial();
      toast('Puntos actualizados');
      const badge = parentBackdrop.querySelector('#cm-ajustar-puntos')?.previousElementSibling;
      if (badge) badge.innerHTML = `<b style="font-size:1.3rem;">${res.puntos}</b> puntos`;
      loadClientesList(container);
    } catch (e) { toast(e.message, 'err'); }
  };
}

const CTA_CTE_TIPO_LABEL = { cargo: 'Cargo (venta)', pago: 'Pago', ajuste: 'Ajuste manual' };

async function openAjusteCtaCteModal(cliente, parentBackdrop, container) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.style.zIndex = '200';
  backdrop.innerHTML = `
    <div class="modal">
      <h2>Cuenta corriente de ${cliente.nombre}</h2>
      <p style="margin-top:-8px;">Saldo actual: <b>$${Number(cliente.saldo_cta_cte || 0).toFixed(2)}</b></p>

      <div class="row">
        <div class="field"><label>Registrar pago</label><input type="number" min="0" step="0.01" id="ac-monto" placeholder="Monto que abonó" /></div>
        <div class="field"><label>Motivo</label><input id="ac-motivo" placeholder="Opcional" /></div>
      </div>
      <button class="primary" id="ac-pago" type="button">Registrar pago</button>
      <button class="secondary" id="ac-ajuste" type="button">Aplicar como ajuste manual</button>

      <hr style="border-color:var(--border); margin:16px 0;" />
      <h3 style="font-size:0.95rem;">Historial</h3>
      <div id="ac-historial"><p style="color:var(--muted); font-size:0.85rem;">Cargando...</p></div>

      <div class="modal-actions">
        <button class="secondary" id="ac-cerrar">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#ac-cerrar').onclick = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };

  let historialRequestId = 0;
  async function loadHistorial() {
    const requestId = ++historialRequestId;
    const box = backdrop.querySelector('#ac-historial');
    const movimientos = await api.clientes.cuentaCorrienteHistorial(cliente.id);
    if (requestId !== historialRequestId) return;
    box.innerHTML = movimientos.length === 0
      ? '<p style="color:var(--muted); font-size:0.85rem;">Sin movimientos todavía.</p>'
      : `
        <table class="data-table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Motivo</th></tr></thead>
          <tbody>
            ${movimientos.map((m) => `
              <tr>
                <td>${new Date(m.created_at).toLocaleDateString('es-AR')}</td>
                <td>${CTA_CTE_TIPO_LABEL[m.tipo] || m.tipo}</td>
                <td>${Number(m.monto) > 0 ? '+' : ''}$${Number(m.monto).toFixed(2)}</td>
                <td>${m.motivo || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
  }
  loadHistorial();

  function actualizarBalance(nuevoSaldo) {
    cliente.saldo_cta_cte = nuevoSaldo;
    backdrop.querySelector('p').innerHTML = `Saldo actual: <b>$${Number(nuevoSaldo).toFixed(2)}</b>`;
    backdrop.querySelector('#ac-monto').value = '';
    backdrop.querySelector('#ac-motivo').value = '';
    loadHistorial();
    const badge = parentBackdrop.querySelector('#cm-ajustar-cta-cte')?.previousElementSibling;
    if (badge) badge.innerHTML = `<b style="font-size:1.3rem; ${nuevoSaldo > 0 ? 'color:var(--danger);' : ''}">$${Number(nuevoSaldo).toFixed(2)}</b> cuenta corriente`;
    loadClientesList(container);
  }

  backdrop.querySelector('#ac-pago').onclick = async () => {
    const monto = Number(backdrop.querySelector('#ac-monto').value);
    if (!(monto > 0)) { toast('Ingresá un monto mayor a cero', 'err'); return; }
    try {
      const res = await api.clientes.ajustarCuentaCorriente(cliente.id, { monto, tipo: 'pago', motivo: backdrop.querySelector('#ac-motivo').value.trim() });
      actualizarBalance(res.saldo_cta_cte);
      toast('Pago registrado');
    } catch (e) { toast(e.message, 'err'); }
  };

  backdrop.querySelector('#ac-ajuste').onclick = async () => {
    const monto = Number(backdrop.querySelector('#ac-monto').value);
    if (!Number.isFinite(monto) || monto === 0) { toast('Ingresá un monto distinto de cero (negativo para restar)', 'err'); return; }
    try {
      const res = await api.clientes.ajustarCuentaCorriente(cliente.id, { monto, tipo: 'ajuste', motivo: backdrop.querySelector('#ac-motivo').value.trim() });
      actualizarBalance(res.saldo_cta_cte);
      toast('Ajuste aplicado');
    } catch (e) { toast(e.message, 'err'); }
  };
}
