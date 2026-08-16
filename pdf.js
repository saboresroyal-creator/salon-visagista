import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, 'public', 'logo.png');

const COLOR_ACCENT = '#b8895f';
const COLOR_TEXT = '#2b2622';
const COLOR_MUTED = '#8a8078';
const COLOR_BORDER = '#e4dfd9';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

function membrete(doc, subtitulo) {
  try { doc.image(LOGO_PATH, 40, 40, { width: 55 }); } catch (e) {}
  doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(18).text('Salón Visagista', 110, 46);
  doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9).text(subtitulo, 110, 68);
  doc.moveTo(40, 105).lineTo(555, 105).strokeColor(COLOR_ACCENT).lineWidth(1.5).stroke();
}

function piePagina(doc, texto) {
  doc.fontSize(8).fillColor(COLOR_MUTED).font('Helvetica')
    .text(texto, 40, 760, { width: 515, align: 'center' });
}

function filaTabla(doc, y, columnas, opts = {}) {
  const { bold = false, color = COLOR_TEXT, size = 9 } = opts;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color);
  columnas.forEach(({ texto, x, width, align }) => {
    doc.text(String(texto), x, y, { width, align: align || 'left' });
  });
}

export function generarComprobantePDF(res, venta) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="comprobante-${venta.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  membrete(doc, 'Comprobante de venta — sin validez fiscal');

  let y = 125;
  doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(13).text('Comprobante de venta', 40, y);
  y += 22;
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED);
  doc.text(`N° ${venta.id.slice(0, 8).toUpperCase()}`, 40, y); y += 13;
  doc.text(`Fecha: ${venta.fecha}`, 40, y); y += 13;
  doc.text(`Clienta: ${venta.clientes?.nombre || 'Consumidor final'}`, 40, y); y += 13;
  if (venta.profesionales?.nombre) { doc.text(`Atendido por: ${venta.profesionales.nombre}`, 40, y); y += 13; }
  y += 15;

  const col = { desc: 40, cant: 330, precio: 390, subtotal: 470 };
  const width = { desc: 280, cant: 50, precio: 70, subtotal: 85 };
  filaTabla(doc, y, [
    { texto: 'Descripción', x: col.desc, width: width.desc },
    { texto: 'Cant.', x: col.cant, width: width.cant, align: 'right' },
    { texto: 'Precio', x: col.precio, width: width.precio, align: 'right' },
    { texto: 'Subtotal', x: col.subtotal, width: width.subtotal, align: 'right' }
  ], { bold: true });
  y += 16;
  doc.moveTo(40, y).lineTo(555, y).strokeColor(COLOR_BORDER).lineWidth(1).stroke();
  y += 8;

  for (const it of venta.venta_items || []) {
    filaTabla(doc, y, [
      { texto: it.descripcion, x: col.desc, width: width.desc },
      { texto: it.cantidad, x: col.cant, width: width.cant, align: 'right' },
      { texto: money(it.precio_unitario), x: col.precio, width: width.precio, align: 'right' },
      { texto: money(it.subtotal), x: col.subtotal, width: width.subtotal, align: 'right' }
    ]);
    y += 18;
  }

  y += 6;
  doc.moveTo(40, y).lineTo(555, y).strokeColor(COLOR_BORDER).lineWidth(1).stroke();
  y += 12;

  if (Number(venta.ajuste_pct)) {
    const etiqueta = Number(venta.ajuste_pct) > 0 ? 'Recargo' : 'Descuento';
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
      .text(`Subtotal: ${money(venta.subtotal ?? venta.total)} · ${etiqueta}: ${venta.ajuste_pct}%`, 40, y, { width: 515, align: 'right' });
    y += 16;
  }

  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_TEXT)
    .text(`Total: ${money(venta.total)}`, 40, y, { width: 515, align: 'right' });
  y += 26;

  const pagos = venta.venta_pagos || [];
  if (pagos.length > 0) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_TEXT).text('Forma de pago', 40, y);
    y += 14;
    for (const p of pagos) {
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
        .text(`${p.metodo}: ${money(p.monto)}`, 40, y);
      y += 13;
    }
  }

  piePagina(doc, 'Este comprobante es un recibo interno del salón y no tiene validez como factura fiscal ante AFIP.');
  doc.end();
}

export function generarEstadoCuentaPDF(res, cliente, movimientos) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="estado-cuenta-${cliente.nombre.replace(/\s+/g, '-').toLowerCase()}.pdf"`);
  doc.pipe(res);

  membrete(doc, 'Estado de cuenta corriente');

  let y = 125;
  doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(13).text(`Estado de cuenta — ${cliente.nombre}`, 40, y);
  y += 20;
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
    .text(`Emitido el ${new Date().toLocaleDateString('es-AR')}`, 40, y);
  y += 28;

  const col = { fecha: 40, tipo: 130, metodo: 230, monto: 330, motivo: 400 };
  const width = { fecha: 85, tipo: 95, metodo: 95, monto: 65, motivo: 155 };
  const TIPO_LABEL = { cargo: 'Cargo (venta)', pago: 'Pago', ajuste: 'Ajuste' };

  filaTabla(doc, y, [
    { texto: 'Fecha', x: col.fecha, width: width.fecha },
    { texto: 'Tipo', x: col.tipo, width: width.tipo },
    { texto: 'Método', x: col.metodo, width: width.metodo },
    { texto: 'Monto', x: col.monto, width: width.monto, align: 'right' },
    { texto: 'Motivo', x: col.motivo, width: width.motivo }
  ], { bold: true });
  y += 16;
  doc.moveTo(40, y).lineTo(555, y).strokeColor(COLOR_BORDER).lineWidth(1).stroke();
  y += 8;

  for (const m of movimientos) {
    if (y > 760) { doc.addPage(); membrete(doc, 'Estado de cuenta corriente'); y = 125; }
    filaTabla(doc, y, [
      { texto: new Date(m.created_at).toLocaleDateString('es-AR'), x: col.fecha, width: width.fecha },
      { texto: TIPO_LABEL[m.tipo] || m.tipo, x: col.tipo, width: width.tipo },
      { texto: m.metodo || '—', x: col.metodo, width: width.metodo },
      { texto: `${Number(m.monto) > 0 ? '+' : ''}${money(m.monto)}`, x: col.monto, width: width.monto, align: 'right' },
      { texto: m.motivo || '', x: col.motivo, width: width.motivo }
    ]);
    y += 16;
  }

  y += 10;
  doc.moveTo(40, y).lineTo(555, y).strokeColor(COLOR_BORDER).lineWidth(1).stroke();
  y += 12;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_TEXT)
    .text(`Saldo actual: ${money(cliente.saldo_cta_cte)}`, 40, y, { width: 515, align: 'right' });

  piePagina(doc, 'Documento informativo, sin validez fiscal.');
  doc.end();
}
