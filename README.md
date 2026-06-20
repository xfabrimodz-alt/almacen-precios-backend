# Backend de Precios — Mi Almacén

Este es un servidor pequeño que existe por una sola razón técnica:
tu `index.html` corre en el navegador y el navegador NO puede pedirle
datos directamente a preciosclaros.gob.ar (por una restricción de
seguridad llamada CORS). Este servidor sí puede, y le pasa los datos
a tu `index.html` cuando este se lo pide.

No necesitás entender todo el código para usarlo. Esta guía te lleva
paso a paso para ponerlo a funcionar gratis.

## Qué vamos a hacer

1. Subir este código a GitHub (gratis).
2. Conectarlo a Render (gratis), un servicio que lo deja corriendo
   24/7 en internet.
3. Vos me pasás la URL final que te da Render, y desde ahí yo conecto
   el `index.html` para que hable con este servidor.

## Paso 1: Crear cuenta en GitHub (si no tenés)

1. Entrá a https://github.com y creá una cuenta gratis (con tu email).
2. Una vez logueado, hacé clic en el botón verde "New" (o el +
   arriba a la derecha → "New repository").
3. Ponele de nombre `almacen-precios-backend`.
4. Dejalo en "Public" (no importa, no hay nada secreto en este código).
5. NO marques ninguna casilla de "Add README" — dejalo vacío.
6. Hacé clic en "Create repository".

## Paso 2: Subir este código a GitHub

GitHub te va a mostrar una pantalla con comandos. La forma más fácil
sin usar la terminal es:

1. En la página de tu repo recién creado, buscá el link que dice
   "uploading an existing file".
2. Arrastrá ahí los archivos de esta carpeta: `server.js`,
   `package.json`, `.gitignore` (NO subas la carpeta `node_modules`,
   no hace falta).
3. Hacé clic en "Commit changes".

## Paso 3: Crear cuenta en Render

1. Entrá a https://render.com y creá una cuenta gratis. Lo más fácil
   es elegir "Sign up with GitHub" para que quede todo conectado.
2. Una vez adentro, hacé clic en "New +" → "Web Service".
3. Elegí el repositorio `almacen-precios-backend` que subiste.
4. Render va a detectar que es Node.js automáticamente. Dejá:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Hacé clic en "Create Web Service".

## Paso 4: Esperar el despliegue

Render va a tardar 2-5 minutos en instalar todo y levantar el
servidor. Vas a ver logs en pantalla. Cuando diga algo como
"Servidor de precios escuchando en puerto..." está listo.

## Paso 5: Conseguir la URL

Arriba de la pantalla de Render vas a ver una URL parecida a:

```
https://almacen-precios-backend.onrender.com
```

Copiá esa URL completa y pasámela. Con eso voy a poder:
- Verificar que el servidor responde correctamente
- Conectar `index.html` para que use estos datos

## Importante: el plan gratis de Render "se duerme"

Si el servidor no recibe pedidos durante un rato, Render lo "duerme"
para ahorrar recursos. La primera consulta después de dormido tarda
unos 30-50 segundos en responder (se está "despertando"), las
siguientes son rápidas. Esto es normal y esperado en el plan gratis,
no es un error.

## Verificar que funciona

Una vez que tengas la URL, podés probarla vos mismo poniendo en el
navegador (reemplazá por tu URL real):

```
https://TU-URL-DE-RENDER.onrender.com/health
```

Si ves algo como `{"status":"ok","timestamp":"..."}` está
funcionando.

También podés probar:

```
https://TU-URL-DE-RENDER.onrender.com/sucursales
```

Esto debería mostrar una lista de sucursales de supermercados
cercanas a Quilmes. Si ves eso, ¡la conexión a Precios Claros
funciona!
