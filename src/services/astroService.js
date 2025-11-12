import { supabase } from "../lib/supabase";

/**
 * Service pour interagir avec les fonctionnalités astrologiques et de matching.
 */

/**
 * Récupère le profil astrologique avec les données utilisateur
 */
export async function getAstroProfile(userId) {
  try {
    console.log('🔄 Récupération du profil astro pour:', userId);
    
    // D'abord récupérer le profil astro
    const { data: astroProfile, error } = await supabase
      .from("astro_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("❌ Error fetching astro profile:", error);
      throw new Error(error.message);
    }

    if (!astroProfile) {
      console.log('ℹ️ Aucun profil astro trouvé');
      return null;
    }

    // Ensuite récupérer les données utilisateur séparément
    const { data: userProfile, error: userError } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, birth_date, birth_time, birth_place")
      .eq("id", userId)
      .maybeSingle();

    if (userError) {
      console.warn("⚠️ Erreur récupération profil utilisateur:", userError);
    }

    // Combiner les données
    const combinedData = {
      ...astroProfile,
      user: userProfile || {}
    };

    console.log('✅ Profil astro chargé:', combinedData.sun_sign);
    return combinedData;
  } catch (error) {
    console.error("❌ Error in getAstroProfile:", error);
    throw error;
  }
}

/**
 * Met à jour les données de naissance
 */
export async function updateBirthData(userId, birthData) {
  try {
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
      console.error("❌ Error updating birth data:", error);
      throw new Error(error.message);
    }

    // Déclencher le calcul astrologique
    try {
      const { data: triggerData, error: triggerError } = await supabase.functions.invoke("calculate-astro-profile", {
        body: { user_id: userId },
      });

      if (triggerError) {
        console.warn("⚠️ Astro calculation trigger failed:", triggerError);
      } else {
        console.log("✅ Astro calculation triggered:", triggerData);
      }
    } catch (triggerErr) {
      console.warn("⚠️ Could not trigger astro calculation:", triggerErr.message);
    }

    return data;
  } catch (error) {
    console.error("❌ Error in updateBirthData:", error);
    throw error;
  }
}

/**
 * Déclenche le matching avancé
 */
export async function triggerAdvancedMatching() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated.");
    }

    const { data, error } = await supabase.functions.invoke("find-advanced-matches", {
      body: { user_id: user.id },
    });

    if (error) {
      console.error("❌ Error triggering advanced matching:", error);
      throw new Error(error.message);
    }

    return data;
  } catch (error) {
    console.error("❌ Error in triggerAdvancedMatching:", error);
    throw error;
  }
}

/**
 * Récupère les matchs avancés
 */
export async function getAdvancedMatches() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated.");
    }

    const { data, error } = await supabase
      .from("advanced_matches")
      .select(`
        *,
        user_b_id:profiles!advanced_matches_user_b_id_fkey(
          id,
          full_name,
          avatar_url,
          passions,
          bio
        )
      `)
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .order("overall_score", { ascending: false });

    if (error) {
      console.error("❌ Error fetching advanced matches:", error);
      throw new Error(error.message);
    }

    return data || [];
  } catch (error) {
    console.error("❌ Error in getAdvancedMatches:", error);
    throw error;
  }
}
