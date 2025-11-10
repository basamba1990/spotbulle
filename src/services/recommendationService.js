import { supabase } from "../utils/supabaseClient";

/**
 * Service pour interagir avec le système de recommandation de projets.
 */

/**
 * Déclenche la génération des recommandations de projets communs.
 * @returns {Promise<object>} Le résultat de l'appel à la fonction.
 */
export async function triggerProjectRecommendations() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated.");
  }

  const { data, error } = await supabase.functions.invoke("generate-project-recommendations", {
    body: { user_id: user.id },
  });

  if (error) {
    console.error("Error triggering project recommendations:", error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Récupère les recommandations de projets pour l'utilisateur.
 * @returns {Promise<Array<object>>} La liste des recommandations.
 */
export async function getProjectRecommendations() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated.");
  }

  // Utiliser la RLS pour ne récupérer que les recommandations qui concernent l'utilisateur
  const { data, error } = await supabase
    .from("project_recommendations")
    .select("*, user_b_id(*)") // Sélectionner aussi les données du profil matché
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
    .order("match_score", { ascending: false });

  if (error) {
    console.error("Error fetching project recommendations:", error);
    throw new Error(error.message);
  }

  return data;
}
