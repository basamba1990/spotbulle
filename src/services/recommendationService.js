import { supabase } from "../lib/supabase";

/**
 * Service pour interagir avec le système de recommandation de projets.
 */

/**
 * Déclenche la génération des recommandations de projets communs.
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
 */
export async function getProjectRecommendations() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated.");
  }

  const { data, error } = await supabase
    .from("project_recommendations")
    .select("*, user_b_id:profiles!project_recommendations_user_b_id_fkey(*)")
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
    .order("match_score", { ascending: false });

  if (error) {
    console.error("Error fetching project recommendations:", error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Récupère les recommandations basées sur le profil astrologique
 */
export async function getAstroBasedRecommendations() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated.");
  }

  // Récupérer le profil astro pour des recommandations personnalisées
  const { data: astroProfile, error: astroError } = await supabase
    .from("astro_profiles")
    .select("sun_sign, moon_sign, rising_sign, symbolic_archetype")
    .eq("user_id", user.id)
    .single();

  if (astroError) {
    throw new Error("Profil astrologique non trouvé");
  }

  // Logique de recommandation basée sur le profil astro
  const recommendations = {
    archetype: astroProfile.symbolic_archetype,
    suggested_projects: generateProjectSuggestions(astroProfile),
    compatible_signs: getCompatibleSigns(astroProfile.sun_sign),
  };

  return recommendations;
}

// Helper functions
function generateProjectSuggestions(astroProfile) {
  const suggestions = [];
  
  if (["Feu", "Lion", "Bélier", "Sagittaire"].some(sign => 
    astroProfile.sun_sign.includes(sign) || astroProfile.symbolic_archetype.includes(sign))) {
    suggestions.push("Projet de leadership et prise de parole", "Débat dynamique", "Pitch motivant");
  }
  
  if (["Terre", "Taureau", "Vierge", "Capricorne"].some(sign => 
    astroProfile.sun_sign.includes(sign) || astroProfile.symbolic_archetype.includes(sign))) {
    suggestions.push("Documentaire structuré", "Tutoriel pratique", "Interview approfondie");
  }
  
  if (["Air", "Gémeaux", "Balance", "Verseau"].some(sign => 
    astroProfile.sun_sign.includes(sign) || astroProfile.symbolic_archetype.includes(sign))) {
    suggestions.push("Discussion d'idées", "Interview croisée", "Présentation créative");
  }
  
  if (["Eau", "Cancer", "Scorpion", "Poissons"].some(sign => 
    astroProfile.sun_sign.includes(sign) || astroProfile.symbolic_archetype.includes(sign))) {
    suggestions.push("Témoignage émotionnel", "Documentaire humain", "Histoire personnelle");
  }

  return suggestions.length > 0 ? suggestions : ["Interview classique", "Partage d'expérience"];
}

function getCompatibleSigns(sunSign) {
  const compatibilityMap = {
    "Bélier": ["Lion", "Sagittaire", "Balance"],
    "Taureau": ["Vierge", "Capricorne", "Cancer"],
    "Gémeaux": ["Balance", "Verseau", "Lion"],
    "Cancer": ["Scorpion", "Poissons", "Taureau"],
    "Lion": ["Bélier", "Sagittaire", "Gémeaux"],
    "Vierge": ["Taureau", "Capricorne", "Cancer"],
    "Balance": ["Gémeaux", "Verseau", "Bélier"],
    "Scorpion": ["Cancer", "Poissons", "Vierge"],
    "Sagittaire": ["Bélier", "Lion", "Balance"],
    "Capricorne": ["Taureau", "Vierge", "Poissons"],
    "Verseau": ["Gémeaux", "Balance", "Sagittaire"],
    "Poissons": ["Cancer", "Scorpion", "Capricorne"]
  };
  
  return compatibilityMap[sunSign] || ["Tous signes"];
}
