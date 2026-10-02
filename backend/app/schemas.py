from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class CatalogoBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=160)
    categoria: str = Field(min_length=1, max_length=100)
    unidad_medida: str = Field(min_length=1, max_length=40)
    dias_caducidad_estimados: int = Field(ge=0)
    precio_referencia: float = Field(ge=0)


class CatalogoCreate(CatalogoBase):
    id: int | None = None


class CatalogoRead(CatalogoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class DespensaBase(BaseModel):
    producto_id: int
    stock_actual: float = Field(ge=0)
    stock_minimo: float = Field(ge=0)
    fecha_ingreso: date = Field(default_factory=date.today)


class DespensaCreate(DespensaBase):
    pass


class DespensaUpdate(BaseModel):
    producto_id: int | None = None
    stock_actual: float | None = Field(default=None, ge=0)
    stock_minimo: float | None = Field(default=None, ge=0)
    fecha_ingreso: date | None = None


class DespensaRead(DespensaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    en_lista_compras: bool
    producto: CatalogoRead


class CompraCreate(BaseModel):
    producto_id: int
    cantidad: float = Field(gt=0)
    precio_unitario: float = Field(ge=0)


class CompraRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    producto_id: int
    cantidad: float
    precio_unitario: float
    comprado_en: datetime


class ConsumoRequest(BaseModel):
    cantidad: float = Field(default=1.0, gt=0)


class CompraConsolidadaItem(BaseModel):
    item_id: int
    cantidad: float = Field(gt=0)


class CompraConsolidadaRequest(BaseModel):
    items: list[CompraConsolidadaItem]


class DashboardRead(BaseModel):
    gasto_estimado: float
    productos_criticos: int
    productos_agotados: int
    proximos_a_vencer: list[dict]
    gasto_por_categoria: dict[str, float]
    mayor_rotacion: list[dict]
    historico_compras: list[dict]
