import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASTRO_API_URL = Deno.env.get("VITE_ASTRO_API_URL")!;
const ASTRO_API_KEY = Deno.env.get("VITE_ASTRO_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Service de géocoding pour convertir les lieux en coordonnées
async function geocodeLocation(place: string): Promise<{ lat: number; lon: number; city: string; country: string }> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&limit=1`
    );
    
    if (!response.ok) {
      throw new Error(`Geocoding API failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data || data.length === 0) {
      throw new Error(`No coordinates found for place: ${place}`);
    }

    const result = data[0];
    return {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      city: result.name || place.split(',')[0],
      country: result.display_name.split(',').pop()?.trim() || "FR"
    };
  } catch (error) {
    console.error("Geocoding error:", error);
    // Fallback sur des coordonnées par défaut (Paris)
    return {
      lat: 48.8566,
      lon: 2.3522,
      city: place.split(',')[0] || "Paris",
      country: "FR"
    };
  }
}

// Fonction pour obtenir le timezone à partir des coordonnées
async function getTimezone(lat: number, lon: number): Promise<string> {
  try {
    const response = await fetch(
      `https://api.timezonedb.com/v2.1/get-time-zone?key=${Deno.env.get("TIMEZONE_API_KEY")}&format=json&by=position&lat=${lat}&lng=${lon}`
    );
    
    if (response.ok) {
      const data = await response.json();
      return data.zoneName || "Europe/Paris";
    }
  } catch (error) {
    console.error("Timezone API error:", error);
  }
  
  return "Europe/Paris"; // Fallback
}

// Appel réel à l'API astrologique RapidAPI
async function calculateRealAstroChart(birthData: any, coordinates: any, timezone: string) {
  const birthDate = new Date(birthData.birth_date);
  
  const payload = {
    subject: {
      year: birthDate.getFullYear(),
      month: birthDate.getMonth() + 1,
      day: birthDate.getDate(),
      hour: parseInt(birthData.birth_time.split(':')[0]),
      minute: parseInt(birthData.birth_time.split(':')[1]),
      longitude: coordinates.lon,
      latitude: coordinates.lat,
      city: coordinates.city,
      nation: coordinates.country,
      timezone: timezone,
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

  console.log("📡 Calling Real Astro API with payload:", JSON.stringify(payload, null, 2));

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

  const data = await response.json();
  console.log("✅ Real Astro API response received");
  
  return data;
}

// Extraction des signes principaux depuis la réponse API
function extractAstroSigns(astroData: any) {
  // Cette logique dépend de la structure exacte de la réponse de l'API
  // Adaptation basée sur la documentation de l'API astrologique
  return {
    sun_sign: astroData?.sun?.sign || "Inconnu",
    moon_sign: astroData?.moon?.sign || "Inconnu", 
    rising_sign: astroData?.ascendant?.sign || "Inconnu",
    planetary_positions: astroData?.planets || {},
    houses: astroData?.houses || []
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

    // 1. Récupération des données de naissance
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("birth_date, birth_time, birth_place, full_name")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profil non trouvé ou données de naissance manquantes" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!profile.birth_date || !profile.birth_time || !profile.birth_place) {
      return new Response(
        JSON.stringify({ error: "Données de naissance incomplètes" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Géocoding du lieu de naissance
    console.log("🗺️ Geocoding location:", profile.birth_place);
    const coordinates = await geocodeLocation(profile.birth_place);
    
    // 3. Récupération du timezone
    console.log("⏰ Getting timezone for coordinates:", coordinates);
    const timezone = await getTimezone(coordinates.lat, coordinates.lon);

    // 4. Calcul astrologique réel
    console.log("🔮 Calculating real astro chart...");
    const astroCalculation = await calculateRealAstroChart(profile, coordinates, timezone);
    const astroSigns = extractAstroSigns(astroCalculation);

    // 5. Préparation des données pour la sauvegarde
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

    // 6. Sauvegarde du profil astrologique
    console.log("💾 Saving astro profile to database...");
    const { error: insertError } = await supabaseAdmin
      .from("astro_profiles")
      .upsert(astroProfileData, { onConflict: "user_id" });

    if (insertError) {
      console.error("❌ Database error:", insertError);
      return new Response(
        JSON.stringify({ error: "Erreur lors de la sauvegarde du profil astrologique" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 7. Déclenchement des traitements suivants
    console.log("🚀 Triggering subsequent processing...");
    const processingPromises = [];
    
    // Génération de l'embedding astrologique
    processingPromises.push(
      supabaseAdmin.functions.invoke("generate-astro-embedding", {
        body: { user_id }
      }).catch(err => console.error("Embedding generation failed:", err))
    );
    
    // Génération du profil symbolique
    processingPromises.push(
      supabaseAdmin.functions.invoke("generate-symbolic-profile", {
        body: { user_id }
      }).catch(err => console.error("Symbolic profile generation failed:", err))
    );

    await Promise.allSettled(processingPromises);

    return new Response(
      JSON.stringify({
        message: "Profil astrologique calculé et sauvegardé avec succès",
        profile: {
          sun_sign: astroSigns.sun_sign,
          moon_sign: astroSigns.moon_sign,
          rising_sign: astroSigns.rising_sign,
          calculation_source: "api"
        },
        coordinates: coordinates,
        timezone: timezone
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ General error in calculate-astro-profile:", error);
    return new Response(
      JSON.stringify({ 
        error: `Erreur lors du calcul astrologique: ${error.message}` 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
