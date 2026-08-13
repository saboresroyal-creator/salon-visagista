const CAL_START_HOUR = 8;
const CAL_END_HOUR = 21;
const CAL_SLOT_MIN = 30;
const CAL_SLOT_PX = 40;
const CAL_WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

let calState = {
  viewMode: 'mes', // 'mes' | 'dia'
  date: new Date(),
  profesionales: [],
  turnos: []
};

function fmtDateISO(d) {
  return d.toISOString().slice(0, 10);
}

function fmtDateLabel(d) {
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtMonthLabel(d) {
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

function getMonthGridDates(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return days;
}

async function renderCalendario(container) {
  container.innerHTML = '<p>Cargando calendario...</p>';
  try {
    calState.profesionales = await api.profesionales.list();
  } catch (e) {
    container.innerHTML = `<p>Error cargando profesionales: ${e.message}</p>`;
    return;
  }
  await reloadAndPaint(container);
}

async function loadTurnosRange(desde, hasta) {
  calState.turnos = await api.turnos.list({ desde, hasta });
}

async function reloadAndPaint(container) {
  if (calState.viewMode === 'mes') {
    const days = getMonthGridDates(calState.date);
    await loadTurnosRange(fmtDateISO(days[0]), fmtDateISO(days[days.length - 1]));
  } else {
    const iso = fmtDateISO(calState.date);
    await loadTurnosRange(iso, iso);
  }
  paint(container);
}

function shiftPeriod(delta, container) {
  if (calState.viewMode === 'mes') calState.date.setMonth(calState.date.getMonth() + delta);
  else calState.date.setDate(calState.date.getDate() + delta);
  reloadAndPaint(container);
}

function paint(container) {
  const activos = calState.profesionales.filter((p) => p.activo !== false);

  container.innerHTML = `
    <div class="cal-toolbar">
      <button class="secondary" id="cal-prev">‹</button>
      <button class="secondary" id="cal-today">Hoy</button>
      <button class="secondary" id="cal-next">›</button>
      <div class="date-label">${calState.viewMode === 'mes' ? fmtMonthLabel(calState.date) : fmtDateLabel(calState.date)}</div>
      <div style="flex:1"></div>
      <div style="display:flex; gap:4px; margin-right:10px;">
        <button class="secondary ${calState.viewMode === 'mes' ? 'active' : ''}" id="cal-view-mes">Mes</button>
        <button class="secondary ${calState.viewMode === 'dia' ? 'active' : ''}" id="cal-view-dia">Día</button>
      </div>
      <button class="primary" id="cal-nuevo">+ Nuevo turno</button>
    </div>
    ${activos.length === 0
      ? '<p>No hay profesionales cargadas todavía. Agregalas desde la pestaña Servicios &amp; Equipo.</p>'
      : (calState.viewMode === 'mes' ? renderMonthGrid(activos) : renderDayGrid(activos, activos.length))}
  `;

  container.querySelector('#cal-prev').onclick = () => shiftPeriod(-1, container);
  container.querySelector('#cal-next').onclick = () => shiftPeriod(1, container);
  container.querySelector('#cal-today').onclick = () => { calState.date = new Date(); reloadAndPaint(container); };
  container.querySelector('#cal-nuevo').onclick = () => openTurnoModal({ fecha: fmtDateISO(calState.date) }, container);
  container.querySelector('#cal-view-mes').onclick = () => { calState.viewMode = 'mes'; reloadAndPaint(container); };
  container.querySelector('#cal-view-dia').onclick = () => { calState.viewMode = 'dia'; reloadAndPaint(container); };

  if (activos.length === 0) return;

  if (calState.viewMode === 'dia') {
    container.querySelectorAll('.cal-slot').forEach((slot) => {
      slot.onclick = () => {
        openTurnoModal({
          fecha: fmtDateISO(calState.date),
          profesional_id: slot.dataset.prof,
          hora_inicio: slot.dataset.hora
        }, container);
      };
    });
    container.querySelectorAll('.cal-turno').forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        const turno = calState.turnos.find((t) => t.id === el.dataset.id);
        if (turno) openTurnoModal(turno, container);
      };
    });
  } else {
    container.querySelectorAll('.cal-month-cell').forEach((cell) => {
      cell.onclick = () => openTurnoModal({ fecha: cell.dataset.fecha }, container);
    });
    container.querySelectorAll('.cal-month-daynum').forEach((btn) => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        calState.date = new Date(btn.dataset.fecha + 'T00:00:00');
        calState.viewMode = 'dia';
        reloadAndPaint(container);
      };
    });
    container.querySelectorAll('.cal-month-pill').forEach((pill) => {
      pill.onclick = (ev) => {
        ev.stopPropagation();
        const turno = calState.turnos.find((t) => t.id === pill.dataset.id);
        if (turno) openTurnoModal(turno, container);
      };
    });
  }
}

