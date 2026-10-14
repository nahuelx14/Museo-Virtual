let clientPromise;

export function readSupabaseConfig(env = import.meta.env ?? {}) {
  return {
    url: String(env.VITE_SUPABASE_URL ?? '').trim(),
    anonKey: String(env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  };
}

export function isSupabaseConfigured(env = import.meta.env ?? {}) {
  const { url, anonKey } = readSupabaseConfig(env);

  if (!url || !anonKey) {
    return false;
  }

  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function getSupabaseClient(env = import.meta.env ?? {}) {
  if (!isSupabaseConfigured(env)) {
    throw new Error(
      'Supabase no está configurado. Copiá .env.example a .env.local y completá las dos variables públicas.',
    );
  }

  if (!clientPromise) {
    const { url, anonKey } = readSupabaseConfig(env);

    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url, anonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      }),
    );
  }

  return clientPromise;
}
