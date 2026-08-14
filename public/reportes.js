let reportesState = {
  desde: new Date(new Date().setDate(1)).toISOString().slice(0, 10),
  hasta: new Date().toISOString().slice(0, 10)
};

const RP_COLOR_VENTAS = '#2a78d6';
const RP_COLOR_EGRESOS = '#eb6834';

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
    <div class="row" style="gap:14px; margin-bottom:16px; flex-wrap:wrap;">
      <div class="card" style="flex:1; min-width:140px;">
        <div style="color:var(--muted); font-size:0.8rem;">Ventas (${r.cantidadVentas})</div>
        <div style="font-size:1.5rem; font-weight:700;">$${r.ventasTotal.toFixed(2)}</div>
      </div>
      <div class="card" style="flex:1; min-width:140px;">
        <div style="color:var(--muted); font-size:0.8rem;">Egresos (${r.cantidadEgresos})</div>
        <div style="font-size:1.5rem; font-weight:700;">$${r.egresosTotal.toFixed(2)}</div>
      </div>
      <div class="card" style="flex:1; min-width:140px;">
        <div style="color:var(--muted); font-size:0.8rem;">Balance</div>
        <div style="font-size:1.5rem; font-weight:700; color:${r.balance >= 0 ? '#4a7c59' : 'var(--danger)'}">$${r.balance.toFixed(2)}</div>
      </div>
      <div class="card" style="flex:1; min-width:140px;">
        <div style="color:var(--muted); font-size:0.8rem;">Ticket promedio</div>
        <div style="font-size:1.5rem; font-weight:700;">$${r.ticketPromedio.toFixed(2)}</div>
      </div>
      <div class="card" style="flex:1; min-width:140px;">
        <div style="color:var(--muted); font-size:0.8rem;">Clientas nuevas</div>
        <div style="font-size:1.5rem; font-weight:700;">${r.clientesNuevos}</div>
      </div>
      <div class="card" style="flex:1; min-width:140px;">
        <div style="color:var(--muted); font-size:0.8rem;">Clientas totales</div>
        <div style="font-size:1.5rem; font-weight:700;">${r.clientesTotal}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <h2 style="margin:0; font-size:1rem;">Ingresos vs. egresos por día</h2>
        <div style="display:flex; gap:14px; font-size:0.8rem; color:var(--muted);">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${RP_COLOR_VENTAS};margin-right:4px;"></span>Ingresos</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${RP_COLOR_EGRESOS};margin-right:4px;"></span>Egresos</span>
        </div>
      </div>
      <div id="rp-chart" style="margin-top:10px;">${renderSerieChart(r.serieDiaria)}</div>
    </div>

    <div class="row" style="gap:14px; align-items:flex-start; flex-wrap:wrap;">
      <div class="card" style="flex:1; min-width:260px;">
        <h2 style="margin-top:0; font-size:1rem;">Top clientas por gasto</h2>
        ${renderTopClientesBars(r.topClientes)}
      </div>
      <div class="card" style="flex:1; min-width:220px;">
        <h2 style="margin-top:0; font-size:1rem;">Ventas por método de pago</h2>
        ${metodoRows ? `<table class="data-table"><tbody>${metodoRows}</tbody></table>` : '<p style="color:var(--muted)">Sin datos.</p>'}
      </div>
      <div class="card" style="flex:1; min-width:220px;">
        <h2 style="margin-top:0; font-size:1rem;">Egresos por categoría</h2>
        ${categoriaRows ? `<table class="data-table"><tbody>${categoriaRows}</tbody></table>` : '<p style="color:var(--muted)">Sin datos.</p>'}
      </div>
    </div>
  `;
}

function renderTopClientesBars(topClientes) {
  if (!topClientes || topClientes.length === 0) return '<p style="color:var(--muted)">Sin ventas con clienta asociada en este período.</p>';
  const max = Math.max(...topClientes.map((c) => c.total));
  return topClientes.map((c) => `
    <div style="margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:2px;">
        <span>${c.nombre}</span><span style="color:var(--muted);">$${c.total.toFixed(2)}</span>
      </div>
      <div style="background:#f0ece7; border-radius:4px; height:8px; overflow:hidden;">
        <div style="background:${RP_COLOR_VENTAS}; height:100%; width:${max > 0 ? (c.total / max) * 100 : 0}%; border-radius:4px;"></div>
      </div>
    </div>
  `).join('');
}

function renderSerieChart(serie) {
  if (!serie || serie.length < 2) {
    return '<p style="color:var(--muted)">No hay suficientes datos en el período para graficar una tendencia.</p>';
  }

  const W = 640, H = 220, padL = 46, padR = 10, padT = 10, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const maxVal = Math.max(1, ...serie.map((d) => Math.max(d.ventas, d.egresos)));
  const x = (i) => padL + (i / (serie.length - 1)) * innerW;
  const y = (v) => padT + innerH - (v / maxVal) * innerH;

  const pathFor = (key) => serie.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');

  const gridLines = [0, 0.5, 1].map((f) => {
    const gy = padT + innerH - f * innerH;
    return `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#e4dfd9" stroke-width="1" />
      <text x="${padL - 6}" y="${gy + 3}" text-anchor="end" font-size="9" fill="#8a8078">$${Math.round(f * maxVal)}</text>`;
  }).join('');

  const step = Math.max(1, Math.ceil(serie.length / 6));
  const xLabels = serie.map((d, i) => {
    if (i % step !== 0 && i !== serie.length - 1) return '';
    return `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="#8a8078">${d.fecha.slice(5)}</text>`;
  }).join('');

  const dots = (key, color) => serie.map((d, i) => `
    <circle cx="${x(i).toFixed(1)}" cy="${y(d[key]).toFixed(1)}" r="3.5" fill="${color}">
      <title>${d.fecha}: $${d[key].toFixed(2)}</title>
    </circle>
  `).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:220px; display:block;">
      ${gridLines}
      <path d="${pathFor('ventas')}" fill="none" stroke="${RP_COLOR_VENTAS}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="${pathFor('egresos')}" fill="none" stroke="${RP_COLOR_EGRESOS}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      ${dots('ventas', RP_COLOR_VENTAS)}
      ${dots('egresos', RP_COLOR_EGRESOS)}
      ${xLabels}
    </svg>
  `;
}
