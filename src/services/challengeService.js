import { supabase } from "../lib/supabase";

/**
 * Service complet pour interagir avec le module SpotBulle Challenges
 * Version réelle sans simulation avec gestion avancée
 */

/**
 * Récupère la liste de tous les défis avec filtres et pagination
 * @param {Object} options - Options de filtrage et pagination
 * @returns {Promise<Array<object>>} La liste des défis avec métadonnées
 */
export async function getChallenges(options = {}) {
  try {
    const {
      category = null,
      difficulty = null,
      isActive = true,
      page = 1,
      limit = 20,
      search = null
    } = options;

    let query = supabase
      .from("spotbulle_challenges")
      .select(`
        *,
        created_by:profiles(full_name, avatar_url),
        submissions:challenge_submissions(count),
        user_submission:challenge_submissions!inner(
          id,
          score,
          status,
          submission_date
        )
      `, { count: 'exact' });

    // Filtres
    if (category) {
      query = query.eq('category', category);
    }
    
    if (difficulty) {
      query = query.eq('difficulty_level', difficulty);
    }
    
    if (isActive !== null) {
      query = query.eq('is_active', isActive);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Pagination et tri
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error("❌ Error fetching challenges:", error);
      throw new Error(`Erreur lors de la récupération des défis: ${error.message}`);
    }

    // Enrichir les données avec des statistiques en temps réel
    const challengesWithStats = await Promise.all(
      (data || []).map(async (challenge) => {
        const stats = await getChallengeStats(challenge.id);
        return {
          ...challenge,
          participant_count: stats.participant_count,
          average_score: stats.average_score,
          top_score: stats.top_score,
          has_user_participated: challenge.user_submission && challenge.user_submission.length > 0,
          user_submission: challenge.user_submission?.[0] || null
        };
      })
    );

    return {
      challenges: challengesWithStats,
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit)
      }
    };

  } catch (error) {
    console.error("❌ Error in getChallenges:", error);
    throw error;
  }
}

/**
 * Récupère les statistiques d'un défi spécifique
 * @param {string} challengeId - L'ID du défi
 * @returns {Promise<object>} Les statistiques du défi
 */
export async function getChallengeStats(challengeId) {
  try {
    const { data, error } = await supabase
      .from('challenge_submissions')
      .select(`
        score,
        user_id
      `)
      .eq('challenge_id', challengeId)
      .eq('status', 'submitted');

    if (error) throw error;

    const participant_count = new Set(data?.map(sub => sub.user_id)).size;
    const scores = data?.map(sub => sub.score).filter(score => score !== null) || [];
    const average_score = scores.length > 0 ? 
      scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const top_score = scores.length > 0 ? Math.max(...scores) : 0;

    return {
      participant_count,
      average_score: Math.round(average_score * 100) / 100,
      top_score: Math.round(top_score * 100) / 100,
      submission_count: data?.length || 0
    };

  } catch (error) {
    console.error("❌ Error fetching challenge stats:", error);
    return {
      participant_count: 0,
      average_score: 0,
      top_score: 0,
      submission_count: 0
    };
  }
}

/**
 * Récupère un défi spécifique avec tous ses détails
 * @param {string} challengeId - L'ID du défi
 * @returns {Promise<object>} Le défi complet
 */
export async function getChallengeById(challengeId) {
  try {
    const { data: challenge, error } = await supabase
      .from("spotbulle_challenges")
      .select(`
        *,
        created_by:profiles(full_name, avatar_url, bio),
        requirements:challenge_requirements(*)
      `)
      .eq('id', challengeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Défi non trouvé');
      }
      throw error;
    }

    // Récupérer les statistiques
    const stats = await getChallengeStats(challengeId);
    
    // Récupérer les meilleures soumissions
    const topSubmissions = await getChallengeLeaderboard(challengeId, 5);

    return {
      ...challenge,
      stats,
      top_submissions: topSubmissions
    };

  } catch (error) {
    console.error("❌ Error fetching challenge by ID:", error);
    throw new Error(`Erreur lors de la récupération du défi: ${error.message}`);
  }
}

/**
 * Soumet une vidéo à un défi avec validation avancée
 * @param {string} challengeId - L'ID du défi
 * @param {string} videoId - L'ID de la vidéo soumise
 * @param {object} submissionData - Données supplémentaires de soumission
 * @returns {Promise<object>} Le résultat de la soumission
 */
