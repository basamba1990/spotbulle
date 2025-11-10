import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

// Fonction de simulation pour générer une recommandation de projet
const generateProjectRecommendation = (matchScore: number, userAstro: any, matchAstro: any): { project: string, reasoning: any } => {
  let project = "Projet de Collaboration Vidéo Général";
  let reasoning = {
    match_score: matchScore,
    compatibility_type: "Général",
    details: "Score de compatibilité élevé, suggérant une bonne synergie générale.",
  };

  if (matchScore > 0.75) {
    project = "Projet de Pitch Vidéo Stratégique";
    reasoning.compatibility_type = "Très Élevée (Astro & Vectorielle)";
    reasoning.details = `Les signes solaires ${userAstro.sun_sign} et ${matchAstro.sun_sign} sont compatibles. L'alignement vectoriel suggère des styles de communication similaires.`;
  } else if (matchScore > 0.5) {
    project = "Projet de Création de Contenu Commun";
    reasoning.compatibility_type = "Modérée";
    reasoning.details = "Bonne base pour une collaboration créative. Recommandation de se concentrer sur les forces communes.";
  }

  return { project, reasoning };
};

serve(async (req) => {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Récupérer les matchs avancés de l'utilisateur
    const { data: matches, error: matchError } = await supabaseAdmin
      .from("advanced_matches")
      .select("user_a_id, user_b_id, overall_score")
      .or(`user_a_id.eq.${user_id},user_b_id.eq.${user_id}`)
      .order("overall_score", { ascending: false })
      .limit(5);

    if (matchError) {
      console.error("Error fetching advanced matches:", matchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch advanced matches" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const recommendations = [];

    // 2. Générer des recommandations pour chaque match
    for (const match of matches) {
      const otherUserId = match.user_a_id === user_id ? match.user_b_id : match.user_a_id;
      const matchScore = match.overall_score;

      // Récupérer les profils astro (nécessaire pour la simulation de raisonnement)
      const { data: userAstro } = await supabaseAdmin.from("astro_profiles").select("sun_sign").eq("user_id", user_id).single();
      const { data: matchAstro } = await supabaseAdmin.from("astro_profiles").select("sun_sign").eq("user_id", otherUserId).single();

      const { project, reasoning } = generateProjectRecommendation(matchScore, userAstro, matchAstro);

      // 3. Sauvegarder la recommandation
      const { error: insertError } = await supabaseAdmin
        .from("project_recommendations")
        .upsert(
          {
            user_a_id: user_id,
            user_b_id: otherUserId,
            match_score: matchScore,
            recommended_project: project,
            reasoning: reasoning,
          },
          { onConflict: ["user_a_id", "user_b_id"] }
        );

      if (insertError) {
        console.error("Error saving recommendation:", insertError);
        // Continuer malgré l'erreur
      }

      recommendations.push({
        match_id: otherUserId,
        project: project,
        score: matchScore,
      });
    }

    return new Response(
      JSON.stringify({
        message: "Project recommendations generated and saved successfully",
        recommendations: recommendations,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("General error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
