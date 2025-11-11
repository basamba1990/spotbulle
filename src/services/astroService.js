import { supabase } from "../lib/supabase";

/**
 * Service pour interagir avec les fonctionnalités astrologiques et de matching.
 * Version corrigée avec gestion robuste des erreurs.
 */

/**
 * Met à jour les données de naissance de l'utilisateur.
 */
export async function updateBirthData(userId, birthData) {
  console.log("📝 Updating birth data for user:", userId);
  
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
      throw new Error(`Erreur mise à jour données: ${error.message}`);
    }

    console.log("✅ Birth data updated successfully");

    // Déclencher le calcul astrologique
    try {
      console.log("🚀 Triggering astro calculation...");
      const { data: triggerData, error: triggerError } = await supabase.functions.invoke("calculate-astro-profile", {
        body: { user_id: userId },
      });

      if (triggerError) {
        console.warn("⚠️ Astro calculation trigger warning:", triggerError.message);
        // Ne pas throw ici - l'utilisateur peut continuer
      } else {
        console.log("✅ Astro calculation triggered:", triggerData);
      }
    } catch (triggerErr) {
      console.warn("⚠️ Could not trigger astro calculation:", triggerErr.message);
      // Ne pas throw ici - l'utilisateur peut continuer
    }

    return data;
  } catch (error) {
    console.error("❌ Failed to update birth data:", error);
    throw error;
  }
}

/**
 * Récupère le profil astrologique de l'utilisateur avec gestion d'erreur robuste.
 */
export async function getAstroProfile(userId) {
  console.log("🔍 Fetching astro profile for user:", userId);
  
  try {
    const { data, error } = await supabase
      .from("astro_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(); // Utiliser maybeSingle au lieu de single

    if (error) {
      // Si c'est juste "no rows", c'est normal (pas de profil encore)
      if (error.code === 'PGRST116' || error.message?.includes('No rows found')) {
        console.log("ℹ️ No astro profile found for user:", userId);
        return null;
      }
      console.error("❌ Error fetching astro profile:", error);
      throw new Error(`Erreur récupération profil: ${error.message}`);
    }

    console.log("✅ Astro profile found:", data ? "Yes" : "No");
    return data;
  } catch (error) {
    console.error("❌ Failed to fetch astro profile:", error);
    // Retourner null au lieu de throw pour éviter de bloquer l'interface
    return null;
  }
}

/**
 * Déclenche le calcul de matching avancé.
 */
export async function triggerAdvancedMatching() {
  console.log("🎯 Triggering advanced matching...");
  
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Utilisateur non authentifié");
    }

    const { data, error } = await supabase.functions.invoke("find-advanced-matches", {
      body: { user_id: user.id },
    });

    if (error) {
      console.error("❌ Error triggering matching:", error);
      throw new Error(`Erreur matching: ${error.message}`);
    }

    console.log("✅ Advanced matching triggered successfully");
    return data;
  } catch (error) {
    console.error("❌ Failed to trigger matching:", error);
    throw error;
  }
}

/**
 * Récupère les résultats de matching avancé.
 */
export async function getAdvancedMatches() {
  console.log("🔍 Fetching advanced matches...");
  
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Utilisateur non authentifié");
    }

    const { data, error } = await supabase
      .from("advanced_matches")
      .select("*, user_b_id:profiles!advanced_matches_user_b_id_fkey(id, full_name, avatar_url)")
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .order("overall_score", { ascending: false });

    if (error) {
      console.error("❌ Error fetching matches:", error);
      throw new Error(`Erreur récupération matchs: ${error.message}`);
    }

    console.log(`✅ Found ${data?.length || 0} matches`);
    return data || [];
  } catch (error) {
    console.error("❌ Failed to fetch matches:", error);
    // Retourner tableau vide au lieu de throw
    return [];
  }
}

/**
 * Génère le profil symbolique via IA.
 */
export async function generateSymbolicProfile(userId) {
  console.log("🎨 Generating symbolic profile for user:", userId);
  
  try {
    const { data, error } = await supabase.functions.invoke("generate-symbolic-profile", {
      body: { user_id: userId },
    });

    if (error) {
      console.error("❌ Error generating symbolic profile:", error);
      throw new Error(`Erreur génération profil: ${error.message}`);
    }

    console.log("✅ Symbolic profile generated successfully");
    return data;
  } catch (error) {
    console.error("❌ Failed to generate symbolic profile:", error);
    throw error;
  }
}

/**
 * Vérifie si l'utilisateur a un profil astrologique.
 */
export async function hasAstroProfile(userId) {
  try {
    const profile = await getAstroProfile(userId);
    return !!profile;
  } catch (error) {
    console.error("❌ Error checking astro profile:", error);
    return false;
  }
}

/**
 * Récupère les recommandations de projets.
 */
export async function getProjectRecommendations() {
  console.log("💡 Fetching project recommendations...");
  
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Utilisateur non authentifié");
    }

    const { data, error } = await supabase
      .from("project_recommendations")
      .select("*, user_b_id:profiles!project_recommendations_user_b_id_fkey(id, full_name, avatar_url)")
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .order("match_score", { ascending: false })
      .limit(5);

    if (error) {
      console.error("❌ Error fetching recommendations:", error);
      throw new Error(`Erreur récupération recommandations: ${error.message}`);
    }

    console.log(`✅ Found ${data?.length || 0} recommendations`);
    return data || [];
  } catch (error) {
    console.error("❌ Failed to fetch recommendations:", error);
    return [];
  }
}
