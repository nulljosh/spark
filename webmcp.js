// WebMCP tool registration for Sparkjar. Exposes the idea board to in-browser
// agents via document.modelContext.
//
// ponytail: tools call the same /api routes app.html calls, with the same
// bearer token out of localStorage. Nothing here reimplements the API.
(function () {
    const mc = document.modelContext;
    if (!mc?.registerTool) return; // browser without WebMCP support

    const token = () => localStorage.getItem('spark_token');

    async function call(path, init = {}) {
        const headers = { ...(init.headers || {}) };
        if (init.body) headers['Content-Type'] = 'application/json';
        const t = token();
        if (t) headers.Authorization = 'Bearer ' + t;
        const res = await fetch(path, { ...init, headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { error: data.error || `${path} -> ${res.status}` };
        return data;
    }

    const POST_ID = { type: 'string', description: 'Post id from search_ideas' };

    const TOOLS = [
        // ---- read-only ---------------------------------------------------
        {
            name: 'search_ideas',
            description: 'List ideas on the board, newest first. Filter client-side by category or a text query.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Match against title and content' },
                    category: { type: 'string', description: 'Only this category' },
                    limit: { type: 'number', description: 'Max results (default 25)' },
                    offset: { type: 'number', description: 'Skip this many before filtering' }
                }
            },
            execute: async ({ query, category, limit = 25, offset } = {}) => {
                const params = new URLSearchParams();
                if (offset) params.set('offset', offset);
                params.set('limit', Math.max(limit, 100));
                const data = await call('/api/posts?' + params);
                if (data.error) return data;
                let posts = data.posts || [];
                if (category) posts = posts.filter(p => p.category === category);
                if (query) {
                    const q = query.toLowerCase();
                    posts = posts.filter(p =>
                        (p.title || '').toLowerCase().includes(q) ||
                        (p.content || '').toLowerCase().includes(q));
                }
                return { total: posts.length, posts: posts.slice(0, limit) };
            }
        },
        {
            name: 'get_idea',
            description: 'Get one idea by id, with its comments.',
            inputSchema: { type: 'object', properties: { id: POST_ID }, required: ['id'] },
            execute: async ({ id }) => {
                const [{ posts = [] }, comments] = await Promise.all([
                    call('/api/posts?limit=500'),
                    call('/api/comments?post_id=' + encodeURIComponent(id))
                ]);
                const post = posts.find(p => String(p.id) === String(id));
                if (!post) return { error: `No idea with id "${id}"` };
                return { ...post, comments: comments.comments || comments };
            }
        },
        {
            name: 'get_comments',
            description: 'Get the comments on one idea.',
            inputSchema: { type: 'object', properties: { id: POST_ID }, required: ['id'] },
            execute: ({ id }) => call('/api/comments?post_id=' + encodeURIComponent(id))
        },
        {
            name: 'get_notifications',
            description: 'Get the signed-in user\'s notifications.',
            inputSchema: { type: 'object', properties: {} },
            execute: () => call('/api/notifications')
        },
        {
            name: 'whoami',
            description: 'Get the signed-in user, or report that nobody is signed in.',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => {
                if (!token()) return { signedIn: false };
                const user = JSON.parse(localStorage.getItem('spark_user') || 'null');
                return { signedIn: true, user };
            }
        },

        // ---- reversible state changes ------------------------------------
        {
            name: 'vote_idea',
            description: 'Upvote or downvote an idea. Voting again changes the vote.',
            inputSchema: {
                type: 'object',
                properties: {
                    id: POST_ID,
                    voteType: { type: 'string', enum: ['up', 'down'], description: 'Direction to vote' }
                },
                required: ['id', 'voteType']
            },
            execute: ({ id, voteType }) =>
                call(`/api/posts/${encodeURIComponent(id)}/vote`, { method: 'POST', body: JSON.stringify({ voteType }) })
        },
        {
            name: 'post_comment',
            description: 'Comment on an idea. Visible to everyone on the board.',
            inputSchema: {
                type: 'object',
                properties: { id: POST_ID, content: { type: 'string', description: 'Comment text' } },
                required: ['id', 'content']
            },
            execute: ({ id, content }) =>
                call('/api/comments', { method: 'POST', body: JSON.stringify({ post_id: id, content }) })
        },

        // ---- consequential ------------------------------------------------
        {
            name: 'submit_idea',
            description: 'Publish a new idea to the board under the signed-in user\'s name. Public and visible to everyone.',
            requiresConfirmation: true,
            inputSchema: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Idea title, max 200 characters' },
                    content: { type: 'string', description: 'Idea body, max 5000 characters' },
                    category: { type: 'string', description: 'Category to file it under' },
                    linked_repo: { type: 'string', description: 'Optional http(s) repo URL' }
                },
                required: ['title', 'content']
            },
            execute: (body) => call('/api/posts', { method: 'POST', body: JSON.stringify(body) })
        },
        {
            name: 'delete_idea',
            description: 'Permanently delete one of the signed-in user\'s own ideas.',
            requiresConfirmation: true,
            inputSchema: { type: 'object', properties: { id: POST_ID }, required: ['id'] },
            execute: ({ id }) => call('/api/posts/' + encodeURIComponent(id), { method: 'DELETE' })
        }
    ];

    (async () => {
        for (const tool of TOOLS) {
            try { await mc.registerTool(tool); }
            catch (err) { console.warn('[webmcp] failed to register', tool.name, err?.message); }
        }
    })();
})();
