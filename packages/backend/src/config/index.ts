import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

dotenv.config();

interface Config {
  env: string;
  port: number;
  host: string;
  database: {
    /** Filesystem path to the SQLite database file. */
    path: string;
  };
  auth: {
    /** Secret for Better Auth (session signing/encryption). */
    secret: string;
  };
  admin: {
    username: string;
    password: string;
  };
  ai: {
    openai: {
      apiKey: string | undefined;
    };
    anthropic: {
      apiKey: string | undefined;
    };
    google: {
      apiKey: string | undefined;
    };
    openrouter: {
      apiKey: string | undefined;
    };
    ollama: {
      baseUrl: string;
    };
  };
  upload: {
    dir: string;
    maxSize: number;
  };
  cors: {
    origin: string | string[] | boolean;
  };
  encryption: {
    key: string;
  };
  smtp: {
    host: string | undefined;
    port: number;
    secure: boolean;
    user: string | undefined;
    pass: string | undefined;
    from: string;
  };
}

function parseCorsOrigin(value: string): string | string[] | boolean {
  if (value === '*') return true;
  if (value.includes(',')) return value.split(',').map((s) => s.trim());
  return value;
}

function resolveAuthSecret(): string {
  // BETTER_AUTH_SECRET is preferred; JWT_SECRET is accepted as a legacy alias
  // so existing deployments keep working after the Better Auth migration.
  return (
    process.env.BETTER_AUTH_SECRET ||
    process.env.JWT_SECRET ||
    'nommable-dev-secret-key-change-this-in-production'
  );
}

function resolveEncryptionKey(authSecret: string): string {
  const envKey = (process.env.ENCRYPTION_KEY || '').trim();
  if (envKey) {
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      return envKey;
    }
    // Convert arbitrary passphrase into deterministic 32-byte hex key
    return crypto.createHash('sha256').update(envKey).digest('hex');
  }

  // Fallback: derive 32-byte key from auth secret so server never crashes on missing key
  return crypto.createHash('sha256').update(authSecret).digest('hex');
}

function resolveUploadDir(): string {
  const envDir = (process.env.UPLOAD_DIR || '').trim();
  const resolved = envDir
    ? envDir
    : fs.existsSync('/data')
      ? '/data/uploads'
      : fs.existsSync('/app/uploads')
        ? '/app/uploads'
        : path.join(process.cwd(), 'uploads');
  try {
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
  } catch {
    // Ignore if read-only in test/build environment
  }
  return resolved;
}

function resolveDatabasePath(): string {
  const envPath = (process.env.DB_PATH || '').trim();
  // Single-container default: persistent volume mounted at /data
  const resolved = envPath
    ? envPath
    : fs.existsSync('/data')
      ? '/data/nommable.db'
      : path.join(process.cwd(), 'nommable.db');
  if (resolved !== ':memory:') {
    try {
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // Ignore if directory cannot be created yet
    }
  }
  return resolved;
}

const authSecret = resolveAuthSecret();

export const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || 'localhost',

  database: {
    path: resolveDatabasePath(),
  },

  auth: {
    secret: authSecret,
  },

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin',
  },

  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    google: {
      apiKey: process.env.GOOGLE_AI_API_KEY,
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    },
  },

  upload: {
    dir: resolveUploadDir(),
    maxSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB default
  },

  cors: {
    origin: parseCorsOrigin(process.env.CORS_ORIGIN || 'http://localhost:5173'),
  },

  encryption: {
    key: resolveEncryptionKey(authSecret),
  },
  smtp: {
    host: process.env.SMTP_HOST || undefined,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@nommable.local',
  },
};

// --- Fail-closed production guards ---
// These run after config resolution so dev stays frictionless while prod
// refuses to boot with insecure defaults.

// Auth secret must never fall back to the insecure default in production —
// anyone with the default can forge valid session tokens.
if (
  config.env === 'production' &&
  authSecret === 'nommable-dev-secret-key-change-this-in-production'
) {
  console.error(
    'FATAL: BETTER_AUTH_SECRET (or JWT_SECRET as legacy alias) is required in production. Set a long random string.'
  );
  process.exit(1);
}
// ENCRYPTION_KEY must be explicitly set in production. Note: we check the raw
// env var, not the resolved value, because resolveEncryptionKey() derives a
// fallback from the auth secret — running prod on a derived key is exactly what
// this guard prevents.
if (config.env === 'production' && !process.env.ENCRYPTION_KEY) {
  console.error('FATAL: ENCRYPTION_KEY is required in production. Set a 64-character hex string.');
  process.exit(1);
}
// If SEED_ADMIN_ON_BOOT=true in production, require a non-default ADMIN_PASSWORD.
if (
  config.env === 'production' &&
  process.env.SEED_ADMIN_ON_BOOT === 'true' &&
  config.admin.password === 'admin'
) {
  console.error(
    'FATAL: ADMIN_PASSWORD must be changed from the default when SEED_ADMIN_ON_BOOT=true.'
  );
  process.exit(1);
}
// CORS_ORIGIN=* resolves to `origin: true`, which reflects ANY origin while
// credentials are enabled — any website could then make credentialed
// cross-origin API calls as the signed-in user. Refuse to boot prod that way.
if (config.env === 'production' && (process.env.CORS_ORIGIN || '').trim() === '*') {
  console.error(
    'FATAL: CORS_ORIGIN=* is not allowed in production with credentials enabled. Set an explicit origin list.'
  );
  process.exit(1);
}

if (!process.env.ENCRYPTION_KEY) {
  console.warn('NOTICE: ENCRYPTION_KEY not explicitly set. Using derived key from auth secret.');
}
