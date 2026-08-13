async function renderMarketing(container) {
  container.innerHTML = '<p>Cargando...</p>';
  const [recordatorios, cumpleanos] = await Promise.all([
    api.marketing.recordatorios(),
    api.marketing.cumpleanos(15)
  ]);

  container.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h2 style="margin-top:0;">Recordatorios de cita pendientes</h2>
      ${recordatorios.length === 0 ? '<p style="color:var(--muted)">No hay recordatorios para enviar hoy.</p>' : `
        <table class="data-table">
          <thead><tr><th>Clienta</th><th>Cita</th><th>Mensaje</th><th></th></tr></thead>
          <tbody>
            ${recordatorios.map((c) => `
              <tr data-id="${c.id}">
                <td>${c.nombre}</td>
                <td>${c.proxima_cita_fecha} ${(c.proxima_cita_hora || '').slice(0, 5)}</td>
                <td style="max-width:260px;">${c.msg_recordatorio || `Hola ${c.nombre}! Te recordamos tu cita el ${c.proxima_cita_fecha} a las ${(c.proxima_cita_hora || '').slice(0, 5)} en Salón Visagista.`}</td>
                <td><button class="secondary" data-wa data-tel="${c.telefono || ''}" data-msg="${escapeAttr(c.msg_recordatorio || `Hola ${c.nombre}! Te recordamos tu cita el ${c.proxima_cita_fecha} a las ${(c.proxima_cita_hora || '').slice(0, 5)} en Salón Visagista.`)}" data-cliente="${c.id}" data-tipo="recordatorio">WhatsApp</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>

    <div class="card">
      <h2 style="margin-top:0;">Cumpleaños próximos (15 días)</h2>
      ${cumpleanos.length === 0 ? '<p style="color:var(--muted)">Sin cumpleaños próximos.</p>' : `
        <table class="data-table">
          <thead><tr><th>Clienta</th><th>Faltan</th><th>Mensaje</th><th></th></tr></thead>
          <tbody>
            ${cumpleanos.map((c) => `
              <tr data-id="${c.id}">
                <td>${c.nombre}</td>
                <td>${c.diasFaltantes === 0 ? 'Hoy' : `${c.diasFaltantes} día(s)`}</td>
                <td style="max-width:260px;">${c.msg_cumpleanos || `¡Feliz cumpleaños ${c.nombre}! Te esperamos en Salón Visagista para celebrarlo.`}</td>
                <td><button class="secondary" data-wa data-tel="${c.telefono || ''}" data-msg="${escapeAttr(c.msg_cumpleanos || `¡Feliz cumpleaños ${c.nombre}! Te esperamos en Salón Visagista para celebrarlo.`)}" data-cliente="${c.id}" data-tipo="cumpleanos">WhatsApp</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;

  container.querySelectorAll('[data-wa]').forEach((btn) => {
    btn.onclick = async () => {
      const tel = (btn.dataset.tel || '').replace(/\D/g, '');
      if (!tel) { toast('Esta clienta no tiene teléfono cargado', 'err'); return; }
      const url = `https://wa.me/${tel}?text=${encodeURIComponent(btn.dataset.msg)}`;
      window.open(url, '_blank');
      try {
        await api.marketing.registrarEnvio({ cliente_id: btn.dataset.cliente, tipo: btn.dataset.tipo, mensaje: btn.dataset.msg });
      } catch (e) { /* no bloquea el envío si falla el log */ }
    };
  });
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}
