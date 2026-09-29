-- ==============================================================================
-- CupidXChat — Supabase Database Setup & Row Level Security (RLS)
-- Target: Supabase SQL Editor (supabase-emerald-garden)
-- ==============================================================================

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT,
    full_name TEXT,
    avatar_url TEXT,
    plan TEXT NOT NULL DEFAULT 'free', -- 'free' | 'premium'
    premium_expiry TIMESTAMPTZ,
    is_banned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL,
    payment_id TEXT,
    plan TEXT NOT NULL, -- 'weekly' | 'monthly' | 'yearly'
    amount INTEGER NOT NULL, -- in paise (e.g. 9900 = ₹99)
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'created', -- 'created' | 'paid' | 'failed'
    signature TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Reports Table
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'reviewed' | 'dismissed' | 'actioned'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Bans Table
CREATE TABLE IF NOT EXISTS public.bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    banned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ, -- NULL indicates a permanent ban
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_plan_expiry ON public.profiles(plan, premium_expiry);
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON public.profiles(is_banned);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON public.reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_bans_user_id ON public.bans(user_id);

-- 6. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bans ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies: PROFILES
-- Users can view their own profile
CREATE POLICY "Users can read own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Users can update basic profile fields (username, full_name, avatar_url)
-- Critical Rule: Users CANNOT update plan, premium_expiry, or is_banned.
CREATE POLICY "Users can update own basic profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND plan IS NOT DISTINCT FROM (SELECT p.plan FROM public.profiles p WHERE p.id = auth.uid())
        AND premium_expiry IS NOT DISTINCT FROM (SELECT p.premium_expiry FROM public.profiles p WHERE p.id = auth.uid())
        AND is_banned IS NOT DISTINCT FROM (SELECT p.is_banned FROM public.profiles p WHERE p.id = auth.uid())
    );

-- 8. RLS Policies: PAYMENTS
-- Users can read their own payment history; only server (service role) can insert/update payments
CREATE POLICY "Users can read own payments"
    ON public.payments
    FOR SELECT
    USING (auth.uid() = user_id);

-- 9. RLS Policies: REPORTS
-- Authenticated users can insert reports; users can read reports they filed
CREATE POLICY "Users can submit reports"
    ON public.reports
    FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can read reports they submitted"
    ON public.reports
    FOR SELECT
    USING (auth.uid() = reporter_id);

-- 10. RLS Policies: BANS
-- Users can view ban records concerning them; inserts/updates restricted to service role
CREATE POLICY "Users can view own ban status"
    ON public.bans
    FOR SELECT
    USING (auth.uid() = user_id);

-- 11. Trigger: Automatically create public.profiles row on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, full_name, avatar_url, plan, is_banned)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substring(NEW.id::text, 1, 8)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Anonymous'),
        NEW.raw_user_meta_data->>'avatar_url',
        'free',
        false
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
