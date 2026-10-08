/**
 * DEPRECATED — this file exists only to prevent stale import resolution.
 * The canonical auth implementation is in useAuth.js (two-query approach,
 * does NOT use FK join which can fail silently).
 *
 * All imports should use:  import { useAuth } from '../lib/useAuth'
 * Vite resolves .js before .jsx so useAuth.js wins automatically.
 * This file is a safety re-export in case any tool resolves .jsx explicitly.
 */
export { useAuth, AuthProvider } from './useAuth.js'
