import { createClient } from "npm:@supabase/supabase-js@2.44.0";

// Intégration de corsHeaders
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET, PUT, DELETE",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


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

// Intégration Réelle: Appel à l'API OpenAI Embeddings
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
/**
 * Génère un embedding vectoriel à partir d'un texte en utilisant l'API OpenAI.
 * @param text Le texte à encoder.
 * @returns Le vecteur d'embedding.
 */
const generateEmbedding = async (text: string): Promise<number[]> => {
  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set. Returning simulated embedding.");
    // Fallback en mode simulation si la clé n'est pas configurée
    const vectorSize = 1536;
    const seed = text.length % 100;
    return Array.from({ length: vectorSize }, (_, i) =>
      parseFloat(Math.sin(i + seed).toFixed(6))
    );
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small", // Modèle d'embedding recommandé
        input: text,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API failed: ${errorData.error.message}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error("Error calling OpenAI Embeddings API:", error);
    throw new Error("Failed to generate embedding from OpenAI.");
  }
};

Deno.serve(async (req) => {
  // Gestion CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }
  
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "User ID manquant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Récupération du profil astrologique réel
    const { data: astroProfile, error: fetchError } = await supabaseAdmin
      .from("astro_profiles")
      .select("sun_sign, moon_sign, rising_sign, symbolic_profile_text, archetype_profile")
      .eq("user_id", user_id)
      .single();

    if (fetchError || !astroProfile) {
      return new Response(
        JSON.stringify({ error: "Profil astrologique non trouvé. Exécutez d'abord calculate-astro-profile." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Créer une description textuelle pour l'embedding
    const description = `Profil astrologique de l'utilisateur ${user_id}: Signe Solaire ${astroProfile.sun_sign}, Signe Lunaire ${astroProfile.moon_sign}, Ascendant ${astroProfile.rising_sign}. Archétype: ${astroProfile.archetype_profile?.dominant_element || "Non défini"} ${astroProfile.archetype_profile?.dominant_modality || "Non défini"}. Profil Symbolique: ${astroProfile.symbolic_profile_text || "Non généré"}`;

    // 3. Générer l'embedding
    const embedding = await generateEmbedding(description);

    // 4. Sauvegarder l'embedding dans la table astro_profiles
    const { error: updateError } = await supabaseAdmin
      .from("astro_profiles")
      .update({ astro_embedding: embedding })
      .eq("user_id", user_id);

    if (updateError) {
      console.error("❌ Database error:", updateError);
      return new Response(
        JSON.stringify({ error: "Erreur lors de la sauvegarde de l'embedding" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Astro embedding généré et sauvegardé avec succès",
        embedding_size: embedding.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ General error in generate-astro-embedding:", error);
    return new Response(
      JSON.stringify({ 
        error: `Erreur lors de la génération de l'embedding: ${error.message}` 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
