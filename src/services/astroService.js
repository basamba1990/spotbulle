import { supabase } from "../utils/supabaseClient";

/**
 * Service pour interagir avec les fonctionnalités astrologiques et de matching.
 */

/**
 * Met à jour les données de naissance de l'utilisateur dans la table 'profiles'.
 * Cette action déclenchera le calcul du profil astrologique via un trigger Supabase.
 * @param {string} userId - L'ID de l'utilisateur.
 * @param {object} birthData - Les données de naissance (date, time, place).
 * @returns {Promise<object>} Le résultat de la mise à jour.
 */
export async function updateBirthData(userId, birthData) {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      birth_date: birthData.date,
      birth_time: birthData.time,
      birth_place: birthData.place,
    })
    .eq("id", userId)
    .select();

  if (error) {
    console.error("Error updating birth data:", error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Récupère le profil astrologique de l'utilisateur.
 * @param {string} userId - L'ID de l'utilisateur.
 * @returns {Promise<object>} Le profil astrologique.
 */
export async function getAstroProfile(userId) {
  const { data, error } = await supabase
    .from("astro_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") { // PGRST116 = No rows found
    console.error("Error fetching astro profile:", error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Déclenche le calcul de matching avancé via une fonction Supabase.
 * @returns {Promise<object>} Le résultat de l'appel à la fonction.
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
 * @returns {Promise<Array<object>>} La liste des matchs.
 */
export async function getAdvancedMatches() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated.");
  }

  // Utiliser la RLS pour ne récupérer que les matchs qui concernent l'utilisateur
  const { data, error } = await supabase
    .from("advanced_matches")
    .select("*, user_b_id(*)") // Sélectionner aussi les données du profil matché (si RLS le permet)
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
    .order("overall_score", { ascending: false });

  if (error) {
    console.error("Error fetching advanced matches:", error);
    throw new Error(error.message);
  }

  return data;
}
