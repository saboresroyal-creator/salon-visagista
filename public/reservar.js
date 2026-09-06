async function rsvApi(method, url, body) {
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const rsvState = {
  step: 1,
  servicios: null,
  profesionales: null,
  servicio: null,
  profesional: null, // objeto {id, nombre, color} o null si eligió "cualquiera"
  cualquieraElegido: false,
  fecha: todayISO(),
  slots: [],
  slot: null,
  nombre: '', telefono: '', email: '', notas: '',
  resultado: null
};

function initRsv() {
  paintSteps();
  renderStep1();
}

function paintSteps() {
  document.querySelectorAll('#rsv-steps li').forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.toggle('rsv-step-active', n === rsvState.step);
    li.classList.toggle('rsv-step-done', n < rsvState.step);
  });
}

function goToStep(n) {
  rsvState.step = n;
  paintSteps();
  if (n === 1) renderStep1();
  else if (n === 2) renderStep2();
  else if (n === 3) renderStep3();
  else if (n === 4) renderStep4();
}

function content() { return document.getElementById('rsv-content'); }

function errorBox(msg) {
  return msg ? `<div class="rsv-error">${msg}</div>` : '';
}

// ── Paso 1: servicio ──
async function renderStep1() {
  content().innerHTML = '<p>Cargando servicios...</p>';
  try {
    if (!rsvState.servicios) rsvState.servicios = await rsvApi('GET', '/api/publico/servicios');
  } catch (e) {
    content().innerHTML = errorBox('No pudimos cargar los servicios. Probá de nuevo más tarde.');
    return;
  }

  const grupos = {};
  for (const s of rsvState.servicios) {
    const cat = s.categoria || 'Servicios';
    (grupos[cat] ||= []).push(s);
  }

  content().innerHTML = `
    <div class="rsv-title">¿Qué servicio querés reservar?</div>
    <div class="rsv-subtitle">Elegí el servicio para ver los horarios disponibles.</div>
    ${Object.keys(grupos).length === 0 ? '<p class="rsv-empty">No hay servicios disponibles para reservar online en este momento.</p>' : Object.entries(grupos).map(([cat, items]) => `
      <div class="rsv-cat-label">${cat}</div>
      <div class="rsv-card-grid">
        ${items.map((s) => `
          <button type="button" class="rsv-option-card" data-id="${s.id}">
            <span>
              <b>${s.nombre}</b>
              <span class="rsv-meta">${s.duracion_min} min</span>
            </span>
            <span class="rsv-meta">$${Number(s.precio).toFixed(0)}</span>
          </button>
        `).join('')}
      </div>
    `).join('')}
  `;

  content().querySelectorAll('[data-id]').forEach((btn) => {
    btn.onclick = () => {
      rsvState.servicio = rsvState.servicios.find((s) => s.id === btn.dataset.id);
      rsvState.profesional = null;
      rsvState.cualquieraElegido = false;
      rsvState.slot = null;
      goToStep(2);
    };
  });
}

