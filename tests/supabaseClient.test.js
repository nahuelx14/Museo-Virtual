import assert from 'node:assert/strict';
import test from 'node:test';
import { isSupabaseConfigured, readSupabaseConfig } from '../src/backend/supabaseClient.js';

test('readSupabaseConfig normaliza espacios de las variables públicas', () => {
  assert.deepEqual(
    readSupabaseConfig({
      VITE_SUPABASE_URL: ' https://demo.supabase.co ',
      VITE_SUPABASE_ANON_KEY: ' clave-publica ',
    }),
    {
      url: 'https://demo.supabase.co',
      anonKey: 'clave-publica',
    },
  );
});

test('isSupabaseConfigured requiere URL HTTPS y ambas variables', () => {
  assert.equal(
    isSupabaseConfigured({
      VITE_SUPABASE_URL: 'https://demo.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'clave-publica',
    }),
    true,
  );
  assert.equal(
    isSupabaseConfigured({
      VITE_SUPABASE_URL: 'http://demo.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'clave-publica',
    }),
    false,
  );
  assert.equal(isSupabaseConfigured({}), false);
});
