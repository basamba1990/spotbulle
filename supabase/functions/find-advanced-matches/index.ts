import { createClient } from "npm:@supabase/supabase-js@2.44.0";
import { corsHeaders } from "../_shared/http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Calcul de compatibilité astrologique basé sur les signes réels
function calculateAstroCompatibility(userAAstro: any, userBAstro: any): number {
  let compatibility = 0.5; // Score de base
  
  // Compatibilité des signes solaires
  const sunCompatibility = calculateSignCompatibility(userAAstro.sun_sign, userBAstro.sun_sign);
  compatibility += sunCompatibility * 0.3;
  
  // Compatibilité des signes lunaires
  const moonCompatibility = calculateSignCompatibility(userAAstro.moon_sign, userBAstro.moon_sign);
  compatibility += moonCompatibility * 0.3;
  
  // Compatibilité des ascendants
  const risingCompatibility = calculateSignCompatibility(userAAstro.rising_sign, userBAstro.rising_sign);
  compatibility += risingCompatibility * 0.2;
  
  // Bonus pour les éléments complémentaires
  const elementBonus = calculateElementCompatibility(userAAstro.sun_sign, userBAstro.sun_sign);
  compatibility += elementBonus * 0.2;
  
  return Math.min(compatibility, 1.0);
}

function calculateSignCompatibility(signA: string, signB: string): number {
  if (signA === signB) return 0.8; // Même signe = bonne compatibilité
  
  const compatiblePairs: Record<string, string[]> = {
    'Bélier': ['Balance', 'Lion', 'Sagittaire'],
    'Taureau': ['Scorpion', 'Vierge', 'Capricorne'],
    'Gémeaux': ['Sagittaire', 'Balance', 'Verseau'],
    'Cancer': ['Capricorne', 'Scorpion', 'Poissons'],
    'Lion': ['Verseau', 'Balance', 'Sagittaire'],
    'Vierge': ['Poissons', 'Capricorne', 'Taureau'],
    'Balance': ['Bélier', 'Lion', 'Gémeaux'],
    'Scorpion': ['Taureau', 'Cancer', 'Poissons'],
    'Sagittaire': ['Gémeaux', 'Bélier', 'Lion'],
    'Capricorne': ['Cancer', 'Taureau', 'Vierge'],
    'Verseau': ['Lion', 'Gémeaux', 'Balance'],
    'Poissons': ['Vierge', 'Cancer', 'Scorpion']
  };
  
  return compatiblePairs[signA]?.includes(signB) ? 0.9 : 0.6;
}

function calculateElementCompatibility(signA: string, signB: string): number {
  const elements: Record<string, string> = {
    'Bélier': 'Feu', 'Lion': 'Feu', 'Sagittaire': 'Feu',
    'Taureau': 'Terre', 'Vierge': 'Terre', 'Capricorne': 'Terre',
    'Gémeaux': 'Air', 'Balance': 'Air', 'Verseau': 'Air',
    'Cancer': 'Eau', 'Scorpion': 'Eau', 'Poissons': 'Eau'
  };
  
  const elementA = elements[signA];
  const elementB = elements[signB];
  
  if (!elementA || !elementB) return 0;
  
  // Les éléments complémentaires
  const complementaryPairs: Record<string, string[]> = {
    'Feu': ['Air', 'Feu'],
    'Terre': ['Eau', 'Terre'],
    'Air': ['Feu', 'Air'],
    'Eau': ['Terre', 'Eau']
  };
  
  return complementaryPairs[elementA]?.includes(elementB) ? 0.2 : 0;
}

// Calcul de similarité vectorielle réelle
function calculateVectorSimilarity(embeddingA: number[], embeddingB: number[]): number {
  if (!embeddingA || !embeddingB || embeddingA.length !== embeddingB.length) {
    return 0.5; // Fallback si les embeddings sont incompatibles
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < embeddingA.length; i++) {
    dotProduct += embeddingA[i] * embeddingB[i];
    normA += embeddingA[i] * embeddingA[i];
    normB += embeddingB[i] * embeddingB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) return 0;
  
  const cosineSimilarity = dotProduct / (normA * normB);
  return (cosineSimilarity + 1) / 2; // Normalisation entre 0 et 1
}

