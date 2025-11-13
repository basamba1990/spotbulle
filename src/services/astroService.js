import { supabase } from "../lib/supabase";

export async function getAstroProfile(userId) {
  try {
    const { data, error } = await supabase
      .from("astro_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(); // Utiliser maybeSingle() pour éviter les erreurs 406

    if (error) {
      if (error.code === "PGRST116" || error.code === "406") {
        // Aucun profil trouvé - c'est normal pour un nouveau utilisateur
        console.log("Aucun profil astrologique trouvé pour l'utilisateur:", userId);
        return null;
      }
      console.error("Error fetching astro profile:", error);
      throw new Error(error.message);
    }

    return data;
  } catch (error) {
    console.error("Exception in getAstroProfile:", error);
    // Retourner null au lieu de throw pour éviter de bloquer l'application
    return null;
  }
}

// Le reste des fonctions reste inchangé...
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

  return data;
}

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
