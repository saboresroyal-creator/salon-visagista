async function renderCatalogo(container) {
  container.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h2 style="margin-top:0;">Profesionales</h2>
      <div id="cat-profesionales"><p>Cargando...</p></div>
      <button class="secondary" id="cat-add-prof" type="button" style="margin-top:10px;">+ Agregar profesional</button>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <h2 style="margin-top:0;">Servicios</h2>
      <div id="cat-servicios"><p>Cargando...</p></div>
      <button class="secondary" id="cat-add-serv" type="button" style="margin-top:10px;">+ Agregar servicio</button>
    </div>

    <div class="card">
      <h2 style="margin-top:0;">Productos</h2>
      <div id="cat-productos"><p>Cargando...</p></div>
      <button class="secondary" id="cat-add-prod" type="button" style="margin-top:10px;">+ Agregar producto</button>
    </div>
  `;

  container.querySelector('#cat-add-prof').onclick = () => openProfesionalModal(null, container);
  container.querySelector('#cat-add-serv').onclick = () => openServicioModal(null, container);
  container.querySelector('#cat-add-prod').onclick = () => openProductoModal(null, container);

  await Promise.all([loadProfesionales(container), loadServicios(container), loadProductos(container)]);
}

async function loadProfesionales(container) {
  const box = container.querySelector('#cat-profesionales');
  const data = await api.profesionales.list();
  box.innerHTML = data.length === 0 ? '<p style="color:var(--muted)">Sin profesionales cargadas.</p>' : `
    <table class="data-table">
      <thead><tr><th></th><th>Nombre</th><th>Estado</th></tr></thead>
      <tbody>${data.map((p) => `
        <tr data-id="${p.id}">
          <td><span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${p.color}"></span></td>
          <td>${p.nombre}</td>
          <td>${p.activo === false ? 'Inactiva' : 'Activa'}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  box.querySelectorAll('tr[data-id]').forEach((row) => {
    row.onclick = () => openProfesionalModal(data.find((p) => p.id === row.dataset.id), container);
  });
}

async function loadServicios(container) {
  const box = container.querySelector('#cat-servicios');
  const data = await api.servicios.list();
  box.innerHTML = data.length === 0 ? '<p style="color:var(--muted)">Sin servicios cargados.</p>' : `
    <table class="data-table">
      <thead><tr><th>Nombre</th><th>Categoría</th><th>Duración</th><th>Precio</th></tr></thead>
      <tbody>${data.map((s) => `
        <tr data-id="${s.id}">
          <td>${s.nombre}</td><td>${s.categoria || ''}</td><td>${s.duracion_min} min</td><td>$${s.precio}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  box.querySelectorAll('tr[data-id]').forEach((row) => {
    row.onclick = () => openServicioModal(data.find((s) => s.id === row.dataset.id), container);
  });
}

async function loadProductos(container) {
  const box = container.querySelector('#cat-productos');
  const data = await api.productos.list();
  box.innerHTML = data.length === 0 ? '<p style="color:var(--muted)">Sin productos cargados.</p>' : `
    <table class="data-table">
      <thead><tr><th>Nombre</th><th>Precio</th><th>Costo</th><th>Stock</th></tr></thead>
      <tbody>${data.map((p) => `
        <tr data-id="${p.id}">
          <td>${p.nombre}</td><td>$${p.precio}</td><td>$${p.costo}</td><td>${p.stock}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  box.querySelectorAll('tr[data-id]').forEach((row) => {
    row.onclick = () => openProductoModal(data.find((p) => p.id === row.dataset.id), container);
  });
}

function smallModal(title, fieldsHtml, onSave, onDelete) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h2>${title}</h2>
      ${fieldsHtml}
      <div class="modal-actions">
        ${onDelete ? '<button class="danger" id="sm-eliminar">Eliminar</button>' : ''}
        <button class="secondary" id="sm-cancelar">Cancelar</button>
        <button class="primary" id="sm-guardar">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  backdrop.querySelector('#sm-cancelar').onclick = close;
  backdrop.querySelector('#sm-guardar').onclick = () => onSave(backdrop, close);
  if (onDelete) backdrop.querySelector('#sm-eliminar').onclick = () => onDelete(close);
  return backdrop;
}

function openProfesionalModal(prof, container) {
  const isEdit = !!prof;
  smallModal(isEdit ? 'Editar profesional' : 'Nueva profesional', `
      <div class="field"><label>Nombre</label><input id="pf-nombre" value="${prof?.nombre || ''}" /></div>
      <div class="field"><label>Color en el calendario</label><input type="color" id="pf-color" value="${prof?.color || '#5b8def'}" /></div>
      <div class="field"><label><input type="checkbox" id="pf-activo" ${prof?.activo !== false ? 'checked' : ''} /> Activa</label></div>
    `,
    async (backdrop, close) => {
      const payload = {
        nombre: backdrop.querySelector('#pf-nombre').value.trim(),
        color: backdrop.querySelector('#pf-color').value,
        activo: backdrop.querySelector('#pf-activo').checked
      };
      if (!payload.nombre) { toast('El nombre es obligatorio', 'err'); return; }
      try {
        if (isEdit) await api.profesionales.update(prof.id, payload);
        else await api.profesionales.create(payload);
        toast('Profesional guardada');
        close();
        loadProfesionales(container);
      } catch (e) { toast(e.message, 'err'); }
    },
    isEdit ? async (close) => {
      if (!confirm(`¿Eliminar a ${prof.nombre}?`)) return;
      try { await api.profesionales.remove(prof.id); toast('Eliminada'); close(); loadProfesionales(container); }
      catch (e) { toast(e.message, 'err'); }
    } : null
  );
}

function openServicioModal(serv, container) {
  const isEdit = !!serv;
  smallModal(isEdit ? 'Editar servicio' : 'Nuevo servicio', `
      <div class="field"><label>Nombre</label><input id="sv-nombre" value="${serv?.nombre || ''}" /></div>
      <div class="field"><label>Categoría</label><input id="sv-categoria" value="${serv?.categoria || ''}" /></div>
      <div class="row">
        <div class="field"><label>Duración (min)</label><input type="number" id="sv-duracion" value="${serv?.duracion_min ?? 30}" /></div>
        <div class="field"><label>Precio</label><input type="number" id="sv-precio" value="${serv?.precio ?? 0}" /></div>
      </div>
      <div class="field"><label><input type="checkbox" id="sv-activo" ${serv?.activo !== false ? 'checked' : ''} /> Activo</label></div>
    `,
    async (backdrop, close) => {
      const payload = {
        nombre: backdrop.querySelector('#sv-nombre').value.trim(),
        categoria: backdrop.querySelector('#sv-categoria').value.trim(),
        duracion_min: Number(backdrop.querySelector('#sv-duracion').value) || 30,
        precio: Number(backdrop.querySelector('#sv-precio').value) || 0,
        activo: backdrop.querySelector('#sv-activo').checked
      };
      if (!payload.nombre) { toast('El nombre es obligatorio', 'err'); return; }
      try {
        if (isEdit) await api.servicios.update(serv.id, payload);
        else await api.servicios.create(payload);
        toast('Servicio guardado');
        close();
        loadServicios(container);
      } catch (e) { toast(e.message, 'err'); }
    },
    isEdit ? async (close) => {
      if (!confirm(`¿Eliminar ${serv.nombre}?`)) return;
      try { await api.servicios.remove(serv.id); toast('Eliminado'); close(); loadServicios(container); }
      catch (e) { toast(e.message, 'err'); }
    } : null
  );
}

function openProductoModal(prod, container) {
  const isEdit = !!prod;
  const backdrop = smallModal(isEdit ? 'Editar producto' : 'Nuevo producto', `
      <div class="field"><label>Nombre</label><input id="pd-nombre" value="${prod?.nombre || ''}" /></div>
      <div class="row">
        <div class="field"><label>Precio</label><input type="number" id="pd-precio" value="${prod?.precio ?? 0}" /></div>
        <div class="field"><label>Costo</label><input type="number" id="pd-costo" value="${prod?.costo ?? 0}" /></div>
      </div>
      <div class="row">
        <div class="field"><label>Stock</label><input type="number" id="pd-stock" value="${prod?.stock ?? 0}" /></div>
        <div class="field"><label>Stock mínimo</label><input type="number" id="pd-stock-minimo" value="${prod?.stock_minimo ?? 0}" /></div>
      </div>
      <div class="field">
        <label>Código de barras</label>
        <div class="row" style="align-items:center;">
          <input id="pd-barcode" value="${prod?.barcode || ''}" style="flex:1;" />
          <button class="secondary" id="pd-escanear" type="button" title="Escanear código">📷</button>
        </div>
      </div>
      <div class="field"><label><input type="checkbox" id="pd-activo" ${prod?.activo !== false ? 'checked' : ''} /> Activo</label></div>
    `,
    async (backdrop, close) => {
      const payload = {
        nombre: backdrop.querySelector('#pd-nombre').value.trim(),
        precio: Number(backdrop.querySelector('#pd-precio').value) || 0,
        costo: Number(backdrop.querySelector('#pd-costo').value) || 0,
        stock: Number(backdrop.querySelector('#pd-stock').value) || 0,
        stock_minimo: Number(backdrop.querySelector('#pd-stock-minimo').value) || 0,
        barcode: backdrop.querySelector('#pd-barcode').value.trim() || null,
        activo: backdrop.querySelector('#pd-activo').checked
      };
      if (!payload.nombre) { toast('El nombre es obligatorio', 'err'); return; }
      try {
        if (isEdit) await api.productos.update(prod.id, payload);
        else await api.productos.create(payload);
        toast('Producto guardado');
        close();
        loadProductos(container);
      } catch (e) { toast(e.message, 'err'); }
    },
    isEdit ? async (close) => {
      if (!confirm(`¿Eliminar ${prod.nombre}?`)) return;
      try { await api.productos.remove(prod.id); toast('Eliminado'); close(); loadProductos(container); }
      catch (e) { toast(e.message, 'err'); }
    } : null
  );
  backdrop.querySelector('#pd-escanear').onclick = () => {
    openBarcodeScanner((code) => { backdrop.querySelector('#pd-barcode').value = code; });
  };
}
