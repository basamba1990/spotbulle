-- Migration: 20251111000001_enhance_challenges_system.sql

-- 1. Table pour les exigences spécifiques des défis
CREATE TABLE IF NOT EXISTS challenge_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID REFERENCES spotbulle_challenges(id) ON DELETE CASCADE,
    requirement_type VARCHAR(100) NOT NULL, -- 'duration', 'skills', 'format', etc.
    requirement_value JSONB NOT NULL,
    is_optional BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table pour le suivi des vues et interactions des défis
CREATE TABLE IF NOT EXISTS challenge_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID REFERENCES spotbulle_challenges(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- 'view', 'click', 'share'
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table pour les badges et récompenses
CREATE TABLE IF NOT EXISTS challenge_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID REFERENCES spotbulle_challenges(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    icon_url TEXT,
    criteria JSONB NOT NULL, -- Conditions pour obtenir le badge
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table pour les badges attribués aux utilisateurs
CREATE TABLE IF NOT EXISTS user_challenge_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    badge_id UUID REFERENCES challenge_badges(id) ON DELETE CASCADE,
    challenge_id UUID REFERENCES spotbulle_challenges(id) ON DELETE CASCADE,
    awarded_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, badge_id, challenge_id)
);

-- 5. Amélioration de la table spotbulle_challenges (CORRIGÉE - ajout de is_active)
ALTER TABLE spotbulle_challenges 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(50) DEFAULT 'beginner',
ADD COLUMN IF NOT EXISTS reward_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_submissions_per_user INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS evaluation_criteria JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 6. Amélioration de la table challenge_submissions
ALTER TABLE challenge_submissions 
ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS evaluator_notes TEXT,
ADD COLUMN IF NOT EXISTS technical_score DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS creativity_score DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS communication_score DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS overall_score DECIMAL(3,2);

-- 7. Index pour les performances (CORRIGÉ)
CREATE INDEX IF NOT EXISTS idx_challenge_submissions_challenge_user 
ON challenge_submissions(challenge_id, user_id);

CREATE INDEX IF NOT EXISTS idx_challenge_submissions_status 
ON challenge_submissions(status);

-- Index corrigé : remplacement de 'score' par 'overall_score'
CREATE INDEX IF NOT EXISTS idx_challenge_submissions_overall_score 
ON challenge_submissions(overall_score DESC);

CREATE INDEX IF NOT EXISTS idx_spotbulle_challenges_active 
ON spotbulle_challenges(is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_challenge_requirements_challenge 
ON challenge_requirements(challenge_id);

-- 8. RLS pour les nouvelles tables
ALTER TABLE challenge_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_challenge_badges ENABLE ROW LEVEL SECURITY;

-- Politiques RLS
CREATE POLICY "Challenge requirements are viewable by all" 
ON challenge_requirements FOR SELECT USING (true);

CREATE POLICY "Challenge analytics can be inserted by anyone" 
ON challenge_analytics FOR INSERT WITH CHECK (true);

CREATE POLICY "Challenge badges are viewable by all" 
ON challenge_badges FOR SELECT USING (true);

CREATE POLICY "User badges are viewable by all" 
ON user_challenge_badges FOR SELECT USING (true);

CREATE POLICY "Users can view their own badge awards" 
ON user_challenge_badges FOR SELECT USING (auth.uid() = user_id);

-- 9. Vue pour les statistiques avancées des défis (CORRIGÉE)
CREATE OR REPLACE VIEW challenge_detailed_stats AS
SELECT 
    c.id,
    c.title,
    c.category,
    c.difficulty_level,
    COUNT(DISTINCT cs.user_id) as unique_participants,
    COUNT(cs.id) as total_submissions,
    AVG(cs.overall_score) as average_score,  -- Corrigé : score → overall_score
    MAX(cs.overall_score) as top_score,      -- Corrigé : score → overall_score
    COUNT(CASE WHEN cs.status = 'evaluated' THEN 1 END) as evaluated_count,
    COUNT(CASE WHEN cs.status = 'submitted' THEN 1 END) as pending_count
FROM spotbulle_challenges c
LEFT JOIN challenge_submissions cs ON c.id = cs.challenge_id
WHERE c.is_active = true
GROUP BY c.id, c.title, c.category, c.difficulty_level;

-- 10. Fonction utilitaire pour calculer le score global (OPTIONNEL)
CREATE OR REPLACE FUNCTION calculate_overall_score(
    technical DECIMAL(3,2),
    creativity DECIMAL(3,2), 
    communication DECIMAL(3,2)
)
RETURNS DECIMAL(3,2) AS $$
BEGIN
    -- Pondération : 40% technique, 35% créativité, 25% communication
    RETURN COALESCE(technical, 0) * 0.4 + 
           COALESCE(creativity, 0) * 0.35 + 
           COALESCE(communication, 0) * 0.25;
END;
$$ LANGUAGE plpgsql;

-- 11. Déclencheur pour mettre à jour automatiquement le overall_score (OPTIONNEL)
CREATE OR REPLACE FUNCTION update_overall_score()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.technical_score IS NOT NULL OR NEW.creativity_score IS NOT NULL OR NEW.communication_score IS NOT NULL THEN
        NEW.overall_score = calculate_overall_score(
            NEW.technical_score, 
            NEW.creativity_score, 
            NEW.communication_score
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_overall_score
    BEFORE INSERT OR UPDATE OF technical_score, creativity_score, communication_score
    ON challenge_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_overall_score();
