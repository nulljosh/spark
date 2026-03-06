-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- Adds password reset token support to users table

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