// ── Paso 2: profesional ──
async function renderStep2() {
  content().innerHTML = '<p>Cargando profesionales...</p>';
  try {
    if (!rsvState.profesionales) rsvState.profesionales = await rsvApi('GET', '/api/publico/profesionales');
  } catch (e) {
    content().innerHTML = errorBox('No pudimos cargar el equipo. Probá de nuevo más tarde.');
    return;
  }

  content().innerHTML = `
    <div class="rsv-title">¿Con quién preferís atenderte?</div>
    <div class="rsv-subtitle">Servicio elegido: <b>${rsvState.servicio.nombre}</b></div>
    <div class="rsv-card-grid">
      <button type="button" class="rsv-option-card" data-cualquiera="1">
        <span class="rsv-avatar" style="background:var(--accent)">✓</span>
        <span style="flex:1; margin-left:10px;"><b>Cualquiera disponible</b><span class="rsv-meta">Te asignamos el primer profesional libre</span></span>
      </button>
      ${rsvState.profesionales.map((p) => `
        <button type="button" class="rsv-option-card" data-id="${p.id}">
          <span class="rsv-avatar" style="background:${p.color || '#5b8def'}">${p.nombre.charAt(0).toUpperCase()}</span>
          <span style="flex:1; margin-left:10px;"><b>${p.nombre}</b></span>
        </button>
      `).join('')}
    </div>
    <div class="rsv-actions">
      <button type="button" class="secondary" id="rsv-atras">‹ Atrás</button>
    </div>
  `;

  content().querySelector('#rsv-atras').onclick = () => goToStep(1);
  content().querySelector('[data-cualquiera]').onclick = () => {
    rsvState.profesional = null;
    rsvState.cualquieraElegido = true;
    rsvState.slot = null;
    goToStep(3);
  };
  content().querySelectorAll('[data-id]').forEach((btn) => {
    btn.onclick = () => {
      rsvState.profesional = rsvState.profesionales.find((p) => p.id === btn.dataset.id);
      rsvState.cualquieraElegido = false;
      rsvState.slot = null;
      goToStep(3);
    };
  });
}

// ── Paso 3: fecha y hora ──
async function renderStep3() {
  paintStep3(true);
  await loadSlots();
  paintStep3(false);
}

function paintStep3(cargando) {
  content().innerHTML = `
    <div class="rsv-title">Elegí fecha y horario</div>
    <div class="rsv-subtitle">
      ${rsvState.servicio.nombre} · ${rsvState.cualquieraElegido ? 'Cualquier profesional' : rsvState.profesional.nombre}
    </div>
    <div class="field" style="margin-bottom:10px;">
      <label style="font-size:0.8rem; color:var(--muted);">Fecha</label>
      <input type="date" id="rsv-fecha" value="${rsvState.fecha}" min="${todayISO()}" />
    </div>
    <div id="rsv-slots-box">
      ${cargando ? '<p>Buscando horarios disponibles...</p>' : renderSlotsHtml()}
    </div>
    <div class="rsv-actions">
      <button type="button" class="secondary" id="rsv-atras">‹ Atrás</button>
      <button type="button" class="primary" id="rsv-siguiente" ${rsvState.slot ? '' : 'disabled'}>Siguiente</button>
    </div>
  `;
  content().querySelector('#rsv-atras').onclick = () => goToStep(2);
  content().querySelector('#rsv-fecha').onchange = async (e) => {
    rsvState.fecha = e.target.value;
    rsvState.slot = null;
    document.getElementById('rsv-slots-box').innerHTML = '<p>Buscando horarios disponibles...</p>';
    await loadSlots();
    paintStep3(false);
  };
  const siguienteBtn = content().querySelector('#rsv-siguiente');
  if (siguienteBtn) siguienteBtn.onclick = () => { if (rsvState.slot) goToStep(4); };

  if (!cargando) {
    content().querySelectorAll('.rsv-slot-chip').forEach((chip) => {
      chip.onclick = () => {
        rsvState.slot = chip.dataset.hora;
        paintStep3(false);
      };
    });
  }
}

function renderSlotsHtml() {
  if (rsvState.slots.length === 0) {
    return '<p class="rsv-empty">No hay horarios disponibles ese día. Probá con otra fecha.</p>';
  }
  return `
    <div class="rsv-slots-grid">
      ${rsvState.slots.map((s) => `
        <button type="button" class="rsv-slot-chip ${rsvState.slot === s.hora_inicio ? 'selected' : ''}" data-hora="${s.hora_inicio}">
          ${s.hora_inicio}
        </button>
      `).join('')}
    </div>
  `;
}

async function loadSlots() {
  const params = new URLSearchParams({ servicio_id: rsvState.servicio.id, fecha: rsvState.fecha });
  if (!rsvState.cualquieraElegido) params.set('profesional_id', rsvState.profesional.id);
  try {
    const res = await rsvApi('GET', `/api/publico/disponibilidad?${params}`);
    rsvState.slots = res.slots || [];
  } catch (e) {
    rsvState.slots = [];
  }
}

