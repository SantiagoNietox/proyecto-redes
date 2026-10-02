from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import CompraHistorial, DespensaItem
from app.schemas import DashboardRead

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardRead)
def obtener_dashboard(dias_alerta: int = 3, db: Session = Depends(get_db)):
    """RN-02, RN-04, RF-05: Métricas analíticas de consumo, costos y alertas predictivas."""
    items = db.scalars(select(DespensaItem).options(joinedload(DespensaItem.producto))).all()

    # RN-02: Presupuesto estimado = sumatoria de faltante * precio de referencia
    gasto_estimado = sum(
        max(item.stock_minimo - item.stock_actual, 0) * item.producto.precio_referencia for item in items
    )

    # Conteo de estados
    productos_agotados = sum(1 for item in items if item.stock_actual == 0)
    productos_criticos = sum(1 for item in items if 0 < item.stock_actual <= item.stock_minimo)

    # RN-04: Priorización de caducidad si (fecha_ingreso + dias_caducidad - hoy) <= 3 días
    limite = date.today() + timedelta(days=max(0, dias_alerta))
    proximos = []
    for item in items:
        vence = item.fecha_ingreso + timedelta(days=item.producto.dias_caducidad_estimados)
        dias_restantes = (vence - date.today()).days
        if dias_restantes <= max(0, dias_alerta):
            proximos.append({
                "item_id": item.id,
                "producto": item.producto.nombre,
                "categoria": item.producto.categoria,
                "fecha_vencimiento_estimada": vence.isoformat(),
                "dias_restantes": dias_restantes,
                "estado_alerta": "Vencido" if dias_restantes < 0 else ("Hoy" if dias_restantes == 0 else f"{dias_restantes} días"),
            })

    # RF-05: Distribución de gasto/presupuesto por categoría
    gasto_por_cat = defaultdict(float)
    for item in items:
        faltante = max(item.stock_minimo - item.stock_actual, 0)
        costo_faltante = faltante * item.producto.precio_referencia
        if costo_faltante > 0:
            gasto_por_cat[item.producto.categoria] += costo_faltante
        else:
            if item.producto.categoria not in gasto_por_cat:
                gasto_por_cat[item.producto.categoria] += 0.0

    # Si todo está abastecido, mostrar distribución de valor del inventario total
    if not any(gasto_por_cat.values()) and items:
        for item in items:
            gasto_por_cat[item.producto.categoria] += item.stock_actual * item.producto.precio_referencia

    gasto_por_categoria = {cat: round(monto, 2) for cat, monto in gasto_por_cat.items()}

    # RF-05: Productos con mayor rotación / compras acumuladas
    rotacion_raw = db.scalars(
        select(CompraHistorial)
        .options(joinedload(CompraHistorial.producto))
        .order_by(CompraHistorial.comprado_en.desc())
    ).all()

    conteo_rotacion = defaultdict(lambda: {"cantidad": 0.0, "veces": 0, "unidad": ""})
    for c in rotacion_raw:
        nombre = c.producto.nombre
        conteo_rotacion[nombre]["cantidad"] += c.cantidad
        conteo_rotacion[nombre]["veces"] += 1
        conteo_rotacion[nombre]["unidad"] = c.producto.unidad_medida

    mayor_rotacion = [
        {
            "producto": prod,
            "total_comprado": round(datos["cantidad"], 2),
            "veces_reabastecido": datos["veces"],
            "unidad": datos["unidad"],
        }
        for prod, datos in sorted(conteo_rotacion.items(), key=lambda x: x[1]["cantidad"], reverse=True)[:5]
    ]

    # RF-05: Histórico de consumo / compras recientes (últimas 10)
    historico_compras = [
        {
            "id": c.id,
            "producto": c.producto.nombre,
            "cantidad": c.cantidad,
            "unidad": c.producto.unidad_medida,
            "precio_unitario": c.precio_unitario,
            "total": round(c.cantidad * c.precio_unitario, 2),
            "fecha": c.comprado_en.strftime("%Y-%m-%d %H:%M"),
        }
        for c in rotacion_raw[:10]
    ]

    return {
        "gasto_estimado": round(gasto_estimado, 2),
        "productos_criticos": productos_criticos,
        "productos_agotados": productos_agotados,
        "proximos_a_vencer": proximos,
        "gasto_por_categoria": gasto_por_categoria,
        "mayor_rotacion": mayor_rotacion,
        "historico_compras": historico_compras,
    }
