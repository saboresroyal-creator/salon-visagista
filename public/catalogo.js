let catalogoListasPrecio = [];

async function renderCatalogo(container) {
  container.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h2 style="margin-top:0;">Profesionales</h2>
      <div id="cat-profesionales"><p>Cargando...</p></div>
      <button class="secondary" id="cat-add-prof" type="button" style="margin-top:10px;">+ Agregar profesional</button>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <h2 style="margin-top:0;">Listas de precio</h2>
      <p style="color:var(--muted); font-size:0.8rem; margin-top:-8px;">Un servicio puede valer distinto según la lista elegida al armar la comanda.</p>
      <div id="cat-listas-precio"><p>Cargando...</p></div>
      <button class="secondary" id="cat-add-lista" type="button" style="margin-top:10px;">+ Agregar lista de precio</button>
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
  container.querySelector('#cat-add-lista').onclick = () => openListaPrecioModal(null, container);
  container.querySelector('#cat-add-serv').onclick = () => openServicioModal(null, container);
  container.querySelector('#cat-add-prod').onclick = () => openProductoModal(null, container);

  catalogoListasPrecio = await api.listasPrecio.list();
  await Promise.all([loadProfesionales(container), loadListasPrecio(container), loadServicios(container), loadProductos(container)]);
}

async function loadListasPrecio(container) {
  const box = container.querySelector('#cat-listas-precio');
  catalogoListasPrecio = await api.listasPrecio.list();
  const data = catalogoListasPrecio;
  box.innerHTML = data.length === 0 ? '<p style="color:var(--muted)">Sin listas de precio cargadas.</p>' : `
    <table class="data-table">
      <thead><tr><th>Nombre</th><th>Estado</th></tr></thead>
      <tbody>${data.map((l) => `
        <tr data-id="${l.id}">
          <td>${l.nombre}</td><td>${l.activo === false ? 'Inactiva' : 'Activa'}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  box.querySelectorAll('tr[data-id]').forEach((row) => {
    row.onclick = () => openListaPrecioModal(data.find((l) => l.id === row.dataset.id), container);
  });
}

function openListaPrecioModal(lista, container) {
  const isEdit = !!lista;
  smallModal(isEdit ? 'Editar lista de precio' : 'Nueva lista de precio', `
      <div class="field"><label>Nombre</label><input id="lp-nombre" value="${lista?.nombre || ''}" /></div>
      <div class="field"><label><input type="checkbox" id="lp-activo" ${lista?.activo !== false ? 'checked' : ''} /> Activa</label></div>
    `,
    async (backdrop, close) => {
      const nombre = backdrop.querySelector('#lp-nombre').value.trim();
      if (!nombre) { toast('El nombre es obligatorio', 'err'); return; }
      try {
        if (isEdit) await api.listasPrecio.update(lista.id, { nombre, activo: backdrop.querySelector('#lp-activo').checked });
        else await api.listasPrecio.create({ nombre, activo: backdrop.querySelector('#lp-activo').checked });
        toast('Lista de precio guardada');
        close();
        loadListasPrecio(container);
      } catch (e) { toast(e.message, 'err'); }
    },
    isEdit ? async (close) => {
      if (!confirm(`¿Eliminar la lista "${lista.nombre}"?`)) return;
      try { await api.listasPrecio.remove(lista.id); toast('Eliminada'); close(); loadListasPrecio(container); }
      catch (e) { toast(e.message, 'err'); }
    } : null
  );
}

async function loadProfesionales(container) {
  const box = container.querySelector('#cat-profesionales');
  const data = await api.profesionales.list();
  box.innerHTML = data.length === 0 ? '<p style="color:var(--muted)">Sin profesionales cargadas.</p>' : `
    <table class="data-table">
      <thead><tr><th></th><th>Nombre</th><th>Estado</th><th></th></tr></thead>
      <tbody>${data.map((p) => `
        <tr data-id="${p.id}">
          <td><span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${p.color}"></span></td>
          <td>${p.nombre}</td>
          <td>${p.activo === false ? 'Inactiva' : 'Activa'}</td>
          <td><button type="button" class="secondary" data-horarios="${p.id}">Horarios</button></td>
        </tr>`).join('')}</tbody>
    </table>`;
  box.querySelectorAll('tr[data-id]').forEach((row) => {
    row.onclick = () => openProfesionalModal(data.find((p) => p.id === row.dataset.id), container);
  });
  box.querySelectorAll('[data-horarios]').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      openHorariosModal(data.find((p) => p.id === btn.dataset.horarios));
    };
  });
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

