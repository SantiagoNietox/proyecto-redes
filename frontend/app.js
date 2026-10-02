// SmartPantry - Sistema de Gestión e Inventario Doméstico Inteligente
// Arquitectura Desacoplada: Frontend SPA Vanilla JS (Fetch API)

// Resolución de URL base: Si se accede por Nginx (smartpantry.local o 192.168.56.10) usa /api;
// si se accede directo a la VM o archivo local, usa la IP directa de backend.
const API_BASE = (window.location.hostname === "192.168.56.10" || window.location.hostname === "smartpantry.local")
  ? "/api"
  : "http://192.168.56.20:8000/api";

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});

// Estado global de la aplicación
const state = {
  role: "admin", // 'admin' (Jefe de Hogar) | 'operativo' (Miembro del Hogar / Comprador)
  pantryItems: [],
  catalogItems: [],
  dashboard: null,
  activeFilter: "all",
  searchQuery: "",
  catalogSearchQuery: "",
  selectedPurchases: new Map() // item_id -> cantidad
};

// Cliente HTTP asíncrono
async function api(path, options = {}) {
  const config = {
    headers: { "Content-Type": "application/json" },
    ...options
  };
  const response = await fetch(`${API_BASE}${path}`, config);
  if (!response.ok) {
    let errorDetail = `Error ${response.status}`;
    try {
      const err = await response.json();
      errorDetail = err.detail || JSON.stringify(err);
    } catch (_) {}
    throw new Error(errorDetail);
  }
  if (response.status === 204) return null;
  return response.json();
}

