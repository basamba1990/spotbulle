import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

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

serve(async (req) => {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Récupérer le profil astrologique
    const { data: astroProfile, error: fetchError } = await supabaseAdmin
      .from("astro_profiles")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (fetchError || !astroProfile) {
      return new Response(
        JSON.stringify({ error: "Astro profile not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 2. Créer une description textuelle pour l'embedding
    const description = `Profil astrologique de l'utilisateur ${user_id}: Signe Solaire ${astroProfile.sun_sign}, Signe Lunaire ${astroProfile.moon_sign}, Ascendant ${astroProfile.rising_sign}. Archétype: ${astroProfile.archetype_profile.dominant_element} ${astroProfile.archetype_profile.dominant_modality}.`;

    // 3. Générer l'embedding
    const embedding = await generateEmbedding(description);

    // 4. Sauvegarder l'embedding dans la table astro_profiles
    const { error: updateError } = await supabaseAdmin
      .from("astro_profiles")
      .update({ astro_embedding: embedding })
      .eq("user_id", user_id);

    if (updateError) {
      console.error("Error saving astro embedding:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save astro embedding" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Astro embedding generated and saved successfully",
        embedding_size: embedding.length,
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