export async function submitChallenge(challengeId, videoId, submissionData = {}) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Utilisateur non authentifié.");
    }

    // Vérifier que le défi existe et est actif
    const { data: challenge, error: challengeError } = await supabase
      .from("spotbulle_challenges")
      .select("id, title, is_active, start_date, end_date")
      .eq("id", challengeId)
      .single();

    if (challengeError || !challenge) {
      throw new Error("Défi non trouvé.");
    }

    if (!challenge.is_active) {
      throw new Error("Ce défi n'est plus actif.");
    }

    // Vérifier les dates du défi
    const now = new Date();
    if (challenge.start_date && new Date(challenge.start_date) > now) {
      throw new Error("Ce défi n'a pas encore commencé.");
    }

    if (challenge.end_date && new Date(challenge.end_date) < now) {
      throw new Error("Ce défi est terminé.");
    }

    // Vérifier que la vidéo existe et appartient à l'utilisateur
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, title, duration, status, user_id")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      throw new Error("Vidéo non trouvée.");
    }

    if (video.user_id !== user.id) {
      throw new Error("Cette vidéo ne vous appartient pas.");
    }

    if (video.status !== 'analyzed') {
      throw new Error("La vidéo doit être analysée avant de pouvoir être soumise.");
    }

    // Vérifier si l'utilisateur a déjà soumis une vidéo pour ce défi
    const { data: existingSubmission, error: existingError } = await supabase
      .from("challenge_submissions")
      .select("id, status")
      .eq("challenge_id", challengeId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') {
      throw new Error("Erreur lors de la vérification des soumissions existantes.");
    }

    if (existingSubmission) {
      throw new Error("Vous avez déjà soumis une vidéo pour ce défi.");
    }

    // Créer la soumission
    const submissionPayload = {
      challenge_id: challengeId,
      user_id: user.id,
      video_id: videoId,
      status: 'submitted',
      submission_date: new Date().toISOString(),
      ...submissionData
    };

    const { data, error } = await supabase
      .from("challenge_submissions")
      .upsert(submissionPayload, { 
        onConflict: "challenge_id,user_id",
        ignoreDuplicates: false 
      })
      .select(`
        *,
        challenge:spotbulle_challenges(title, category),
        video:videos(title, duration, thumbnail_url, public_url)
      `)
      .single();

    if (error) {
      console.error("❌ Error submitting challenge:", error);
      throw new Error(`Erreur lors de la soumission: ${error.message}`);
    }

    // Déclencher l'évaluation automatique si configuré
    try {
      await evaluateSubmission(data.id);
    } catch (evalError) {
      console.warn("⚠️ L'évaluation automatique a échoué:", evalError.message);
      // Ne pas bloquer la soumission si l'évaluation échoue
    }

    return {
      ...data,
      message: "Votre vidéo a été soumise avec succès !"
    };

  } catch (error) {
    console.error("❌ Error in submitChallenge:", error);
    throw error;
  }
}

/**
 * Évalue automatiquement une soumission de défi
 * @param {string} submissionId - L'ID de la soumission
 * @returns {Promise<object>} Résultat de l'évaluation
 */
export async function evaluateSubmission(submissionId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Non authentifié");

    // Récupérer les données de la soumission
    const { data: submission, error: subError } = await supabase
      .from("challenge_submissions")
      .select(`
        *,
        challenge:spotbulle_challenges(*),
        video:videos(*)
      `)
      .eq("id", submissionId)
      .single();

    if (subError) throw subError;

    // Vérifier que l'utilisateur a le droit d'évaluer cette soumission
    if (submission.user_id !== user.id) {
      throw new Error("Vous n'avez pas l'autorisation d'évaluer cette soumission.");
    }

    // Appeler l'Edge Function pour l'évaluation IA
    const { data: evalResult, error: evalError } = await supabase.functions.invoke(
      'evaluate-challenge-submission',
      {
        body: {
          submission_id: submissionId,
          challenge_id: submission.challenge_id,
          video_id: submission.video_id
        }
      }
    );

    if (evalError) throw evalError;

    // Mettre à jour la soumission avec le score et le feedback
    const { data: updatedSubmission, error: updateError } = await supabase
      .from("challenge_submissions")
      .update({
        score: evalResult.score,
        feedback: evalResult.feedback,
        evaluated_at: new Date().toISOString(),
        status: 'evaluated'
      })
      .eq("id", submissionId)
      .select()
      .single();

    if (updateError) throw updateError;

    return updatedSubmission;

  } catch (error) {
    console.error("❌ Error evaluating submission:", error);
    
    // Marquer la soumission comme échouée en cas d'erreur
    await supabase
      .from("challenge_submissions")
      .update({
        status: 'evaluation_failed',
        feedback: { error: error.message }
      })
      .eq("id", submissionId);

    throw new Error(`Évaluation échouée: ${error.message}`);
  }
}

