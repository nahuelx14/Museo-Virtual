# AGENTS.md

## Descripción del proyecto

Aplicación WebXR para Meta Quest 3 que presenta objetos 3D creados por
estudiantes sobre 10 mesas escolares reales usadas como tótems. La experiencia se
ejecuta en Meta Quest Browser con passthrough y debe seguir siendo operable por
visitantes sin conocimientos técnicos.

## Objetivo funcional

El visitante abre una URL HTTPS, identifica la sala mediante el QR maestro antes
de entrar a WebXR, calibra el origen apuntando al QR físico y ve las obras sobre
las mesas. Puede consultar sus datos y examinarlas temporalmente. Un usuario
administra tótems y obras; un invitado nunca modifica la muestra. Las 10 mesas
son posiciones físicas fijas y tres escenas rotan una obra distinta por mesa.

## Stack y decisiones vigentes

- JavaScript con módulos ES; el entry point es `src/main.js`.
- Vite para desarrollo y build.
- Three.js para renderizado.
- RATK (`ratk`) como capa para hit-test, meshes y anchors WebXR.
- Supabase Auth, Postgres y Storage como backend.
- `vite-plugin-mkcert` para HTTPS local.
- No incorporar otro framework UI o motor 3D sin consultarlo primero.

## Restricciones que no se pueden romper

1. Meta Quest Browser no entrega frames de la cámara de passthrough a la página.
   No implementar escaneo QR en vivo dentro de WebXR. El QR aporta el ID antes
   de entrar y luego el usuario apunta físicamente al marcador para calibrar.
2. Toda ejecución WebXR debe ocurrir en un contexto seguro HTTPS.
3. Verificar soporte real de una feature antes de usarla. Una API experimental,
   una extensión nativa de Meta o una API de Unity no se debe presentar como una
   API disponible en WebXR.
4. RATK administra anchors, hit-test, planos y meshes. No duplicar esa capa con
   una implementación propia salvo carencia comprobada y decisión documentada.
5. Meta Quest Browser documenta un límite de ocho anchors persistentes por sitio.
   Persistir un anchor principal del origen de sala y expresar las 10 mesas como
   transforms relativos; no crear un anchor persistente independiente por mesa.
6. Los handles de anchors persistentes son locales al navegador/dispositivo y
   desaparecen al borrar sus datos o usar navegación privada. Para varios
   visores, reconstruir los tótems desde los offsets de Supabase después de
   recalibrar el mismo QR maestro.
7. Nunca cargar los 30 modelos al iniciar. Descargar y parsear el modelo de un
   tótem únicamente cuando el usuario lo seleccione o apunte, con caché acotada
   en memoria.
8. Un STL con más de 100.000 polígonos debe generar una advertencia visible al
   admin. No modificar silenciosamente archivos de estudiantes. Proponer GLB o
   simplificación como proceso explícito y conservar el original.

## Sistema de coordenadas

- El origen de sala es la pose confirmada por el usuario al apuntar al QR.
- La orientación manual mantiene `Y` vertical y define `+Z` desde el QR hacia
  el usuario; pedir que la confirmación se haga de frente al marcador.
- Postgres almacena transformaciones de tótems relativas a ese origen:
  posición, cuaternión y escala; nunca coordenadas absolutas del headset.
- Separar identidad/ubicación del tótem e identidad/archivo de la obra para
  poder reemplazar un modelo sin volver a registrar la mesa.
- Una escena solo almacena 10 asignaciones `mesaId → obraId`; cambiar de escena
  no modifica las transformaciones físicas de las mesas.
- Para la muestra actual se administra una única sala física. Sus 10 mesas se
  colocan una vez y se reutilizan sin cambios en todas las escenas.
- Definir y documentar unidades en metros y el eje vertical `Y`.
- Las transformaciones deben serializarse como números finitos y validarse antes
  de aplicarse a objetos Three.js.

## Modelos 3D

- STL se carga mediante `STLLoader` solo bajo demanda.
- Calcular normales cuando el archivo no las tenga, centrar por bounding box y
  aplicar una escala explícita; no adivinar unidades sin mostrar el resultado al
  admin.
- La base visual es un objeto separado del mesh de la obra.
- Liberar geometrías, materiales y texturas al expulsar un modelo de la caché.
- Toda optimización o conversión a GLB debe conservar el STL original en Storage.

## Anchors y calibración

- Pedir `hit-test` y declarar el resto de WebXR features según necesidad real.
- Comprobar cada feature y ofrecer un mensaje comprensible si falta.
- La calibración requiere una confirmación deliberada del usuario; no guardar
  una pose obtenida por accidente.
