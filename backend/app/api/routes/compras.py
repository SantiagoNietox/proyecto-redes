from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Catalogo, CompraHistorial
from app.schemas import CompraCreate, CompraRead

router = APIRouter(prefix="/compras", tags=["Compras"])


@router.get("", response_model=list[CompraRead])
def listar_compras(db: Session = Depends(get_db)):
    return db.scalars(select(CompraHistorial).order_by(CompraHistorial.comprado_en.desc())).all()


@router.post("", response_model=CompraRead, status_code=status.HTTP_201_CREATED)
def registrar_compra(payload: CompraCreate, db: Session = Depends(get_db)):
    if db.get(Catalogo, payload.producto_id) is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado en catálogo")
    compra = CompraHistorial(**payload.model_dump())
    db.add(compra)
    db.commit()
    db.refresh(compra)
    return compra
