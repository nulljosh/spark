import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseKey)

serve(async (req) => {
  try {
    // Create users table
    await supabase.rpc('sql_exec', {
      query: `create table if not exists users (
        id bigint generated always as identity primary key,
        user_id text unique not null,
        username text unique not null,
        email text,
        password_salt text not null,
        password_hash text not null,
        created_at timestamptz default now()
      )`
    }).then(r => {
      if (r.error && !r.error.message.includes('already exists')) throw r.error
    }).catch(() => {})

    // Create posts table
    await supabase.rpc('sql_exec', {
      query: `create table if not exists posts (
        id text primary key,
        title text not null,
        content text not null,
        category text default 'tech',
        author_username text not null,
        author_user_id text not null,
        score integer default 0,
        created_at timestamptz default now()
      )`
    }).then(r => {
      if (r.error && !r.error.message.includes('already exists')) throw r.error
    }).catch(() => {})

    // Create indexes
    await supabase.rpc('sql_exec', {
      query: `create index if not exists idx_users_username on users(username);
               create index if not exists idx_posts_score on posts(score desc);
               create index if not exists idx_posts_created on posts(created_at desc)`
    }).catch(() => {})

    return new Response(JSON.stringify({ success: true, message: 'Schema initialized' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
