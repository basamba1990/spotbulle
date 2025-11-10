-- Migration: 20251107000001_add_astro_trigger.sql

-- 1. Créer la fonction de trigger
CREATE OR REPLACE FUNCTION public.trigger_astro_calculation_on_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Vérifier si les colonnes de naissance ont été modifiées ou si elles sont nouvellement définies
  IF (NEW.birth_date IS NOT NULL AND NEW.birth_time IS NOT NULL AND NEW.birth_place IS NOT NULL) AND
     (OLD.birth_date IS DISTINCT FROM NEW.birth_date OR
      OLD.birth_time IS DISTINCT FROM NEW.birth_time OR
      OLD.birth_place IS DISTINCT FROM NEW.birth_place)
  THEN
    -- Appeler la fonction Supabase Edge Function via un webhook
    -- Le chemin est /functions/v1/{function_name}
    PERFORM net.http_post(
      url := 'http://host.docker.internal:54321/functions/v1/trigger-astro-calculation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('request.jwt.claim.aud', true)
      ),
      body := jsonb_build_object('record', NEW)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Créer le trigger sur la table 'profiles'
-- Ce trigger s'exécute APRÈS une mise à jour de la ligne.
CREATE OR REPLACE TRIGGER profile_update_trigger_astro
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_astro_calculation_on_profile_update();

-- NOTE IMPORTANTE: L'URL 'http://host.docker.internal:54321' est utilisée pour les appels
-- de fonction à fonction dans l'environnement local Supabase. En production,
-- il faudrait utiliser l'URL de l'API Gateway de Supabase.
-- Pour un déploiement standard, l'appel direct à la fonction Deno est souvent préféré
-- ou l'utilisation d'un système de queue pour les tâches asynchrones.
-- Nous utilisons ici le pattern de webhook pour la démonstration.
