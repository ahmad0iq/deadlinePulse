// ============================================================
// DeadlinePulse — Supabase Configuration
// Replace these values with your Supabase project credentials
// ============================================================

const SUPABASE_CONFIG = {
    // Reads from env.js
    URL: typeof ENV !== 'undefined' ? ENV.SUPABASE_URL : "YOUR_SUPABASE_URL",

    // Reads from env.js
    ANON_KEY: typeof ENV !== 'undefined' ? ENV.SUPABASE_ANON_KEY : "YOUR_SUPABASE_ANON_KEY",
};

// Edge Function endpoints
const SUPABASE_FUNCTIONS = {
    SYNC_SUBMISSIONS: `${SUPABASE_CONFIG.URL}/functions/v1/sync-submissions`,
    GET_SUBMISSIONS: `${SUPABASE_CONFIG.URL}/functions/v1/get-submissions`,
    MARK_SUBMITTED: `${SUPABASE_CONFIG.URL}/functions/v1/mark-submitted`,
    REGISTER_PUSH_TOKEN: `${SUPABASE_CONFIG.URL}/functions/v1/register-push-token`,
};

// Token storage key
const TOKEN_STORAGE_KEY = "deadlinepulse_token";
