import mongoose from 'mongoose';

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function connectToDatabase(connectionString = process.env.MONGODB_URI): Promise<typeof mongoose> {
  if (!connectionString) {
    throw new Error('MONGODB_URI is required to connect to MongoDB');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose.connect(connectionString);

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
}

export interface DatabaseReadiness {
  ready: boolean;
  mongo: 'up' | 'down';
}

export async function readDatabaseReadiness(): Promise<DatabaseReadiness> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return { ready: false, mongo: 'down' };
  }

  try {
    await mongoose.connection.db.admin().ping();
    return { ready: true, mongo: 'up' };
  } catch {
    return { ready: false, mongo: 'down' };
  }
}
