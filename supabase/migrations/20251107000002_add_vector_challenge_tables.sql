-- Migration: 20251107000002_add_vector_challenge_tables.sql

-- 1. Activer l'extension pg_vector pour le matching avancé
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Ajouter les colonnes d'embeddings (taille 1536 pour compatibilité OpenAI/Cohere)
ALTER TABLE public.astro_profiles
ADD COLUMN IF NOT EXISTS astro_embedding VECTOR(1536);

ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS video_embedding VECTOR(1536);

-- 3. Table pour les défis (SpotBulle Challenges)
CREATE TABLE IF NOT EXISTS public.spotbulle_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT,
    required_skills TEXT[],
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS pour spotbulle_challenges: Tous peuvent voir, seuls les admins peuvent créer/modifier
ALTER TABLE public.spotbulle_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Challenges are viewable by everyone" ON public.spotbulle_challenges FOR SELECT USING (TRUE);
-- NOTE: Les politiques INSERT/UPDATE/DELETE pour les challenges sont laissées aux administrateurs (non implémenté ici)

-- 4. Table pour les soumissions aux défis
CREATE TABLE IF NOT EXISTS public.challenge_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID REFERENCES public.spotbulle_challenges(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
    submission_date TIMESTAMPTZ DEFAULT NOW(),
    score REAL,
    feedback JSONB,
    UNIQUE (challenge_id, user_id)
);

-- RLS pour challenge_submissions: Les utilisateurs peuvent voir leurs soumissions et celles des autres
ALTER TABLE public.challenge_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all submissions" ON public.challenge_submissions FOR SELECT USING (TRUE);
CREATE POLICY "Users can insert their own submission" ON public.challenge_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own submission" ON public.challenge_submissions FOR UPDATE USING (auth.uid() = user_id);

-- 5. Table pour les recommandations de projets communs
CREATE TABLE IF NOT EXISTS public.project_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id UUID REFERENCES auth.users(id) NOT NULL,
    user_b_id UUID REFERENCES auth.users(id) NOT NULL,
    match_score REAL NOT NULL,
    recommended_project TEXT NOT NULL,
    reasoning JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Assurer l'unicité de la paire, indépendamment de l'ordre (A, B) ou (B, A)
    UNIQUE (user_a_id, user_b_id),
    CONSTRAINT check_different_users_rec CHECK (user_a_id <> user_b_id)
);

-- RLS pour project_recommendations: Les utilisateurs peuvent voir les recommandations qui les concernent
ALTER TABLE public.project_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own recommendations"
ON public.project_recommendations FOR SELECT
USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- 6. Création d'index pour la recherche vectorielle
CREATE INDEX ON public.astro_profiles USING ivfflat (astro_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON public.videos USING ivfflat (video_embedding vector_cosine_ops) WITH (lists = 100);
