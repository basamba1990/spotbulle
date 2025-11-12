-- CORRECTION COMPLÈTE DES POLITIQUES RLS SANS DOUBLONS

-- 1. SUPPRESSION SÉLECTIVE DES POLITIQUES EXISTANTES (si nécessaire)
DROP POLICY IF EXISTS "Anyone can view seminars" ON seminars;
DROP POLICY IF EXISTS "Only admins can manage seminars" ON seminars;
DROP POLICY IF EXISTS "Users can view own seminar inscriptions" ON seminar_inscriptions;
DROP POLICY IF EXISTS "Users can create own seminar inscriptions" ON seminar_inscriptions;
DROP POLICY IF EXISTS "Users can view own certifications" ON certifications;
DROP POLICY IF EXISTS "Only admins can manage certifications" ON certifications;

-- 2. ACTIVATION RLS POUR LES TABLES
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'seminar_inscriptions' AND rowsecurity = true) THEN
        ALTER TABLE seminar_inscriptions ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'seminars' AND rowsecurity = true) THEN
        ALTER TABLE seminars ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'certifications' AND rowsecurity = true) THEN
        ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- 3. CRÉATION CONDITIONNELLE DES POLITIQUES SEMINARS
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view seminars' AND tablename = 'seminars') THEN
        CREATE POLICY "Anyone can view seminars" ON seminars FOR SELECT USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Only admins can manage seminars' AND tablename = 'seminars') THEN
        CREATE POLICY "Only admins can manage seminars" ON seminars FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- 4. CRÉATION CONDITIONNELLE DES POLITIQUES SEMINAR_INSCRIPTIONS
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own seminar inscriptions' AND tablename = 'seminar_inscriptions') THEN
        CREATE POLICY "Users can view own seminar inscriptions" ON seminar_inscriptions FOR SELECT USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create own seminar inscriptions' AND tablename = 'seminar_inscriptions') THEN
        CREATE POLICY "Users can create own seminar inscriptions" ON seminar_inscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- 5. CRÉATION CONDITIONNELLE DES POLITIQUES CERTIFICATIONS
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own certifications' AND tablename = 'certifications') THEN
        CREATE POLICY "Users can view own certifications" ON certifications FOR SELECT USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Only admins can manage certifications' AND tablename = 'certifications') THEN
        CREATE POLICY "Only admins can manage certifications" ON certifications FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- 6. VÉRIFICATION ET CORRECTION DES POLITIQUES ASTRO_PROFILES
DO $$ 
BEGIN
    -- Vérifier si RLS est activé sur astro_profiles
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'astro_profiles' AND rowsecurity = true) THEN
        ALTER TABLE astro_profiles ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Supprimer les politiques existantes problématiques
    DROP POLICY IF EXISTS "Users can view own astro profile" ON astro_profiles;
    DROP POLICY IF EXISTS "Users can manage own astro profile" ON astro_profiles;
    DROP POLICY IF EXISTS "Service role can manage all astro profiles" ON astro_profiles;
    
    -- Recréer les politiques
    CREATE POLICY "Users can view own astro profile" ON astro_profiles FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY "Users can manage own astro profile" ON astro_profiles FOR ALL USING (auth.uid() = user_id);
    CREATE POLICY "Service role can manage all astro profiles" ON astro_profiles FOR ALL USING (auth.role() = 'service_role');
    
END $$;

-- 7. VÉRIFICATION DES VUES
DROP VIEW IF EXISTS public.video_details CASCADE;
DROP VIEW IF EXISTS public.challenge_detailed_stats CASCADE;
DROP VIEW IF EXISTS public.astro_system_stats CASCADE;
DROP VIEW IF EXISTS public.enriched_profiles CASCADE;

CREATE VIEW public.video_details WITH (security_invoker = true) AS 
SELECT v.*, p.full_name, p.avatar_url 
FROM videos v 
LEFT JOIN profiles p ON v.user_id = p.id;

CREATE VIEW public.challenge_detailed_stats WITH (security_invoker = true) AS 
SELECT c.*, COUNT(cs.id) as submission_count
FROM spotbulle_challenges c
LEFT JOIN challenge_submissions cs ON c.id = cs.challenge_id
GROUP BY c.id;

CREATE VIEW public.astro_system_stats WITH (security_invoker = true) AS 
SELECT COUNT(*) as total_profiles, 
       AVG(EXTRACT(EPOCH FROM (calculated_at - created_at))) as avg_calculation_time
FROM astro_profiles;

CREATE VIEW public.enriched_profiles WITH (security_invoker = true) AS 
SELECT p.*, ap.sun_sign, ap.moon_sign, ap.rising_sign
FROM profiles p
LEFT JOIN astro_profiles ap ON p.id = ap.user_id;
