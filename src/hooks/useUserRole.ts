// src/hooks/useUserRole.ts
// Thin re-export so existing imports keep working.
// The actual implementation lives in the UserRoleProvider (see
// src/context/UserRoleContext.tsx) and runs ONCE per session,
// instead of once per component mount.
export { useUserRole } from '@/context/UserRoleContext'