# SmartPantry: Despensa Inteligente

Base académica para desplegar un frontend Nginx y una API FastAPI en dos VMs Ubuntu 22.04 independientes. El aprovisionamiento de ambas VMs está incluido como bloques `inline` en `Vagrantfile`. Se utiliza SQLite en el backend para iniciar rápidamente; el archivo de base de datos queda en `backend/smartpantry.db` (carpeta sincronizada de Vagrant).

## Estructura

```text
.
├── Vagrantfile
├── README.md
├── backend/
│   ├── requirements.txt
│   ├── data/productos.csv
│   └── app/
│       ├── main.py
│       ├── database.py
│       ├── models.py
│       ├── schemas.py
│       ├── seed.py
│       └── api/routes/{catalogo,despensa,compras,dashboard}.py
├── frontend/{index.html,styles.css,app.js}
├── nginx/smartpantry.conf
```

## Requisitos del host

Instala VirtualBox y Vagrant en Windows. La red privada `192.168.56.0/24` debe estar disponible en el host. Desde PowerShell, en la carpeta del proyecto:

```powershell
vagrant up
vagrant status
```

El provisionamiento inline del `Vagrantfile` instala dependencias, crea el entorno Python, importa el catálogo CSV, configura Nginx y habilita `smartpantry-api.service`. La API escucha en todas las interfaces de la VM para que el frontend pueda alcanzarla. Si las VMs ya estaban creadas, aplica los cambios con `vagrant provision`.

## Iniciar o revisar servicios

```powershell
vagrant ssh backend
sudo systemctl status smartpantry-api
sudo systemctl restart smartpantry-api
```

Para iniciar manualmente en backend (por ejemplo, durante desarrollo), dentro de la VM:

```bash
cd /vagrant/backend
.venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Nginx arranca automáticamente en frontend. Para comprobarlo o reiniciarlo:

```powershell
vagrant ssh frontend
sudo systemctl status nginx
sudo systemctl reload nginx
```

## Dominio local y pruebas desde Windows

Agrega como administrador esta línea al archivo `C:\Windows\System32\drivers\etc\hosts`:

```text
192.168.56.10 smartpantry.local
```

Abre `http://smartpantry.local`. El frontend hace fetch directo a `http://192.168.56.20:8000/api`; Nginx también ofrece reverse proxy para `http://smartpantry.local/api/...`.

Desde PowerShell puedes comprobar conexión y datos:

```powershell
Test-NetConnection 192.168.56.20 -Port 8000
curl.exe http://192.168.56.20:8000/api/health
curl.exe http://smartpantry.local/api/catalogo
```

Documentación interactiva: `http://192.168.56.20:8000/docs`.

## API

Todas las rutas de negocio están bajo `/api`:

| Método | Ruta | Función |
|---|---|---|
| GET, POST | `/api/catalogo` | Consultar/crear productos |
| GET, POST | `/api/despensa` | Consultar/agregar stock |
| PUT, DELETE | `/api/despensa/{item_id}` | Actualizar/eliminar stock |
| GET, POST | `/api/compras` | Consultar/registrar compras |
| GET | `/api/dashboard?dias_alerta=7` | Presupuesto, críticos y próximos a vencer |
| GET | `/api/health` | Salud de servicio |

Ejemplo para agregar un item de despensa:

```powershell
curl.exe -X POST http://192.168.56.20:8000/api/despensa `
  -H "Content-Type: application/json" `
  -d '{"producto_id":1,"stock_actual":0,"stock_minimo":2,"fecha_ingreso":"2026-09-30"}'
```

Cuando `stock_actual <= stock_minimo`, la API marca el producto para la lista. El presupuesto suma `max(stock_minimo - stock_actual, 0) * precio_referencia` de cada item de despensa. La caducidad estimada se calcula usando `fecha_ingreso + dias_caducidad_estimados` del catálogo.

## Reinicializar

El seed es idempotente para los nombres existentes y mantiene los registros de despensa. Para empezar con una base limpia, detén el servicio, elimina `backend/smartpantry.db` desde el host y vuelve a provisionar/iniciar la API; el seed recrea el catálogo.
