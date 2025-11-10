-- Migration: 20251107000000_add_astro_matching_tables.sql

-- 1. Table pour les profils astrologiques
CREATE TABLE IF NOT EXISTS astro_profiles (
    user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
    sun_sign VARCHAR(50),
    moon_sign VARCHAR(50),
    rising_sign VARCHAR(50),
    planetary_positions JSONB,
    houses_data JSONB,
    archetype_profile JSONB,
    astro_embedding VECTOR(1536),
    symbolic_profile_text TEXT,
    symbolic_phrase TEXT,
    symbolic_archetype TEXT,
    symbolic_color TEXT,
    birth_data JSONB,
    calculation_source VARCHAR(50) DEFAULT 'api',
    is_mock BOOLEAN DEFAULT false,
    calculated_at TIMESTAMPTZ,
    embedding_generated_at TIMESTAMPTZ,
    symbolic_generated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supprimer les politiques existantes si elles existent
DROP POLICY IF EXISTS "Users can view all astro profiles" ON astro_profiles;
DROP POLICY IF EXISTS "Users can insert their own astro profile" ON astro_profiles;
DROP POLICY IF EXISTS "Users can update their own astro profile" ON astro_profiles;

-- RLS pour astro_profiles
ALTER TABLE astro_profiles ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir leur propre profil et ceux des autres (pour le matching)
CREATE POLICY "Users can view all astro profiles"
ON astro_profiles FOR SELECT
USING (true);

CREATE POLICY "Users can insert their own astro profile"
ON astro_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own astro profile"
ON astro_profiles FOR UPDATE
USING (auth.uid() = user_id);

-- 2. Table pour le matching avancé
CREATE TABLE IF NOT EXISTS advanced_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id UUID REFERENCES auth.users(id) NOT NULL,
    user_b_id UUID REFERENCES auth.users(id) NOT NULL,
    vector_similarity DECIMAL(4,3),
    astro_compatibility DECIMAL(4,3),
    overall_score DECIMAL(4,3) NOT NULL,
    match_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE (user_a_id, user_b_id),
    CONSTRAINT check_different_users CHECK (user_a_id <> user_b_id)
);

-- Supprimer les politiques existantes si elles existent
DROP POLICY IF EXISTS "Users can view their own matches" ON advanced_matches;
DROP POLICY IF EXISTS "Matches can be inserted by authenticated users" ON advanced_matches;

-- RLS pour advanced_matches
ALTER TABLE advanced_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own matches"
ON advanced_matches FOR SELECT
USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "Matches can be inserted by authenticated users"
ON advanced_matches FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- 3. Table pour les recommandations de projets
CREATE TABLE IF NOT EXISTS project_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id UUID REFERENCES auth.users(id) NOT NULL,
    user_b_id UUID REFERENCES auth.users(id) NOT NULL,
    match_score REAL NOT NULL,
    recommended_project TEXT NOT NULL,
    project_description TEXT,
    reasoning JSONB,
    category VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE (user_a_id, user_b_id),
    CONSTRAINT check_different_users_rec CHECK (user_a_id <> user_b_id)
);

-- Supprimer les politiques existantes si elles existent
DROP POLICY IF EXISTS "Users can view their own recommendations" ON project_recommendations;

-- RLS pour project_recommendations
ALTER TABLE project_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recommendations"
ON project_recommendations FOR SELECT
USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- 4. Création d'index pour accélérer les recherches
CREATE INDEX IF NOT EXISTS idx_advanced_matches_user_a ON advanced_matches (user_a_id);
CREATE INDEX IF NOT EXISTS idx_advanced_matches_user_b ON advanced_matches (user_b_id);
CREATE INDEX IF NOT EXISTS idx_advanced_matches_score ON advanced_matches (overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_project_recommendations_user_a ON project_recommendations (user_a_id);
CREATE INDEX IF NOT EXISTS idx_project_recommendations_user_b ON project_recommendations (user_b_id);
CREATE INDEX IF NOT EXISTS idx_project_recommendations_score ON project_recommendations (match_score DESC);

-- 5. Ajout des colonnes de naissance à la table profiles existante
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'birth_date') THEN
        ALTER TABLE profiles ADD COLUMN birth_date DATE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'birth_time') THEN
        ALTER TABLE profiles ADD COLUMN birth_time TIME;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name