Deno.serve(async (req) => {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "User ID manquant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Récupération du profil astrologique et embedding de l'utilisateur
    const { data: userAstro, error: userError } = await supabaseAdmin
      .from("astro_profiles")
      .select("sun_sign, moon_sign, rising_sign, astro_embedding")
      .eq("user_id", user_id)
      .single();

    if (userError || !userAstro) {
      return new Response(
        JSON.stringify({ error: "Profil astrologique non trouvé pour l'utilisateur" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Recherche des profils potentiels avec similarité vectorielle
    console.log("🔍 Searching for potential matches...");
    
    const { data: potentialMatches, error: matchError } = await supabaseAdmin
      .from("astro_profiles")
      .select("user_id, sun_sign, moon_sign, rising_sign, astro_embedding")
      .neq("user_id", user_id)
      .not("astro_embedding", "is", null)
      .limit(20);

    if (matchError) {
      console.error("❌ Match search error:", matchError);
      return new Response(
        JSON.stringify({ error: "Erreur lors de la recherche de correspondances" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Found ${potentialMatches.length} potential matches`);

    const advancedMatches = [];

    // 3. Calcul des scores pour chaque match potentiel
    for (const match of potentialMatches) {
      // Similarité vectorielle
      const vectorSimilarity = calculateVectorSimilarity(
        userAstro.astro_embedding,
        match.astro_embedding
      );

      // Compatibilité astrologique
      const astroCompatibility = calculateAstroCompatibility(userAstro, match);

      // Score global pondéré
      const overallScore = (
        (vectorSimilarity * 0.6) +      // 60% similarité vectorielle
        (astroCompatibility * 0.4)      // 40% compatibilité astro
      );

      // Seuil minimum pour considérer un match
      if (overallScore >= 0.6) {
        const matchData = {
          user_a_id: user_id,
          user_b_id: match.user_id,
          vector_similarity: parseFloat(vectorSimilarity.toFixed(3)),
          astro_compatibility: parseFloat(astroCompatibility.toFixed(3)),
          overall_score: parseFloat(overallScore.toFixed(3)),
          match_details: {
            sun_sign_compatibility: calculateSignCompatibility(userAstro.sun_sign, match.sun_sign),
            moon_sign_compatibility: calculateSignCompatibility(userAstro.moon_sign, match.moon_sign),
            element_compatibility: calculateElementCompatibility(userAstro.sun_sign, match.sun_sign)
          }
        };

        // Sauvegarde du match
        const { error: insertError } = await supabaseAdmin
          .from("advanced_matches")
          .upsert(matchData, { onConflict: ["user_a_id", "user_b_id"] });

        if (insertError) {
          console.error("❌ Error saving match:", insertError);
          continue;
        }

        advancedMatches.push({
          match_id: match.user_id,
          overall_score: matchData.overall_score,
          vector_similarity: matchData.vector_similarity,
          astro_compatibility: matchData.astro_compatibility
        });
      }
    }

    console.log(`🎯 Generated ${advancedMatches.length} advanced matches`);

    // 4. Déclenchement des recommandations de projets
    try {
      await supabaseAdmin.functions.invoke("generate-project-recommendations", {
        body: { user_id }
      });
    } catch (recError) {
      console.log("⚠️ Project recommendations skipped:", recError.message);
    }

    return new Response(
      JSON.stringify({
        message: "Matching avancé complété avec succès",
        matches_generated: advancedMatches.length,
        matches: advancedMatches.sort((a, b) => b.overall_score - a.overall_score)
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ General error in find-advanced-matches:", error);
    return new Response(
      JSON.stringify({ 
        error: `Erreur lors du matching avancé: ${error.message}` 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