async function openHorariosModal(prof) {
  const actuales = await api.profesionales.horarios(prof.id);
  const porDia = {};
  actuales.forEach((h) => { porDia[h.dia_semana] = h; });

  const fieldsHtml = `
    <p style="color:var(--muted); font-size:0.8rem; margin-top:-6px;">Días y horarios en que ${prof.nombre} atiende — usado para la reserva online.</p>
    ${DIAS_SEMANA.map((nombreDia, i) => {
      const h = porDia[i];
      return `
        <div class="row" style="align-items:center; margin-bottom:6px;">
          <label style="flex:1; display:flex; align-items:center; gap:6px; font-size:0.85rem;">
            <input type="checkbox" data-dia-activo="${i}" ${h ? 'checked' : ''} /> ${nombreDia}
          </label>
          <input type="time" data-dia-inicio="${i}" value="${h?.hora_inicio?.slice(0, 5) || '09:00'}" style="width:110px;" />
          <input type="time" data-dia-fin="${i}" value="${h?.hora_fin?.slice(0, 5) || '18:00'}" style="width:110px;" />
        </div>`;
    }).join('')}
  `;

  smallModal(`Horarios de ${prof.nombre}`, fieldsHtml, async (backdrop, close) => {
    const horarios = [];
    for (let i = 0; i < 7; i++) {
      if (!backdrop.querySelector(`[data-dia-activo="${i}"]`).checked) continue;
      horarios.push({
        dia_semana: i,
        hora_inicio: backdrop.querySelector(`[data-dia-inicio="${i}"]`).value,
        hora_fin: backdrop.querySelector(`[data-dia-fin="${i}"]`).value
      });
    }
    try {
      await api.profesionales.guardarHorarios(prof.id, horarios);
      toast('Horarios guardados');
      close();
    } catch (e) { toast(e.message, 'err'); }
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
      <div class="field"><label>% Comisión</label><input type="number" id="pf-comision" value="${prof?.comision_pct ?? 0}" /></div>
      <div class="field"><label><input type="checkbox" id="pf-activo" ${prof?.activo !== false ? 'checked' : ''} /> Activa</label></div>
    `,
    async (backdrop, close) => {
      const payload = {
        nombre: backdrop.querySelector('#pf-nombre').value.trim(),
        color: backdrop.querySelector('#pf-color').value,
        comision_pct: Number(backdrop.querySelector('#pf-comision').value) || 0,
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
  const preciosPorLista = serv?.precios_por_lista || {};
  const listasActivas = catalogoListasPrecio.filter((l) => l.activo !== false);
  smallModal(isEdit ? 'Editar servicio' : 'Nuevo servicio', `
      <div class="field"><label>Nombre</label><input id="sv-nombre" value="${serv?.nombre || ''}" /></div>
      <div class="field"><label>Categoría</label><input id="sv-categoria" value="${serv?.categoria || ''}" /></div>
      <div class="row">
        <div class="field"><label>Duración (min)</label><input type="number" id="sv-duracion" value="${serv?.duracion_min ?? 30}" /></div>
        <div class="field"><label>Precio base</label><input type="number" id="sv-precio" value="${serv?.precio ?? 0}" /></div>
      </div>
      ${listasActivas.length > 0 ? `
        <div class="field">
          <label>Precio por lista (dejar vacío para usar el precio base)</label>
          ${listasActivas.map((l) => `
            <div class="row" style="align-items:center; margin-bottom:4px;">
              <span style="flex:1; font-size:0.88rem;">${l.nombre}</span>
              <input type="number" data-lista-precio="${l.id}" value="${preciosPorLista[l.id] ?? ''}" placeholder="$" style="width:110px;" />
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="field"><label><input type="checkbox" id="sv-activo" ${serv?.activo !== false ? 'checked' : ''} /> Activo</label></div>
      <div class="field"><label><input type="checkbox" id="sv-reservable" ${serv?.reservable_online !== false ? 'checked' : ''} /> Reservable desde la página online</label></div>
    `,
    async (backdrop, close) => {
      const nuevosPrecios = {};
      backdrop.querySelectorAll('[data-lista-precio]').forEach((inp) => {
        if (inp.value.trim() !== '') nuevosPrecios[inp.dataset.listaPrecio] = Number(inp.value) || 0;
      });
      const payload = {
        nombre: backdrop.querySelector('#sv-nombre').value.trim(),
        categoria: backdrop.querySelector('#sv-categoria').value.trim(),
        duracion_min: Number(backdrop.querySelector('#sv-duracion').value) || 30,
        precio: Number(backdrop.querySelector('#sv-precio').value) || 0,
        precios_por_lista: nuevosPrecios,
        activo: backdrop.querySelector('#sv-activo').checked,
        reservable_online: backdrop.querySelector('#sv-reservable').checked
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
