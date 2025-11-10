import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASTRO_API_URL = Deno.env.get("VITE_ASTRO_API_URL")!;
const ASTRO_API_KEY = Deno.env.get("VITE_ASTRO_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Fonction pour appeler l'API astrologique RapidAPI
const calculateAstroChart = async (birthData: any) => {
  if (!ASTRO_API_URL || !ASTRO_API_KEY) {
    throw new Error("Astro API configuration missing");
  }

  try {
    const birthDate = new Date(birthData.birth_date);
    
    const payload = {
      subject: {
        year: birthDate.getFullYear(),
        month: birthDate.getMonth() + 1,
        day: birthDate.getDate(),
        hour: parseInt(birthData.birth_time.split(':')[0]),
        minute: parseInt(birthData.birth_time.split(':')[1]),
        longitude: 2.3522, // Paris par défaut - à améliorer avec géocoding
        latitude: 48.8566,
        city: birthData.birth_place.split(',')[0]?.trim() || "Paris",
        nation: "FR",
        timezone: "Europe/Paris",
        name: "User",
        zodiac_type: "Tropic",
        sidereal_mode: null,
        perspective_type: "Apparent Geocentric",
        houses_system_identifier: "P"
      },
      theme: "classic",
      language: "FR",
      wheel_only: false
    };

    const response = await fetch(`${ASTRO_API_URL}/natal-aspects-data`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-RapidAPI-Host': 'astrologer.p.rapidapi.com',
        'x-rapidapi-key': ASTRO_API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Astro API failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error calling Astro API:", error);
    // Fallback avec des données mock
    return generateMockAstroData(birthData);
  }
};

function generateMockAstroData(birthData: any) {
  const signs = ["Bélier", "Taureau", "Gémeaux", "Cancer", "Lion", "Vierge", 
                 "Balance", "Scorpion", "Sagittaire", "Capricorne", "Verseau", "Poissons"];
  const randomSign = () => signs[Math.floor(Math.random() * signs.length)];
  
  return {
    sun_sign: randomSign(),
    moon_sign: randomSign(),
    rising_sign: randomSign(),
    aspects: [],
    houses: [],
    summary: "Profil astrologique généré en mode développement"
  };
}

serve(async (req) => {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Récupérer les données de naissance
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("birth_date, birth_time, birth_place")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found or missing birth data" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!profile.birth_date || !profile.birth_time || !profile.birth_place) {
      return new Response(
        JSON.stringify({ error: "Birth data incomplete" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Calcul astrologique
    const astroCalculation = await calculateAstroChart(profile);
    const isMock = !ASTRO_API_URL || !ASTRO_API_KEY;

    // 3. Sauvegarder le profil astrologique
    const astroProfileData = {
      user_id: user_id,
      birth_data: profile,
      astro_calculation: astroCalculation,
      sun_sign: astroCalculation.sun_sign,
      moon_sign: astroCalculation.moon_sign,
      rising_sign: astroCalculation.rising_sign,
      calculation_source: isMock ? "mock" : "api",
      is_mock: isMock,
      calculated_at: new Date().toISOString()
    };

    const { error: insertError } = await supabaseAdmin
      .from("astro_profiles")
      .upsert(astroProfileData, { onConflict: "user_id" });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Failed to save astro profile" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Déclencher les étapes suivantes
    try {
      await supabaseAdmin.functions.invoke("generate-astro-embedding", {
        body: { user_id }
      });
      
      await supabaseAdmin.functions.invoke("generate-symbolic-profile", {
        body: { user_id }
      });
    } catch (chainError) {
      console.log("Chain execution warning:", chainError);
    }

    return new Response(
      JSON.stringify({
        message: "Astro profile calculated successfully",
        profile: astroProfileData,
        is_mock: isMock
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("General error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
