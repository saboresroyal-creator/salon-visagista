let facturacionState = { fecha: new Date().toISOString().slice(0, 10) };

async function renderFacturacion(container) {
  container.innerHTML = `
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

  await loadVentasDelDia(container);
}

async function loadVentasDelDia(container) {
  const box = container.querySelector('#fa-lista');
  const resumenBox = container.querySelector('#fa-resumen');
  const ventas = await api.ventas.list({ desde: facturacionState.fecha, hasta: facturacionState.fecha });

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
            <td><button class="danger" data-del="${v.id}">Eliminar</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
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

async function openVentaModal(container) {
  const [servicios, productos] = await Promise.all([api.servicios.list(), api.productos.list()]);
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

      <div class="row">
        <div class="field">
          <label>Fecha</label>
          <input type="date" id="vm-fecha" value="${facturacionState.fecha}" />
        </div>
        <div class="field">
          <label>Método de pago</label>
          <select id="vm-metodo">
            <option value="Efectivo">Efectivo</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Débito">Débito</option>
            <option value="Crédito">Crédito</option>
          </select>
        </div>
      </div>

      <div style="text-align:right; font-weight:600; margin-top:8px;">Total: $<span id="vm-total">0.00</span></div>

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
    const total = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
    backdrop.querySelector('#vm-total').textContent = total.toFixed(2);
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
        fecha: backdrop.querySelector('#vm-fecha').value,
        metodo_pago: backdrop.querySelector('#vm-metodo').value,
        items
      });
      toast('Venta registrada');
      close();
      loadVentasDelDia(container);
    } catch (e) { toast(e.message, 'err'); }
  };
}
