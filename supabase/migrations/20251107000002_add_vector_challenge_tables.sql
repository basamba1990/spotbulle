-- Migration: 20251107000002_add_vector_challenge_tables.sql

-- 1. Activer l'extension pg_vector pour le matching avancé
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Table pour les défis (SpotBulle Challenges)
CREATE TABLE IF NOT EXISTS public.spotbulle_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT,
    required_skills TEXT[],
    difficulty_level VARCHAR(50) DEFAULT 'beginner',
    is_active BOOLEAN DEFAULT true,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supprimer les politiques existantes
DROP POLICY IF EXISTS "Challenges are viewable by everyone" ON public.spotbulle_challenges;

-- RLS pour spotbulle_challenges
ALTER TABLE public.spotbulle_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Challenges are viewable by everyone" ON public.spotbulle_challenges FOR SELECT USING (TRUE);

-- 3. Table pour les soumissions aux défis
CREATE TABLE IF NOT EXISTS public.challenge_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID REFERENCES public.spotbulle_challenges(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
    submission_date TIMESTAMPTZ DEFAULT NOW(),
    score REAL,
    feedback JSONB,
    status VARCHAR(50) DEFAULT 'submitted',
    UNIQUE (challenge_id, user_id)
);

-- Supprimer les politiques existantes
DROP POLICY IF EXISTS "Users can view all submissions" ON public.challenge_submissions;
DROP POLICY IF EXISTS "Users can insert their own submission" ON public.challenge_submissions;
DROP POLICY IF EXISTS "Users can update their own submission" ON public.challenge_submissions;

-- RLS pour challenge_submissions
ALTER TABLE public.challenge_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all submissions" ON public.challenge_submissions FOR SELECT USING (TRUE);
CREATE POLICY "Users can insert their own submission" ON public.challenge_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own submission" ON public.challenge_submissions FOR UPDATE USING (auth.uid() = user_id);

-- 4. Index pour les recherches
CREATE INDEX IF NOT EXISTS idx_spotbulle_challenges_active ON public.spotbulle_challenges (is_active, category);
CREATE INDEX IF NOT EXISTS idx_spotbulle_challenges_dates ON public.spotbulle_challenges (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_challenge_submissions_user ON public.challenge_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_submissions_challenge ON public.challenge_submissions (challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_submissions_status ON public.challenge_submissions (status);

-- 5. Vue pour les statistiques des défis - CORRECTION : utiliser la colonne correcte
CREATE OR REPLACE VIEW public.challenge_stats AS
SELECT 
    c.id as challenge_id,
    c.title,
    c.category,
    COUNT(DISTINCT cs.user_id) as participant_count,
    AVG(cs.score) as average_score,
    MAX(cs.score) as top_score
FROM public.spotbulle_challenges c
LEFT JOIN public.challenge_submissions cs ON c.id = cs.challenge_id
-- CORRECTION : Utiliser la colonne qui existe vraiment
WHERE c.is_active = true
GROUP BY c.id, c.title, c.category;