- Guardar el handle del anchor de origen localmente y asociarlo al ID de sala y
  al dispositivo actual. Supabase guarda offsets compartibles, no handles
  locales.
- La implementación local usa registros versionados separados para el handle
  del anchor y para la distribución relativa. No mezclar ambos ciclos de vida.
- Si no se puede restaurar el anchor, volver al flujo de calibración sin mover
  datos remotos.

## Roles y seguridad

- Roles válidos: `admin` e `invitado`.
- `public.profiles` es la fuente del rol; ocultar botones en UI no es una medida
  de seguridad.
- Row Level Security (RLS) y las políticas de Storage deben impedir escrituras
  de invitados y validar pertenencia a la sala.
- El invitado entra mediante Auth anónimo. El administrador usa
  correo/contraseña y solo obtiene permisos si su perfil tiene rol `admin`.
- La promoción a `admin` se hace fuera del cliente, desde el panel o SQL seguro
  de Supabase; nunca desde la aplicación Vite.
- No aceptar un rol proveniente de query params, `localStorage` o campos
  editables del cliente.
- No guardar secretos, service accounts ni archivos `.env.local` en el repo.
- Confirmar el esquema definitivo de colecciones y la estrategia de login antes
  de implementar el paso de backend.

## Interacción

- Raycasting primario desde Touch Plus; hand tracking básico es una mejora con
  detección de capacidad, no una dependencia para entrar.
- El menú flotante se asocia al controlador izquierdo cuando exista.
- La escena visible se elige desde ese menú dentro de WebXR. El selector de la
  landing es exclusivamente para que el admin edite asignaciones y no controla
  la escena que está viendo el visitante.
- Al entrar a `Examinar`, clonar posición, cuaternión, escala y parent originales.
  Al salir, restaurar exactamente esos valores y limpiar el estado temporal.
- Solo puede existir una obra en modo `Examinar` por usuario.
- Diseñar botones y textos para lectura a distancia y selección con rayos.

## Estructura del código

```text
src/
  main.js          Orquestación y ciclo de vida de la aplicación
  data/            Catálogo: 10 mesas, 3 escenas y asignaciones de obras
  scene/           Renderer, cámara, luces, passthrough y escena
  anchors/         Origen de sala, calibración y anchors RATK
  models/          Descarga, STLLoader, caché y políticas de optimización
  interaction/     Raycasting, selección y modo Examinar
  backend/         Supabase, auth, roles, Storage y sincronización
  ui/              UI 2D inicial y paneles espaciales
public/
  assets/           Recursos estáticos que sí se versionan
tests/              Pruebas unitarias fuera de hardware
```

Mantener dependencias entre capas en una sola dirección: la UI invoca servicios;
los servicios no importan la UI. La capa de backend no debe depender de Three.js.

## Comandos

- `npm run dev`: servidor HTTPS accesible en la red local.
- `npm run test`: pruebas unitarias con Node.
- `npm run build`: build de producción.
- `npm run check`: pruebas y build; mínimo antes de entregar una iteración.

## Forma de trabajo del agente

- Preguntar antes de cambiar backend, lenguaje, esquema persistente, flujo de
  autenticación, interacción principal o estrategia de despliegue.
- Implementar por etapas pequeñas y verificables; no adelantar varios pasos si
  una decisión del usuario afecta su arquitectura.
- Mantener la app utilizable en navegador de escritorio como vista de diagnóstico,
  sin confundirla con una prueba WebXR real.
- No afirmar que passthrough, anchors, hand tracking o controladores funcionan
  hasta probarlos físicamente en Meta Quest 3.
- Registrar degradaciones, features ausentes y errores en mensajes visibles; no
  fallar silenciosamente.
- Preservar archivos originales y no inventar metadatos de estudiantes.

## Criterio de cierre por iteración

Una iteración de código requiere pruebas unitarias pertinentes y build exitoso.
Las funciones espaciales, de hardware o de certificados solo se consideran
validadas después de una prueba en el Quest y en una sala real. Un build exitoso
no reemplaza esa validación.

## Referencias técnicas primarias

- RATK oficial: https://github.com/meta-quest/reality-accelerator-toolkit
- WebXR Mixed Reality en Meta Quest Browser:
  https://developers.meta.com/vr/documentation/web/webxr-mixed-reality/
- Vite: https://vite.dev/guide/
- vite-plugin-mkcert: https://github.com/liuweiGL/vite-plugin-mkcert
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
