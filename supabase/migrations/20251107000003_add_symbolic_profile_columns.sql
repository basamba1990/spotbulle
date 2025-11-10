-- Migration: 20251107000003_add_symbolic_profile_columns.sql

-- Ajout des colonnes pour stocker le profil symbolique généré par GPT-4
ALTER TABLE public.astro_profiles
ADD COLUMN IF NOT EXISTS symbolic_profile_text TEXT,
ADD COLUMN IF NOT EXISTS symbolic_phrase TEXT,
ADD COLUMN IF NOT EXISTS symbolic_archetype TEXT,
ADD COLUMN IF NOT EXISTS symbolic_color TEXT;

-- Création d'une fonction pour mettre à jour le timestamp de la table profiles
-- (Utile pour déclencher la fonction de génération de profil symbolique si nécessaire)
CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ajout d'un trigger pour la mise à jour du timestamp
CREATE OR REPLACE TRIGGER profiles_updated_at_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_profiles_updated_at();
