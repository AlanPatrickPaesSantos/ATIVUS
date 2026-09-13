export type RealBackendEnvironment = Partial<Record<string, string>>

const REQUIRED_REAL_BACKEND_ENV = [
  'E2E_REAL_DITEL_REGISTRATION',
  'E2E_REAL_DITEL_PASSWORD',
  'E2E_REAL_UNIT_REGISTRATION',
  'E2E_REAL_UNIT_PASSWORD',
] as const

export function missingRealBackendEnvironment(env: RealBackendEnvironment) {
  return REQUIRED_REAL_BACKEND_ENV.filter((name) => !env[name])
}

export function isStrictRealBackendEnvironmentRequired(env: RealBackendEnvironment) {
  return env.E2E_REAL_REQUIRE_ENV === 'true'
}

export function shouldSkipRealBackendSmoke(env: RealBackendEnvironment) {
  return missingRealBackendEnvironment(env).length > 0 && !isStrictRealBackendEnvironmentRequired(env)
}

export function assertRealBackendEnvironment(env: RealBackendEnvironment) {
  const missing = missingRealBackendEnvironment(env)
  if (missing.length > 0 && isStrictRealBackendEnvironmentRequired(env)) {
    throw new Error(`Missing required real-backend E2E env: ${missing.join(', ')}`)
  }
}