// ── Paso 4: datos de contacto ──
function renderStep4() {
  content().innerHTML = `
    <div class="rsv-title">Tus datos</div>
    <div class="rsv-summary">
      <b>${rsvState.servicio.nombre}</b> · ${rsvState.cualquieraElegido ? 'Cualquier profesional' : rsvState.profesional.nombre}<br>
      ${rsvState.fecha} a las ${rsvState.slot}
    </div>
    <form class="rsv-form" id="rsv-form">
      <div class="field">
        <label>Nombre y apellido</label>
        <input type="text" id="rsv-nombre" value="${rsvState.nombre}" required />
      </div>
      <div class="field">
        <label>Teléfono (WhatsApp)</label>
        <input type="tel" id="rsv-telefono" value="${rsvState.telefono}" placeholder="Ej: 11 2345 6789" required />
      </div>
      <div class="field">
        <label>Email (opcional)</label>
        <input type="email" id="rsv-email" value="${rsvState.email}" />
      </div>
      <div class="field">
        <label>Notas para el salón (opcional)</label>
        <textarea id="rsv-notas" rows="2">${rsvState.notas}</textarea>
      </div>
      <div class="rsv-honeypot" aria-hidden="true">
        <label>Sitio web</label>
        <input type="text" id="rsv-sitio-web" tabindex="-1" autocomplete="off" />
      </div>
      <div id="rsv-form-error"></div>
      <div class="rsv-actions">
        <button type="button" class="secondary" id="rsv-atras">‹ Atrás</button>
        <button type="submit" class="primary" id="rsv-confirmar">Confirmar reserva</button>
      </div>
    </form>
  `;
  content().querySelector('#rsv-atras').onclick = () => goToStep(3);
  content().querySelector('#rsv-form').onsubmit = async (e) => {
    e.preventDefault();
    rsvState.nombre = content().querySelector('#rsv-nombre').value.trim();
    rsvState.telefono = content().querySelector('#rsv-telefono').value.trim();
    rsvState.email = content().querySelector('#rsv-email').value.trim();
    rsvState.notas = content().querySelector('#rsv-notas').value.trim();
    if (!rsvState.nombre || !rsvState.telefono) return;

    const btn = content().querySelector('#rsv-confirmar');
    btn.disabled = true;
    btn.textContent = 'Reservando...';
    try {
      const payload = {
        nombre: rsvState.nombre,
        telefono: rsvState.telefono,
        email: rsvState.email || undefined,
        notas: rsvState.notas || undefined,
        servicio_id: rsvState.servicio.id,
        fecha: rsvState.fecha,
        hora_inicio: rsvState.slot,
        sitio_web: content().querySelector('#rsv-sitio-web').value
      };
      if (!rsvState.cualquieraElegido) payload.profesional_id = rsvState.profesional.id;

      const resultado = await rsvApi('POST', '/api/publico/turnos', payload);
      rsvState.resultado = resultado;
      renderConfirmacion();
    } catch (err) {
      content().querySelector('#rsv-form-error').innerHTML = errorBox(err.message);
      btn.disabled = false;
      btn.textContent = 'Confirmar reserva';
    }
  };
}

function renderConfirmacion() {
  document.getElementById('rsv-steps').style.display = 'none';
  const r = rsvState.resultado;
  content().innerHTML = `
    <div class="rsv-confirm">
      <div class="rsv-confirm-icon">🕓</div>
      <h2>¡Tu turno quedó pendiente de confirmación!</h2>
      <p>${r.servicio_nombre} con ${r.profesional_nombre} el ${r.fecha} a las ${r.hora_inicio}.</p>
      <p>El salón te va a confirmar a la brevedad. Si tenés dudas, comunicate directamente con nosotros.</p>
    </div>
  `;
}

initRsv();
