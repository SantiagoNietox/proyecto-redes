from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Catalogo(Base):
    __tablename__ = "catalogo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(160), nullable=False, unique=True, index=True)
    categoria: Mapped[str] = mapped_column(String(100), nullable=False)
    unidad_medida: Mapped[str] = mapped_column(String(40), nullable=False)
    dias_caducidad_estimados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    precio_referencia: Mapped[float] = mapped_column(Float, nullable=False, default=0)

    items_despensa: Mapped[list["DespensaItem"]] = relationship(back_populates="producto")


class DespensaItem(Base):
    __tablename__ = "despensa_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("catalogo.id", ondelete="CASCADE"), nullable=False)
    stock_actual: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    stock_minimo: Mapped[float] = mapped_column(Float, nullable=False, default=1)
    en_lista_compras: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fecha_ingreso: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    creado_en: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    producto: Mapped[Catalogo] = relationship(back_populates="items_despensa")


class CompraHistorial(Base):
    __tablename__ = "compras_historial"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("catalogo.id", ondelete="RESTRICT"), nullable=False)
    cantidad: Mapped[float] = mapped_column(Float, nullable=False)
    precio_unitario: Mapped[float] = mapped_column(Float, nullable=False)
    comprado_en: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    producto: Mapped[Catalogo] = relationship()
