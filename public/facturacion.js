let facturacionState = { fecha: new Date().toISOString().slice(0, 10) };
const METODOS_PAGO = ['Efectivo', 'Débito', 'Crédito', 'MercadoPago', 'Cta Cte', 'Cheque', 'Transferencia', 'Otro'];

async function renderFacturacion(container) {
  container.innerHTML = `
    <div class="card" style="margin-bottom:16px;" id="fa-pendientes-card">
      <h2 style="margin-top:0; font-size:1rem;">Pendientes de cobro</h2>
      <div id="fa-pendientes"><p>Cargando...</p></div>
    </div>

    <div class="cal-toolbar">
      <input type="date" id="fa-fecha" value="${facturacionState.fecha}" />
      <div style="flex:1"></div>
      <button class="primary" id="fa-nueva">+ Nueva venta</button>
    </div>
    <div id="fa-resumen" class="card" style="margin-bottom:14px;"></div>
    <div id="fa-lista" class="card"><p>Cargando...</p></div>
  `;

  container.querySelector('#fa-fecha').onchange = (e) => {
    facturacionState.fecha = e.target.value;
    loadVentasDelDia(container);
  };
  container.querySelector('#fa-nueva').onclick = () => openVentaModal(container);

  await Promise.all([loadPendientes(container), loadVentasDelDia(container)]);

  onSync((table) => {
    if (!container.isConnected || table !== 'ventas') return;
    loadPendientes(container);
    loadVentasDelDia(container);
  });
}

async function loadPendientes(container) {
  const box = container.querySelector('#fa-pendientes');
  const ventas = await api.ventas.list({ estado: 'pendiente' });
  if (!container.isConnected) return;

  box.innerHTML = ventas.length === 0 ? '<p style="color:var(--muted)">No hay comandas esperando cobro.</p>' : `
    <table class="data-table">
      <thead><tr><th>Clienta</th><th>Ítems</th><th>Total</th><th></th></tr></thead>
      <tbody>
        ${ventas.map((v) => `
          <tr data-id="${v.id}">
            <td>${v.clientes?.nombre || 'Consumidor final'}</td>
            <td>${(v.venta_items || []).map((i) => `${i.descripcion} x${i.cantidad}`).join(', ')}</td>
            <td>$${Number(v.total).toFixed(2)}</td>
            <td><button class="primary" data-cobrar="${v.id}" type="button">Cobrar</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  box.querySelectorAll('[data-cobrar]').forEach((btn) => {
    btn.onclick = () => {
      const venta = ventas.find((v) => v.id === btn.dataset.cobrar);
      openCobrarModal(venta, container);
    };
  });
}

