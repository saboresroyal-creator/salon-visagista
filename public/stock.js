const TIPO_LABEL = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' };

async function renderStock(container) {
  container.innerHTML = '<p>Cargando...</p>';
  await reloadStock(container, false);
  onStockChange((table) => {
    if (!container.isConnected) return;
    if (table === 'productos' || table === 'stock_movimientos') reloadStock(container, false);
  });
}

async function reloadStock(container, showLoading) {
  if (showLoading) container.innerHTML = '<p>Cargando...</p>';
  const [productos, alertas, movimientos] = await Promise.all([
    api.productos.list(),
    api.stock.alertas(),
    api.stock.movimientos.list()
  ]);
  if (!container.isConnected) return;
  renderStockView(container, productos, alertas, movimientos);
}

function renderStockView(container, productos, alertas, movimientos) {
  const activos = productos.filter((p) => p.activo !== false);

  container.innerHTML = `
    ${alertas.length ? `
      <div class="card" style="margin-bottom:16px; border-color:var(--danger);">
        <h2 style="margin-top:0; font-size:1rem; color:var(--danger);">⚠ Stock bajo (${alertas.length})</h2>
        <p style="color:var(--muted); font-size:0.85rem; margin-bottom:10px;">Estos productos están en su stock mínimo o por debajo.</p>
        <div class="row" style="flex-wrap:wrap; gap:8px;">
          ${alertas.map((p) => `<span class="servicio-chip" style="background:#fbeceb;">${p.nombre}: ${p.stock}</span>`).join('')}
        </div>
      </div>` : ''}

    <div class="cal-toolbar">
      <input id="st-buscar" placeholder="Buscar producto o código..." style="flex:1; max-width:320px;" />
      <div style="flex:1"></div>
      <button class="secondary" id="st-escanear" type="button">📷 Escanear código</button>
      <button class="primary" id="st-nuevo-mov" type="button">+ Registrar movimiento</button>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <h2 style="margin-top:0; font-size:1rem;">Productos</h2>
      <div id="st-productos"></div>
    </div>

    <div class="card">
      <h2 style="margin-top:0; font-size:1rem;">Historial de movimientos</h2>
      <div id="st-historial"></div>
    </div>
  `;

  const renderProductos = (list) => {
    const box = container.querySelector('#st-productos');
    box.innerHTML = list.length === 0 ? '<p style="color:var(--muted)">Sin productos.</p>' : `
      <table class="data-table">
        <thead><tr><th>Nombre</th><th>Stock</th><th>Mínimo</th><th>Código</th><th></th></tr></thead>
        <tbody>${list.map((p) => `
          <tr data-id="${p.id}" ${p.stock <= (p.stock_minimo || 0) ? 'class="stock-bajo"' : ''}>
            <td>${p.nombre}</td><td>${p.stock}</td><td>${p.stock_minimo || 0}</td><td>${p.barcode || '—'}</td>
            <td><button class="secondary st-mov-btn" data-id="${p.id}" type="button">Movimiento</button></td>
          </tr>`).join('')}</tbody>
      </table>`;
    box.querySelectorAll('.st-mov-btn').forEach((btn) => {
      btn.onclick = () => openMovimientoModal(list.find((x) => x.id === btn.dataset.id), container, activos);
    });
  };
  renderProductos(activos);

  container.querySelector('#st-buscar').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    renderProductos(activos.filter((p) => p.nombre.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q)));
  };

  const histBox = container.querySelector('#st-historial');
  histBox.innerHTML = movimientos.length === 0 ? '<p style="color:var(--muted)">Sin movimientos registrados.</p>' : `
    <table class="data-table">
      <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Stock resultante</th><th>Motivo</th><th>Usuario</th></tr></thead>
      <tbody>${movimientos.map((m) => `
        <tr>
          <td>${new Date(m.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
          <td>${m.productos?.nombre || '—'}</td>
          <td>${TIPO_LABEL[m.tipo] || m.tipo}</td>
          <td>${m.cantidad}</td>
          <td>${m.stock_nuevo}</td>
          <td>${m.motivo || ''}</td>
          <td>${m.usuario_nombre || ''}</td>
        </tr>`).join('')}</tbody>
    </table>`;

  container.querySelector('#st-escanear').onclick = () => handleScan(container, activos);
  container.querySelector('#st-nuevo-mov').onclick = () => openMovimientoModal(null, container, activos);
}

function handleScan(container, productosList) {
  openBarcodeScanner(async (code) => {
    try {
      const producto = await api.productos.buscarBarcode(code);
      openMovimientoModal(producto, container, productosList);
    } catch (e) {
      if (confirm(`El código "${code}" no está asociado a ningún producto. ¿Creamos un producto nuevo con este código?`)) {
        openNuevoProductoDesdeEscaneo(code, container);
      }
    }
  });
}

function openMovimientoModal(producto, container, productosList) {
  const necesitaSelector = !producto;
  smallModal('Registrar movimiento de stock', `
      ${necesitaSelector ? `
        <div class="field"><label>Producto</label>
          <select id="mv-producto">${productosList.map((p) => `<option value="${p.id}">${p.nombre} (stock: ${p.stock})</option>`).join('')}</select>
        </div>` : `<p style="margin:0 0 12px;"><b>${producto.nombre}</b> — stock actual: ${producto.stock}</p>`}
      <div class="field"><label>Tipo de movimiento</label>
        <select id="mv-tipo">
          <option value="entrada">Entrada (suma al stock)</option>
          <option value="salida">Salida (resta del stock)</option>
          <option value="ajuste">Ajuste (fija el stock a este valor)</option>
        </select>
      </div>
      <div class="field"><label>Cantidad</label><input type="number" id="mv-cantidad" min="0" value="1" /></div>
      <div class="field"><label>Motivo (opcional)</label><input id="mv-motivo" placeholder="Ej: compra a proveedor, uso en un servicio..." /></div>
    `,
    async (backdrop, close) => {
      const producto_id = necesitaSelector ? backdrop.querySelector('#mv-producto').value : producto.id;
      const tipo = backdrop.querySelector('#mv-tipo').value;
      const cantidad = Number(backdrop.querySelector('#mv-cantidad').value);
      const motivo = backdrop.querySelector('#mv-motivo').value.trim();
      if (!producto_id) { toast('Elegí un producto', 'err'); return; }
      if (!(cantidad >= 0)) { toast('Cantidad inválida', 'err'); return; }
      try {
        await api.stock.movimientos.create({ producto_id, tipo, cantidad, motivo });
        toast('Movimiento registrado');
        close();
        reloadStock(container, false);
      } catch (e) { toast(e.message, 'err'); }
    }
  );
}

function openNuevoProductoDesdeEscaneo(barcode, container) {
  smallModal('Producto no encontrado — crear nuevo', `
      <div class="field"><label>Nombre</label><input id="np-nombre" /></div>
      <div class="row">
        <div class="field"><label>Precio</label><input type="number" id="np-precio" value="0" /></div>
        <div class="field"><label>Costo</label><input type="number" id="np-costo" value="0" /></div>
      </div>
      <div class="field"><label>Stock inicial</label><input type="number" id="np-stock" value="0" /></div>
      <div class="field"><label>Código de barras</label><input id="np-barcode" value="${barcode}" /></div>
    `,
    async (backdrop, close) => {
      const nombre = backdrop.querySelector('#np-nombre').value.trim();
      if (!nombre) { toast('El nombre es obligatorio', 'err'); return; }
      try {
        await api.productos.create({
          nombre,
          precio: Number(backdrop.querySelector('#np-precio').value) || 0,
          costo: Number(backdrop.querySelector('#np-costo').value) || 0,
          stock: Number(backdrop.querySelector('#np-stock').value) || 0,
          barcode: backdrop.querySelector('#np-barcode').value.trim() || null
        });
        toast('Producto creado');
        close();
        reloadStock(container, false);
      } catch (e) { toast(e.message, 'err'); }
    }
  );
}
