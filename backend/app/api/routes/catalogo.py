from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Catalogo
from app.schemas import CatalogoCreate, CatalogoRead

router = APIRouter(prefix="/catalogo", tags=["Catálogo"])


@router.get("", response_model=list[CatalogoRead])
def listar_catalogo(db: Session = Depends(get_db)):
    return db.scalars(select(Catalogo).order_by(Catalogo.nombre)).all()


@router.post("", response_model=CatalogoRead, status_code=status.HTTP_201_CREATED)
def crear_producto(payload: CatalogoCreate, db: Session = Depends(get_db)):
    if db.scalar(select(Catalogo).where(Catalogo.nombre == payload.nombre)):
        raise HTTPException(status_code=409, detail="Ya existe un producto con ese nombre")
    producto = Catalogo(**payload.model_dump(exclude={"id"}))
    if payload.id is not None:
        producto.id = payload.id
    db.add(producto)
    db.commit()
    db.refresh(producto)
    return producto
