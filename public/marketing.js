function mensajeSemana(c) {
  return c.msg_recordatorio || `Hola ${c.nombre}! Te recordamos tu turno el ${c.fecha} a las ${(c.hora || '').slice(0, 5)} en Salón Visagista. ¡Te esperamos!`;
}
function mensaje24h(c) {
  return c.msg_recordatorio || `Hola ${c.nombre}! Te recordamos que tenés turno ${c.diasFaltantes === 0 ? 'hoy' : 'mañana'} a las ${(c.hora || '').slice(0, 5)} en Salón Visagista. ¡Nos vemos pronto!`;
}

async function renderMarketing(container) {
  container.innerHTML = '<p>Cargando...</p>';
  const [recordatorios, cumpleanos] = await Promise.all([
    api.marketing.recordatorios(),
    api.marketing.cumpleanos(15)
  ]);

  container.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h2 style="margin-top:0;">Recordatorio — una semana antes</h2>
      ${recordatorios.semana.length === 0 ? '<p style="color:var(--muted)">Sin turnos en esa ventana todavía.</p>' : `
        <table class="data-table">
          <thead><tr><th>Clienta</th><th>Turno</th><th>Mensaje</th><th></th></tr></thead>
          <tbody>
            ${recordatorios.semana.map((c) => `
              <tr>
                <td>${c.nombre}</td>
                <td>${c.fecha} ${(c.hora || '').slice(0, 5)}</td>
                <td style="max-width:260px;">${mensajeSemana(c)}</td>
                <td><button class="secondary" data-wa data-tel="${c.telefono || ''}" data-msg="${escapeAttr(mensajeSemana(c))}" data-cliente="${c.cliente_id}" data-turno="${c.turno_id}" data-tipo="recordatorio_semana">WhatsApp</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>

    <div class="card" style="margin-bottom:16px;">
      <h2 style="margin-top:0;">Recordatorio — 24 horas antes</h2>
      ${recordatorios.veinticuatro.length === 0 ? '<p style="color:var(--muted)">Sin turnos en esa ventana todavía.</p>' : `
        <table class="data-table">
          <thead><tr><th>Clienta</th><th>Turno</th><th>Mensaje</th><th></th></tr></thead>
          <tbody>
            ${recordatorios.veinticuatro.map((c) => `
              <tr>
                <td>${c.nombre}</td>
                <td>${c.fecha} ${(c.hora || '').slice(0, 5)}</td>
                <td style="max-width:260px;">${mensaje24h(c)}</td>
                <td><button class="secondary" data-wa data-tel="${c.telefono || ''}" data-msg="${escapeAttr(mensaje24h(c))}" data-cliente="${c.cliente_id}" data-turno="${c.turno_id}" data-tipo="recordatorio_24h">WhatsApp</button></td>
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
        await api.marketing.registrarEnvio({
          cliente_id: btn.dataset.cliente,
          tipo: btn.dataset.tipo,
          mensaje: btn.dataset.msg,
          turno_id: btn.dataset.turno || null
        });
        if (btn.dataset.tipo === 'recordatorio_semana' || btn.dataset.tipo === 'recordatorio_24h') {
          btn.closest('tr').remove();
        }
      } catch (e) { /* no bloquea el envío si falla el log */ }
    };
  });
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}
