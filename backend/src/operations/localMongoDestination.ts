export const LOCAL_MONGO_HOST = '127.0.0.1';
export const LOCAL_MONGO_PORT = '27018';
export const LOCAL_MONGO_DATABASE = 'ativus_homolog';

export interface LocalMongoDestinationOptions {
  requireDirectConnection?: boolean;
  requireReplicaSet?: string;
}

export interface LocalMongoDestinationResult {
  valid: boolean;
  reason?: string;
  host?: string;
  database?: string;
}

export function validateLocalMongoDestination(uri: string, options: LocalMongoDestinationOptions = {}): LocalMongoDestinationResult {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'mongodb:') return { valid: false, reason: 'mongodb_protocol_required' };
    if (parsed.hostname !== LOCAL_MONGO_HOST || parsed.port !== LOCAL_MONGO_PORT) return { valid: false, reason: 'approved_local_endpoint_required' };
    if (parsed.username || parsed.password) return { valid: false, reason: 'credentials_in_uri_forbidden' };
    if (parsed.pathname.slice(1) !== LOCAL_MONGO_DATABASE) return { valid: false, reason: 'approved_database_required' };
    const queryKeys = [...parsed.searchParams.keys()];
    const allowedKeys = new Set(['directConnection', 'replicaSet']);
    if (queryKeys.some((key) => !allowedKeys.has(key))) return { valid: false, reason: 'unexpected_mongo_option' };
    const requiresBothModes = Boolean(options.requireDirectConnection && options.requireReplicaSet);
    if (requiresBothModes && (queryKeys.length !== 2 || !queryKeys.includes('directConnection') || !queryKeys.includes('replicaSet'))) return { valid: false, reason: 'direct_replica_options_required' };
    if (!requiresBothModes && options.requireDirectConnection && (queryKeys.length !== 1 || queryKeys[0] !== 'directConnection')) return { valid: false, reason: 'unexpected_mongo_option' };
    if (!requiresBothModes && options.requireReplicaSet && (queryKeys.length !== 1 || queryKeys[0] !== 'replicaSet')) return { valid: false, reason: 'unexpected_mongo_option' };
    if (options.requireDirectConnection && parsed.searchParams.get('directConnection') !== 'true') return { valid: false, reason: 'direct_connection_required' };
    if (options.requireReplicaSet && parsed.searchParams.get('replicaSet') !== options.requireReplicaSet) return { valid: false, reason: 'replica_set_required' };
    return { valid: true, host: parsed.hostname, database: LOCAL_MONGO_DATABASE };
  } catch {
    return { valid: false, reason: 'invalid_mongodb_uri' };
  }
}
