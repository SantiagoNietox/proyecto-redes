from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import DespensaItem
from app.schemas import DashboardRead

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardRead)
def obtener_dashboard(dias_alerta: int = 7, db: Session = Depends(get_db)):
    items = db.scalars(select(DespensaItem).options(joinedload(DespensaItem.producto))).all()
    gasto_estimado = sum(
        max(item.stock_minimo - item.stock_actual, 0) * item.producto.precio_referencia for item in items
    )
    limite = date.today() + timedelta(days=max(0, dias_alerta))
    proximos = []
    for item in items:
        vence = item.fecha_ingreso + timedelta(days=item.producto.dias_caducidad_estimados)
        if date.today() <= vence <= limite:
            proximos.append({
                "item_id": item.id,
                "producto": item.producto.nombre,
                "fecha_vencimiento_estimada": vence.isoformat(),
                "dias_restantes": (vence - date.today()).days,
            })
    return {
        "gasto_estimado": round(gasto_estimado, 2),
        "productos_criticos": sum(1 for item in items if item.stock_actual <= item.stock_minimo),
        "proximos_a_vencer": proximos,
    }
