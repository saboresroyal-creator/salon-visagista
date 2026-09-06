let misTurnosState = null;

async function renderMisTurnos(container) {
  container.innerHTML = '<p>Cargando tus turnos...</p>';
  misTurnosState = { fecha: new Date().toISOString().slice(0, 10), turnos: [] };
  try {
    misTurnosState.turnos = await api.misTurnos.list(misTurnosState.fecha);
  } catch (e) {
    container.innerHTML = `<p style="color:var(--danger)">${e.message}</p>`;
    return;
  }
  renderListaTurnos(container);
}

function renderListaTurnos(container) {
  const st = misTurnosState;
  container.innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <div class="row" style="align-items:center;">
        <h2 style="margin:0; flex:1;">Mis turnos de hoy</h2>
        <input type="date" id="mt-fecha" value="${st.fecha}" style="max-width:170px;" />
      </div>
    </div>
    ${st.turnos.length === 0 ? '<p style="color:var(--muted)">No tenés turnos para este día.</p>' : st.turnos.map((t) => `
      <div class="card mt-turno-card ${t.estado === 'completado' ? 'mt-completado' : ''}" data-id="${t.id}" style="margin-bottom:10px; cursor:${t.estado === 'completado' ? 'default' : 'pointer'};">
        <div class="row" style="align-items:center;">
          <div style="font-weight:700; font-size:1.1rem; width:64px;">${t.hora_inicio.slice(0, 5)}</div>
          <div style="flex:1;">
            <div style="font-weight:600;">${t.clientes?.nombre || '(sin clienta)'}</div>
            <div style="color:var(--muted); font-size:0.85rem;">${(t.turno_servicios || []).map((ts) => ts.servicios?.nombre).filter(Boolean).join(', ') || 'Sin servicio reservado'}</div>
          </div>
          <div style="font-size:0.78rem; color:${t.estado === 'completado' ? '#4a7c59' : 'var(--muted)'};">${t.estado === 'completado' ? '✓ Enviada' : ''}</div>
        </div>
      </div>
    `).join('')}
  `;

  container.querySelector('#mt-fecha').onchange = async (e) => {
    st.fecha = e.target.value;
    container.innerHTML = '<p>Cargando tus turnos...</p>';
    st.turnos = await api.misTurnos.list(st.fecha);
    renderListaTurnos(container);
  };

  container.querySelectorAll('.mt-turno-card').forEach((card) => {
    if (card.classList.contains('mt-completado')) return;
    card.onclick = () => renderAtencion(container, st.turnos.find((t) => t.id === card.dataset.id));
  });
}

function renderAtencion(container, turno) {
  const serviciosRealizados = (turno.turno_servicios || [])
    .filter((ts) => ts.servicios)
    .map((ts) => ({ servicio_id: ts.servicios.id, nombre: ts.servicios.nombre }));
  const productosUtilizados = [];

  function paint() {
    container.innerHTML = `
      <div class="card" style="margin-bottom:14px;">
        <button type="button" class="secondary" id="at-volver" style="margin-bottom:10px;">‹ Volver</button>
        <div style="font-size:0.8rem; color:var(--muted);">CLIENTA</div>
        <div style="font-size:1.2rem; font-weight:700; margin-bottom:6px;">${turno.clientes?.nombre || '(sin clienta)'}</div>
        <div style="font-size:0.8rem; color:var(--muted);">PROFESIONAL</div>
        <div style="font-weight:600;">${currentUser.nombre}</div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <h2 style="margin-top:0; font-size:1rem;">Servicios realizados</h2>
        <div id="at-servicios">${renderChips(serviciosRealizados, 'nombre')}</div>
        <button type="button" class="secondary" id="at-add-servicio" style="margin-top:8px;">+ Agregar servicio</button>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <h2 style="margin-top:0; font-size:1rem;">Productos utilizados</h2>
        <div id="at-productos">${renderChips(productosUtilizados, 'nombre')}</div>
        <button type="button" class="secondary" id="at-add-producto" style="margin-top:8px;">+ Agregar producto</button>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <h2 style="margin-top:0; font-size:1rem;">Observaciones</h2>
        <textarea id="at-obs" rows="3" placeholder="Ej: Se utilizó tratamiento reparación intensiva."></textarea>
      </div>

      <button type="button" class="primary" id="at-enviar" style="width:100%; padding:16px; font-size:1.05rem;">ENVIAR A RECEPCIÓN</button>
    `;

    container.querySelector('#at-volver').onclick = () => renderListaTurnos(container);

    container.querySelector('#at-add-servicio').onclick = async () => {
      const catalogo = await api.servicios.list();
      abrirPicker('Agregar servicio', catalogo, (item) => {
        serviciosRealizados.push({ servicio_id: item.id, nombre: item.nombre });
        paint();
      });
    };
    container.querySelector('#at-add-producto').onclick = async () => {
      const catalogo = await api.productos.list();
      abrirPicker('Agregar producto', catalogo, (item) => {
        productosUtilizados.push({ producto_id: item.id, nombre: item.nombre, cantidad: 1 });
        paint();
      });
    };

    container.querySelectorAll('#at-servicios [data-remove]').forEach((btn) => {
      btn.onclick = () => { serviciosRealizados.splice(Number(btn.dataset.remove), 1); paint(); };
    });
    container.querySelectorAll('#at-productos [data-remove]').forEach((btn) => {
      btn.onclick = () => { productosUtilizados.splice(Number(btn.dataset.remove), 1); paint(); };
    });

    container.querySelector('#at-enviar').onclick = async () => {
      if (serviciosRealizados.length === 0 && productosUtilizados.length === 0) {
        toast('Agregá al menos un servicio o producto', 'err');
        return;
      }
      const btn = container.querySelector('#at-enviar');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      try {
        await api.comandas.crear({
          turno_id: turno.id,
          servicios: serviciosRealizados.map((s) => s.servicio_id),
          productos: productosUtilizados.map((p) => ({ producto_id: p.producto_id, cantidad: p.cantidad })),
          observaciones: container.querySelector('#at-obs').value.trim()
        });
        renderConfirmacion(container);
      } catch (e) {
        toast(e.message, 'err');
        btn.disabled = false;
        btn.textContent = 'ENVIAR A RECEPCIÓN';
      }
    };
  }

  function renderChips(items) {
    if (items.length === 0) return '<p style="color:var(--muted); font-size:0.85rem;">Todavía no agregaste nada.</p>';
    return items.map((it, i) => `<span class="servicio-chip">${it.nombre}<button type="button" data-remove="${i}">×</button></span>`).join('');
  }

  paint();
}

function abrirPicker(titulo, catalogo, onElegir) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h2>${titulo}</h2>
      <input type="text" id="pk-buscar" placeholder="Buscar..." autocomplete="off" />
      <div id="pk-lista" style="max-height:320px; overflow-y:auto; margin-top:10px;"></div>
      <div class="modal-actions"><button class="secondary" id="pk-cancelar">Cancelar</button></div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  backdrop.querySelector('#pk-cancelar').onclick = close;

  function renderLista(filtro) {
    const activos = catalogo.filter((c) => c.activo !== false);
    const matches = filtro ? activos.filter((c) => c.nombre.toLowerCase().includes(filtro.toLowerCase())) : activos;
    backdrop.querySelector('#pk-lista').innerHTML = matches.map((c) => `
      <div class="pk-item" data-id="${c.id}" style="padding:10px; border-bottom:1px solid var(--border); cursor:pointer;">${c.nombre}</div>
    `).join('') || '<p style="color:var(--muted);">Sin resultados.</p>';
    backdrop.querySelectorAll('.pk-item').forEach((row) => {
      row.onclick = () => {
        onElegir(matches.find((c) => c.id === row.dataset.id));
        close();
      };
    });
  }
  renderLista('');
  backdrop.querySelector('#pk-buscar').oninput = (e) => renderLista(e.target.value);
}

function renderConfirmacion(container) {
  container.innerHTML = `
    <div class="card" style="text-align:center; padding:40px 20px;">
      <div style="font-size:2.4rem; margin-bottom:10px;">✅</div>
      <h2>Comanda enviada correctamente a recepción.</h2>
      <button type="button" class="primary" id="conf-volver" style="margin-top:16px;">Volver a mis turnos</button>
    </div>
  `;
  container.querySelector('#conf-volver').onclick = () => renderMisTurnos(container);
}
