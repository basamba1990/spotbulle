import { supabase } from "../lib/supabase";

/**
 * Service pour interagir avec les fonctionnalités astrologiques et de matching.
 */

/**
 * Met à jour les données de naissance de l'utilisateur dans la table 'profiles'.
 * Cette action déclenchera le calcul du profil astrologique via un trigger Supabase.
 */
export async function updateBirthData(userId, birthData) {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      birth_date: birthData.date,
      birth_time: birthData.time,
      birth_place: birthData.place,
      birth_data_updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select();

  if (error) {
    console.error("Error updating birth data:", error);
    throw new Error(error.message);
  }

  // Déclencher le calcul astrologique
  try {
    const { data: triggerData, error: triggerError } = await supabase.functions.invoke("calculate-astro-profile", {
      body: { user_id: userId },
    });

    if (triggerError) {
      console.warn("Astro calculation trigger failed:", triggerError);
    } else {
      console.log("Astro calculation triggered:", triggerData);
    }
  } catch (triggerErr) {
    console.warn("Could not trigger astro calculation:", triggerErr.message);
  }

  return data;
}

/**
 * Récupère le profil astrologique de l'utilisateur.
 */
export async function getAstroProfile(userId) {
  const { data, error } = await supabase
    .from("astro_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching astro profile:", error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Déclenche le calcul de matching avancé via une fonction Supabase.
 */
export async function triggerAdvancedMatching() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated.");
  }

  const { data, error } = await supabase.functions.invoke("find-advanced-matches", {
    body: { user_id: user.id },
  });

  if (error) {
    console.error("Error triggering advanced matching:", error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Récupère les résultats de matching avancé pour l'utilisateur.
 */
export async function getAdvancedMatches() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated.");
  }

  const { data, error } = await supabase
    .from("advanced_matches")
    .select("*, user_b_id:profiles!advanced_matches_user_b_id_fkey(*)")
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
    .order("overall_score", { ascending: false });

  if (error) {
    console.error("Error fetching advanced matches:", error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Génère le profil symbolique via IA
 */
export async function generateSymbolicProfile(userId) {
  const { data, error } = await supabase.functions.invoke("generate-symbolic-profile", {
    body: { user_id: userId },
  });

  if (error) {
    console.error("Error generating symbolic profile:", error);
    throw new Error(error.message);
  }

  return data;
}