async function loadVentasDelDia(container) {
  const box = container.querySelector('#fa-lista');
  const resumenBox = container.querySelector('#fa-resumen');
  const ventas = await api.ventas.list({ desde: facturacionState.fecha, hasta: facturacionState.fecha, estado: 'cobrada' });
  if (!container.isConnected) return;

  const total = ventas.reduce((s, v) => s + Number(v.total), 0);
  resumenBox.innerHTML = `<b>${ventas.length}</b> venta(s) · Total del día: <b>$${total.toFixed(2)}</b>`;

  if (ventas.length === 0) {
    box.innerHTML = '<p style="color:var(--muted)">Sin ventas registradas ese día.</p>';
    return;
  }

  box.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Cliente</th><th>Items</th><th>Método de pago</th><th>Total</th><th></th></tr></thead>
      <tbody>
        ${ventas.map((v) => `
          <tr data-id="${v.id}">
            <td>${v.clientes?.nombre || 'Consumidor final'}</td>
            <td>${(v.venta_items || []).map((i) => `${i.descripcion} x${i.cantidad}`).join(', ')}</td>
            <td>${v.metodo_pago || '—'}</td>
            <td>$${Number(v.total).toFixed(2)}</td>
            <td style="white-space:nowrap;">
              <button class="secondary" data-comprobante="${v.id}" type="button">Comprobante</button>
              <button class="danger" data-del="${v.id}">Eliminar</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  box.querySelectorAll('[data-comprobante]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      window.open(`/api/ventas/${btn.dataset.comprobante}/comprobante.pdf`, '_blank');
    };
  });
  box.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('¿Eliminar esta venta?')) return;
      await api.ventas.remove(btn.dataset.del);
      toast('Venta eliminada');
      loadVentasDelDia(container);
    };
  });
}

// Editor de pago dividido: uno o más renglones de método + monto que tienen
// que sumar el total. Se usa tanto para cobrar una comanda pendiente como
// para el flujo directo de "+ Nueva venta". getClienteId (opcional) permite
// el botón "Dejar diferencia a cuenta corriente", que carga como deuda lo
// que no se llegó a cobrar en el momento.
function crearEditorPagos(mountEl, totalInicial, onCtaCteToggle, getClienteId) {
  let total = totalInicial;
  let pagos = [{ metodo: 'Efectivo', monto: total }];

  function renderResumen() {
    const suma = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const falta = Math.round((total - suma) * 100) / 100;
    const resumenEl = mountEl.querySelector('#pg-resumen');
    if (Math.abs(falta) < 0.01) {
      resumenEl.textContent = 'Total cubierto';
      resumenEl.style.color = 'var(--muted)';
    } else {
      resumenEl.textContent = falta > 0 ? `Falta cobrar: $${falta.toFixed(2)}` : `Sobran $${Math.abs(falta).toFixed(2)}`;
      resumenEl.style.color = 'var(--danger)';
    }
    if (onCtaCteToggle) onCtaCteToggle(pagos.some((p) => p.metodo === 'Cta Cte'));
  }

  function renderFilas() {
    const filasBox = mountEl.querySelector('#pg-filas');
    filasBox.innerHTML = pagos.map((p, i) => `
      <div class="row" style="align-items:center; margin-bottom:6px;">
        <select data-i="${i}" data-field="metodo" style="flex:1;">
          ${METODOS_PAGO.map((m) => `<option value="${m}" ${p.metodo === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
        <input type="number" step="0.01" data-i="${i}" data-field="monto" value="${p.monto}" style="width:110px;" />
        ${pagos.length > 1 ? `<button type="button" data-remove="${i}" style="border:none;background:none;color:var(--danger);cursor:pointer;">×</button>` : ''}
      </div>
    `).join('');
    filasBox.querySelectorAll('select').forEach((el) => {
      el.onchange = () => { pagos[Number(el.dataset.i)].metodo = el.value; renderResumen(); };
    });
    filasBox.querySelectorAll('input').forEach((el) => {
      el.oninput = () => { pagos[Number(el.dataset.i)].monto = Number(el.value) || 0; renderResumen(); };
    });
    filasBox.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.onclick = () => { pagos.splice(Number(btn.dataset.remove), 1); renderFilas(); renderResumen(); };
    });
  }

  mountEl.innerHTML = `
    <div id="pg-filas"></div>
    <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:6px;">
      <button type="button" class="secondary" id="pg-agregar">+ Otro método</button>
      <button type="button" class="secondary" id="pg-resto-ctacte">Dejar diferencia a cuenta corriente</button>
    </div>
    <p id="pg-resumen" style="text-align:right; font-size:0.85rem; margin:4px 0 0;"></p>
  `;
  mountEl.querySelector('#pg-agregar').onclick = () => {
    const sumaActual = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
    pagos.push({ metodo: 'Efectivo', monto: Math.max(0, Math.round((total - sumaActual) * 100) / 100) });
    renderFilas();
    renderResumen();
  };
  mountEl.querySelector('#pg-resto-ctacte').onclick = () => {
    const clienteId = getClienteId ? getClienteId() : null;
    if (!clienteId) { toast('Elegí una clienta primero para poder dejar la diferencia a cuenta corriente', 'err'); return; }
    const sumaActual = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const falta = Math.round((total - sumaActual) * 100) / 100;
    if (falta <= 0) { toast('No hay diferencia pendiente por cobrar', 'err'); return; }
    const existente = pagos.find((p) => p.metodo === 'Cta Cte');
    if (existente) existente.monto = Math.round(((Number(existente.monto) || 0) + falta) * 100) / 100;
    else pagos.push({ metodo: 'Cta Cte', monto: falta });
    renderFilas();
    renderResumen();
  };
  renderFilas();
  renderResumen();

  return {
    getPagos: () => pagos.filter((p) => p.monto !== 0),
    // El total puede cambiar si se edita un ítem después de armar el pago;
    // esto solo actualiza el "falta cobrar", no toca lo que ya se cargó.
    setTotal: (nuevoTotal) => { total = nuevoTotal; renderResumen(); }
  };
}

async function mostrarInfoCtaCte(infoBox, clienteId) {
  if (!clienteId) {
    infoBox.style.display = 'block';
    infoBox.style.color = 'var(--danger)';
    infoBox.textContent = 'Para pagar con Cta Cte hay que elegir una clienta.';
    return;
  }
  const cliente = await api.clientes.get(clienteId);
  infoBox.style.display = 'block';
  infoBox.style.color = 'var(--muted)';
  infoBox.textContent = `Saldo actual de la clienta en cuenta corriente: $${Number(cliente.saldo_cta_cte || 0).toFixed(2)}`;
}

