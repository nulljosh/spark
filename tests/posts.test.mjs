import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);

beforeEach(() => {
  try { fs.unlinkSync('/tmp/spark-users.json'); } catch {}
  try { fs.unlinkSync('/tmp/spark-sessions.json'); } catch {}
});

const { parseToken, fallbackPosts, votePostInDataSource } = require('../api/posts');
const { issueToken, createUser, createSession } = require('../api/auth/store');

describe('parseToken', () => {
  it('should parse a valid JWT bearer token', () => {
    const user = { username: 'testuser', userId: 'user-123' };
    const token = issueToken(user);
    const result = parseToken(`Bearer ${token}`, null);
    expect(result).not.toBeNull();
    expect(result.username).toBe('testuser');
    expect(result.userId).toBe('user-123');
  });

  it('should reject invalid bearer token', () => {
    const result = parseToken('Bearer invalidtoken', null);
    expect(result).toBeNull();
  });

  it('should return null with no auth', () => {
    const result = parseToken(null, null);
    expect(result).toBeNull();
  });

  it('should fall back to session cookie', () => {
    const user = { username: 'cookieuser', userId: 'user-cookie' };
    const session = createSession({ user, token: 'tok' });
    const result = parseToken(null, `spark_session=${session.id}`);
    expect(result).not.toBeNull();
    expect(result.username).toBe('cookieuser');
  });
});

describe('Vote system (fallback mode)', () => {
  it('should upvote a fallback post', async () => {
    const post = fallbackPosts[0];
    const originalScore = post.score;
    const result = await votePostInDataSource({ id: post.id, voteType: 'up' });
    expect(result.mode).toBe('demo');
    expect(result.post.score).toBe(originalScore + 1);
  });

  it('should downvote a fallback post', async () => {
    const post = fallbackPosts[1];
    const originalScore = post.score;
    const result = await votePostInDataSource({ id: post.id, voteType: 'down' });
    expect(result.mode).toBe('demo');
    expect(result.post.score).toBe(originalScore - 1);
  });

  it('should return null for nonexistent post', async () => {
    const result = await votePostInDataSource({ id: 'nonexistent', voteType: 'up' });
    expect(result.post).toBeNull();
  });
});

describe('Login handler', () => {
  it('should return 405 for non-POST', async () => {
    const handler = require('../api/auth/login');
    const res = createMockRes();
    await handler({ method: 'GET', body: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('should require username and password', async () => {
    const handler = require('../api/auth/login');
    const res = createMockRes();
    await handler({ method: 'POST', body: { username: 'test' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('should login with valid credentials', async () => {
    await createUser({ username: 'logintest', password: 'password123' });
    const handler = require('../api/auth/login');
    const res = createMockRes();
    await handler({ method: 'POST', body: { username: 'logintest', password: 'password123' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.username).toBe('logintest');
  });

  it('should reject wrong password', async () => {
    await createUser({ username: 'wrongpass', password: 'correct' });
    const handler = require('../api/auth/login');
    const res = createMockRes();
    await handler({ method: 'POST', body: { username: 'wrongpass', password: 'incorrect' } }, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('Register handler', () => {
  it('should register a new user', async () => {
    const handler = require('../api/auth/register');
    const res = createMockRes();
    await handler({ method: 'POST', body: { username: 'newreg', password: 'password123' } }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.username).toBe('newreg');
    expect(res.body.token).toBeTruthy();
  });

  it('should reject short password', async () => {
    const handler = require('../api/auth/register');
    const res = createMockRes();
    await handler({ method: 'POST', body: { username: 'short', password: 'abc' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('should reject duplicate username', async () => {
    await createUser({ username: 'existing', password: 'password123' });
    const handler = require('../api/auth/register');
    const res = createMockRes();
    await handler({ method: 'POST', body: { username: 'existing', password: 'password123' } }, res);
    expect(res.statusCode).toBe(409);
  });
});

function createMockRes() {
  const headers = {};
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    setHeader(key, val) { headers[key] = val; },
    getHeader(key) { return headers[key]; },
  };
  return res;
}
