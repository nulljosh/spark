import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
// Still needed further down to scan api/ source files on disk (not for the
// removed /tmp user store).
import fs from 'fs';

const require = createRequire(import.meta.url);

// The /tmp JSON store is gone (no filesystem on Cloudflare Workers). These
// tests run against the opt-in in-memory store instead; production leaves
// SPARK_ALLOW_MEMORY_STORE unset so a missing Supabase config fails loudly.
process.env.SPARK_ALLOW_MEMORY_STORE = '1';

beforeEach(() => {
  require('../api/_lib/store')._resetMemoryStore();
});

const {
  createUser,
  findUserByUsername,
  issueToken,
  verifyToken,
  verifyPassword,
  deriveUser,
  createSession,
  resolveSession,
  parseCookie,
} = require('../api/_lib/store');

describe('Password hashing (bcrypt)', () => {
  it('should verify correct password', async () => {
    const user = await createUser({ username: 'test', email: 'test@test.com', password: 'password123' });
    expect(user).not.toBeNull();
    expect(user.passwordHash).toBeTruthy();
    expect(user.passwordHash.startsWith('$2')).toBe(true); // bcrypt prefix
    expect(verifyPassword('password123', user)).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const user = await createUser({ username: 'test2', password: 'password123' });
    expect(verifyPassword('wrongpassword', user)).toBe(false);
  });
});

describe('JWT tokens', () => {
  it('should issue a valid JWT', () => {
    const user = { username: 'testuser', userId: 'user-123' };
    const token = issueToken(user);
    expect(token).toBeTruthy();
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('should verify a valid JWT', () => {
    const user = { username: 'testuser', userId: 'user-123' };
    const token = issueToken(user);
    const result = verifyToken(token);
    expect(result).not.toBeNull();
    expect(result.username).toBe('testuser');
    expect(result.userId).toBe('user-123');
  });

  it('should reject an invalid JWT', () => {
    const result = verifyToken('invalid.token.here');
    expect(result).toBeNull();
  });

  it('should reject unsigned Base64 tokens (auth bypass closed)', () => {
    const forgedToken = Buffer.from('legacyuser:user-old-123').toString('base64');
    const result = verifyToken(forgedToken);
    expect(result).toBeNull();
  });
});

describe('User CRUD', () => {
  it('should create a user with bcrypt hash', async () => {
    const user = await createUser({ username: 'newuser', email: 'new@test.com', password: 'pass123456' });
    expect(user).not.toBeNull();
    expect(user.username).toBe('newuser');
    expect(user.userId).toMatch(/^user-/);
    expect(user.passwordHash).toBeTruthy();
    expect(user.passwordHash.startsWith('$2')).toBe(true);
  });

  it('should prevent duplicate usernames', async () => {
    await createUser({ username: 'dupe', password: 'pass123456' });
    const second = await createUser({ username: 'dupe', password: 'pass123456' });
    expect(second).toBeNull();
  });

  it('should find user by username', async () => {
    await createUser({ username: 'findme', password: 'pass123456' });
    const found = await findUserByUsername('findme');
    expect(found).not.toBeNull();
    expect(found.username).toBe('findme');
  });

  it('should return null for missing user', async () => {
    const found = await findUserByUsername('nonexistent');
    expect(found).toBeNull();
  });
});

describe('Derived users', () => {
  it('should derive deterministic user from credentials', () => {
    const user1 = deriveUser('test', 'pass');
    const user2 = deriveUser('test', 'pass');
    expect(user1.userId).toBe(user2.userId);
    expect(user1.userId).toMatch(/^derived-/);
  });

  it('should produce different IDs for different inputs', () => {
    const user1 = deriveUser('test', 'pass1');
    const user2 = deriveUser('test', 'pass2');
    expect(user1.userId).not.toBe(user2.userId);
  });
});

describe('Sessions', () => {
  it('should create and resolve a session', () => {
    const user = { username: 'sessuser', userId: 'user-sess-1' };
    // Sessions are stateless: session.id *is* the signed JWT, so resolving one
    // means verifying it. A placeholder string no longer resolves, which is the
    // point — a forged cookie can't mint a session.
    const session = createSession({ user, token: issueToken(user) });
    expect(session.id).toBeTruthy();
    expect(session.username).toBe('sessuser');

    const resolved = resolveSession(session.id);
    expect(resolved).not.toBeNull();
    expect(resolved.username).toBe('sessuser');
    expect(resolved.userId).toBe('user-sess-1');
  });

  it('should not resolve an unsigned session id', () => {
    expect(resolveSession('tok')).toBeNull();
    expect(resolveSession(undefined)).toBeNull();
  });

  it('should return null for invalid session', () => {
    expect(resolveSession('nonexistent')).toBeNull();
    expect(resolveSession(null)).toBeNull();
    expect(resolveSession('')).toBeNull();
  });
});

describe('Cookie parsing', () => {
  it('should parse cookie string', () => {
    const cookies = parseCookie('spark_session=abc123; theme=dark');
    expect(cookies.spark_session).toBe('abc123');
    expect(cookies.theme).toBe('dark');
  });

  it('should handle empty/null input', () => {
    expect(parseCookie(null)).toEqual({});
    expect(parseCookie('')).toEqual({});
  });
});

// The `users` table has TWO id columns: `id` (bigint identity PK) and `user_id`
// (text, the "user-<ts>-<rand>" value carried in the JWT). Filtering the bigint
// column by a text userId makes Postgres error, so the request 500s. That broke
// account deletion (App Store 5.1.1(v)) and avatar upload silently.
describe('users table queries filter by the correct id column', () => {
  const apiFiles = fs
    .readdirSync('api', { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((f) => `api/${f}`);

  it('never filters the bigint `id` column by a text userId', () => {
    const offenders = apiFiles.filter((f) =>
      /users\?id=eq\.\$\{[^}]*userId/.test(fs.readFileSync(f, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});

// /api/auth/password-reset?action=forgot carries TWO actions: the route
// ("password-reset") and the sub-action password-reset.js reads ("forgot").
// The Pages route used to inject { action: 'password-reset' } into req.query,
// clobbering the caller's ?action= and making password reset a permanent
// "Unknown action" 400 in production.
describe('auth route dispatch does not clobber ?action=', () => {
  it('auth.js reads the route from the URL path, not req.query.action', () => {
    const src = fs.readFileSync('api/auth.js', 'utf8');
    const line = src.split('\n').find((l) => l.includes('const action ='));
    expect(line).toBeTruthy();
    // path regex must come before the req.query fallback
    expect(line.indexOf('req.url')).toBeLessThan(line.indexOf('req.query'));
  });

  it('the Pages auth route injects no query params', () => {
    const src = fs.readFileSync('functions/api/[[route]].js', 'utf8');
    expect(src).not.toMatch(/handlers\.auth,\s*query:\s*\{\s*action:/);
  });
});
