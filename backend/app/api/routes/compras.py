from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Catalogo, CompraHistorial, DespensaItem
from app.schemas import CompraConsolidadaRequest, CompraCreate, CompraRead

router = APIRouter(prefix="/compras", tags=["Compras"])


@router.get("", response_model=list[CompraRead])
def listar_compras(db: Session = Depends(get_db)):
    return db.scalars(select(CompraHistorial).order_by(CompraHistorial.comprado_en.desc())).all()


@router.post("", response_model=CompraRead, status_code=status.HTTP_201_CREATED)
def registrar_compra(payload: CompraCreate, db: Session = Depends(get_db)):
    producto = db.get(Catalogo, payload.producto_id)
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado en catálogo")
    compra = CompraHistorial(**payload.model_dump())
    db.add(compra)

    # RN-03: Incrementar inventario físico si el producto existe en despensa
    despensa_item = db.scalar(select(DespensaItem).where(DespensaItem.producto_id == payload.producto_id))
    if despensa_item:
        despensa_item.stock_actual += payload.cantidad
        despensa_item.fecha_ingreso = date.today()
        despensa_item.en_lista_compras = despensa_item.stock_actual <= despensa_item.stock_minimo

    db.commit()
    db.refresh(compra)
    return compra


@router.post("/consolidar", status_code=status.HTTP_200_OK)
def consolidar_remesa(payload: CompraConsolidadaRequest, db: Session = Depends(get_db)):
    """RN-03 y RF-04: Cierre de remesa en punto de venta.
    Suma al inventario físico doméstico, resetea bandera de compra y guarda en el historial."""
    actualizados = 0
    for item_solicitud in payload.items:
        despensa_item = db.scalar(
            select(DespensaItem)
            .options(joinedload(DespensaItem.producto))
            .where(DespensaItem.id == item_solicitud.item_id)
        )
        if not despensa_item:
            continue

        precio_unitario = despensa_item.producto.precio_referencia
        # Registrar en historial de remesas
        compra = CompraHistorial(
            producto_id=despensa_item.producto_id,
            cantidad=item_solicitud.cantidad,
            precio_unitario=precio_unitario,
        )
        db.add(compra)

        # Actualizar stock físico y resetear estado
        despensa_item.stock_actual += item_solicitud.cantidad
        despensa_item.fecha_ingreso = date.today()
        despensa_item.en_lista_compras = despensa_item.stock_actual <= despensa_item.stock_minimo
        actualizados += 1

    db.commit()
    return {"mensaje": "Remesa consolidada exitosamente", "items_actualizados": actualizados}