async function openCobrarModal(venta, container) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="width:520px;">
      <h2 style="margin-top:0;">Cobrar comanda</h2>
      <p style="margin-top:-8px; color:var(--muted);">
        ${venta.clientes?.nombre || 'Consumidor final'}${venta.profesionales?.nombre ? ` · Atendido por ${venta.profesionales.nombre}` : ''}
      </p>
      <div class="row" style="justify-content:space-between; align-items:center;">
        <span style="font-size:0.8rem; color:var(--muted);">Detalle de la comanda</span>
        <button type="button" class="secondary" id="cb-editar">Editar comanda</button>
      </div>
      <table class="data-table" style="margin-bottom:10px;">
        <thead><tr><th>Ítem</th><th>Cant.</th><th>Precio</th></tr></thead>
        <tbody>
          ${(venta.venta_items || []).map((it) => `<tr><td>${it.descripcion}</td><td>${it.cantidad}</td><td>$${Number(it.precio_unitario).toFixed(2)}</td></tr>`).join('')}
        </tbody>
      </table>
      ${Number(venta.ajuste_pct) ? `<div style="text-align:right; color:var(--muted); font-size:0.85rem;">Subtotal: $${Number(venta.subtotal ?? venta.total).toFixed(2)} · ${Number(venta.ajuste_pct) > 0 ? 'Recargo' : 'Descuento'}: ${Number(venta.ajuste_pct)}%</div>` : ''}
      <div style="text-align:right; font-weight:600; margin-bottom:10px;">Total: $${Number(venta.total).toFixed(2)}</div>
      <div id="cb-cta-cte-info" style="display:none; font-size:0.82rem; margin-bottom:8px;"></div>
      <div id="cb-pagos"></div>
      <div class="modal-actions">
        <button class="secondary" id="cb-cancelar">Cancelar</button>
        <button class="primary" id="cb-confirmar">Confirmar cobro</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  backdrop.querySelector('#cb-cancelar').onclick = close;

  backdrop.querySelector('#cb-editar').onclick = () => {
    close();
    openEditarComandaModal(venta, container);
  };

  const infoBox = backdrop.querySelector('#cb-cta-cte-info');
  const editor = crearEditorPagos(backdrop.querySelector('#cb-pagos'), Number(venta.total), (usaCtaCte) => {
    if (!usaCtaCte) { infoBox.style.display = 'none'; return; }
    mostrarInfoCtaCte(infoBox, venta.cliente_id);
  }, () => venta.cliente_id);

  backdrop.querySelector('#cb-confirmar').onclick = async () => {
    try {
      await api.ventas.cobrar(venta.id, { pagos: editor.getPagos() });
      toast('Cobro confirmado');
      close();
      loadPendientes(container);
      loadVentasDelDia(container);
    } catch (e) { toast(e.message, 'err'); }
  };
}