/**
 * Récupère les soumissions de l'utilisateur pour un défi donné
 * @param {string} challengeId - L'ID du défi
 * @returns {Promise<object>} La soumission de l'utilisateur
 */
export async function getUserSubmission(challengeId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Utilisateur non authentifié.");
    }

    const { data, error } = await supabase
      .from("challenge_submissions")
      .select(`
        *,
        challenge:spotbulle_challenges(title, description, category),
        video:videos(
          id,
          title,
          description,
          duration,
          thumbnail_url,
          public_url,
          transcription_text,
          analysis,
          performance_score
        )
      `)
      .eq("challenge_id", challengeId)
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("❌ Error fetching user submission:", error);
      throw new Error(`Erreur lors de la récupération de la soumission: ${error.message}`);
    }

    return data || null;

  } catch (error) {
    console.error("❌ Error in getUserSubmission:", error);
    throw error;
  }
}

/**
 * Récupère toutes les soumissions d'un utilisateur
 * @param {Object} options - Options de filtrage
 * @returns {Promise<Array<object>>} Les soumissions de l'utilisateur
 */
export async function getUserSubmissions(options = {}) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Utilisateur non authentifié.");
    }

    const { status = null, limit = 50 } = options;

    let query = supabase
      .from("challenge_submissions")
      .select(`
        *,
        challenge:spotbulle_challenges(
          id,
          title,
          description,
          category,
          difficulty_level,
          is_active
        ),
        video:videos(
          id,
          title,
          thumbnail_url,
          public_url,
          duration
        )
      `)
      .eq("user_id", user.id)
      .order("submission_date", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error("❌ Error fetching user submissions:", error);
      throw new Error(`Erreur lors de la récupération des soumissions: ${error.message}`);
    }

    return data || [];

  } catch (error) {
    console.error("❌ Error in getUserSubmissions:", error);
    throw error;
  }
}

/**
 * Récupère le classement d'un défi
 * @param {string} challengeId - L'ID du défi
 * @param {number} limit - Nombre maximum d'entrées
 * @returns {Promise<Array<object>>} Le classement
 */
export async function getChallengeLeaderboard(challengeId, limit = 10) {
  try {
    const { data, error } = await supabase
      .from("challenge_submissions")
      .select(`
        id,
        score,
        submission_date,
        user:profiles(
          id,
          full_name,
          avatar_url
        ),
        video:videos(
          title,
          thumbnail_url
        )
      `)
      .eq("challenge_id", challengeId)
      .eq("status", "evaluated")
      .not("score", "is", null)
      .order("score", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("❌ Error fetching leaderboard:", error);
      throw new Error(`Erreur lors de la récupération du classement: ${error.message}`);
    }

    return data || [];

  } catch (error) {
    console.error("❌ Error in getChallengeLeaderboard:", error);
    throw error;
  }
}

/**
 * Met à jour une soumission (statut, score, feedback)
 * @param {string} submissionId - L'ID de la soumission
 * @param {object} updates - Les modifications à apporter
 * @returns {Promise<object>} La soumission mise à jour
 */
export async function updateSubmission(submissionId, updates) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Utilisateur non authentifié.");
    }

    // Vérifier que l'utilisateur est propriétaire de la soumission
    const { data: existingSubmission, error: checkError } = await supabase
      .from("challenge_submissions")
      .select("user_id")
      .eq("id", submissionId)
      .single();

    if (checkError) {
      throw new Error("Soumission non trouvée.");
    }

    if (existingSubmission.user_id !== user.id) {
      throw new Error("Vous n'avez pas l'autorisation de modifier cette soumission.");
    }

    const { data, error } = await supabase
      .from("challenge_submissions")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("id", submissionId)
      .select(`
        *,
        challenge:spotbulle_challenges(title),
        video:videos(title)
      `)
      .single();

    if (error) {
      console.error("❌ Error updating submission:", error);
      throw new Error(`Erreur lors de la mise à jour: ${error.message}`);
    }

    return data;

  } catch (error) {
    console.error("❌ Error in updateSubmission:", error);
    throw error;
  }
}

