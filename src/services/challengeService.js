import { supabase } from "../lib/supabase";

/**
 * Service pour interagir avec le module SpotBulle Challenges.
 */

/**
 * Récupère la liste de tous les défis avec les données associées
 */
export async function getChallenges() {
  try {
    console.log('🔄 Récupération des défis...');
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated.");
    }

    // Requête corrigée avec des jointures séparées
    const { data: challenges, error } = await supabase
      .from("spotbulle_challenges")
      .select(`
        *,
        created_by:profiles!spotbulle_challenges_created_by_fkey(full_name, avatar_url)
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Error fetching challenges:", error);
      throw new Error(error.message);
    }

    // Récupérer les soumissions et statistiques séparément
    const challengesWithDetails = await Promise.all(
      (challenges || []).map(async (challenge) => {
        // Compter les soumissions
        const { count: submissionsCount, error: countError } = await supabase
          .from("challenge_submissions")
          .select("*", { count: "exact", head: true })
          .eq("challenge_id", challenge.id);

        if (countError) {
          console.warn("Error counting submissions:", countError);
        }

        // Vérifier la soumission de l'utilisateur
        const { data: userSubmission, error: submissionError } = await supabase
          .from("challenge_submissions")
          .select("id, score, status, submission_date")
          .eq("challenge_id", challenge.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (submissionError && submissionError.code !== "PGRST116") {
          console.warn("Error fetching user submission:", submissionError);
        }

        return {
          ...challenge,
          submissions_count: submissionsCount || 0,
          user_submission: userSubmission || null
        };
      })
    );

    console.log(`✅ ${challengesWithDetails.length} défis chargés`);
    return challengesWithDetails;
  } catch (error) {
    console.error("❌ Error in getChallenges:", error);
    throw error;
  }
}

/**
 * Récupère les vidéos de l'utilisateur pour les défis
 */
export async function getUserVideosForChallenges() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated.");
    }

    console.log('🔄 Récupération des vidéos utilisateur...');

    const { data, error } = await supabase
      .from("videos")
      .select("id, title, created_at, duration, status")
      .eq("user_id", user.id)
      .in("status", ["analyzed", "published", "completed"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Error fetching user videos:", error);
      throw new Error(error.message);
    }

    console.log(`✅ ${data?.length || 0} vidéos trouvées`);
    return data || [];
  } catch (error) {
    console.error("❌ Error in getUserVideosForChallenges:", error);
    throw error;
  }
}

/**
 * Soumet une vidéo à un défi
 */
export async function submitChallenge(challengeId, videoId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated.");
    }

    console.log('🚀 Soumission du défi:', { challengeId, videoId, userId: user.id });

    // Vérifier que la vidéo appartient à l'utilisateur
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, user_id")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (videoError || !video) {
      throw new Error("Vidéo non trouvée ou accès non autorisé");
    }

    // Vérifier que le défi existe et est actif
    const { data: challenge, error: challengeError } = await supabase
      .from("spotbulle_challenges")
      .select("id, is_active, end_date")
      .eq("id", challengeId)
      .eq("is_active", true)
      .single();

    if (challengeError || !challenge) {
      throw new Error("Défi non trouvé ou inactif");
    }

    // Vérifier la date de fin
    if (challenge.end_date && new Date(challenge.end_date) < new Date()) {
      throw new Error("Ce défi est terminé");
    }

    // Créer la soumission
    const { data, error } = await supabase
      .from("challenge_submissions")
      .upsert(
        {
          challenge_id: challengeId,
          user_id: user.id,
          video_id: videoId,
          status: "submitted",
          submission_date: new Date().toISOString(),
        },
        { 
          onConflict: "challenge_id,user_id",
          ignoreDuplicates: false 
        }
      )
      .select()
      .single();

    if (error) {
      console.error("❌ Error submitting challenge:", error);
      throw new Error(error.message);
    }

    console.log('✅ Défi soumis avec succès:', data);
    return data;
  } catch (error) {
    console.error("❌ Error in submitChallenge:", error);
    throw error;
  }
}

/**
 * Récupère les soumissions de l'utilisateur pour un défi
 */
export async function getUserSubmission(challengeId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated.");
    }

    const { data, error } = await supabase
      .from("challenge_submissions")
      .select(`
        *,
        videos(title, thumbnail_url)
      `)
      .eq("challenge_id", challengeId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching user submission:", error);
      throw new Error(error.message);
    }

    return data;
  } catch (error) {
    console.error("Error in getUserSubmission:", error);
    throw error;
  }
}