// ================= TOAST NOTIFICATIONS =================
function showToast(message, type = "info") {
  const container = document.querySelector("#toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// ================= CONTROL DE ROLES (RF-06 / SECCIÓN 3) =================
function setRole(newRole) {
  state.role = newRole;
  const bannerText = document.querySelector("#role-banner-text");
  const bannerIcon = document.querySelector("#role-banner-icon");
  const select = document.querySelector("#role-select");
  if (select) select.value = newRole;

  if (newRole === "admin") {
    bannerIcon.textContent = "👑";
    bannerText.textContent = "Perfil Administrador (Jefe de Hogar): Configuración de inventario base, definición de umbrales de reabastecimiento (stock de seguridad) y parametrización analítica.";
    document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
  } else {
    bannerIcon.textContent = "🛒";
    bannerText.textContent = "Perfil Miembro del Hogar / Comprador: Registro de consumos diarios directos (-1) y lista interactiva ('Modo Mercado') para compras físicas.";
    document.querySelectorAll(".admin-only").forEach(el => el.classList.add("hidden"));
  }
  renderPantry();
}

// ================= CLASIFICACIÓN Y SEMÁFORO DE ESTADO =================
function getItemStatus(item) {
  if (item.stock_actual <= 0) return { key: "agotado", label: "Agotado", class: "badge-agotado" };
  if (item.stock_actual <= item.stock_minimo) return { key: "critico", label: "Stock Crítico", class: "badge-critico" };
  return { key: "optimo", label: "Óptimo", class: "badge-optimo" };
}

function getDaysRemaining(fechaIngreso, diasCaducidad) {
  const ingreso = new Date(fechaIngreso);
  const vence = new Date(ingreso.getTime() + diasCaducidad * 86400000);
  const hoy = new Date();
  const diffTime = vence.getTime() - hoy.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ================= RENDERIZADO DE ALACENA (RF-02, RN-01, 3.2) =================
function renderPantry() {
  const root = document.querySelector("#pantry-list");
  let items = [...state.pantryItems];

  // Conteo para los botones de filtro
  const countAll = items.length;
  const countOptimo = items.filter(i => i.stock_actual > i.stock_minimo).length;
  const countCritico = items.filter(i => i.stock_actual > 0 && i.stock_actual <= i.stock_minimo).length;
  const countAgotado = items.filter(i => i.stock_actual <= 0).length;

  document.querySelector("#count-all").textContent = countAll;
  document.querySelector("#count-optimo").textContent = countOptimo;
  document.querySelector("#count-critico").textContent = countCritico;
  document.querySelector("#count-agotado").textContent = countAgotado;

  // Filtrado por estado
  if (state.activeFilter !== "all") {
    items = items.filter(item => {
      const status = getItemStatus(item);
      return status.key === state.activeFilter;
    });
  }

  // Filtrado por buscador
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    items = items.filter(item =>
      item.producto.nombre.toLowerCase().includes(q) ||
      item.producto.categoria.toLowerCase().includes(q)
    );
  }

  if (!items.length) {
    root.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
        <p style="font-size: 1.1rem; margin-bottom: 12px;">No hay productos en esta vista.</p>
        ${state.role === "admin"
          ? '<button class="btn btn-primary" onclick="openAddModal()">➕ Registrar primer producto</button>'
          : '<p>Pide al Administrador registrar productos en la despensa.</p>'}
      </div>`;
    return;
  }

  root.innerHTML = items.map(item => {
    const status = getItemStatus(item);
    const daysLeft = getDaysRemaining(item.fecha_ingreso, item.producto.dias_caducidad_estimados);
    const isExpiring = daysLeft <= 3; // RN-04: <= 3 días

    // Porcentaje para la barra visual
    const maxVal = Math.max(item.stock_minimo * 1.5, item.stock_actual, 1);
    const percent = Math.min(100, Math.round((item.stock_actual / maxVal) * 100));
    const meterColor = status.key === "agotado" ? "var(--agotado)" : (status.key === "critico" ? "var(--critico)" : "var(--optimo)");

    return `
      <article class="card" data-item-id="${item.id}">
        <div>
          <div class="card-header">
            <h3>${item.producto.nombre}</h3>
          </div>
          <div class="card-category">${item.producto.categoria} · ${item.producto.unidad_medida}</div>
          <div class="card-price">Ref: <strong>${money.format(item.producto.precio_referencia)}</strong></div>

          <div class="stock-info">
            <span>Stock actual: <strong>${item.stock_actual}</strong></span>
            <span>Mínimo: <strong>${item.stock_minimo}</strong></span>
          </div>

          <div class="stock-meter">
            <div class="stock-meter-bar" style="width: ${percent}%; background: ${meterColor};"></div>
          </div>

          <div class="badges-row">
            <span class="badge ${status.class}">${status.label}</span>
            ${isExpiring ? `<span class="badge badge-expiring">⚠️ ${daysLeft < 0 ? "Vencido" : (daysLeft === 0 ? "Vence hoy" : `Vence en ${daysLeft}d`)}</span>` : ""}
          </div>
        </div>

        <div class="card-actions">
          <!-- Acción Operativa: Consumo diario directo (RN-01, 3.2, 4.2 paso 1) -->
          <button class="btn btn-sm btn-consume" onclick="handleConsumir(${item.id})" title="Registrar consumo directo (-1)">
            🥄 Consumir (-1)
          </button>

          <!-- Acciones de Administrador: Parametrización y eliminación (3.1) -->
          ${state.role === "admin" ? `
            <button class="btn btn-sm btn-secondary" onclick="openEditModal(${item.id})" title="Editar umbrales">✏️</button>
            <button class="btn btn-sm btn-danger-outline" onclick="handleEliminar(${item.id})" title="Eliminar de despensa">🗑️</button>
          ` : ""}
        </div>
      </article>
    `;
  }).join("");
}

// ================= CONSUMO DIRECTO (RN-01, 3.2, 4.2 PASO 1) =================
async function handleConsumir(itemId) {
  try {
    const updated = await api(`/despensa/${itemId}/consumir`, {
      method: "POST",
      body: JSON.stringify({ cantidad: 1.0 })
    });
    // Actualizar estado local
    const idx = state.pantryItems.findIndex(i => i.id === itemId);
    if (idx !== -1) state.pantryItems[idx] = updated;

    showToast(`Consumo registrado: ${updated.producto.nombre} (Stock: ${updated.stock_actual})`, "info");
    renderPantry();
    renderShopping();
    loadDashboardMetrics().catch(console.error);
  } catch (err) {
    showToast(`Error al consumir: ${err.message}`, "error");
  }
}

// ================= ELIMINACIÓN DE DESPENSA (ADMIN) =================
async function handleEliminar(itemId) {
  const item = state.pantryItems.find(i => i.id === itemId);
  const nombre = item ? item.producto.nombre : "este producto";
  if (!confirm(`¿Estás seguro de eliminar "${nombre}" de la despensa?`)) return;

  try {
    await api(`/despensa/${itemId}`, { method: "DELETE" });
    state.pantryItems = state.pantryItems.filter(i => i.id !== itemId);
    showToast(`"${nombre}" eliminado de la despensa`, "info");
    renderPantry();
    renderShopping();
    loadDashboardMetrics().catch(console.error);
  } catch (err) {
    showToast(`Error al eliminar: ${err.message}`, "error");
  }
}

// ================= MODO MERCADO / LISTA DE COMPRAS (RF-03, RF-04, RN-02, RN-03) =================
function renderShopping() {
  const listEl = document.querySelector("#shopping-list");
  const badgeCount = document.querySelector("#badge-compras-count");

  // Ítems bajo el mínimo o con bandera de compra
  const neededItems = state.pantryItems.filter(i => i.en_lista_compras || i.stock_actual <= i.stock_minimo);
  badgeCount.textContent = neededItems.length;
  badgeCount.classList.toggle("empty", neededItems.length === 0);

  document.querySelector("#checkout-total-items").textContent = neededItems.length;

  if (!neededItems.length) {
    listEl.innerHTML = `
      <li style="text-align: center; padding: 30px; color: var(--text-muted);">
        <p style="font-size: 1.1rem; margin: 0 0 6px;">🎉 ¡Despensa completamente abastecida!</p>
        <p style="font-size: 0.88rem;">No hay productos con existencias por debajo del umbral mínimo de seguridad.</p>
      </li>`;
    updateCheckoutSummary([]);
    return;
  }

  // Pre-poblar selección si no estaba registrada
  neededItems.forEach(item => {
    if (!state.selectedPurchases.has(item.id)) {
      const sugerido = Math.max(1, Math.ceil(item.stock_minimo - item.stock_actual));
      state.selectedPurchases.set(item.id, { checked: true, qty: sugerido });
    }
  });

  listEl.innerHTML = neededItems.map(item => {
    const sel = state.selectedPurchases.get(item.id) || { checked: true, qty: 1 };
    const faltante = Math.max(1, Math.ceil(item.stock_minimo - item.stock_actual));
    const subtotal = sel.qty * item.producto.precio_referencia;

    return `
      <li class="shopping-item ${sel.checked ? "checked" : ""}" data-item-id="${item.id}">
        <div class="shopping-item-left">
          <input type="checkbox" class="shopping-checkbox" data-item-id="${item.id}" ${sel.checked ? "checked" : ""}>
          <div class="shopping-details">
            <strong>${item.producto.nombre}</strong>
            <span class="shopping-meta">${item.producto.categoria} · Stock: ${item.stock_actual} / Mínimo: ${item.stock_minimo} ${item.producto.unidad_medida}</span>
          </div>
        </div>

        <div class="shopping-item-right">
          <div class="qty-adjuster">
            <label>Cant:</label>
            <input type="number" class="shopping-qty" data-item-id="${item.id}" min="1" step="1" value="${sel.qty}">
            <span>${item.producto.unidad_medida}</span>
          </div>
          <span class="item-subtotal">${money.format(subtotal)}</span>
        </div>
      </li>
    `;
  }).join("");

  // Añadir eventos dinámicos a checkboxes y inputs de cantidad
  listEl.querySelectorAll(".shopping-checkbox").forEach(chk => {
    chk.addEventListener("change", (e) => {
      const id = parseInt(e.target.dataset.itemId);
      const current = state.selectedPurchases.get(id) || { qty: 1 };
      state.selectedPurchases.set(id, { ...current, checked: e.target.checked });
      const parent = e.target.closest(".shopping-item");
      if (parent) parent.classList.toggle("checked", e.target.checked);
      updateCheckoutSummary(neededItems);
    });
  });

  listEl.querySelectorAll(".shopping-qty").forEach(input => {
    input.addEventListener("input", (e) => {
      const id = parseInt(e.target.dataset.itemId);
      const val = Math.max(1, parseFloat(e.target.value) || 1);
      const current = state.selectedPurchases.get(id) || { checked: true };
      state.selectedPurchases.set(id, { ...current, qty: val });

      const item = state.pantryItems.find(i => i.id === id);
      if (item) {
        const subtotalEl = e.target.closest(".shopping-item-right").querySelector(".item-subtotal");
        if (subtotalEl) subtotalEl.textContent = money.format(val * item.producto.precio_referencia);
      }
      updateCheckoutSummary(neededItems);
    });
  });

  updateCheckoutSummary(neededItems);
}

function updateCheckoutSummary(neededItems) {
  let totalEstimated = 0;
  let selectedCount = 0;
  let selectedTotal = 0;

  neededItems.forEach(item => {
    const sel = state.selectedPurchases.get(item.id);
    const faltante = Math.max(1, Math.ceil(item.stock_minimo - item.stock_actual));
    totalEstimated += faltante * item.producto.precio_referencia;

    if (sel && sel.checked) {
      selectedCount++;
      selectedTotal += sel.qty * item.producto.precio_referencia;
    }
  });

  document.querySelector("#checkout-selected-items").textContent = selectedCount;
  document.querySelector("#checkout-budget-total").textContent = money.format(totalEstimated);
  document.querySelector("#checkout-budget-selected").textContent = money.format(selectedTotal);

  const btnConsolidar = document.querySelector("#btn-consolidar-compra");
  btnConsolidar.disabled = selectedCount === 0;
}

// ================= CONSOLIDACIÓN TRANSACCIONAL DE COMPRA (RN-03, RF-04) =================
async function consolidarCompra() {
  const payloadItems = [];
  state.selectedPurchases.forEach((val, itemId) => {
    if (val.checked && val.qty > 0) {
      payloadItems.push({ item_id: itemId, cantidad: val.qty });
    }
  });

  if (!payloadItems.length) {
    showToast("Selecciona al menos un producto para consolidar", "error");
    return;
  }

  const btn = document.querySelector("#btn-consolidar-compra");
  btn.disabled = true;
  btn.textContent = "⏳ Consolidando en base de datos…";

  try {
    const res = await api("/compras/consolidar", {
      method: "POST",
      body: JSON.stringify({ items: payloadItems })
    });

    showToast(`✅ ${res.mensaje} (${res.items_actualizados} productos actualizados)`, "success");

    // Limpiar selección de los comprados
    payloadItems.forEach(p => state.selectedPurchases.delete(p.item_id));

    // Recargar inventario y analíticas
    await loadInitialData();
  } catch (err) {
    showToast(`Error al consolidar remesa: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "🛒 Consolidar Compra / Cierre de Remesa";
  }
}

// ================= DASHBOARD ANALÍTICO (RF-05, RN-04, 3.1) =================
async function loadDashboardMetrics() {
  try {
    const dashboard = await api("/dashboard");
    state.dashboard = dashboard;

    document.querySelector("#metric-budget").textContent = money.format(dashboard.gasto_estimado);
    document.querySelector("#metric-critical").textContent = dashboard.productos_criticos;
    document.querySelector("#metric-exhausted").textContent = dashboard.productos_agotados;
    document.querySelector("#metric-expiring").textContent = dashboard.proximos_a_vencer.length;

    // Alertas predictivas de caducidad (RN-04)
    const expiringList = document.querySelector("#expiring-list");
    if (!dashboard.proximos_a_vencer.length) {
      expiringList.innerHTML = '<li class="muted" style="padding: 10px;">✅ Sin alertas críticas de caducidad para los próximos 3 días.</li>';
    } else {
      expiringList.innerHTML = dashboard.proximos_a_vencer.map(item => `
        <li class="expiring-item ${item.dias_restantes < 0 ? "expired" : ""}">
          <div>
            <strong>${item.producto}</strong>
            <small class="muted" style="display:block;">${item.categoria} · Estimado: ${item.fecha_vencimiento_estimada}</small>
          </div>
          <span class="badge ${item.dias_restantes < 0 ? "badge-agotado" : "badge-critico"}">
            ${item.estado_alerta}
          </span>
        </li>
      `).join("");
    }

    // Gráfico de gasto por categoría (Canvas nativo Vanilla JS)
    drawCategoryChart(dashboard.gasto_por_categoria);

    // Productos con mayor rotación (RF-05)
    const rotationList = document.querySelector("#rotation-list");
    if (!dashboard.mayor_rotacion.length) {
      rotationList.innerHTML = '<li class="muted">Aún no hay compras registradas en el historial.</li>';
    } else {
      rotationList.innerHTML = dashboard.mayor_rotacion.map((r, i) => `
        <li>
          <span><strong>#${i + 1}</strong> ${r.producto}</span>
          <span class="muted">${r.total_comprado} ${r.unidad} (${r.veces_reabastecido} compras)</span>
        </li>
      `).join("");
    }

    // Histórico reciente de compras
    const tbody = document.querySelector("#history-tbody");
    if (!dashboard.historico_compras.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted text-center" style="padding: 18px;">Sin transacciones de compra en el historial.</td></tr>';
    } else {
      tbody.innerHTML = dashboard.historico_compras.map(c => `
        <tr>
          <td><small>${c.fecha}</small></td>
          <td><strong>${c.producto}</strong></td>
          <td>${c.cantidad} ${c.unidad}</td>
          <td><strong>${money.format(c.total)}</strong></td>
        </tr>
      `).join("");
    }
  } catch (err) {
    console.error("Error al cargar dashboard:", err);
  }
}

// Dibujo en Canvas del gráfico de distribución por categoría (RF-05)
function drawCategoryChart(data = {}) {
  const canvas = document.querySelector("#category-chart");
  const legend = document.querySelector("#category-legend");
  if (!canvas || !legend) return;

  const entries = Object.entries(data).filter(([_, val]) => val > 0);
  legend.innerHTML = "";

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (!entries.length) {
    ctx.fillStyle = "#8a9990";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No hay presupuesto estimado pendiente", width / 2, height / 2);
    return;
  }

  const palette = ["#20744a", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#ca8a04", "#475569"];
  const maxVal = Math.max(...entries.map(e => e[1]), 1);
  const barHeight = Math.min(26, Math.floor((height - 20) / entries.length) - 8);

  entries.slice(0, 6).forEach(([cat, val], idx) => {
    const color = palette[idx % palette.length];
    const y = 14 + idx * (barHeight + 10);
    const barWidth = Math.max(6, (val / maxVal) * (width - 150));

    // Barra
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(100, y, barWidth, barHeight, 4);
    ctx.fill();

    // Etiqueta categoría
    ctx.fillStyle = "#20312c";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "right";
    const label = cat.length > 12 ? cat.substring(0, 11) + "…" : cat;
    ctx.fillText(label, 92, y + barHeight / 2 + 4);

    // Valor monetario
    ctx.textAlign = "left";
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#55645c";
    ctx.fillText(money.format(val), 108 + barWidth, y + barHeight / 2 + 4);

    // Leyenda inferior
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-dot" style="background:${color}"></span> ${cat}: <strong>${money.format(val)}</strong>`;
    legend.appendChild(item);
  });
}

// ================= CATÁLOGO BASE (RF-01, SECCIÓN 2) =================
function renderCatalog() {
  const grid = document.querySelector("#catalog-grid");
  let items = [...state.catalogItems];

  if (state.catalogSearchQuery.trim()) {
    const q = state.catalogSearchQuery.toLowerCase();
    items = items.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      c.categoria.toLowerCase().includes(q)
    );
  }

  grid.innerHTML = items.map(c => `
    <article class="catalog-card">
      <div>
        <span class="cat-badge">${c.categoria}</span>
        <h4>${c.nombre}</h4>
        <p class="muted" style="margin: 4px 0 8px; font-size: 0.84rem;">Unidad: ${c.unidad_medida}</p>
        <p class="muted" style="margin: 0 0 12px; font-size: 0.84rem;">Caducidad est: ${c.dias_caducidad_estimados} días</p>
      </div>
      <div>
        <p style="margin: 0 0 10px; font-size: 0.95rem;"><strong>${money.format(c.precio_referencia)}</strong></p>
        <button class="btn btn-sm btn-primary btn-block admin-only" onclick="openAddModalWithProduct(${c.id})">
          ➕ Agregar a Despensa
        </button>
      </div>
    </article>
  `).join("");
}

// ================= MODALES Y FORMULARIOS (RF-02 / 3.1) =================
function populateProductSelect() {
  const select = document.querySelector("#select-producto");
  if (!select) return;
  select.innerHTML = '<option value="">Selecciona un producto preexistente…</option>';

  // Agrupar por categoría
  const grouped = {};
  state.catalogItems.forEach(p => {
    if (!grouped[p.categoria]) grouped[p.categoria] = [];
    grouped[p.categoria].push(p);
  });

  Object.keys(grouped).sort().forEach(cat => {
    const group = document.createElement("optgroup");
    group.label = cat;
    grouped[cat].forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.nombre} (${money.format(p.precio_referencia)} / ${p.unidad_medida})`;
      group.appendChild(opt);
    });
    select.appendChild(group);
  });
}

function openAddModal() {
  const modal = document.querySelector("#modal-add-pantry");
  const form = document.querySelector("#form-add-pantry");
  const alertEl = document.querySelector("#form-add-alert");
  form.reset();
  alertEl.classList.add("hidden");
  document.querySelector("#input-fecha-ingreso").value = new Date().toISOString().split("T")[0];
  document.querySelector("#product-meta-preview").textContent = "";
  modal.classList.remove("hidden");
  modal.style.display = "flex";
}

function openAddModalWithProduct(productId) {
  openAddModal();
  const select = document.querySelector("#select-producto");
  select.value = productId;
  select.dispatchEvent(new Event("change"));
}

function openEditModal(itemId) {
  const item = state.pantryItems.find(i => i.id === itemId);
  if (!item) return;

  document.querySelector("#edit-item-id").value = item.id;
  document.querySelector("#edit-product-name").textContent = `${item.producto.nombre} (${item.producto.categoria})`;
  document.querySelector("#edit-stock-actual").value = item.stock_actual;
  document.querySelector("#edit-stock-minimo").value = item.stock_minimo;
  document.querySelector("#edit-fecha-ingreso").value = item.fecha_ingreso || new Date().toISOString().split("T")[0];

  const modal = document.querySelector("#modal-edit-pantry");
  modal.classList.remove("hidden");
  modal.style.display = "flex";
}

function closeModal(modalId) {
  const modal = document.querySelector(`#${modalId}`);
  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }
}

// ================= INICIALIZACIÓN Y EVENT LISTENERS =================
async function loadInitialData() {
  try {
    const [pantry, catalog] = await Promise.all([
      api("/despensa"),
      api("/catalogo")
    ]);
    state.pantryItems = pantry;
    state.catalogItems = catalog;

    setConnection(true, "API Conectada · Backend 192.168.56.20:8000");
    populateProductSelect();
    renderPantry();
    renderShopping();
    renderCatalog();
    await loadDashboardMetrics();
  } catch (err) {
    console.error("Error al cargar datos iniciales:", err);
    setConnection(false, "API sin conexión");
    document.querySelector("#pantry-list").innerHTML = `
      <div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: #b91c1c;">
        <h3>No se pudo establecer conexión con la API de SmartPantry</h3>
        <p class="muted">Detalle: ${err.message}</p>
        <p>Asegúrate de que las máquinas virtuales de Vagrant estén encendidas (<code>vagrant status</code>).</p>
      </div>`;
  }
}

function setConnection(online, text) {
  const badge = document.querySelector("#connection");
  if (!badge) return;
  badge.textContent = text;
  badge.classList.toggle("error", !online);
}

// Configuración de listeners globales
document.addEventListener("DOMContentLoaded", () => {
  // Selector de roles (RF-06)
  const roleSelect = document.querySelector("#role-select");
  roleSelect.addEventListener("change", (e) => setRole(e.target.value));

  // Navegación de pestañas
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".panel").forEach(p => p.classList.toggle("hidden", p.id !== tab.dataset.view));
      if (tab.dataset.view === "dashboard") loadDashboardMetrics();
    });
  });

  // Filtros de despensa
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeFilter = btn.dataset.filter;
      renderPantry();
    });
  });

  // Buscador de despensa
  const pantrySearch = document.querySelector("#pantry-search");
  pantrySearch.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    renderPantry();
  });

  // Buscador de catálogo
  const catalogSearch = document.querySelector("#catalog-search");
  catalogSearch.addEventListener("input", (e) => {
    state.catalogSearchQuery = e.target.value;
    renderCatalog();
  });

  // Asegurar que los modales inicien ocultos
  document.querySelectorAll(".modal-backdrop").forEach(m => {
    m.classList.add("hidden");
    m.style.display = "none";
  });

  // Botón abrir modal registrar producto
  document.querySelector("#btn-open-add-modal").addEventListener("click", openAddModal);

  // Cerrar modales (botones con atributo data-close-modal)
  document.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });

  // Cerrar modal al hacer clic en el backdrop
  document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.classList.add("hidden");
        backdrop.style.display = "none";
      }
    });
  });

  // Cerrar modal con la tecla Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-backdrop").forEach(m => {
        m.classList.add("hidden");
        m.style.display = "none";
      });
    }
  });

  // Evento change en el selector de producto del modal
  document.querySelector("#select-producto").addEventListener("change", (e) => {
    const id = parseInt(e.target.value);
    const prod = state.catalogItems.find(p => p.id === id);
    const preview = document.querySelector("#product-meta-preview");
    if (prod) {
      preview.textContent = `Categoría: ${prod.categoria} · Unidad: ${prod.unidad_medida} · Vida estimada: ${prod.dias_caducidad_estimados} días · Precio ref: ${money.format(prod.precio_referencia)}`;
    } else {
      preview.textContent = "";
    }
  });

  // Formulario agregar producto a la despensa (RF-02 / 3.1)
  document.querySelector("#form-add-pantry").addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.querySelector("#form-add-alert");
    alertEl.classList.add("hidden");

    const productoId = parseInt(document.querySelector("#select-producto").value);
    const stockActual = parseFloat(document.querySelector("#input-stock-actual").value);
    const stockMinimo = parseFloat(document.querySelector("#input-stock-minimo").value);
    const fechaIngreso = document.querySelector("#input-fecha-ingreso").value;

    if (!productoId || isNaN(stockActual) || isNaN(stockMinimo)) {
      alertEl.textContent = "Por favor completa todos los campos requeridos con valores válidos.";
      alertEl.classList.remove("hidden");
      return;
    }

    try {
      const nuevoItem = await api("/despensa", {
        method: "POST",
        body: JSON.stringify({
          producto_id: productoId,
          stock_actual: stockActual,
          stock_minimo: stockMinimo,
          fecha_ingreso: fechaIngreso
        })
      });

      closeModal("modal-add-pantry");
      showToast(`¡Producto registrado en despensa: ${nuevoItem.producto.nombre}!`, "success");
      await loadInitialData();
    } catch (err) {
      alertEl.textContent = `Error al registrar: ${err.message}`;
      alertEl.classList.remove("hidden");
    }
  });

  // Formulario editar parámetros de despensa (Administrador)
  document.querySelector("#form-edit-pantry").addEventListener("submit", async (e) => {
    e.preventDefault();
    const itemId = parseInt(document.querySelector("#edit-item-id").value);
    const stockActual = parseFloat(document.querySelector("#edit-stock-actual").value);
    const stockMinimo = parseFloat(document.querySelector("#edit-stock-minimo").value);
    const fechaIngreso = document.querySelector("#edit-fecha-ingreso").value;

    try {
      const updated = await api(`/despensa/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({
          stock_actual: stockActual,
          stock_minimo: stockMinimo,
          fecha_ingreso: fechaIngreso
        })
      });

      closeModal("modal-edit-pantry");
      showToast(`Parámetros actualizados: ${updated.producto.nombre}`, "success");
      await loadInitialData();
    } catch (err) {
      showToast(`Error al actualizar: ${err.message}`, "error");
    }
  });

  // Botón consolidar compra / cierre de remesa (RN-03, RF-04)
  document.querySelector("#btn-consolidar-compra").addEventListener("click", consolidarCompra);

  // Botón seleccionar todos en Modo Mercado
  document.querySelector("#btn-select-all").addEventListener("click", () => {
    const checkboxes = document.querySelectorAll(".shopping-checkbox");
    const allChecked = Array.from(checkboxes).every(c => c.checked);
    checkboxes.forEach(c => {
      c.checked = !allChecked;
      c.dispatchEvent(new Event("change"));
    });
  });

  // Botón refrescar dashboard
  document.querySelector("#btn-refresh-dashboard").addEventListener("click", () => {
    loadDashboardMetrics();
    showToast("Dashboard actualizado", "info");
  });

  // Iniciar carga de datos
  loadInitialData();
});
