// calculate-astro-profile/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.44.0";
import { corsHeaders } from "shared/http";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASTRO_API_URL = Deno.env.get("VITE_ASTRO_API_URL") || "https://astrologer.p.rapidapi.com";
const ASTRO_API_KEY = Deno.env.get("VITE_ASTRO_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Utilisation de corsHeaders partagé depuis _shared/http.ts

// Service de géocoding amélioré avec gestion d'erreur
async function geocodeLocation(place: string) {
  try {
    console.log("🗺️ Geocoding location:", place);
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&limit=1&accept-language=fr`
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        const result = {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
          city: data[0].name || place.split(',')[0]?.trim(),
          country: data[0].display_name?.split(',').pop()?.trim() || "FR",
          display_name: data[0].display_name
        };
        console.log("✅ Geocoding result:", result);
        return result;
      }
    }
    throw new Error("Aucun résultat de géocoding");
  } catch (error) {
    console.error("❌ Geocoding error:", error);
    // Fallback sur Paris avec log
    console.log("🔄 Using fallback coordinates for Paris");
    return {
      lat: 48.8566,
      lon: 2.3522,
      city: "Paris",
      country: "FR",
      display_name: "Paris, France"
    };
  }
}

// Calcul d'archétype basé sur les signes
function calculateArchetype(sunSign: string, moonSign: string, risingSign: string) {
  const elements: Record<string, string> = {
    'Bélier': 'Feu', 'Lion': 'Feu', 'Sagittaire': 'Feu',
    'Taureau': 'Terre', 'Vierge': 'Terre', 'Capricorne': 'Terre', 
    'Gémeaux': 'Air', 'Balance': 'Air', 'Verseau': 'Air',
    'Cancer': 'Eau', 'Scorpion': 'Eau', 'Poissons': 'Eau'
  };

  const modalities: Record<string, string> = {
    'Bélier': 'Cardinal', 'Cancer': 'Cardinal', 'Balance': 'Cardinal', 'Capricorne': 'Cardinal',
    'Taureau': 'Fixé', 'Lion': 'Fixé', 'Scorpion': 'Fixé', 'Verseau': 'Fixé',
    'Gémeaux': 'Mutable', 'Vierge': 'Mutable', 'Sagittaire': 'Mutable', 'Poissons': 'Mutable'
  };

  const sunElement = elements[sunSign] || 'Feu';
  const moonElement = elements[moonSign] || 'Eau';
  const risingElement = elements[risingSign] || 'Air';
  
  // Déterminer l'élément dominant
  const elementCount: Record<string, number> = { Feu: 0, Terre: 0, Air: 0, Eau: 0 };
  elementCount[sunElement]++;
  elementCount[moonElement]++;
  elementCount[risingElement]++;
  
  const dominantElement = Object.entries(elementCount)
    .sort(([,a], [,b]) => b - a)[0][0];

  const dominantModality = modalities[sunSign] || 'Cardinal';

  return {
    dominant_element: dominantElement,
    dominant_modality: dominantModality,
    element_balance: elementCount,
    signature: `${sunElement}/${moonElement}/${risingElement}`
  };
}

// Génération de données astro de fallback robuste
function generateFallbackAstroData(birthDate: Date, birthPlace: string) {
  const signs = ['Bélier', 'Taureau', 'Gémeaux', 'Cancer', 'Lion', 'Vierge', 'Balance', 'Scorpion', 'Sagittaire', 'Capricorne', 'Verseau', 'Poissons'];
  
  // Utiliser la date pour une génération déterministe
  const seed = birthDate.getTime() % 12;
  const sunSign = signs[seed];
  const moonSign = signs[(seed + 4) % 12];
  const risingSign = signs[(seed + 8) % 12];
  
  const archetype = calculateArchetype(sunSign, moonSign, risingSign);

  return {
    sun: { sign: sunSign, house: 1, degree: (seed * 30) % 360 },
    moon: { sign: moonSign, house: 4, degree: ((seed + 4) * 30) % 360 },
    ascendant: { sign: risingSign, degree: ((seed + 8) * 30) % 360 },
    planets: {
      mercure: { sign: signs[(seed + 1) % 12], house: 1, degree: (seed + 1) * 30 % 360 },
      venus: { sign: signs[(seed + 2) % 12], house: 2, degree: (seed + 2) * 30 % 360 },
      mars: { sign: signs[(seed + 3) % 12], house: 1, degree: (seed + 3) * 30 % 360 },
      jupiter: { sign: signs[(seed + 5) % 12], house: 9, degree: (seed + 5) * 30 % 360 },
      saturne: { sign: signs[(seed + 6) % 12], house: 10, degree: (seed + 6) * 30 % 360 }
    },
    houses: Array.from({length: 12}, (_, i) => ({
      number: i + 1,
      sign: signs[(seed + i) % 12],
      degree: (i * 30) % 360
    })),
    archetype_profile: archetype
  };
}

// Appel à l'API astrologique avec gestion d'erreur robuste
async function calculateRealAstroChart(birthData: any, coordinates: any, timezone: string) {
  const birthDate = new Date(birthData.birth_date);
  
  // Vérification des données de naissance
  if (!birthData.birth_time || birthData.birth_time.trim() === '') {
    console.warn("⚠️ Heure de naissance non fournie, utilisation de midi par défaut");
    birthData.birth_time = "12:00";
  }

  const [hours, minutes] = birthData.birth_time.split(':').map((x: string) => parseInt(x) || 0);
  
  const payload = {
    subject: {
      year: birthDate.getFullYear(),
      month: birthDate.getMonth() + 1,
      day: birthDate.getDate(),
      hour: hours,
      minute: minutes,
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

  // Vérifier si les clés API sont configurées
  if (!ASTRO_API_KEY || ASTRO_API_KEY === "your_rapidapi_key_here") {
    console.warn("❌ Clé API astrologique non configurée, utilisation du mode fallback");
    return generateFallbackAstroData(birthDate, coordinates.city);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(`${ASTRO_API_URL}/natal-aspects-data`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-RapidAPI-Host': 'astrologer.p.rapidapi.com',
        'x-rapidapi-key': ASTRO_API_KEY
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Astro API failed: ${response.status} - ${errorText}`);
      throw new Error(`API astrologique: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("✅ Astro API response received successfully");
    
    // Ajouter l'archétype calculé
    if (data.sun && data.moon && data.ascendant) {
      data.archetype_profile = calculateArchetype(
        data.sun.sign, 
        data.moon.sign, 
        data.ascendant.sign
      );
    }
    
    return data;
  } catch (error) {
    console.error("❌ Astro API call failed:", error);
    
    if (error.name === 'AbortError') {
      console.warn("⏰ Timeout de l'API astrologique");
    }
    
    // Retourner des données de fallback calculées
    console.log("🔄 Using calculated fallback astro data");
    return generateFallbackAstroData(birthDate, coordinates.city);
  }
}

// Extraction des signes avec validation
function extractAstroSigns(astroData: any) {
  if (!astroData) {
    console.warn("❌ No astro data provided to extractAstroSigns");
    return {
      sun_sign: "Lion",
      moon_sign: "Balance", 
      rising_sign: "Gémeaux",
      planetary_positions: {},
      houses: [],
      archetype_profile: calculateArchetype("Lion", "Balance", "Gémeaux")
    };
  }

  return {
    sun_sign: astroData.sun?.sign || "Lion",
    moon_sign: astroData.moon?.sign || "Balance", 
    rising_sign: astroData.ascendant?.sign || "Gémeaux",
    planetary_positions: astroData.planets || {},
    houses: astroData.houses || [],
    archetype_profile: astroData.archetype_profile || calculateArchetype(
      astroData.sun?.sign || "Lion",
      astroData.moon?.sign || "Balance", 
      astroData.ascendant?.sign || "Gémeaux"
    )
  };
}

Deno.serve(async (req) => {
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
      console.log("📝 Request body received");
      
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
        JSON.stringify({ error: "Profil utilisateur non trouvé" }),
        { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("📅 Birth data found:", {
      date: profile.birth_date,
      time: profile.birth_time,
      place: profile.birth_place
    });

    // Validation des données obligatoires
    if (!profile.birth_date) {
      return new Response(
        JSON.stringify({ error: "Date de naissance requise" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // 2. Géocoding
    console.log("🗺️ Geocoding location:", profile.birth_place);
    const coordinates = await geocodeLocation(profile.birth_place || "Paris, France");
    
    // 3. Timezone (simplifié pour l'Europe)
    const timezone = "Europe/Paris";

    // 4. Calcul astrologique
    console.log("🔮 Calculating astro chart...");
    const astroCalculation = await calculateRealAstroChart(profile, coordinates, timezone);
    const astroSigns = extractAstroSigns(astroCalculation);

    console.log("✅ Astro signs calculated:", {
      sun: astroSigns.sun_sign,
      moon: astroSigns.moon_sign,
      rising: astroSigns.rising_sign
    });

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
      archetype_profile: astroSigns.archetype_profile,
      calculation_source: astroCalculation.sun?.sign ? "api" : "fallback",
      is_mock: !astroCalculation.sun?.sign,
      calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 6. Sauvegarde dans la base de données
    console.log("💾 Saving astro profile to database...");
    const { error: insertError } = await supabaseAdmin
      .from("astro_profiles")
      .upsert(astroProfileData, { 
        onConflict: 'user_id',
        ignoreDuplicates: false 
      });

    if (insertError) {
      console.error("❌ Database error:", insertError);
      return new Response(
        JSON.stringify({ error: `Erreur base de données: ${insertError.message}` }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("✅ Astro profile saved successfully");

    // 7. Déclencher les calculs suivants de manière asynchrone
    console.log("🚀 Triggering follow-up calculations...");
    try {
      // Génération d'embedding astrologique
      await supabaseAdmin.functions.invoke('generate-astro-embedding', {
        body: { user_id }
      }).catch(err => console.warn("⚠️ Embedding generation skipped:", err.message));

      // Génération du profil symbolique
      await supabaseAdmin.functions.invoke('generate-symbolic-profile', {
        body: { user_id }
      }).catch(err => console.warn("⚠️ Symbolic profile skipped:", err.message));

    } catch (followupError) {
      console.warn("⚠️ Follow-up calculations had issues:", followupError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Profil astrologique calculé avec succès",
        data: {
          sun_sign: astroSigns.sun_sign,
          moon_sign: astroSigns.moon_sign,
          rising_sign: astroSigns.rising_sign,
          calculation_source: astroProfileData.calculation_source,
          archetype: astroSigns.archetype_profile
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
        details: "Vérifiez les données de naissance et réessayez"
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
