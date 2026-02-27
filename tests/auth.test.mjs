import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);

beforeEach(() => {
  try { fs.unlinkSync('/tmp/spark-users.json'); } catch {}
  try { fs.unlinkSync('/tmp/spark-sessions.json'); } catch {}
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
} = require('../api/auth/store');

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

  it('should accept old Base64 tokens for backward compat', () => {
    const oldToken = Buffer.from('legacyuser:user-old-123').toString('base64');
    const result = verifyToken(oldToken);
    expect(result).not.toBeNull();
    expect(result.username).toBe('legacyuser');
    expect(result.userId).toBe('user-old-123');
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
    const session = createSession({ user, token: 'tok' });
    expect(session.id).toBeTruthy();
    expect(session.username).toBe('sessuser');

    const resolved = resolveSession(session.id);
    expect(resolved).not.toBeNull();
    expect(resolved.username).toBe('sessuser');
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
