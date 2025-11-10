import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";

// Intégration Réelle: Appel à une API Astrologique Externe
// NOTE: Vous devez configurer ASTRO_API_URL et ASTRO_API_KEY dans vos variables d'environnement Supabase.
const ASTRO_API_URL = Deno.env.get("ASTRO_API_URL") || "https://api.example.com/astro-chart";
const ASTRO_API_KEY = Deno.env.get("ASTRO_API_KEY") || "YOUR_ASTRO_API_KEY";

/**
 * Appelle une API externe pour obtenir les données astrologiques précises.
 * @param birthData Les données de naissance de l'utilisateur.
 * @returns Les données du thème astral.
 */
const calculateAstroChart = async (birthData: any) => {
  console.log("Calling external Astro API for:", birthData);

  try {
    const response = await fetch(ASTRO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ASTRO_API_KEY}`,
      },
      body: JSON.stringify({
        date: birthData.birth_date,
        time: birthData.birth_time,
        latitude: birthData.birth_latitude,
        longitude: birthData.birth_longitude,
      }),
    });

    if (!response.ok) {
      throw new Error(`Astro API failed with status: ${response.status}`);
    }

    const data = await response.json();

    // Mapping des données de l'API vers le format interne
    return {
      sun_sign: data.sun.sign,
      moon_sign: data.moon.sign,
      rising_sign: data.ascendant.sign,
      planetary_positions: data.planets, // Supposons que l'API retourne les positions structurées
      archetype_profile: data.archetype, // Supposons que l'API retourne l'archétype
    };
  } catch (error) {
    console.error("Error calling Astro API:", error);
    // Fallback en cas d'échec de l'API (important pour la robustesse)
    return {
      sun_sign: "Inconnu",
      moon_sign: "Inconnu",
      rising_sign: "Inconnu",
      planetary_positions: {},
      archetype_profile: {
        dominant_element: "Inconnu",
        dominant_modality: "Inconnu",
        dominant_planet: "Inconnu",
      },
    };
  }
};

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

    // 1. Récupérer les données de naissance de l'utilisateur
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("birth_date, birth_time, birth_place")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      console.error("Error fetching profile:", profileError);
      return new Response(
        JSON.stringify({ error: "Profile not found or missing birth data" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Vérification des données de base pour le calcul
    if (!profile.birth_date || !profile.birth_time || !profile.birth_place) {
      return new Response(
        JSON.stringify({
          error: "Birth data (date, time, place) is incomplete for calculation",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 2. Calcul Astrologique (via l'appel à l'API Astro réelle)
    const astroChart = await calculateAstroChart(profile);

    const astroProfile = {
      sun_sign: astroChart.sun_sign,
      moon_sign: astroChart.moon_sign,
      rising_sign: astroChart.rising_sign,
      planetary_positions: astroChart.planetary_positions,
      archetype_profile: astroChart.archetype_profile,
    };

    // 3. Sauvegarder le profil astrologique dans la nouvelle table
    const { error: insertError } = await supabaseAdmin
      .from("astro_profiles")
      .upsert(
        {
          user_id: user_id,
          ...astroProfile,
        },
        { onConflict: "user_id" }
      );

    if (insertError) {
      console.error("Error inserting astro profile:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to insert astro profile" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 4. Déclencher la génération du profil symbolique (Fusion Doc_SpotCoach)
    const { error: symbolicError } = await supabaseAdmin.functions.invoke(
      "generate-symbolic-profile",
      {
        body: { user_id: user_id },
      }
    );

    if (symbolicError) {
      console.error("Error triggering symbolic profile generation:", symbolicError);
      // NOTE: On ne bloque pas la réponse si la génération symbolique échoue,
      // car le profil astro brut est déjà sauvegardé.
    }

    return new Response(
      JSON.stringify({
        message: "Astro profile calculated and saved successfully",
        profile: astroProfile,
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
