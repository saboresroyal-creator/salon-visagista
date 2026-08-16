let comandasState = null;

async function renderComandas(container) {
  container.innerHTML = '<p>Cargando...</p>';
  const [servicios, productos, profesionales, listasPrecio] = await Promise.all([
    api.servicios.list(),
    api.productos.list(),
    api.profesionales.list(),
    api.listasPrecio.list()
  ]);
  comandasState = {
    cliente: null,
    fecha: new Date().toISOString().slice(0, 10),
    atendidoPorId: '',
    listaPrecioId: '',
    ajustePct: 0,
    items: [],
    servicios: servicios.filter((s) => s.activo !== false),
    productos: productos.filter((p) => p.activo !== false),
    profesionales: profesionales.filter((p) => p.activo !== false),
    listasPrecio: listasPrecio.filter((l) => l.activo !== false)
  };
  renderComandasView(container);
}

function gruposPorCategoria(servicios) {
  const grupos = {};
  for (const s of servicios) {
    const cat = s.categoria || 'Otros servicios';
    (grupos[cat] ||= []).push(s);
  }
  return grupos;
}

function resolverPrecioServicio(servicio, listaId) {
  if (listaId && servicio.precios_por_lista && servicio.precios_por_lista[listaId] != null) {
    return Number(servicio.precios_por_lista[listaId]);
  }
  return Number(servicio.precio);
}

