# Barrio Seguro SPS

PWA de seguridad comunitaria para San Pedro Sula, Honduras — ahora dividida en
**dos módulos independientes**:

- **Módulo Denuncia** (`/denuncia.html`) — requiere iniciar sesión. Aquí el
  vecino reporta incidentes, envía alertas silenciosas y gestiona su círculo
  de contactos de confianza.
- **Módulo Monitor** (`/monitor.html`) — panel de recepción en tiempo real.
  Muestra el mapa con la ubicación de cada denuncia marcada con un **emoji
  intermitente** (🚨 Robo/Asalto, 🚗 Vehículo Sospechoso, 🆘 Violencia
  Doméstica), además de las alertas silenciosas activas y el directorio de
  recursos (policía, hospitales, refugios).

`/index.html` es ahora una landing simple con dos botones para entrar a cada
módulo.

## Cuenta de prueba (módulo Denuncia)

Se crea automáticamente al iniciar el servidor por primera vez:

- **Usuario:** `vecino_demo`
- **Contraseña:** `Demo1234`

También se puede crear una cuenta nueva desde `/registro.html`.

## Instalación local

1. `npm install`
2. Copia `.env.example` a `.env` y ajusta si es necesario.
3. `npm start`
4. Abre http://localhost:3000

## Despliegue en Railway

1. Sube el proyecto a un repositorio GitHub.
2. Conecta el repositorio a Railway y despliega.
3. **Agrega un Volume** en Railway (importante: sin esto se pierde la base de
   datos, los usuarios registrados y las sesiones en cada despliegue) y
   define `DATABASE_PATH=/data/barrio_seguro.db`.
4. Define `NODE_ENV=production` para que las cookies de sesión viajen solo
   por HTTPS.
5. El dominio público se generará automáticamente.

## Autenticación

Las sesiones se guardan en la propia base de datos SQLite (tabla `sesiones`),
no en memoria — así sobreviven a reinicios del proceso si el Volume está
configurado. Las contraseñas se guardan con `bcryptjs` (hash, sin
dependencias nativas, compatible con hosting compartido o VPS económicos).

Duran 7 días y se limpian automáticamente cada hora.

## Dirección / nombre del lugar

Cada denuncia y alerta silenciosa se guarda con lat/lng **y** una dirección
legible (ej. "Calle Principal, Col. Ideal, San Pedro Sula"), resuelta con
geocodificación inversa de OpenStreetMap/Nominatim (gratuito, sin API key).

- La resolución ocurre en el servidor (`geocoding.js`) al momento de guardar,
  con caché de 24h por coordenada y las llamadas encoladas para respetar el
  límite de 1 solicitud/segundo que exige Nominatim — así varios vecinos
  reportando en la misma zona no generan peticiones repetidas.
- Si el servicio no responde (sin internet, caído, timeout de 5s), la
  denuncia igual se guarda — solo que sin dirección, mostrando coordenadas
  como respaldo en el Monitor. Nunca bloquea el envío de una denuncia.
- En el formulario de Denuncia, al tocar el mapa o usar "Mi ubicación", se
  muestra un preview de la dirección mientras se resuelve (`Buscando
  dirección...` → dirección final). Esto es solo informativo para el
  vecino; el servidor vuelve a resolverla de forma independiente al guardar.

## Nota de seguridad sobre el Monitor

El panel `/monitor.html` **no tiene login** por ahora — se dejó abierto tal
como se pidió, para que cualquier persona del equipo de seguridad pueda
verlo sin fricción. Como sí puede ver la existencia de reportes de violencia
doméstica (aunque sin descripción, solo como "reporte confidencial"), vale
la pena considerar agregarle un acceso propio (usuario/contraseña o código
compartido) antes de usarlo en producción con datos reales. Si se quiere,
se puede reutilizar el mismo mecanismo de sesiones que ya tiene el módulo
de denuncia.

## Estructura

```
barrio-seguro-sps-main/
├── server.js          # rutas, API REST, SSE
├── auth.js            # login/registro/sesiones (bcryptjs + SQLite)
├── database.js         # esquema y migraciones SQLite
├── public/
│   ├── index.html      # landing (elige módulo)
│   ├── login.html / registro.html
│   ├── denuncia.html    # módulo protegido — reporta incidentes
│   ├── monitor.html     # módulo de recepción — mapa en tiempo real
│   ├── css/style.css
│   ├── js/
│   │   ├── login.js / registro.js
│   │   ├── denuncia.js
│   │   └── monitor.js
│   ├── manifest.json
│   └── sw.js            # service worker (network-first en nav/API)
```
