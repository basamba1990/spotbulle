import { supabase } from "../lib/supabase"; // ✅ CORRECTION : "../lib/supabase" au lieu de "../utils/supabaseClient"

/**
 * Service pour interagir avec le module SpotBulle Challenges.
 */

/**
 * Récupère la liste de tous les défis.
 * @returns {Promise<Array<object>>} La liste des défis.
 */
export async function getChallenges() {
  const { data, error } = await supabase
    .from("spotbulle_challenges")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching challenges:", error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Soumet une vidéo à un défi.
 * @param {string} challengeId - L'ID du défi.
 * @param {string} videoId - L'ID de la vidéo soumise.
 * @returns {Promise<object>} Le résultat de la soumission.
 */
export async function submitChallenge(challengeId, videoId) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated.");
  }

  const { data, error } = await supabase
    .from("challenge_submissions")
    .upsert(
      {
        challenge_id: challengeId,
        user_id: user.id,
        video_id: videoId,
      },
      { onConflict: ["challenge_id", "user_id"] }
    )
    .select()
    .single();

  if (error) {
    console.error("Error submitting challenge:", error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Récupère les soumissions de l'utilisateur pour un défi donné.
 * @param {string} challengeId - L'ID du défi.
 * @returns {Promise<object>} La soumission de l'utilisateur.
 */
export async function getUserSubmission(challengeId) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated.");
  }

  const { data, error } = await supabase
    .from("challenge_submissions")
    .select("*, videos(title, thumbnail_url)")
    .eq("challenge_id", challengeId)
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") { // PGRST116 = No rows found
    console.error("Error fetching user submission:", error);
    throw new Error(error.message);
  }

  return data;
}
