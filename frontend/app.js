// La llamada directa entre VMs valida el acceso de red y las reglas CORS.
const API_BASE = "http://192.168.56.20:8000/api";
const money = new Intl.NumberFormat("es", { style: "currency", currency: "USD" });

async function api(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`API respondió ${response.status}`);
  return response.json();
}

function setConnection(online, message) {
  const badge = document.querySelector("#connection");
  badge.textContent = message;
  badge.classList.toggle("error", !online);
}

function renderPantry(items) {
  const root = document.querySelector("#pantry-list");
  if (!items.length) { root.innerHTML = "<p>La alacena está vacía. Agrega productos desde la API.</p>"; return; }
  root.innerHTML = items.map(item => `<article class="card"><h3>${item.producto.nombre}</h3><p>${item.producto.categoria} · ${item.producto.unidad_medida}</p><p>Stock: ${item.stock_actual} · Mínimo: ${item.stock_minimo}</p><span class="badge ${item.en_lista_compras ? "critical" : ""}">${item.en_lista_compras ? "Stock crítico" : "En inventario"}</span></article>`).join("");
}

function renderShopping(items, dashboard) {
  const critical = items.filter(item => item.en_lista_compras);
  document.querySelector("#shopping-list").innerHTML = critical.length
    ? critical.map(item => `<li><label><input type="checkbox"> ${item.producto.nombre} — reponer ${Math.max(item.stock_minimo - item.stock_actual, 0)} ${item.producto.unidad_medida}</label></li>`).join("")
    : "<li>No hay productos bajo el mínimo.</li>";
  document.querySelector("#budget").textContent = `Presupuesto estimado: ${money.format(dashboard.gasto_estimado)}`;
}

function drawChart(dashboard) {
  const canvas = document.querySelector("#dashboard-chart");
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = rect.width * scale;
  canvas.height = rect.height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  const values = [dashboard.productos_criticos, dashboard.proximos_a_vencer.length, dashboard.gasto_estimado];
  const labels = ["Críticos", "Por vencer", "Presupuesto / 10"];
  const normalized = [values[0], values[1], values[2] / 10];
  const max = Math.max(...normalized, 1);
  const colors = ["#e89b45", "#65a875", "#4579a8"];
  normalized.forEach((value, i) => {
    const x = 12 + i * (rect.width / 3);
    const height = Math.max(4, (value / max) * 115);
    ctx.fillStyle = colors[i];
    ctx.fillRect(x, 130 - height, Math.min(72, rect.width / 5), height);
    ctx.fillStyle = "#526158";
    ctx.font = "12px sans-serif";
    ctx.fillText(labels[i], x, 153);
  });
}

async function loadDashboard() {
  const [items, dashboard] = await Promise.all([api("/despensa"), api("/dashboard")]);
  renderPantry(items);
  renderShopping(items, dashboard);
  document.querySelector("#metric-budget").textContent = money.format(dashboard.gasto_estimado);
  document.querySelector("#metric-critical").textContent = dashboard.productos_criticos;
  document.querySelector("#metric-expiring").textContent = dashboard.proximos_a_vencer.length;
  document.querySelector("#expiring-list").innerHTML = dashboard.proximos_a_vencer.length
    ? dashboard.proximos_a_vencer.map(item => `<li>${item.producto}: ${item.dias_restantes} días (estimado ${item.fecha_vencimiento_estimada})</li>`).join("")
    : "<li>Sin productos próximos a vencer.</li>";
  drawChart(dashboard);
}

document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab === button));
  document.querySelectorAll(".panel").forEach(panel => panel.classList.toggle("hidden", panel.id !== button.dataset.view));
  if (button.dataset.view === "dashboard") loadDashboard().catch(console.error);
}));

loadDashboard()
  .then(() => setConnection(true, "API conectada · 192.168.56.20:8000"))
  .catch(error => {
    setConnection(false, "API sin conexión");
    document.querySelector("#pantry-list").innerHTML = `<p>No se pudo contactar la API: ${error.message}. Comprueba que ambas VMs estén activas.</p>`;
  });
