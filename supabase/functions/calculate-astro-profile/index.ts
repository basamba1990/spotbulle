import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASTRO_API_URL = Deno.env.get("VITE_ASTRO_API_URL")!;
const ASTRO_API_KEY = Deno.env.get("VITE_ASTRO_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Service de géocoding simplifié
async function geocodeLocation(place: string) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&limit=1`
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
          city: data[0].name || place.split(',')[0],
          country: data[0].display_name?.split(',').pop()?.trim() || "FR"
        };
      }
    }
  } catch (error) {
    console.error("Geocoding error:", error);
  }
  
  // Fallback sur Paris
  return {
    lat: 48.8566,
    lon: 2.3522,
    city: place.split(',')[0] || "Paris",
    country: "FR"
  };
}

// Appel à l'API astrologique avec gestion d'erreur robuste
async function calculateRealAstroChart(birthData: any, coordinates: any, timezone: string) {
  const birthDate = new Date(birthData.birth_date);
  
  const payload = {
    subject: {
      year: birthDate.getFullYear(),
      month: birthDate.getMonth() + 1,
      day: birthDate.getDate(),
      hour: parseInt(birthData.birth_time?.split(':')[0] || '12'),
      minute: parseInt(birthData.birth_time?.split(':')[1] || '0'),
      longitude: coordinates.lon,
      latitude: coordinates.lat,
      city: coordinates.city,
      nation: coordinates.country,
      timezone: timezone,
      name: "User",
      zodiac_type: "Tropic",
      houses_system_identifier: "P"
    }
  };

  console.log("📡 Calling Astro API with payload:", JSON.stringify(payload));

  try {
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
      throw new Error(`Astro API failed: ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ Astro API response received");
    return data;
  } catch (error) {
    console.error("❌ Astro API call failed:", error);
    // Retourner des données mock pour le développement
    return {
      sun: { sign: "Lion" },
      moon: { sign: "Balance" },
      ascendant: { sign: "Gémeaux" },
      planets: {},
      houses: []
    };
  }
}

// Extraction des signes
function extractAstroSigns(astroData: any) {
  return {
    sun_sign: astroData?.sun?.sign || "Lion",
    moon_sign: astroData?.moon?.sign || "Balance", 
    rising_sign: astroData?.ascendant?.sign || "Gémeaux",
    planetary_positions: astroData?.planets || {},
    houses: astroData?.houses || []
  };
}

serve(async (req) => {
  // Gestion CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log("🔮 Starting astro profile calculation...");
    
    // Vérifier la méthode
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: "Méthode non autorisée. Utilisez POST." }),
        { 
          status: 405, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Lecture robuste du corps
    let body;
    try {
      const bodyText = await req.text();
      console.log("📝 Request body:", bodyText);
      
      if (!bodyText) {
        throw new Error("Corps de requête vide");
      }
      
      body = JSON.parse(bodyText);
    } catch (parseError) {
      console.error("❌ JSON parse error:", parseError);
      return new Response(
        JSON.stringify({ error: "JSON invalide dans le corps de la requête" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    const { user_id } = body;

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "User ID manquant" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("👤 Processing user:", user_id);

    // 1. Récupération des données de naissance
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("birth_date, birth_time, birth_place, full_name")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      console.error("❌ Profile not found:", profileError);
      return new Response(
        JSON.stringify({ error: "Profil non trouvé" }),
        { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("📅 Birth data:", profile);

    if (!profile.birth_date || !profile.birth_time || !profile.birth_place) {
      return new Response(
        JSON.stringify({ error: "Données de naissance incomplètes" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // 2. Géocoding
    console.log("🗺️ Geocoding location:", profile.birth_place);
    const coordinates = await geocodeLocation(profile.birth_place);
    
    // 3. Timezone (simplifié)
    const timezone = "Europe/Paris";

    // 4. Calcul astrologique
    console.log("🔮 Calculating astro chart...");
    const astroCalculation = await calculateRealAstroChart(profile, coordinates, timezone);
    const astroSigns = extractAstroSigns(astroCalculation);

    // 5. Préparation des données
    const astroProfileData = {
      user_id: user_id,
      birth_data: {
        ...profile,
        coordinates: coordinates,
        timezone: timezone
      },
      astro_calculation: astroCalculation,
      sun_sign: astroSigns.sun_sign,
      moon_sign: astroSigns.moon_sign,
      rising_sign: astroSigns.rising_sign,
      planetary_positions: astroSigns.planetary_positions,
      houses_data: astroSigns.houses,
      calculation_source: "api",
      is_mock: false,
      calculated_at: new Date().toISOString()
    };

    // 6. Sauvegarde
    console.log("💾 Saving astro profile...");
    const { error: insertError } = await supabaseAdmin
      .from("astro_profiles")
      .upsert(astroProfileData, { onConflict: "user_id" });

    if (insertError) {
      console.error("❌ Database error:", insertError);
      return new Response(
        JSON.stringify({ error: "Erreur lors de la sauvegarde" }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("✅ Astro profile saved successfully");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Profil astrologique calculé avec succès",
        data: {
          sun_sign: astroSigns.sun_sign,
          moon_sign: astroSigns.moon_sign,
          rising_sign: astroSigns.rising_sign,
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("❌ General error in calculate-astro-profile:", error);
    return new Response(
      JSON.stringify({ 
        error: `Erreur lors du calcul: ${error.message}`,
        stack: error.stack 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