function renderMonthGrid(activos) {
  const days = getMonthGridDates(calState.date);
  const currentMonth = calState.date.getMonth();
  const todayIso = fmtDateISO(new Date());

  const profColor = {};
  activos.forEach((p) => { profColor[p.id] = p.color; });

  const turnosByDate = {};
  for (const t of calState.turnos) {
    (turnosByDate[t.fecha] ||= []).push(t);
  }

  const header = CAL_WEEKDAYS.map((n) => `<div class="cal-month-head">${n}</div>`).join('');

  const cells = days.map((d) => {
    const iso = fmtDateISO(d);
    const inMonth = d.getMonth() === currentMonth;
    const turnosDia = (turnosByDate[iso] || []).slice().sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    const visibles = turnosDia.slice(0, 3);
    const resto = turnosDia.length - visibles.length;

    return `
      <div class="cal-month-cell ${inMonth ? '' : 'out'}" data-fecha="${iso}">
        <button type="button" class="cal-month-daynum ${iso === todayIso ? 'today' : ''}" data-fecha="${iso}">${d.getDate()}</button>
        <div class="cal-month-pills">
          ${visibles.map((t) => `
            <div class="cal-month-pill ${t.estado === 'cancelado' ? 'cancelado' : ''}" data-id="${t.id}" style="background:${profColor[t.profesional_id] || '#5b8def'}">
              ${t.hora_inicio.slice(0, 5)} ${t.clientes?.nombre || ''}
            </div>
          `).join('')}
          ${resto > 0 ? `<div class="cal-month-more">+${resto} más</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="cal-month-grid">
      <div class="cal-month-headers">${header}</div>
      <div class="cal-month-body">${cells}</div>
    </div>
  `;
}

function renderDayGrid(activos, cols) {
  const totalSlots = ((CAL_END_HOUR - CAL_START_HOUR) * 60) / CAL_SLOT_MIN;
  const totalHeight = totalSlots * CAL_SLOT_PX;

  let timeSlots = '';
  for (let i = 0; i < totalSlots; i++) {
    const mins = CAL_START_HOUR * 60 + i * CAL_SLOT_MIN;
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    timeSlots += `<div class="cal-time-slot">${m === '00' ? `${h}:00` : ''}</div>`;
  }

  let profCols = '';
  for (const prof of activos) {
    let slots = '';
    for (let i = 0; i < totalSlots; i++) {
      const mins = CAL_START_HOUR * 60 + i * CAL_SLOT_MIN;
      const h = String(Math.floor(mins / 60)).padStart(2, '0');
      const m = String(mins % 60).padStart(2, '0');
      slots += `<div class="cal-slot" data-prof="${prof.id}" data-hora="${h}:${m}"></div>`;
    }

    const turnosProf = calState.turnos.filter((t) => t.profesional_id === prof.id);
    const blocks = turnosProf.map((t) => renderTurnoBlock(t, prof.color)).join('');

    profCols += `<div class="cal-prof-col" style="height:${totalHeight}px">${slots}${blocks}</div>`;
  }

  return `
    <div class="cal-grid" style="grid-template-columns: 60px repeat(${cols}, 1fr);">
      <div class="cal-header-row" style="grid-column: 1 / -1; display:grid; grid-template-columns: 60px repeat(${cols}, 1fr);">
        <div></div>
        ${activos.map((p) => `<div class="cal-prof-header" style="border-color:${p.color}">${p.nombre}</div>`).join('')}
      </div>
      <div class="cal-body" style="grid-column: 1 / -1; display:grid; grid-template-columns: 60px repeat(${cols}, 1fr);">
        <div class="cal-time-col">${timeSlots}</div>
        ${profCols}
      </div>
    </div>
  `;
}

function renderTurnoBlock(t, color) {
  const [sh, sm] = t.hora_inicio.split(':').map(Number);
  const [eh, em] = t.hora_fin.split(':').map(Number);
  const startMin = sh * 60 + sm - CAL_START_HOUR * 60;
  const endMin = eh * 60 + em - CAL_START_HOUR * 60;
  const top = (startMin / CAL_SLOT_MIN) * CAL_SLOT_PX;
  const height = Math.max(((endMin - startMin) / CAL_SLOT_MIN) * CAL_SLOT_PX, 20);

  const servNames = (t.turno_servicios || []).map((ts) => ts.servicios?.nombre).filter(Boolean).join(', ');
  const clienteNombre = t.clientes?.nombre || '(sin cliente)';

  return `
    <div class="cal-turno ${t.estado === 'cancelado' ? 'cancelado' : ''}" data-id="${t.id}"
         style="top:${top}px; height:${height}px; background:${color || '#5b8def'}">
      <b>${t.hora_inicio.slice(0, 5)} · ${clienteNombre}</b>
      ${servNames || ''}
    </div>
  `;
}

// ── Modal de turno ──
async function openTurnoModal(turno, container) {
  const isEdit = !!turno.id;
  const servicios = await api.servicios.list();
  const profesionales = calState.profesionales;

  let clienteSeleccionado = turno.clientes || null;
  let serviciosSeleccionados = (turno.turno_servicios || []).map((ts) => ({
    servicio_id: ts.servicios?.id || ts.servicio_id,
    nombre: ts.servicios?.nombre || '',
    precio: ts.precio
  }));

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h2>${isEdit ? 'Editar turno' : 'Nuevo turno'}</h2>

      <div class="field">
        <label>Clienta</label>
        <input type="text" id="tm-cliente-buscar" placeholder="Buscar por nombre o teléfono..." value="${clienteSeleccionado ? clienteSeleccionado.nombre : ''}" autocomplete="off" />
        <div id="tm-cliente-resultados" style="position:relative;"></div>
      </div>

      <div class="row">
        <div class="field">
          <label>Profesional</label>
          <select id="tm-profesional">
            ${profesionales.map((p) => `<option value="${p.id}" ${p.id === turno.profesional_id ? 'selected' : ''}>${p.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Fecha</label>
          <input type="date" id="tm-fecha" value="${turno.fecha || fmtDateISO(calState.date)}" />
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label>Hora inicio</label>
          <input type="time" id="tm-hora-inicio" value="${(turno.hora_inicio || '09:00').slice(0, 5)}" />
        </div>
        <div class="field">
          <label>Hora fin</label>
          <input type="time" id="tm-hora-fin" value="${(turno.hora_fin || '09:30').slice(0, 5)}" />
        </div>
      </div>

      <div class="field">
        <label>Servicios</label>
        <select id="tm-servicio-add">
          <option value="">+ agregar servicio...</option>
          ${servicios.map((s) => `<option value="${s.id}" data-precio="${s.precio}" data-dur="${s.duracion_min}" data-nombre="${s.nombre}">${s.nombre} ${s.categoria ? `(${s.categoria})` : ''}</option>`).join('')}
        </select>
        <div id="tm-servicios-chips"></div>
      </div>

      <div class="field">
        <label>Estado</label>
        <select id="tm-estado">
          <option value="confirmado" ${turno.estado === 'confirmado' || !turno.estado ? 'selected' : ''}>Confirmado</option>
          <option value="completado" ${turno.estado === 'completado' ? 'selected' : ''}>Completado</option>
          <option value="cancelado" ${turno.estado === 'cancelado' ? 'selected' : ''}>Cancelado</option>
        </select>
      </div>

      <div class="field">
        <label>Notas</label>
        <textarea id="tm-notas" rows="2">${turno.notas || ''}</textarea>
      </div>

      <div class="modal-actions">
        ${isEdit ? '<button class="danger" id="tm-eliminar">Eliminar</button>' : ''}
        <button class="secondary" id="tm-cancelar">Cancelar</button>
        <button class="primary" id="tm-guardar">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  function closeModal() { backdrop.remove(); }
  backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };
  backdrop.querySelector('#tm-cancelar').onclick = closeModal;

  // Preseleccionar hora si vino de un click en la grilla
  if (turno.hora_inicio && !isEdit) {
    const [h, m] = turno.hora_inicio.split(':').map(Number);
    const finMin = h * 60 + m + 30;
    backdrop.querySelector('#tm-hora-fin').value = `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`;
  }
  if (turno.profesional_id) backdrop.querySelector('#tm-profesional').value = turno.profesional_id;

  function renderChips() {
    const box = backdrop.querySelector('#tm-servicios-chips');
    box.innerHTML = serviciosSeleccionados.map((s, i) => `
      <span class="servicio-chip">${s.nombre} · $${s.precio}<button data-i="${i}" type="button">×</button></span>
    `).join('');
    box.querySelectorAll('button').forEach((btn) => {
      btn.onclick = () => { serviciosSeleccionados.splice(Number(btn.dataset.i), 1); renderChips(); };
    });
  }
  renderChips();

  backdrop.querySelector('#tm-servicio-add').onchange = (e) => {
    const opt = e.target.selectedOptions[0];
    if (!opt.value) return;
    serviciosSeleccionados.push({ servicio_id: opt.value, nombre: opt.dataset.nombre, precio: Number(opt.dataset.precio) });
    renderChips();

    const dur = Number(opt.dataset.dur) || 30;
    const inicioEl = backdrop.querySelector('#tm-hora-inicio');
    const finEl = backdrop.querySelector('#tm-hora-fin');
    const [h, m] = inicioEl.value.split(':').map(Number);
    const finMin = h * 60 + m + dur;
    finEl.value = `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`;
    e.target.value = '';
  };

  // Búsqueda de clienta
  const buscarInput = backdrop.querySelector('#tm-cliente-buscar');
  const resultadosBox = backdrop.querySelector('#tm-cliente-resultados');
  let searchTimeout;
  buscarInput.oninput = () => {
    clienteSeleccionado = null;
    clearTimeout(searchTimeout);
    const q = buscarInput.value.trim();
    if (q.length < 2) { resultadosBox.innerHTML = ''; return; }
    searchTimeout = setTimeout(async () => {
      const res = await api.clientes.list(q);
      resultadosBox.innerHTML = `
        <div style="position:absolute; background:white; border:1px solid var(--border); border-radius:8px; width:100%; max-height:180px; overflow-y:auto; z-index:50;">
          ${res.map((c) => `<div data-id="${c.id}" data-nombre="${c.nombre}" style="padding:8px 10px; cursor:pointer;">${c.nombre} ${c.telefono ? `· ${c.telefono}` : ''}</div>`).join('')}
          <div data-crear="1" style="padding:8px 10px; cursor:pointer; color:var(--accent-dark); font-weight:600;">+ Crear clienta "${q}"</div>
        </div>
      `;
      resultadosBox.querySelectorAll('[data-id]').forEach((row) => {
        row.onclick = () => {
          clienteSeleccionado = { id: row.dataset.id, nombre: row.dataset.nombre };
          buscarInput.value = row.dataset.nombre;
          resultadosBox.innerHTML = '';
        };
      });
      const crear = resultadosBox.querySelector('[data-crear]');
      if (crear) {
        crear.onclick = async () => {
          try {
            const nuevo = await api.clientes.create({ nombre: q });
            clienteSeleccionado = { id: nuevo.id, nombre: nuevo.nombre };
            buscarInput.value = nuevo.nombre;
            resultadosBox.innerHTML = '';
            toast('Clienta creada');
          } catch (err) { toast(err.message, 'err'); }
        };
      }
    }, 250);
  };

  backdrop.querySelector('#tm-guardar').onclick = async () => {
    if (!clienteSeleccionado) { toast('Elegí o creá una clienta', 'err'); return; }
    const payload = {
      cliente_id: clienteSeleccionado.id,
      profesional_id: backdrop.querySelector('#tm-profesional').value,
      fecha: backdrop.querySelector('#tm-fecha').value,
      hora_inicio: backdrop.querySelector('#tm-hora-inicio').value,
      hora_fin: backdrop.querySelector('#tm-hora-fin').value,
      estado: backdrop.querySelector('#tm-estado').value,
      notas: backdrop.querySelector('#tm-notas').value,
      servicios: serviciosSeleccionados.map((s) => ({ servicio_id: s.servicio_id, precio: s.precio }))
    };
    try {
      if (isEdit) await api.turnos.update(turno.id, payload);
      else await api.turnos.create(payload);
      toast('Turno guardado');
      closeModal();
      await reloadAndPaint(container);
    } catch (err) { toast(err.message, 'err'); }
  };

  if (isEdit) {
    backdrop.querySelector('#tm-eliminar').onclick = async () => {
      if (!confirm('¿Eliminar este turno?')) return;
      try {
        await api.turnos.remove(turno.id);
        toast('Turno eliminado');
        closeModal();
        await reloadAndPaint(container);
      } catch (err) { toast(err.message, 'err'); }
    };
  }
}
