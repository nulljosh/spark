import { describe, it, expect, beforeAll } from 'vitest';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

let testUser = null;
let authToken = null;

describe('Spark Full Workflow', () => {
  it('should signup a new user', async () => {
    testUser = {
      username: `test_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'TestPass123!@'
    };

    const res = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });

    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(data.token).toBeTruthy();
    authToken = data.token;
  });

  it('should post an idea', async () => {
    const res = await fetch(`${API_URL}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        title: 'Test Idea',
        content: 'This is a test idea to verify posting works.',
        category: 'tech'
      })
    });

    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(data.post?.id).toBeTruthy();
  });

  it('should list all users', async () => {
    const res = await fetch(`${API_URL}/users`);
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(Array.isArray(data.users)).toBe(true);
    expect(data.count).toBeGreaterThan(0);
    
    const foundUser = data.users.find(u => u.username === testUser.username);
    expect(foundUser).toBeTruthy();
    console.log(`✓ Found user ${testUser.username} in user list`);
  });

  it('should get user profile', async () => {
    const res = await fetch(`${API_URL}/user?username=${encodeURIComponent(testUser.username)}`);
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.user?.username).toBe(testUser.username);
    expect(Array.isArray(data.posts)).toBe(true);
    expect(data.posts.length).toBeGreaterThan(0);
  });
});
