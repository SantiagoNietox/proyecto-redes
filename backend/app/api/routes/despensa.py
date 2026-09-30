from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Catalogo, DespensaItem
from app.schemas import DespensaCreate, DespensaRead, DespensaUpdate

router = APIRouter(prefix="/despensa", tags=["Despensa"])


def _with_producto(db: Session, item_id: int):
    return db.scalar(
        select(DespensaItem).options(joinedload(DespensaItem.producto)).where(DespensaItem.id == item_id)
    )


@router.get("", response_model=list[DespensaRead])
def listar_despensa(db: Session = Depends(get_db)):
    return db.scalars(select(DespensaItem).options(joinedload(DespensaItem.producto)).order_by(DespensaItem.id)).all()


@router.post("", response_model=DespensaRead, status_code=status.HTTP_201_CREATED)
def agregar_item(payload: DespensaCreate, db: Session = Depends(get_db)):
    if db.get(Catalogo, payload.producto_id) is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado en catálogo")
    item = DespensaItem(**payload.model_dump(), en_lista_compras=payload.stock_actual <= payload.stock_minimo)
    db.add(item)
    db.commit()
    return _with_producto(db, item.id)


@router.put("/{item_id}", response_model=DespensaRead)
def actualizar_item(item_id: int, payload: DespensaUpdate, db: Session = Depends(get_db)):
    item = db.get(DespensaItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item de despensa no encontrado")
    cambios = payload.model_dump(exclude_unset=True)
    if "producto_id" in cambios and db.get(Catalogo, cambios["producto_id"]) is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado en catálogo")
    for campo, valor in cambios.items():
        setattr(item, campo, valor)
    item.en_lista_compras = item.stock_actual <= item.stock_minimo
    db.commit()
    return _with_producto(db, item.id)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(DespensaItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item de despensa no encontrado")
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
