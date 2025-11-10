-- Migration: 20251107000001_add_astro_trigger.sql

-- Fonction de trigger SIMPLIFIÉE (sans appel HTTP direct)
CREATE OR REPLACE FUNCTION public.trigger_astro_calculation_on_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Vérifier si les colonnes de naissance ont été modifiées
  IF (NEW.birth_date IS NOT NULL AND NEW.birth_time IS NOT NULL AND NEW.birth_place IS NOT NULL) AND
     (OLD.birth_date IS DISTINCT FROM NEW.birth_date OR
      OLD.birth_time IS DISTINCT FROM NEW.birth_time OR
      OLD.birth_place IS DISTINCT FROM NEW.birth_place)
  THEN
    -- Mettre à jour le timestamp pour indiquer que les données astro doivent être recalculées
    NEW.astro_data_updated_at = NOW();
    
    -- NOTE: Le calcul astrologique sera déclenché par l'application via l'Edge Function
    -- plutôt que par un appel HTTP direct depuis le trigger
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recréer le trigger
DROP TRIGGER IF EXISTS profile_update_trigger_astro ON public.profiles;
CREATE TRIGGER profile_update_trigger_astro
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_astro_calculation_on_profile_update();
