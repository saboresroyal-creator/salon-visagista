let reportesState = {
  desde: new Date(new Date().setDate(1)).toISOString().slice(0, 10),
  hasta: new Date().toISOString().slice(0, 10)
};

async function renderReportes(container) {
  container.innerHTML = `
    <div class="cal-toolbar">
      <label style="font-size:0.82rem; color:var(--muted);">Desde</label>
      <input type="date" id="rp-desde" value="${reportesState.desde}" />
      <label style="font-size:0.82rem; color:var(--muted);">Hasta</label>
      <input type="date" id="rp-hasta" value="${reportesState.hasta}" />
    </div>
    <div id="rp-contenido"><p>Cargando...</p></div>
  `;

  const reload = () => {
    reportesState.desde = container.querySelector('#rp-desde').value;
    reportesState.hasta = container.querySelector('#rp-hasta').value;
    loadReporte(container);
  };
  container.querySelector('#rp-desde').onchange = reload;
  container.querySelector('#rp-hasta').onchange = reload;

  await loadReporte(container);
}

async function loadReporte(container) {
  const box = container.querySelector('#rp-contenido');
  const r = await api.reportes.get(reportesState.desde, reportesState.hasta);

  const metodoRows = Object.entries(r.porMetodo).map(([k, v]) => `<tr><td>${k}</td><td>$${v.toFixed(2)}</td></tr>`).join('');
  const categoriaRows = Object.entries(r.porCategoria).map(([k, v]) => `<tr><td>${k}</td><td>$${v.toFixed(2)}</td></tr>`).join('');

  box.innerHTML = `
    <div class="row" style="gap:14px; margin-bottom:16px;">
      <div class="card" style="flex:1;">
        <div style="color:var(--muted); font-size:0.8rem;">Ventas (${r.cantidadVentas})</div>
        <div style="font-size:1.5rem; font-weight:700;">$${r.ventasTotal.toFixed(2)}</div>
      </div>
      <div class="card" style="flex:1;">
        <div style="color:var(--muted); font-size:0.8rem;">Egresos (${r.cantidadEgresos})</div>
        <div style="font-size:1.5rem; font-weight:700;">$${r.egresosTotal.toFixed(2)}</div>
      </div>
      <div class="card" style="flex:1;">
        <div style="color:var(--muted); font-size:0.8rem;">Balance</div>
        <div style="font-size:1.5rem; font-weight:700; color:${r.balance >= 0 ? '#4a7c59' : 'var(--danger)'}">$${r.balance.toFixed(2)}</div>
      </div>
    </div>
    <div class="row" style="gap:14px; align-items:flex-start;">
      <div class="card" style="flex:1;">
        <h2 style="margin-top:0; font-size:1rem;">Ventas por método de pago</h2>
        ${metodoRows ? `<table class="data-table"><tbody>${metodoRows}</tbody></table>` : '<p style="color:var(--muted)">Sin datos.</p>'}
      </div>
      <div class="card" style="flex:1;">
        <h2 style="margin-top:0; font-size:1rem;">Egresos por categoría</h2>
        ${categoriaRows ? `<table class="data-table"><tbody>${categoriaRows}</tbody></table>` : '<p style="color:var(--muted)">Sin datos.</p>'}
      </div>
    </div>
  `;
}
