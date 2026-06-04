// Typed loader for the app's public environment variables.
//
// Expo inlines `EXPO_PUBLIC_*` vars at build time via `process.env`. This
// module reads them once, fails loudly at startup if a required one is
// missing, and exports a typed object so the rest of the app never touches
// `process.env` directly (which is untyped and easy to typo).
//
// Only EXPO_PUBLIC_* vars belong here — anything else is not exposed to the
// client bundle and would read as undefined.

type Env = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        'Copy .env.example to .env and fill in the values printed by `supabase start`.',
    );
  }
  return value;
}

export const env: Env = {
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
};
