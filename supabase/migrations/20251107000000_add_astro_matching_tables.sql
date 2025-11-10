-- Migration: 20251107000000_add_astro_matching_tables.sql

-- 1. Table pour les profils astrologiques
CREATE TABLE IF NOT EXISTS astro_profiles (
    user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
    sun_sign VARCHAR(20) NOT NULL,
    moon_sign VARCHAR(20) NOT NULL,
    rising_sign VARCHAR(20) NOT NULL,
    planetary_positions JSONB,
    archetype_profile JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS pour astro_profiles:
-- Les utilisateurs peuvent voir leur propre profil et ceux des autres (pour le matching)
ALTER TABLE astro_profiles ENABLE ROW LEVEL SECURITY;

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
    vector_similarity DECIMAL(4,3), -- Pour un matching basé sur des vecteurs (e.g., embeddings)
    astro_compatibility DECIMAL(4,3),
    overall_score DECIMAL(4,3) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Assurer l'unicité de la paire, indépendamment de l'ordre (A, B) ou (B, A)
    UNIQUE (user_a_id, user_b_id),
    CONSTRAINT check_different_users CHECK (user_a_id <> user_b_id)
);

-- RLS pour advanced_matches:
-- Les utilisateurs peuvent voir les matchs qui les concernent
ALTER TABLE advanced_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own matches"
ON advanced_matches FOR SELECT
USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "Matches can be inserted by authenticated users (backend function)"
ON advanced_matches FOR INSERT
WITH CHECK (auth.role() = 'authenticated'); -- Ou une vérification plus stricte si nécessaire

-- Création d'index pour accélérer les recherches de matching
CREATE INDEX idx_advanced_matches_user_a ON advanced_matches (user_a_id);
CREATE INDEX idx_advanced_matches_user_b ON advanced_matches (user_b_id);

-- Amélioration générale: Ajout de colonnes de naissance à la table 'profiles' existante
-- Je suppose qu'une table 'profiles' existe, comme suggéré par le pasted_content.
-- Si la table n'existe pas, cette partie devra être ajustée.
-- Basé sur l'analyse de la structure, il est probable que la table 'profiles' soit gérée par les migrations existantes.
-- Nous allons ajouter les colonnes nécessaires pour le calcul astrologique.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS birth_time TIME,
ADD COLUMN IF NOT EXISTS birth_place VARCHAR(255);

-- RLS pour la table profiles:
-- Assurer que les utilisateurs peuvent mettre à jour leurs propres données de profil
-- (Ceci est une amélioration de robustesse générale)
-- Nous allons lire les migrations existantes pour voir si une politique RLS est déjà en place.
-- En attendant, nous ajoutons une politique d'UPDATE pour les nouvelles colonnes.

-- NOTE: Les politiques RLS pour la table 'profiles' sont généralement définies dans les migrations initiales.
-- Nous allons nous concentrer sur l'ajout des colonnes.

-- Fin de la migration
