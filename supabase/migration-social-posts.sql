-- =============================================================================
-- YRSF Social Media & Content Hub Migration
-- =============================================================================
-- Stores drafts, scheduled posts, and published social media posts across
-- Instagram, TikTok, Facebook, etc., and integrates with Zapier Webhooks.

CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    caption TEXT NOT NULL,
    media_urls JSONB DEFAULT '[]'::jsonb, -- Array of image/video URLs
    platforms JSONB DEFAULT '["instagram", "tiktok"]'::jsonb, -- Targeted platforms
    yacht_id UUID REFERENCES boats(id) ON DELETE SET NULL, -- Optional link to specific yacht
    scheduled_for TIMESTAMPTZ, -- When post should go live (or went live)
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
    zapier_response JSONB, -- Logs response from Zapier webhook dispatch
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying calendar dates and queue status
CREATE INDEX IF NOT EXISTS idx_social_posts_status_date ON social_posts(status, scheduled_for);

-- Enable Row Level Security (RLS)
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- Policies for admin access
CREATE POLICY "Admin full access on social_posts"
    ON social_posts FOR ALL
    USING (true)
    WITH CHECK (true);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_social_posts_updated_at ON social_posts;
CREATE TRIGGER update_social_posts_updated_at
    BEFORE UPDATE ON social_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Add default Zapier webhook setting into site_settings if not exists
INSERT INTO site_settings (key, value)
VALUES ('zapier_social_webhook', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;