/**
 * Supprime une soumission
 * @param {string} submissionId - L'ID de la soumission
 * @returns {Promise<boolean>} Succès de la suppression
 */
export async function deleteSubmission(submissionId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Utilisateur non authentifié.");
    }

    // Vérifier que l'utilisateur est propriétaire de la soumission
    const { data: existingSubmission, error: checkError } = await supabase
      .from("challenge_submissions")
      .select("user_id")
      .eq("id", submissionId)
      .single();

    if (checkError) {
      throw new Error("Soumission non trouvée.");
    }

    if (existingSubmission.user_id !== user.id) {
      throw new Error("Vous n'avez pas l'autorisation de supprimer cette soumission.");
    }

    const { error } = await supabase
      .from("challenge_submissions")
      .delete()
      .eq("id", submissionId);

    if (error) {
      console.error("❌ Error deleting submission:", error);
      throw new Error(`Erreur lors de la suppression: ${error.message}`);
    }

    return true;

  } catch (error) {
    console.error("❌ Error in deleteSubmission:", error);
    throw error;
  }
}

/**
 * Récupère les catégories de défis disponibles
 * @returns {Promise<Array<string>>} Liste des catégories
 */
export async function getChallengeCategories() {
  try {
    const { data, error } = await supabase
      .from("spotbulle_challenges")
      .select("category")
      .eq("is_active", true)
      .not("category", "is", null);

    if (error) {
      console.error("❌ Error fetching categories:", error);
      return [];
    }

    const categories = [...new Set(data.map(item => item.category))].filter(Boolean);
    return categories;

  } catch (error) {
    console.error("❌ Error in getChallengeCategories:", error);
    return [];
  }
}

/**
 * Récupère les défis recommandés pour un utilisateur
 * @param {number} limit - Nombre maximum de recommandations
 * @returns {Promise<Array<object>>} Défis recommandés
 */
export async function getRecommendedChallenges(limit = 5) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      // Retourner les défis populaires si non connecté
      return getPopularChallenges(limit);
    }

    // Récupérer le profil et les compétences de l'utilisateur
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("skills, interests")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.warn("⚠️ Could not fetch user profile for recommendations");
      return getPopularChallenges(limit);
    }

    // Construire la requête basée sur les compétences et intérêts
    let query = supabase
      .from("spotbulle_challenges")
      .select(`
        *,
        created_by:profiles(full_name, avatar_url),
        submissions:challenge_submissions(count)
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Filtrer par compétences si disponibles
    const userSkills = profile?.skills || [];
    const userInterests = profile?.interests || [];

    if (userSkills.length > 0 || userInterests.length > 0) {
      const searchTerms = [...userSkills, ...userInterests];
      query = query.or(
        `category.in.(${searchTerms.join(',')}),title.ilike.%${searchTerms[0]}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("❌ Error fetching recommended challenges:", error);
      return getPopularChallenges(limit);
    }

    return data || [];

  } catch (error) {
    console.error("❌ Error in getRecommendedChallenges:", error);
    return getPopularChallenges(limit);
  }
}

/**
 * Récupère les défis les plus populaires
 * @param {number} limit - Nombre maximum de défis
 * @returns {Promise<Array<object>>} Défis populaires
 */
export async function getPopularChallenges(limit = 5) {
  try {
    const { data, error } = await supabase
      .from("spotbulle_challenges")
      .select(`
        *,
        created_by:profiles(full_name, avatar_url),
        submissions:challenge_submissions(count)
      `)
      .eq("is_active", true)
      .order("submissions(count)", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("❌ Error fetching popular challenges:", error);
      return [];
    }

    return data || [];

  } catch (error) {
    console.error("❌ Error in getPopularChallenges:", error);
    return [];
  }
}

export default {
  getChallenges,
  getChallengeById,
  getChallengeStats,
  submitChallenge,
  evaluateSubmission,
  getUserSubmission,
  getUserSubmissions,
  getChallengeLeaderboard,
  updateSubmission,
  deleteSubmission,
  getChallengeCategories,
  getRecommendedChallenges,
  getPopularChallenges
};
