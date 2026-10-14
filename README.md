# Museo escolar WebXR

Base de una experiencia de museo escolar en realidad mixta para Meta Quest 3.
La aplicación usa Vite, Three.js y RATK, con Supabase para autenticación, datos
y almacenamiento.

## Estado actual

- Paso 1: estructura Vite y escena base WebXR.
- Paso 2: convenciones del proyecto en `AGENTS.md`.
- Paso 3: cargador STL bajo demanda, caché acotada y colocación temporal por
  hit-test desde el controlador derecho.
- Paso 4: un anchor de origen RATK por sala, persistente cuando el navegador lo
  permite, asociado localmente al ID de sala.
- Paso 5: calibración manual apuntando de frente al centro del QR y persistencia
  local de las 10 transformaciones relativas.
- Paso 6: cliente Supabase, sesión anónima para invitados, acceso admin por
  correo/contraseña y roles protegidos por RLS.
- Primera versión del panel admin en la landing: creación explícita de salas,
  carga de STL, conteo de polígonos, escala inicial y asignación de una obra por
  mesa para cada escena.
- Entrada de sala por `?room=ID` o formulario manual.
- Vista previa 3D en escritorio y botón `immersive-ar` gestionado por RATK.
- Modelo confirmado: 10 mesas físicas fijas y 3 escenas que rotan las obras.
- El esquema Supabase ya está versionado. Todavía faltan el ajuste fino espacial
  desde el casco, la sincronización de offsets entre visores y el modo Examinar.

## Prototipo espacial actual

1. Si el visor ya conoce la sala, se intenta restaurar su anchor persistente.
2. Si no existe o se marcó `Recalibrar origen al entrar`, ponerse de frente al
   QR, apuntar al centro y presionar el gatillo derecho.
3. Como admin, apuntar con el controlador derecho a cada mesa y presionar el gatillo para
   colocar `Mesa 1` a `Mesa 10`.
4. Desde la landing, elegir la escena que se quiere editar y asignar una obra previamente cargada a
   cada mesa.
5. Dentro del casco, usar el panel del controlador izquierdo y el rayo del
   controlador derecho para elegir la escena visible.
6. Apuntar a una base ya colocada y presionar el gatillo para cargar
   su STL bajo demanda.

El handle del anchor y la distribución se guardan en el almacenamiento local del
navegador del visor. Cuando Supabase está configurado, las obras y asignaciones
se leen del catálogo remoto. Cambiar de escena conserva las 10 posiciones y rota
únicamente las asignaciones.

Esta persistencia local no sincroniza dispositivos. Supabase incorporará los
offsets compartidos en la siguiente integración; cada visor nuevo deberá calibrar el mismo QR
antes de reconstruirlos.

## Flujo del administrador

1. Abrir la URL con `?room=ID` e ingresar con la cuenta admin.
2. Si el ID aún no existe, crear la sala. La aplicación registra 10 mesas y tres
   escenas sin colocar físicamente ninguna mesa.
3. Cargar cada STL junto con nombre, autor, descripción y una escala explícita.
   La landing analiza el archivo antes de subirlo y muestra una advertencia si
   supera 100.000 polígonos; el original no se modifica.
   Título, autor, descripción y escala se pueden corregir después desde la
   biblioteca, sin reemplazar el archivo original.
4. Elegir en la landing la escena que se está editando y guardar una obra como
   máximo para cada mesa. Esta selección no cambia la escena del visitante.
5. Entrar a WebXR como admin para calibrar el QR y colocar las mesas en orden.
6. En WebXR, elegir la escena visible desde el menú unido al controlador izquierdo.

La escala puede corregirse desde la biblioteca de la landing. El ajuste fino con
controladores dentro del casco todavía no forma parte de esta iteración.

## Requisitos locales

- Node.js 22.19 o posterior (el entorno usado para esta base tiene Node 24).
- Un Meta Quest 3 conectado a la misma red para probar desde el visor.

## Puesta en marcha

```bash
npm install
npm run dev
```

Vite mostrará una URL HTTPS de red. Abrila en Meta Quest Browser, por ejemplo:

```text
https://IP-DE-LA-PC:5173/?room=muestra-2026
```

`vite-plugin-mkcert` genera el certificado de desarrollo. El visor debe confiar
en la autoridad certificante local; si no es posible instalarla, usar un hosting
o túnel HTTPS con certificado público válido.

La instalación de una autoridad certificante modifica el almacén de confianza
del equipo. Debe aprobarse de forma consciente en el primer arranque; no se debe
automatizar ni eludir esa confirmación.

## Validación local

```bash
npm run check
```

La compilación y las pruebas locales no validan passthrough, tracking, anchors,
controladores ni persistencia en un Quest real.

## Publicación en GitHub Pages

La publicación prevista es:

```text
https://nahuelx14.github.io/Museo-Virtual/
```

Vite usa la base `/Museo-Virtual/` y el workflow
`.github/workflows/deploy-pages.yml` ejecuta pruebas, genera `dist` y publica el
sitio después de cada `push` a `main`. Antes del primer despliegue:

1. Crear el repositorio `nahuelx14/Museo-Virtual` y subir este proyecto a la
   rama `main`.
2. En `Settings > Pages`, elegir `GitHub Actions` como fuente.
3. En `Settings > Secrets and variables > Actions`, crear los secretos
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. En Supabase, agregar como Redirect URL:

   ```text
   https://nahuelx14.github.io/Museo-Virtual/**
   ```

5. Configurar como Site URL de Supabase:

   ```text
   https://nahuelx14.github.io/Museo-Virtual/
   ```

La URL de acceso a la sala principal será:

```text
https://nahuelx14.github.io/Museo-Virtual/?room=muestra-2026
```

## Supabase

La aplicación funciona como demo local si no hay variables configuradas. Para
activar el backend real:

1. Crear el proyecto Supabase y habilitar los proveedores `Anonymous Sign-Ins`
   y `Email`.
2. Ejecutar `supabase/migrations/0001_museum_schema.sql`.
3. Crear la cuenta del administrador y promoverla con el SQL documentado en
   `supabase/README.md`.
4. En `Authentication > URL Configuration`, agregar como Redirect URL cada URL
   desde la que se probará la recuperación de contraseña. Por ejemplo,
   `https://IP-DE-LA-PC:5173/**` en desarrollo y
   `https://nahuelx14.github.io/Museo-Virtual/**` en producción.
5. Copiar `.env.example` como `.env.local` y completar:

   ```dotenv
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
   ```

La clave `anon`/`publishable` está diseñada para el cliente; la seguridad real
la aplican las políticas RLS incluidas. Nunca colocar una clave `service_role`
en Vite. El bucket privado `museum-stl` limita cada archivo a 50 MB y solo los
perfiles `admin` pueden escribir.

El formulario de administrador incluye `Olvidé mi contraseña`. Supabase envía
un enlace a la URL actual y, al regresar, la aplicación muestra el formulario
para definir la contraseña nueva. Por privacidad, el mensaje de envío no revela
si el correo está registrado. El servicio de correo incorporado de Supabase es
solo para pruebas y tiene límites reducidos; para producción se debe configurar
SMTP propio.

El build local comprueba el código, pero no confirma que un proyecto Supabase
externo, sus proveedores o sus políticas hayan sido desplegados correctamente.
