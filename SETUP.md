# Beacon Platform - Collaborative Editing Setup

One-time setup to enable real-time collaborative editing.

## Step 1: Create Supabase Project (Free)

1. Go to https://supabase.com and sign up (free tier)
2. Click "New Project"
3. Name it `beacon-platform`, set a password, choose region
4. Wait ~2 minutes for it to provision

## Step 2: Create the Database Table

1. In Supabase dashboard, go to **SQL Editor**
2. Paste this and click **Run**:

```sql
-- Version history for collaborative editing
-- Each save creates a new row (keeps full history)
CREATE TABLE page_versions (
  id SERIAL PRIMARY KEY,
  page TEXT NOT NULL,
  version_major INTEGER DEFAULT 1,
  version_minor INTEGER DEFAULT 0,
  content JSONB NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_page_versions_page ON page_versions(page, updated_at DESC);

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE page_versions;

-- Allow public read/write (simple setup - no auth required)
ALTER TABLE page_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON page_versions FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON page_versions FOR INSERT WITH CHECK (true);
```

## Step 3: Get Your API Keys

1. Go to **Settings** > **API**
2. Copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (the long string)

## Step 4: Configure Beacon

1. Open `config.js` in the beacon-platform folder
2. Paste your URL and key:

```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_KEY = 'your-anon-key-here';
```

## Done!

Open `index.html` in a browser. You'll see an **Edit** button.
- Click Edit to modify content
- Click Save to publish changes
- Everyone with the link sees updates in real-time
