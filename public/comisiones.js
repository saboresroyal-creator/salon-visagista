let comisionesState = {
  desde: new Date(new Date().setDate(1)).toISOString().slice(0, 10),
  hasta: new Date().toISOString().slice(0, 10)
};

async function renderComisiones(container) {
  container.innerHTML = `
    <div class="cal-toolbar">
      <label style="font-size:0.82rem; color:var(--muted);">Desde</label>
      <input type="date" id="cm-desde" value="${comisionesState.desde}" />
      <label style="font-size:0.82rem; color:var(--muted);">Hasta</label>
      <input type="date" id="cm-hasta" value="${comisionesState.hasta}" />
    </div>
    <div id="cm-contenido"><p>Cargando...</p></div>
  `;

  const reload = () => {
    comisionesState.desde = container.querySelector('#cm-desde').value;
    comisionesState.hasta = container.querySelector('#cm-hasta').value;
    loadComisiones(container);
  };
  container.querySelector('#cm-desde').onchange = reload;
  container.querySelector('#cm-hasta').onchange = reload;

  await loadComisiones(container);
}

async function loadComisiones(container) {
  const box = container.querySelector('#cm-contenido');
  const filas = await api.comisiones.get({ desde: comisionesState.desde, hasta: comisionesState.hasta });
  const puedeEditar = currentUser.rol === 'admin' || (currentUser.permisos || []).includes('comisiones:ver');

  box.innerHTML = filas.length === 0 ? '<p style="color:var(--muted)">Sin datos para este período.</p>' : `
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Profesional</th><th>Servicios realizados</th><th>Facturación generada</th><th>% Comisión</th><th>Comisión</th></tr></thead>
        <tbody>
          ${filas.map((f) => `
            <tr data-id="${f.profesional_id}">
              <td>${f.profesional_nombre}</td>
              <td>${f.servicios_realizados}</td>
              <td>$${f.facturacion_generada.toFixed(2)}</td>
              <td>
                ${puedeEditar
                  ? `<input type="number" step="0.01" class="cm-pct-input" data-id="${f.profesional_id}" value="${f.comision_pct}" style="width:80px;" />%`
                  : `${f.comision_pct}%`}
              </td>
              <td><b class="cm-comision" data-id="${f.profesional_id}">$${f.comision.toFixed(2)}</b></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (!puedeEditar) return;
  box.querySelectorAll('.cm-pct-input').forEach((input) => {
    let guardando = false;
    input.onchange = async () => {
      if (guardando) return;
      guardando = true;
      const nuevoPct = Number(input.value) || 0;
      try {
        await api.profesionales.update(input.dataset.id, { comision_pct: nuevoPct });
        const fila = filas.find((f) => f.profesional_id === input.dataset.id);
        fila.comision_pct = nuevoPct;
        fila.comision = Math.round(fila.facturacion_generada * nuevoPct) / 100;
        box.querySelector(`.cm-comision[data-id="${input.dataset.id}"]`).textContent = `$${fila.comision.toFixed(2)}`;
        toast('% de comisión actualizado');
      } catch (e) {
        toast(e.message, 'err');
      }
      guardando = false;
    };
  });
}
