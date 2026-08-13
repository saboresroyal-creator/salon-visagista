let egresosState = {
  desde: new Date(new Date().setDate(1)).toISOString().slice(0, 10),
  hasta: new Date().toISOString().slice(0, 10)
};

async function renderEgresos(container) {
  container.innerHTML = `
    <div class="cal-toolbar">
      <label style="font-size:0.82rem; color:var(--muted);">Desde</label>
      <input type="date" id="eg-desde" value="${egresosState.desde}" />
      <label style="font-size:0.82rem; color:var(--muted);">Hasta</label>
      <input type="date" id="eg-hasta" value="${egresosState.hasta}" />
      <div style="flex:1"></div>
      <button class="primary" id="eg-nuevo">+ Nuevo egreso</button>
    </div>
    <div id="eg-resumen" class="card" style="margin-bottom:14px;"></div>
    <div id="eg-lista" class="card"><p>Cargando...</p></div>
  `;

  const reload = () => {
    egresosState.desde = container.querySelector('#eg-desde').value;
    egresosState.hasta = container.querySelector('#eg-hasta').value;
    loadEgresos(container);
  };
  container.querySelector('#eg-desde').onchange = reload;
  container.querySelector('#eg-hasta').onchange = reload;
  container.querySelector('#eg-nuevo').onclick = () => openEgresoModal(null, container);

  await loadEgresos(container);
}

async function loadEgresos(container) {
  const box = container.querySelector('#eg-lista');
  const resumenBox = container.querySelector('#eg-resumen');
  const egresos = await api.egresos.list({ desde: egresosState.desde, hasta: egresosState.hasta });

  const total = egresos.reduce((s, e) => s + Number(e.monto), 0);
  resumenBox.innerHTML = `<b>${egresos.length}</b> egreso(s) · Total del período: <b>$${total.toFixed(2)}</b>`;

  if (egresos.length === 0) {
    box.innerHTML = '<p style="color:var(--muted)">Sin egresos en ese rango.</p>';
    return;
  }

  box.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Monto</th><th></th></tr></thead>
      <tbody>
        ${egresos.map((e) => `
          <tr data-id="${e.id}">
            <td>${e.fecha}</td><td>${e.concepto}</td><td>${e.categoria || '—'}</td><td>$${Number(e.monto).toFixed(2)}</td>
            <td><button class="danger" data-del="${e.id}">Eliminar</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  box.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      if (!confirm('¿Eliminar este egreso?')) return;
      await api.egresos.remove(btn.dataset.del);
      toast('Egreso eliminado');
      loadEgresos(container);
    };
  });
}

function openEgresoModal(egreso, container) {
  const isEdit = !!egreso;
  smallModal(isEdit ? 'Editar egreso' : 'Nuevo egreso', `
      <div class="field"><label>Concepto</label><input id="em-concepto" value="${egreso?.concepto || ''}" /></div>
      <div class="row">
        <div class="field"><label>Monto</label><input type="number" id="em-monto" value="${egreso?.monto ?? ''}" /></div>
        <div class="field"><label>Fecha</label><input type="date" id="em-fecha" value="${egreso?.fecha || new Date().toISOString().slice(0, 10)}" /></div>
      </div>
      <div class="field"><label>Categoría</label><input id="em-categoria" value="${egreso?.categoria || ''}" placeholder="Insumos, alquiler, servicios..." /></div>
    `,
    async (backdrop, close) => {
      const payload = {
        concepto: backdrop.querySelector('#em-concepto').value.trim(),
        monto: Number(backdrop.querySelector('#em-monto').value),
        fecha: backdrop.querySelector('#em-fecha').value,
        categoria: backdrop.querySelector('#em-categoria').value.trim()
      };
      if (!payload.concepto || !payload.monto) { toast('Concepto y monto son obligatorios', 'err'); return; }
      try {
        if (isEdit) await api.egresos.update(egreso.id, payload);
        else await api.egresos.create(payload);
        toast('Egreso guardado');
        close();
        loadEgresos(container);
      } catch (e) { toast(e.message, 'err'); }
    },
    isEdit ? async (close) => {
      if (!confirm('¿Eliminar este egreso?')) return;
      try { await api.egresos.remove(egreso.id); toast('Eliminado'); close(); loadEgresos(container); }
      catch (e) { toast(e.message, 'err'); }
    } : null
  );
}