// Recepción puede ajustar el descuento/recargo y los ítems de una comanda
// pendiente antes de cobrarla (por ejemplo, sacar algo que la profesional
// cargó de más, o aplicar un descuento acordado con la clienta).
async function openEditarComandaModal(venta, container) {
  const [servicios, productos] = await Promise.all([api.servicios.list(), api.productos.list()]);
  const items = (venta.venta_items || []).map((it) => ({ ...it }));

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="width:560px;">
      <h2>Editar comanda</h2>
      <p style="margin-top:-8px; color:var(--muted);">${venta.clientes?.nombre || 'Consumidor final'}</p>

      <div class="field">
        <label>Agregar ítem</label>
        <select id="ec-item-add">
          <option value="">Elegir servicio o producto...</option>
          <optgroup label="Servicios">
            ${servicios.map((s) => `<option value="servicio:${s.id}" data-precio="${s.precio}" data-nombre="${s.nombre}">${s.nombre}</option>`).join('')}
          </optgroup>
          <optgroup label="Productos">
            ${productos.map((p) => `<option value="producto:${p.id}" data-precio="${p.precio}" data-nombre="${p.nombre}">${p.nombre}</option>`).join('')}
          </optgroup>
        </select>
        <div id="ec-items"></div>
      </div>

      <div class="field" style="max-width:220px; margin-left:auto;">
        <label>Descuento / recargo (%)</label>
        <input type="number" id="ec-ajuste-pct" value="${venta.ajuste_pct || 0}" placeholder="Ej: -10 ó 5" />
      </div>
      <div style="text-align:right; margin-top:4px;">
        <div style="color:var(--muted); font-size:0.85rem;">Subtotal: $<span id="ec-subtotal">0.00</span></div>
        <div style="font-weight:600; font-size:1.05rem;">Total: $<span id="ec-total">0.00</span></div>
      </div>

      <div class="modal-actions">
        <button class="secondary" id="ec-cancelar">Cancelar</button>
        <button class="primary" id="ec-guardar">Guardar cambios</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  backdrop.querySelector('#ec-cancelar').onclick = close;

  function updateTotal() {
    const subtotal = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
    const ajustePct = Number(backdrop.querySelector('#ec-ajuste-pct').value) || 0;
    backdrop.querySelector('#ec-subtotal').textContent = subtotal.toFixed(2);
    backdrop.querySelector('#ec-total').textContent = (subtotal * (1 + ajustePct / 100)).toFixed(2);
  }

  function renderItems() {
    const box = backdrop.querySelector('#ec-items');
    box.innerHTML = items.map((it, i) => `
      <div class="row" style="align-items:center; margin-bottom:6px;">
        <span style="flex:2;">${it.descripcion}</span>
        <input type="number" min="1" value="${it.cantidad}" data-i="${i}" data-field="cantidad" style="width:60px;" />
        <input type="number" value="${it.precio_unitario}" data-i="${i}" data-field="precio_unitario" style="width:90px;" />
        <button type="button" data-remove="${i}" style="border:none;background:none;color:var(--danger);cursor:pointer;">×</button>
      </div>
    `).join('');
    box.querySelectorAll('input').forEach((inp) => {
      inp.oninput = () => { items[Number(inp.dataset.i)][inp.dataset.field] = Number(inp.value) || 0; updateTotal(); };
    });
    box.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.onclick = () => { items.splice(Number(btn.dataset.remove), 1); renderItems(); updateTotal(); };
    });
  }

  backdrop.querySelector('#ec-item-add').onchange = (e) => {
    const opt = e.target.selectedOptions[0];
    if (!opt.value) return;
    const [tipo, id] = opt.value.split(':');
    items.push({ tipo, referencia_id: id, descripcion: opt.dataset.nombre, cantidad: 1, precio_unitario: Number(opt.dataset.precio) });
    renderItems();
    updateTotal();
    e.target.value = '';
  };
  backdrop.querySelector('#ec-ajuste-pct').oninput = updateTotal;

  backdrop.querySelector('#ec-guardar').onclick = async () => {
    if (items.length === 0) { toast('La comanda necesita al menos un ítem', 'err'); return; }
    try {
      const actualizada = await api.ventas.update(venta.id, {
        items,
        ajuste_pct: Number(backdrop.querySelector('#ec-ajuste-pct').value) || 0
      });
      toast('Comanda actualizada');
      close();
      openCobrarModal(actualizada, container);
    } catch (e) { toast(e.message, 'err'); }
  };

  renderItems();
  updateTotal();
}

