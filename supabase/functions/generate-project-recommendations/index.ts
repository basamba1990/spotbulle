import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";
import { OpenAI } from "https://esm.sh/openai@4.10.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Génération de recommandations de projets avec GPT-4
async function generateProjectRecommendation(
  userAAstro: any, 
  userBAstro: any, 
  matchScore: number
): Promise<{ project: string; description: string; reasoning: any }> {
  
  const prompt = `
En tant que SpotCoach, expert en synergie créative, génère une recommandation de projet collaboratif basée sur cette compatibilité astrologique:

**COMPATIBILITÉ:**
- Score de matching: ${(matchScore * 10).toFixed(1)}/10
- Signe Solaire User A: ${userAAstro.sun_sign}
- Signe Solaire User B: ${userBAstro.sun_sign}
- Signe Lunaire User A: ${userAAstro.moon_sign}
- Signe Lunaire User B: ${userBAstro.moon_sign}
- Ascendant User A: ${userAAstro.rising_sign}
- Ascendant User B: ${userBAstro.rising_sign}

**CONTEXTE SPOTBULLE:**
SpotBulle est une plateforme d'expression orale et vidéo. Les projets doivent favoriser:
- La communication et l'expression personnelle
- La création de contenu vidéo authentique
- Le développement des compétences oratoires
- Les connexions humaines significatives

**FORMAT DE RÉPONSE (JSON):**
{
  "project_title": "Titre accrocheur du projet",
  "project_description": "Description détaillée du projet (100-150 mots)",
  "project_category": "Catégorie (ex: 'Interview', 'Débat', 'Documentaire', 'Pitch')",
  "reasoning": {
    "astro_synergy": "Explication de la synergie astrologique",
    "communication_strengths": "Points forts communs en communication",
    "expected_outcomes": "Résultats attendus pour les participants"
  }
}

Sois créatif, précis et basé sur les signes astrologiques réels.
  `.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { 
          role: "system", 
          content: "Tu es SpotCoach, expert en synergie créative et projets collaboratifs. Tu crées des recommandations personnalisées basées sur la compatibilité astrologique." 
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.8,
      response_format: { type: "json_object" },
    });

    const recommendation = JSON.parse(completion.choices[0].message.content!);
    
    return {
      project: recommendation.project_title,
      description: recommendation.project_description,
      reasoning: {
        ...recommendation.reasoning,
        match_score: matchScore,
        category: recommendation.project_category,
        ai_generated: true,
        tokens_used: completion.usage?.total_tokens
      }
    };
  } catch (error) {
    console.error("GPT-4 recommendation failed:", error);
    // Fallback manuel basé sur le score
    return generateFallbackRecommendation(matchScore, userAAstro, userBAstro);
  }
}

function generateFallbackRecommendation(matchScore: number, userAAstro: any, userBAstro: any) {
  const baseProjects = [
    {
      title: "Double Interview Croisée",
      description: "Chaque participant interviewe l'autre sur ses passions, créant un dialogue authentique et révélateur.",
      category: "Interview"
    },
    {
      title: "Débat Thématique",
      description: "Débat amical sur un sujet qui vous passionne tous les deux, mettant en valeur vos styles de communication complémentaires.",
      category: "Débat"
    },
    {
      title: "Pitch Collaboratif",
      description: "Créez ensemble un pitch vidéo sur un projet qui vous tient à cœur, combinant vos énergies créatives.",
      category: "Pitch"
    },
    {
      title: "Documentaire Humain",
      description: "Racontez vos histoires personnelles et explorez vos points communs à travers un format documentaire.",
      category: "Documentaire"
    }
  ];

  const projectIndex = Math.min(Math.floor(matchScore * baseProjects.length), baseProjects.length - 1);
  const selectedProject = baseProjects[projectIndex];

  return {
    project: selectedProject.title,
    description: selectedProject.description,
    reasoning: {
      astro_synergy: `Compatibilité ${userAAstro.sun_sign}-${userBAstro.sun_sign} avec score ${(matchScore * 10).toFixed(1)}/10`,
      communication_strengths: "Styles complémentaires détectés",
      expected_outcomes: "Renforcement des compétences en communication et création de contenu authentique",
      match_score: matchScore,
      category: selectedProject.category,
      ai_generated: false
    }
  };
}

serve(async (req) => {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "User ID manquant" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Récupération des matchs avancés
    const { data: matches, error: matchError } = await supabaseAdmin
      .from("advanced_matches")
      .select("user_a_id, user_b_id, overall_score, astro_compatibility, vector_similarity")
      .or(`user_a_id.eq.${user_id},user_b_id.eq.${user_id}`)
      .order("overall_score", { ascending: false })
      .limit(5);

    if (matchError) {
      console.error("❌ Error fetching matches:", matchError);
      return new Response(
        JSON.stringify({ error: "Erreur lors de la récupération des matchs" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`🎯 Generating recommendations for ${matches.length} matches`);

    const recommendations = [];

    // 2. Génération des recommandations pour chaque match
    for (const match of matches) {
      const otherUserId = match.user_a_id === user_id ? match.user_b_id : match.user_a_id;
      const matchScore = match.overall_score;

      // Récupération des profils astro complets
      const [{ data: userAstro }, { data: otherUserAstro }] = await Promise.all([
        supabaseAdmin.from("astro_profiles").select("sun_sign, moon_sign, rising_sign").eq("user_id", user_id).single(),
        supabaseAdmin.from("astro_profiles").select("sun_sign, moon_sign, rising_sign").eq("user_id", otherUserId).single()
      ]);

      if (!userAstro || !otherUserAstro) {
        console.log("⚠️ Skipping recommendation - astro data missing");
        continue;
      }

      // Génération de la recommandation
      const recommendation = await generateProjectRecommendation(userAstro, otherUserAstro, matchScore);

      // Sauvegarde de la recommandation
      const { error: insertError } = await supabaseAdmin
        .from("project_recommendations")
        .upsert(
          {
            user_a_id: user_id,
            user_b_id: otherUserId,
            match_score: matchScore,
            recommended_project: recommendation.project,
            project_description: recommendation.description,
            reasoning: recommendation.reasoning,
            category: recommendation.reasoning.category
          },
          { onConflict: ["user_a_id", "user_b_id"] }
        );

      if (insertError) {
        console.error("❌ Error saving recommendation:", insertError);
        continue;
      }

      recommendations.push({
        match_user_id: otherUserId,
        project: recommendation.project,
        score: matchScore,
        category: recommendation.reasoning.category,
        ai_generated: recommendation.reasoning.ai_generated
      });
    }

    console.log(`✅ Generated ${recommendations.length} project recommendations`);

    return new Response(
      JSON.stringify({
        message: "Recommandations de projets générées avec succès",
        recommendations_generated: recommendations.length,
        recommendations: recommendations
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ General error in generate-project-recommendations:", error);
    return new Response(
      JSON.stringify({ 
        error: `Erreur lors de la génération des recommandations: ${error.message}` 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
