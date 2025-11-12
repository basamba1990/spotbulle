// astroService.js - VERSION COMPLÈTE CORRIGÉE
import { supabase } from "../lib/supabase";

// Cache local pour éviter les appels répétitifs
const astroCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getAstroProfile(userId) {
  if (!userId) {
    console.error("❌ getAstroProfile: userId manquant");
    return null;
  }

  // Vérifier le cache
  const cacheKey = `astro_profile_${userId}`;
  const cached = astroCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log("📦 Retour du cache astro profile");
    return cached.data;
  }

  try {
    console.log("🔄 Récupération du profil astro pour:", userId);
    
    const { data, error } = await supabase
      .from("astro_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (error.code === "PGRST116") {
        // Aucun profil trouvé - normal pour un nouvel utilisateur
        console.log("📭 Aucun profil astrologique trouvé");
        return null;
      }
      console.error("❌ Erreur récupération profil astro:", error);
      throw new Error(`Erreur base de données: ${error.message}`);
    }

    // Mettre en cache
    if (data) {
      astroCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
    }

    return data;
  } catch (error) {
    console.error("❌ Exception dans getAstroProfile:", error);
    return null;
  }
}

export async function updateBirthData(userId, birthData) {
  if (!userId) throw new Error("User ID requis");
  
  try {
    console.log("📝 Mise à jour données naissance pour:", userId);
    
    // Valider les données
    if (!birthData.date || !birthData.place) {
      throw new Error("Date et lieu de naissance requis");
    }

    const updateData = {
      birth_date: birthData.date,
      birth_time: birthData.time || "12:00",
      birth_place: birthData.place,
      birth_data_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      console.error("❌ Erreur mise à jour données naissance:", error);
      throw new Error(`Erreur sauvegarde: ${error.message}`);
    }

    // Nettoyer le cache
    astroCache.delete(`astro_profile_${userId}`);
    
    console.log("✅ Données naissance mises à jour");
    return data;
  } catch (error) {
    console.error("❌ Exception dans updateBirthData:", error);
    throw error;
  }
}

export async function calculateAstroProfile(userId) {
  if (!userId) throw new Error("User ID requis");
  
  try {
    console.log("🔮 Déclenchement calcul profil astro pour:", userId);
    
    const { data, error } = await supabase.functions.invoke("calculate-astro-profile", {
      body: { user_id: userId }
    });

    if (error) {
      console.error("❌ Erreur calcul profil astro:", error);
      throw new Error(`Calcul astro échoué: ${error.message}`);
    }

    // Nettoyer le cache
    astroCache.delete(`astro_profile_${userId}`);
    
    console.log("✅ Calcul profil astro déclenché");
    return data;
  } catch (error) {
    console.error("❌ Exception dans calculateAstroProfile:", error);
    throw error;
  }
}

export async function triggerAdvancedMatching() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error("Utilisateur non authentifié");
    }

    console.log("💫 Déclenchement matching avancé pour:", user.id);
    
    const { data, error } = await supabase.functions.invoke("find-advanced-matches", {
      body: { user_id: user.id }
    });

    if (error) {
      console.error("❌ Erreur matching avancé:", error);
      throw new Error(`Matching échoué: ${error.message}`);
    }

    console.log("✅ Matching avancé déclenché");
    return data;
  } catch (error) {
    console.error("❌ Exception dans triggerAdvancedMatching:", error);
    throw error;
  }
}

export async function getAdvancedMatches() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error("Utilisateur non authentifié");
    }

    console.log("🔍 Récupération des matches avancés pour:", user.id);
    
    const { data, error } = await supabase
      .from("advanced_matches")
      .select(`
        *,
        user_b_id:profiles!advanced_matches_user_b_id_fkey(
          id,
          full_name,
          avatar_url,
          bio,
          passions,
          age_group,
          dominant_color
        )
      `)
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .order("overall_score", { ascending: false })
      .limit(10);

    if (error) {
      console.error("❌ Erreur récupération matches:", error);
      throw new Error(`Récupération matches échouée: ${error.message}`);
    }

    console.log(`✅ ${data?.length || 0} matches récupérés`);
    return data || [];
  } catch (error) {
    console.error("❌ Exception dans getAdvancedMatches:", error);
    throw error;
  }
}

export async function generateSymbolicProfile(userId) {
  if (!userId) throw new Error("User ID requis");
  
  try {
    console.log("🎨 Génération profil symbolique pour:", userId);
    
    const { data, error } = await supabase.functions.invoke("generate-symbolic-profile", {
      body: { user_id: userId }
    });

    if (error) {
      console.error("❌ Erreur génération profil symbolique:", error);
      throw new Error(`Génération symbolique échouée: ${error.message}`);
    }

    // Nettoyer le cache
    astroCache.delete(`astro_profile_${userId}`);
    
    console.log("✅ Profil symbolique généré");
    return data;
  } catch (error) {
    console.error("❌ Exception dans generateSymbolicProfile:", error);
    throw error;
  }
}

export async function getAstroBasedRecommendations() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error("Utilisateur non authentifié");
    }

    console.log("💡 Récupération recommandations astro pour:", user.id);
    
    const { data, error } = await supabase
      .from("project_recommendations")
      .select(`
        *,
        user_b_id:profiles!project_recommendations_user_b_id_fkey(
          id,
          full_name,
          avatar_url,
          bio
        )
      `)
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .order("match_score", { ascending: false })
      .limit(5);

    if (error) {
      console.error("❌ Erreur récupération recommandations:", error);
      // Retourner des recommandations par défaut plutôt que de throw
      return getFallbackRecommendations();
    }

    console.log(`✅ ${data?.length || 0} recommandations récupérées`);
    return data || getFallbackRecommendations();
  } catch (error) {
    console.error("❌ Exception dans getAstroBasedRecommendations:", error);
    return getFallbackRecommendations();
  }
}

// Recommandations de fallback
function getFallbackRecommendations() {
  return [
    {
      id: "fallback-1",
      recommended_project: "Interview Croisée",
      project_description: "Rencontrez un partenaire complémentaire pour une interview mutuelle qui révèlera vos talents cachés",
      category: "Interview",
      match_score: 0.85
    },
    {
      id: "fallback-2", 
      recommended_project: "Débat Thématique",
      project_description: "Explorez un sujet qui vous passionne avec un partenaire aux perspectives différentes",
      category: "Débat",
      match_score: 0.78
    }
  ];
}

// Nettoyer le cache
export function clearAstroCache(userId = null) {
  if (userId) {
    astroCache.delete(`astro_profile_${userId}`);
  } else {
    astroCache.clear();
  }
  console.log("🧹 Cache astro nettoyé");
}