async function openVentaModal(container) {
  const [servicios, productos, profesionales] = await Promise.all([api.servicios.list(), api.productos.list(), api.profesionales.list()]);
  let clienteSeleccionado = null;
  let items = [];

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="width:560px;">
      <h2>Nueva venta</h2>

      <div class="field">
        <label>Clienta (opcional)</label>
        <input type="text" id="vm-cliente-buscar" placeholder="Buscar o dejar vacío para consumidor final..." autocomplete="off" />
        <div id="vm-cliente-resultados" style="position:relative;"></div>
      </div>

      <div class="field">
        <label>Atendido por</label>
        <select id="vm-atendido-por">
          <option value="">—</option>
          ${profesionales.filter((p) => p.activo !== false).map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label>Agregar ítem</label>
        <select id="vm-item-add">
          <option value="">Elegir servicio o producto...</option>
          <optgroup label="Servicios">
            ${servicios.map((s) => `<option value="servicio:${s.id}" data-precio="${s.precio}" data-nombre="${s.nombre}">${s.nombre}</option>`).join('')}
          </optgroup>
          <optgroup label="Productos">
            ${productos.map((p) => `<option value="producto:${p.id}" data-precio="${p.precio}" data-nombre="${p.nombre}">${p.nombre} (stock: ${p.stock})</option>`).join('')}
          </optgroup>
        </select>
        <div id="vm-items"></div>
      </div>

      <div class="field">
        <label>Fecha</label>
        <input type="date" id="vm-fecha" value="${facturacionState.fecha}" />
      </div>

      <div class="field" style="max-width:220px; margin-left:auto;">
        <label>Descuento / recargo (%)</label>
        <input type="number" id="vm-ajuste-pct" value="0" placeholder="Ej: -10 ó 5" />
      </div>

      <div style="text-align:right; margin-top:4px;">
        <div style="color:var(--muted); font-size:0.85rem;">Subtotal: $<span id="vm-subtotal">0.00</span></div>
        <div style="font-weight:600; font-size:1.05rem;">Total: $<span id="vm-total">0.00</span></div>
      </div>

      <div class="field" style="margin-top:10px;">
        <label>Pago</label>
        <div id="vm-cta-cte-info" style="display:none; font-size:0.82rem; margin-bottom:6px;"></div>
        <div id="vm-pagos"></div>
      </div>

      <div class="modal-actions">
        <button class="secondary" id="vm-cancelar">Cancelar</button>
        <button class="primary" id="vm-guardar">Guardar venta</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  backdrop.querySelector('#vm-cancelar').onclick = close;

  function calcularTotal() {
    const subtotal = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
    const ajustePct = Number(backdrop.querySelector('#vm-ajuste-pct')?.value) || 0;
    return { subtotal, total: subtotal * (1 + ajustePct / 100) };
  }

  let editorPagos = null;
  function renderEditorPagos() {
    const { total } = calcularTotal();
    const infoBox = backdrop.querySelector('#vm-cta-cte-info');
    editorPagos = crearEditorPagos(backdrop.querySelector('#vm-pagos'), total, (usaCtaCte) => {
      if (!usaCtaCte) { infoBox.style.display = 'none'; return; }
      mostrarInfoCtaCte(infoBox, clienteSeleccionado?.id);
    }, () => clienteSeleccionado?.id);
  }

  function renderItems() {
    const box = backdrop.querySelector('#vm-items');
    box.innerHTML = items.map((it, i) => `
      <div class="row" style="align-items:center; margin-bottom:6px;">
        <span style="flex:2;">${it.descripcion}</span>
        <input type="number" min="1" value="${it.cantidad}" data-i="${i}" data-field="cantidad" style="width:60px;" />
        <input type="number" value="${it.precio_unitario}" data-i="${i}" data-field="precio_unitario" style="width:90px;" />
        <button type="button" data-remove="${i}" style="border:none;background:none;color:var(--danger);cursor:pointer;">×</button>
      </div>
    `).join('');
    box.querySelectorAll('input').forEach((inp) => {
      inp.oninput = () => {
        items[Number(inp.dataset.i)][inp.dataset.field] = Number(inp.value) || 0;
        updateTotal();
      };
    });
    box.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.onclick = () => { items.splice(Number(btn.dataset.remove), 1); renderItems(); updateTotal(); };
    });
  }

  function updateTotal() {
    const { subtotal, total } = calcularTotal();
    backdrop.querySelector('#vm-subtotal').textContent = subtotal.toFixed(2);
    backdrop.querySelector('#vm-total').textContent = total.toFixed(2);
    if (editorPagos) editorPagos.setTotal(total);
  }

  backdrop.querySelector('#vm-item-add').onchange = (e) => {
    const opt = e.target.selectedOptions[0];
    if (!opt.value) return;
    const [tipo, id] = opt.value.split(':');
    items.push({ tipo, referencia_id: id, descripcion: opt.dataset.nombre, cantidad: 1, precio_unitario: Number(opt.dataset.precio) });
    renderItems();
    updateTotal();
    e.target.value = '';
  };

  backdrop.querySelector('#vm-ajuste-pct').oninput = () => updateTotal();

  const buscarInput = backdrop.querySelector('#vm-cliente-buscar');
  const resultadosBox = backdrop.querySelector('#vm-cliente-resultados');
  let searchTimeout;
  buscarInput.oninput = () => {
    clienteSeleccionado = null;
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
          clienteSeleccionado = { id: row.dataset.id, nombre: row.dataset.nombre };
          buscarInput.value = row.dataset.nombre;
          resultadosBox.innerHTML = '';
        };
      });
    }, 250);
  };

  backdrop.querySelector('#vm-guardar').onclick = async () => {
    if (items.length === 0) { toast('Agregá al menos un ítem', 'err'); return; }
    try {
      await api.ventas.create({
        cliente_id: clienteSeleccionado?.id || null,
        atendido_por_id: backdrop.querySelector('#vm-atendido-por').value || null,
        ajuste_pct: Number(backdrop.querySelector('#vm-ajuste-pct').value) || 0,
        fecha: backdrop.querySelector('#vm-fecha').value,
        estado: 'cobrada',
        pagos: editorPagos.getPagos(),
        items
      });
      toast('Venta registrada');
      close();
      loadVentasDelDia(container);
    } catch (e) { toast(e.message, 'err'); }
  };

  renderItems();
  renderEditorPagos();
}
