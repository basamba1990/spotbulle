-- Migration: 20251111000002_enhance_astro_system.sql

-- 1. Table pour le cache des calculs de compatibilité
CREATE TABLE IF NOT EXISTS compatibility_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_b_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    compatibility_scores JSONB NOT NULL,
    analysis_details JSONB,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    
    UNIQUE(user_a_id, user_b_id),
    CONSTRAINT check_different_users_comp CHECK (user_a_id <> user_b_id)
);

-- 2. Table pour les historiques de calcul astrologique
CREATE TABLE IF NOT EXISTS astro_calculation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    calculation_type VARCHAR(100) NOT NULL,
    input_data JSONB,
    output_data JSONB,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table pour les préférences astrologiques utilisateur
CREATE TABLE IF NOT EXISTS user_astro_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    preferred_zodiac_type VARCHAR(50) DEFAULT 'tropical',
    include_houses BOOLEAN DEFAULT true,
    include_aspects BOOLEAN DEFAULT true,
    language VARCHAR(10) DEFAULT 'fr',
    notification_new_matches BOOLEAN DEFAULT true,
    notification_compatibility_updates BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Amélioration de la table astro_profiles
ALTER TABLE astro_profiles 
ADD COLUMN IF NOT EXISTS calculation_metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS data_source VARCHAR(100) DEFAULT 'rapidapi',
ADD COLUMN IF NOT EXISTS accuracy_confidence DECIMAL(3,2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

-- 5. Index pour les performances
CREATE INDEX IF NOT EXISTS idx_compatibility_cache_users 
ON compatibility_cache(user_a_id, user_b_id);

CREATE INDEX IF NOT EXISTS idx_compatibility_cache_expires 
ON compatibility_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_astro_calculation_logs_user 
ON astro_calculation_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_astro_profiles_calculated 
ON astro_profiles(calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_astro_profiles_embedding 
ON astro_profiles USING ivfflat (astro_embedding vector_cosine_ops);

-- 6. RLS pour les nouvelles tables
ALTER TABLE compatibility_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE astro_calculation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_astro_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own compatibility cache" 
ON compatibility_cache FOR SELECT 
USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "Users can view their own calculation logs" 
ON astro_calculation_logs FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own astro preferences" 
ON user_astro_preferences FOR ALL 
USING (auth.uid() = user_id);

-- 7. Fonction pour nettoyer le cache expiré
CREATE OR REPLACE FUNCTION cleanup_expired_compatibility_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM compatibility_cache 
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 8. Vue pour les statistiques astrologiques avancées
CREATE OR REPLACE VIEW astro_system_stats AS
SELECT 
    COUNT(DISTINCT ap.user_id) as total_users_with_astro,
    COUNT(DISTINCT CASE WHEN ap.calculated_at IS NOT NULL THEN ap.user_id END) as users_with_calculations,
    COUNT(DISTINCT am.user_a_id) as users_with_matches,
    AVG(am.overall_score) as average_match_score,
    MAX(ap.calculated_at) as latest_calculation,
    COUNT(DISTINCT cc.id) as cached_compatibilities
FROM astro_profiles ap
LEFT JOIN advanced_matches am ON ap.user_id = am.user_a_id OR ap.user_id = am.user_b_id
LEFT JOIN compatibility_cache cc ON ap.user_id = cc.user_a_id OR ap.user_id = cc.user_b_id;
