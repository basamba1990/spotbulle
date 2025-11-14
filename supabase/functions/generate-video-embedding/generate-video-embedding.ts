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

Deno.serve(async (req) => {
  // Gestion CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }
  
  try {
    const { video_id } = await req.json();

    if (!video_id) {
      return new Response(JSON.stringify({ error: "Missing video_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Récupérer les données d'analyse vidéo
    const { data: video, error: fetchError } = await supabaseAdmin
      .from("videos")
      .select("title, analysis, transcription")
      .eq("id", video_id)
      .single();

    if (fetchError || !video) {
      return new Response(
        JSON.stringify({ error: "Video not found or missing analysis data" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Créer une description textuelle pour l'embedding
    const analysisText = JSON.stringify(video.analysis || {});
    const transcriptionText = JSON.stringify(video.transcription || {});
    const description = `Analyse vidéo pour "${video.title}". Analyse: ${analysisText}. Transcription: ${transcriptionText}.`;

    // 3. Générer l'embedding
    const embedding = await generateEmbedding(description);

    // 4. Sauvegarder l'embedding dans la table videos
    const { error: updateError } = await supabaseAdmin
      .from("videos")
      .update({ video_embedding: embedding })
      .eq("id", video_id);

    if (updateError) {
      console.error("Error saving video embedding:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save video embedding" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Video embedding generated and saved successfully",
        embedding_size: embedding.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("General error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
