# Configuración de Supabase

La aplicación usa sesiones anónimas para visitantes y correo/contraseña para
administradores. El rol efectivo siempre se lee de `public.profiles`; nunca se
acepta desde la URL ni desde el navegador.

## Primera configuración

1. Crear un proyecto en Supabase.
2. En **Authentication > Providers**, habilitar `Anonymous Sign-Ins` y
   `Email` con contraseña.
3. Ejecutar `migrations/0001_museum_schema.sql` en el SQL Editor o mediante la
   CLI de Supabase.
4. Crear la cuenta administrativa desde **Authentication > Users**.
5. Promover únicamente esa cuenta desde el SQL Editor, reemplazando el correo:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (
     select id from auth.users where email = 'admin@escuela.edu.ar'
   );
   ```

6. Copiar `.env.example` como `.env.local` y pegar la URL del proyecto y la
   clave pública `anon`/`publishable`. Nunca usar `service_role` en Vite.
7. Reiniciar `npm run dev`.

## Modelo de datos

- `rooms`: sala identificada por el QR maestro.
- `totems`: las 10 mesas y sus transformaciones relativas al QR, en metros.
- `artworks`: metadatos y ruta privada del STL.
- `scenes`: las 3 rotaciones de la muestra.
- `scene_assignments`: una obra opcional por mesa y escena.
- `profiles`: rol `admin` o `invitado` asociado al usuario de Auth.

RLS permite a invitados autenticados anónimamente leer salas publicadas y
bloquea todas sus escrituras. Solo un perfil `admin` puede modificar catálogo o
Storage. El bucket privado `museum-stl` acepta hasta 50 MB por archivo.
