import { afterEach, describe, expect, it } from 'vitest'
import {
  AUTH_STORAGE_KEY,
  authSessionStorage,
  clearLegacyPersistedAuth,
} from '@/lib/authSessionStorage'

describe('authSessionStorage', () => {
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('uses sessionStorage for Supabase auth payload', () => {
    authSessionStorage.setItem('test-key', 'token')
    expect(sessionStorage.getItem('test-key')).toBe('token')
    expect(localStorage.getItem('test-key')).toBeNull()
  })

  it('clears legacy localStorage auth keys on migration helper', () => {
    localStorage.setItem(AUTH_STORAGE_KEY, '{"access_token":"old"}')
    localStorage.setItem('sb-example-auth-token', 'x')
    clearLegacyPersistedAuth()
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem('sb-example-auth-token')).toBeNull()
  })
})