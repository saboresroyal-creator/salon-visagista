async function renderDashboard(container) {
  const fecha = new Date().toISOString().slice(0, 10);
  container.innerHTML = '<p>Cargando...</p>';

  const [resumen, cumpleanos] = await Promise.all([
    api.resumen.get(fecha),
    api.marketing.cumpleanos(7)
  ]);

  container.innerHTML = `
    <div class="row" style="gap:14px; margin-bottom:16px;">
      <div class="card" style="flex:1;">
        <div style="color:var(--muted); font-size:0.8rem;">Turnos hoy</div>
        <div style="font-size:1.6rem; font-weight:700;">${resumen.turnos.length}</div>
      </div>
      <div class="card" style="flex:1;">
        <div style="color:var(--muted); font-size:0.8rem;">Facturado hoy</div>
        <div style="font-size:1.6rem; font-weight:700;">$${resumen.ventasTotal.toFixed(2)}</div>
      </div>
      <div class="card" style="flex:1;">
        <div style="color:var(--muted); font-size:0.8rem;">Egresos hoy</div>
        <div style="font-size:1.6rem; font-weight:700;">$${resumen.egresosTotal.toFixed(2)}</div>
      </div>
      <div class="card" style="flex:1;">
        <div style="color:var(--muted); font-size:0.8rem;">Balance hoy</div>
        <div style="font-size:1.6rem; font-weight:700; color:${resumen.balance >= 0 ? '#4a7c59' : 'var(--danger)'}">$${resumen.balance.toFixed(2)}</div>
      </div>
    </div>

    <div class="row" style="gap:14px; align-items:flex-start;">
      <div class="card" style="flex:1;">
        <h2 style="margin-top:0; font-size:1rem;">Turnos de hoy</h2>
        ${resumen.turnos.length === 0 ? '<p style="color:var(--muted)">Sin turnos hoy.</p>' : `
          <table class="data-table">
            <thead><tr><th>Hora</th><th>Clienta</th><th>Profesional</th><th>Servicios</th></tr></thead>
            <tbody>
              ${resumen.turnos.map((t) => `
                <tr>
                  <td>${t.hora_inicio.slice(0, 5)}</td>
                  <td>${t.clientes?.nombre || ''}</td>
                  <td>${t.profesionales?.nombre || ''}</td>
                  <td>${(t.turno_servicios || []).map((ts) => ts.servicios?.nombre).filter(Boolean).join(', ')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>

      <div class="card" style="flex:1;">
        <h2 style="margin-top:0; font-size:1rem;">Próximos cumpleaños (7 días)</h2>
        ${cumpleanos.length === 0 ? '<p style="color:var(--muted)">Sin cumpleaños próximos.</p>' : `
          <table class="data-table">
            <thead><tr><th>Clienta</th><th>Faltan</th></tr></thead>
            <tbody>
              ${cumpleanos.map((c) => `
                <tr><td>${c.nombre}</td><td>${c.diasFaltantes === 0 ? 'Hoy' : `${c.diasFaltantes} día(s)`}</td></tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;
}
