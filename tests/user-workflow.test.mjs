import { describe, it, expect, beforeAll } from 'vitest';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

const ideaTemplates = [
  { title: 'Collaborative coding whiteboard', content: 'Real-time code editor with integrated design tools. Pair programming for architecture, with visual diagrams that compile to code.', category: 'tech' },
  { title: 'Personal carbon footprint tracker', content: 'Log flights, purchases, energy use. Get weekly insights and offsets. Gamified with friends. Carbon-negative by design.', category: 'sustainability' },
  { title: 'AI recipe generator from fridge contents', content: 'Take a photo of your fridge. Get recipe suggestions ranked by simplicity. Integrate with grocery delivery APIs.', category: 'productivity' },
  { title: 'Decentralized task marketplace', content: 'Post micro-tasks (design, writing, coding). Get bids instantly. Pay with crypto/stablecoins. Zero middleman.', category: 'business' },
  { title: 'Mental health chatbot with local LLM', content: 'Privacy-first therapy companion. Runs entirely on your device. No cloud, no logs, no surveillance.', category: 'health' },
  { title: 'Podcast transcript + AI notes + highlights', content: 'Auto-transcribe from RSS feeds. Extract key moments. Generate study notes. Export to Obsidian.', category: 'productivity' },
  { title: 'Stock sentiment analyzer from social', content: 'Track mentions across Reddit, Twitter, Discord. Correlate with price action. Alert on unusual sentiment spikes.', category: 'finance' },
  { title: 'Habit stacking accountability group', content: 'Build tiny habits with friends. Daily check-ins via SMS. Win streaks unlock rewards.', category: 'health' },
  { title: 'Dynamic pricing engine for creators', content: 'Gumroad alternative. ML-based price optimization per customer. Recover revenue from price-sensitive users.', category: 'business' },
  { title: 'Browser history search with local embeddings', content: 'Full-text search across your entire browsing history. No cloud, instant results. Find that article from months ago.', category: 'productivity' },
  { title: 'Real estate arbitrage alerter', content: 'Monitor listings for price drops. Alert on undervalued properties. Auto-generate comp analysis.', category: 'finance' },
  { title: 'Ambient music for deep work', content: 'Generative ambient audio with binaural beats. Adapts to your typing speed and breaks.', category: 'productivity' },
  { title: 'Code review as a service (AI)', content: 'Drop a GitHub PR link. Get instant feedback on security, performance, style. Runs offline ONNX models.', category: 'tech' },
  { title: 'Meal prep optimizer for macros', content: 'Input your macros. Get weekly meal plans. Auto-generate shopping lists. Minimize waste.', category: 'health' },
  { title: 'API gateway for small teams', content: 'Open-source rate limiting, auth, logging. Deploy anywhere. Own your traffic.', category: 'tech' }
];

let authToken = null;
let testUsername = null;

describe('Spark User Workflow', () => {
  beforeAll(async () => {
    testUsername = `spark_${Date.now()}`;
    const signupRes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUsername,
        email: `${testUsername}@test.com`,
        password: 'TestPass123!@'
      })
    });
    const data = await signupRes.json();
    authToken = data.token;
    console.log(`Created test user: ${testUsername}`);
  });

  it('should post 15 ideas', async () => {
    const posted = [];
    for (const idea of ideaTemplates) {
      const res = await fetch(`${API_URL}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify(idea)
      });
      const data = await res.json();
      if (data.post?.id) posted.push(data.post.id);
    }
    expect(posted.length).toBe(15);
  });

  it('should verify all 15 posts on feed', async () => {
    const res = await fetch(`${API_URL}/posts`);
    const data = await res.json();
    const userPosts = data.posts.filter(p => p.author?.username === testUsername);
    expect(userPosts.length).toBe(15);
    console.log(`✓ ${testUsername} has 15 posts on live feed`);
  });
});