function renderComandasView(container) {
  const st = comandasState;
  const grupos = gruposPorCategoria(st.servicios);

  container.innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <h2 style="margin-top:0; font-size:1rem;">Clienta</h2>
      <input type="text" id="cm-cliente-buscar" placeholder="Buscar clienta o dejar vacío para consumidor final..." autocomplete="off" value="${st.cliente?.nombre || ''}" />
      <div id="cm-cliente-resultados" style="position:relative;"></div>

      <div class="row" style="margin-top:10px;">
        <div class="field"><label>Fecha</label><input type="date" id="cm-fecha" value="${st.fecha}" /></div>
        <div class="field"><label>Atendido por</label>
          <select id="cm-atendido-por">
            <option value="">—</option>
            ${st.profesionales.map((p) => `<option value="${p.id}" ${st.atendidoPorId === p.id ? 'selected' : ''}>${p.nombre}</option>`).join('')}
          </select>
        </div>
      </div>

      ${st.listasPrecio.length > 0 ? `
        <div class="field" style="margin-top:10px;">
          <label>Lista de precio</label>
          <select id="cm-lista-precio">
            <option value="">Precio de lista (base)</option>
            ${st.listasPrecio.map((l) => `<option value="${l.id}" ${st.listaPrecioId === l.id ? 'selected' : ''}>${l.nombre}</option>`).join('')}
          </select>
        </div>
      ` : ''}
    </div>

    <div class="card" style="margin-bottom:14px;">
      <h2 style="margin-top:0; font-size:1rem;">Servicios</h2>
      ${Object.entries(grupos).map(([cat, items]) => `
        <div style="margin-bottom:10px;">
          <div style="font-size:0.82rem; color:var(--muted); font-weight:600; margin-bottom:4px;">${cat}</div>
          <div class="row" style="flex-wrap:wrap; gap:6px;">
            ${items.map((s) => `<button type="button" class="secondary cm-add-servicio" data-id="${s.id}">${s.nombre} · $${resolverPrecioServicio(s, st.listaPrecioId).toFixed(2)}</button>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="card" style="margin-bottom:14px;">
      <h2 style="margin-top:0; font-size:1rem;">Ítem personalizado</h2>
      <p style="color:var(--muted); font-size:0.8rem; margin-top:-6px;">Para fórmulas de color u otro ítem que no está en el catálogo.</p>
      <div class="row">
        <div class="field"><label>Descripción</label><input id="cm-custom-desc" placeholder="Ej: Sistema color *" /></div>
        <div class="field" style="max-width:140px;"><label>Precio</label><input type="number" id="cm-custom-precio" value="0" /></div>
      </div>
      <button type="button" class="secondary" id="cm-add-custom">+ Agregar</button>
    </div>

    <div class="card" style="margin-bottom:14px;">
      <h2 style="margin-top:0; font-size:1rem;">Productos</h2>
      <div class="row">
        <input type="text" id="cm-producto-buscar" placeholder="Buscar producto..." autocomplete="off" style="flex:1;" />
        <button type="button" class="secondary" id="cm-escanear">📷 Escanear</button>
      </div>
      <div id="cm-producto-resultados"></div>
    </div>

    <div class="card">
      <h2 style="margin-top:0; font-size:1rem;">Ítems de la comanda</h2>
      <div id="cm-items"></div>

      <div class="field" style="max-width:220px; margin-left:auto; margin-top:10px;">
        <label>Descuento / recargo (%)</label>
        <input type="number" id="cm-ajuste-pct" value="${st.ajustePct}" placeholder="Ej: -10 ó 5" />
      </div>

      <div style="text-align:right; margin-top:6px;">
        <div style="color:var(--muted); font-size:0.85rem;">Subtotal: $<span id="cm-subtotal">0.00</span></div>
        <div style="font-weight:600; font-size:1.05rem;">Total: $<span id="cm-total">0.00</span></div>
      </div>
      <button class="primary" id="cm-enviar" type="button" style="margin-top:12px; width:100%;">Enviar a recepción</button>
    </div>
  `;

  wireClienteBuscar(container);
  wireProductoBuscar(container);

  container.querySelectorAll('.cm-add-servicio').forEach((btn) => {
    btn.onclick = () => {
      const servicio = st.servicios.find((s) => s.id === btn.dataset.id);
      const precio = resolverPrecioServicio(servicio, st.listaPrecioId);
      agregarItem(container, { tipo: 'servicio', referencia_id: servicio.id, descripcion: servicio.nombre, cantidad: 1, precio_unitario: precio });
    };
  });

  container.querySelector('#cm-add-custom').onclick = () => {
    const desc = container.querySelector('#cm-custom-desc').value.trim();
    const precio = Number(container.querySelector('#cm-custom-precio').value) || 0;
    if (!desc) { toast('Ingresá una descripción', 'err'); return; }
    agregarItem(container, { tipo: 'servicio', referencia_id: null, descripcion: desc, cantidad: 1, precio_unitario: precio });
    container.querySelector('#cm-custom-desc').value = '';
    container.querySelector('#cm-custom-precio').value = 0;
  };

  container.querySelector('#cm-escanear').onclick = () => {
    openBarcodeScanner(async (code) => {
      try {
        const producto = await api.productos.buscarBarcode(code);
        agregarItem(container, { tipo: 'producto', referencia_id: producto.id, descripcion: producto.nombre, cantidad: 1, precio_unitario: Number(producto.precio) });
      } catch (e) {
        toast(`Código no encontrado: ${code}`, 'err');
      }
    });
  };

  container.querySelector('#cm-fecha').onchange = (e) => { comandasState.fecha = e.target.value; };
  container.querySelector('#cm-atendido-por').onchange = (e) => { comandasState.atendidoPorId = e.target.value; };
  const listaSelect = container.querySelector('#cm-lista-precio');
  if (listaSelect) {
    listaSelect.onchange = (e) => {
      comandasState.listaPrecioId = e.target.value;
      renderComandasView(container);
    };
  }
  container.querySelector('#cm-ajuste-pct').oninput = (e) => {
    comandasState.ajustePct = Number(e.target.value) || 0;
    updateTotal(container);
  };

  container.querySelector('#cm-enviar').onclick = () => enviarComanda(container);

  renderItems(container);
}

function wireClienteBuscar(container) {
  const buscarInput = container.querySelector('#cm-cliente-buscar');
  const resultadosBox = container.querySelector('#cm-cliente-resultados');
  let searchTimeout;
  buscarInput.oninput = () => {
    comandasState.cliente = null;
    clearTimeout(searchTimeout);
    const q = buscarInput.value.trim();
    if (q.length < 2) { resultadosBox.innerHTML = ''; return; }
    searchTimeout = setTimeout(async () => {
      const res = await api.clientes.list(q);
      resultadosBox.innerHTML = `
        <div style="position:absolute; background:white; border:1px solid var(--border); border-radius:8px; width:100%; max-height:180px; overflow-y:auto; z-index:50;">
          ${res.map((c) => `<div data-id="${c.id}" data-nombre="${c.nombre}" style="padding:8px 10px; cursor:pointer;">${c.nombre} ${c.telefono ? `· ${c.telefono}` : ''}</div>`).join('')}
        </div>
      `;
      resultadosBox.querySelectorAll('[data-id]').forEach((row) => {
        row.onclick = () => {
          comandasState.cliente = { id: row.dataset.id, nombre: row.dataset.nombre };
          buscarInput.value = row.dataset.nombre;
          resultadosBox.innerHTML = '';
        };
      });
    }, 250);
  };
}

function wireProductoBuscar(container) {
  const buscarInput = container.querySelector('#cm-producto-buscar');
  const resultadosBox = container.querySelector('#cm-producto-resultados');
  buscarInput.oninput = () => {
    const q = buscarInput.value.trim().toLowerCase();
    if (q.length < 2) { resultadosBox.innerHTML = ''; return; }
    const matches = comandasState.productos.filter((p) => p.nombre.toLowerCase().includes(q)).slice(0, 8);
    resultadosBox.innerHTML = matches.length === 0 ? '<p style="color:var(--muted); font-size:0.85rem;">Sin resultados.</p>' : `
      <div style="border:1px solid var(--border); border-radius:8px; margin-top:6px;">
        ${matches.map((p) => `<div data-id="${p.id}" style="padding:8px 10px; cursor:pointer; border-bottom:1px solid var(--border);">${p.nombre} · $${Number(p.precio).toFixed(2)} (stock: ${p.stock})</div>`).join('')}
      </div>
    `;
    resultadosBox.querySelectorAll('[data-id]').forEach((row) => {
      row.onclick = () => {
        const producto = comandasState.productos.find((p) => p.id === row.dataset.id);
        agregarItem(container, { tipo: 'producto', referencia_id: producto.id, descripcion: producto.nombre, cantidad: 1, precio_unitario: Number(producto.precio) });
        buscarInput.value = '';
        resultadosBox.innerHTML = '';
      };
    });
  };
}

function agregarItem(container, item) {
  comandasState.items.push({ ...item, profesional_diag_id: '', profesional_asist_id: '' });
  renderItems(container);
}

function renderItems(container) {
  const st = comandasState;
  const box = container.querySelector('#cm-items');
  box.innerHTML = st.items.length === 0 ? '<p style="color:var(--muted)">Sin ítems todavía. Elegí servicios o productos arriba.</p>' : st.items.map((it, i) => `
    <div class="card" style="margin-bottom:8px; padding:10px;">
      <div class="row" style="align-items:center;">
        <span style="flex:2; font-weight:600;">${it.descripcion}</span>
        <input type="number" min="1" value="${it.cantidad}" data-i="${i}" data-field="cantidad" style="width:55px;" />
        <input type="number" value="${it.precio_unitario}" data-i="${i}" data-field="precio_unitario" style="width:90px;" />
        <button type="button" data-remove="${i}" style="border:none;background:none;color:var(--danger);cursor:pointer;font-size:1.1rem;">×</button>
      </div>
      <div class="row" style="margin-top:8px;">
        <div class="field"><label>Profesional (DIAG)</label>
          <select data-i="${i}" data-field="profesional_diag_id">
            <option value="">—</option>
            ${st.profesionales.map((p) => `<option value="${p.id}" ${it.profesional_diag_id === p.id ? 'selected' : ''}>${p.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Asistente (ASIST)</label>
          <select data-i="${i}" data-field="profesional_asist_id">
            <option value="">—</option>
            ${st.profesionales.map((p) => `<option value="${p.id}" ${it.profesional_asist_id === p.id ? 'selected' : ''}>${p.nombre}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('input,select').forEach((el) => {
    el.onchange = el.oninput = () => {
      const i = Number(el.dataset.i);
      const field = el.dataset.field;
      st.items[i][field] = field === 'cantidad' || field === 'precio_unitario' ? (Number(el.value) || 0) : el.value;
      updateTotal(container);
    };
  });
  box.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.onclick = () => { st.items.splice(Number(btn.dataset.remove), 1); renderItems(container); updateTotal(container); };
  });
  updateTotal(container);
}

function updateTotal(container) {
  const subtotal = comandasState.items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
  const total = subtotal * (1 + (comandasState.ajustePct || 0) / 100);
  container.querySelector('#cm-subtotal').textContent = subtotal.toFixed(2);
  container.querySelector('#cm-total').textContent = total.toFixed(2);
}

async function enviarComanda(container) {
  const st = comandasState;
  if (st.items.length === 0) { toast('Agregá al menos un ítem', 'err'); return; }
  try {
    await api.ventas.create({
      cliente_id: st.cliente?.id || null,
      atendido_por_id: st.atendidoPorId || null,
      ajuste_pct: st.ajustePct || 0,
      fecha: st.fecha,
      estado: 'pendiente',
      items: st.items.map((it) => ({
        tipo: it.tipo,
        referencia_id: it.referencia_id,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        profesional_diag_id: it.profesional_diag_id || null,
        profesional_asist_id: it.profesional_asist_id || null
      }))
    });
    toast('Comanda enviada a recepción');
    renderComandas(container);
  } catch (e) {
    toast(e.message, 'err');
  }
}
