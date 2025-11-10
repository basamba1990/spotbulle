import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";
import { OpenAI } from "https://esm.sh/openai@4.10.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Fonction pour générer le prompt structuré pour GPT-4
const generatePrompt = (astroProfile: any) => {
  const planetaryPositions = Object.entries(astroProfile.planetary_positions)
    .map(([planet, pos]: [string, any]) => `${planet} en ${pos.sign} (Maison ${pos.house}, ${pos.degree.toFixed(1)}°)`)
    .join(", ");

  const prompt = `
    En tant que SpotCoach, un agent d'IA spécialisé en synergie et performance, analyse le profil astrologique suivant et génère un profil symbolique concis et inspirant.
    Le profil doit être orienté vers la communication, le leadership et la collaboration.

    **Données Astrologiques Brutes :**
    - Signe Solaire : ${astroProfile.sun_sign}
    - Signe Lunaire : ${astroProfile.moon_sign}
    - Ascendant : ${astroProfile.rising_sign}
    - Archétype Dominant : ${astroProfile.archetype_profile.dominant_element} ${astroProfile.archetype_profile.dominant_modality}
    - Positions Planétaires Clés : ${planetaryPositions}

    **Format de Sortie (JSON Strict) :**
    Tu dois retourner un objet JSON avec les clés suivantes :
    1. "archetype": Un mot ou une courte phrase décrivant l'archétype symbolique (ex: "Le Stratège Visionnaire", "Le Communicateur Passionné").
    2. "color": Une couleur dominante (ex: "Bleu Saphir", "Rouge Carmin") et sa signification.
    3. "phrase": Une phrase de synchronie inspirante pour l'utilisateur.
    4. "text": Un paragraphe de 300 mots maximum décrivant le profil, ses forces en collaboration, et son style de leadership.
  `;
  return prompt;
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

    // 1. Récupérer le profil astrologique calculé
    const { data: astroProfile, error: fetchError } = await supabaseAdmin
      .from("astro_profiles")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (fetchError || !astroProfile) {
      return new Response(
        JSON.stringify({ error: "Astro profile not found. Run calculate-astro-profile first." }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 2. Générer le profil symbolique avec GPT-4
    const prompt = generatePrompt(astroProfile);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Utilisation de gpt-4o-mini pour la rapidité et le coût
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      response_format: { type: "json_object" },
    });

    const symbolicData = JSON.parse(completion.choices[0].message.content);

    // 3. Sauvegarder le profil symbolique dans la table astro_profiles
    const { error: updateError } = await supabaseAdmin
      .from("astro_profiles")
      .update({
        symbolic_profile_text: symbolicData.text,
        symbolic_phrase: symbolicData.phrase,
        symbolic_archetype: symbolicData.archetype,
        symbolic_color: symbolicData.color,
      })
      .eq("user_id", user_id);

    if (updateError) {
      console.error("Error saving symbolic profile:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save symbolic profile" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Symbolic profile generated and saved successfully",
        profile: symbolicData,
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
