import csv
from pathlib import Path

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import Catalogo


DATASET = Path(__file__).resolve().parents[1] / "data" / "productos.csv"


def seed():
    Base.metadata.create_all(bind=engine)
    with DATASET.open(newline="", encoding="utf-8") as archivo, SessionLocal() as db:
        for fila in csv.DictReader(archivo):
            producto = db.scalar(select(Catalogo).where(Catalogo.nombre == fila["nombre"]))
            datos = {
                "categoria": fila["categoria"],
                "unidad_medida": fila["unidad_medida"],
                "dias_caducidad_estimados": int(fila["dias_caducidad_estimados"]),
                "precio_referencia": float(fila["precio_referencia"]),
            }
            if producto is None:
                producto = Catalogo(id=int(fila["id"]), nombre=fila["nombre"], **datos)
                db.add(producto)
            else:
                for campo, valor in datos.items():
                    setattr(producto, campo, valor)
        db.commit()
    print(f"Catálogo inicializado desde {DATASET}")


if __name__ == "__main__":
    seed()
