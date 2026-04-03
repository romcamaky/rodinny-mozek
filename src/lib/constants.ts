/**
 * Fallback user id only when `getCurrentUserId()` finds no Supabase session (unexpected
 * while routes are protected). Prefer `session.user.id` for all data access.
 */
export const CURRENT_USER_ID = '00000000-0000-0000-0000-000000000001'