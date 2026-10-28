export type RealBackendEnvironment = Partial<Record<string, string>>

const REQUIRED_REAL_BACKEND_ENV = [
  'E2E_REAL_DITEL_REGISTRATION',
  'E2E_REAL_DITEL_PASSWORD',
  'E2E_REAL_UNIT_REGISTRATION',
  'E2E_REAL_UNIT_PASSWORD',
] as const

export function missingRealBackendEnvironment(
  env: RealBackendEnvironment,
  requiredNames: readonly string[] = REQUIRED_REAL_BACKEND_ENV,
) {
  return requiredNames.filter((name) => !env[name])
}

export function isStrictRealBackendEnvironmentRequired(env: RealBackendEnvironment) {
  return env.E2E_REAL_REQUIRE_ENV === 'true'
}

export function shouldSkipRealBackendSmoke(env: RealBackendEnvironment, requiredNames?: readonly string[]) {
  return missingRealBackendEnvironment(env, requiredNames).length > 0 && !isStrictRealBackendEnvironmentRequired(env)
}

export function assertRealBackendEnvironment(env: RealBackendEnvironment, requiredNames?: readonly string[]) {
  const missing = missingRealBackendEnvironment(env, requiredNames)
  if (missing.length > 0 && isStrictRealBackendEnvironmentRequired(env)) {
    throw new Error(`Missing required real-backend E2E env: ${missing.join(', ')}`)
  }
}
