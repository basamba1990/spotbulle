import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

serve(async (req) => {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Récupérer le profil astrologique de l'utilisateur A
    const { data: userAstro, error: astroError } = await supabaseAdmin
      .from("astro_profiles")
      .select("sun_sign, moon_sign, rising_sign, archetype_profile")
      .eq("user_id", user_id)
      .single();

    if (astroError || !userAstro) {
      return new Response(
        JSON.stringify({ error: "Astro profile not found for user" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

        // 2. Récupérer l'embedding astro de l'utilisateur A
    const { data: userAEmbedding, error: embedError } = await supabaseAdmin
      .from("astro_profiles")
      .select("astro_embedding")
      .eq("user_id", user_id)
      .single();

    if (embedError || !userAEmbedding?.astro_embedding) {
      return new Response(
        JSON.stringify({ error: "Astro embedding not found for user" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 3. Trouver des correspondances potentielles en utilisant la similarité vectorielle (pg_vector)
    // Opérateur de similarité cosinus: <-> (plus le score est bas, plus la similarité est grande)
    const { data: potentialMatches, error: matchError } = await supabaseAdmin
      .from("astro_profiles")
      .select("user_id, astro_embedding, sun_sign, moon_sign, rising_sign")
      .neq("user_id", user_id) // Ne pas se matcher soi-même
      .order("astro_embedding", {
        ascending: true,
        foreignTable: "astro_profiles",
        nullsFirst: false,
        distance: userAEmbedding.astro_embedding,
      })
      .limit(10); // Limiter pour l'exemple

    if (matchError) {
      console.error("Error fetching potential matches:", matchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch potential matches" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (matchError) {
      console.error("Error fetching potential matches:", matchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch potential matches" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const advancedMatches = [];

    // 3. Calculer la compatibilité et sauvegarder
    for (const match of potentialMatches) {
      // Calcul de la similarité vectorielle (distance cosinus)
      // NOTE: La distance cosinus retournée par Supabase est entre 0 et 2.
      // Nous devons la normaliser pour obtenir un score de similarité entre 0 et 1.
      // Pour l'exemple, nous allons simuler un score basé sur la distance.
      const distance = 1 - Math.abs(Math.random() - 0.5) * 2; // Simule une distance entre 0 et 1
      const vectorSimilarity = 1 - distance; // Similarité entre 0 et 1 (1 = parfait match)

      // SIMULATION du calcul de compatibilité astrologique (basé sur les signes)
      const isCompatibleSign = userAstro.sun_sign === match.sun_sign;
      const astroCompatibility = isCompatibleSign ? 8.5 : Math.random() * 5; // Score entre 0 et 10

      // Calcul du score global (pondération)
      const overallScore = (astroCompatibility * 0.5 + vectorSimilarity * 5) / 10; // Pondération

      const { error: insertError } = await supabaseAdmin
        .from("advanced_matches")
        .upsert(
          {
            user_a_id: user_id,
            user_b_id: match.user_id,
            vector_similarity: parseFloat(vectorSimilarity.toFixed(3)),
            astro_compatibility: parseFloat(astroCompatibility.toFixed(3)),
            overall_score: parseFloat(overallScore.toFixed(3)),
            // Connexion avec les profils vidéo existants:
            // Ici, on pourrait ajouter une étape pour récupérer l'embedding vidéo
            // de l'utilisateur B et calculer une similarité vidéo, mais nous
            // nous concentrons sur l'embedding astro pour le matching initial.
          },
          { onConflict: ["user_a_id", "user_b_id"] }
        );

      if (insertError) {
        console.error("Error saving match:", insertError);
        // Continuer malgré l'erreur pour les autres matchs
      }

      advancedMatches.push({
        match_id: match.user_id,
        overall_score: parseFloat(overallScore.toFixed(3)),
      });
    }

    return new Response(
      JSON.stringify({
        message: "Advanced matching completed and results saved",
        matches: advancedMatches,
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
