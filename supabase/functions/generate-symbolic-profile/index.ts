import { createClient } from "npm:@supabase/supabase-js@2.44.0";
import OpenAI from "npm:openai@4.28.0";
import { corsHeaders } from "../_shared/http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Génération du prompt pour GPT-4 basé sur les données astrologiques réelles
function generateSymbolicProfilePrompt(astroProfile: any) {
  const planetaryDetails = Object.entries(astroProfile.planetary_positions || {})
    .map(([planet, data]: [string, any]) => 
      `${planet} en ${data.sign} (Maison ${data.house}, ${data.degree}°)`
    )
    .join(", ");

  const housesDetails = (astroProfile.houses_data || [])
    .map((house: any, index: number) => 
      `Maison ${index + 1}: ${house.sign}`
    )
    .join(", ");

  return `
En tant que SpotCoach, expert en synergie et performance, analyse ce profil astrologique COMPLET et génère un profil symbolique inspirant et personnalisé.

**DONNÉES ASTROLOGIQUES RÉELLES:**
- 🌞 Signe Solaire: ${astroProfile.sun_sign}
- 🌙 Signe Lunaire: ${astroProfile.moon_sign}
- ⬆️ Ascendant: ${astroProfile.rising_sign}
- 🪐 Positions Planétaires: ${planetaryDetails}
- 🏠 Maisons Astrologiques: ${housesDetails}
- 🔮 Archétype: ${astroProfile.archetype_profile?.dominant_element || "Non défini"} ${astroProfile.archetype_profile?.dominant_modality || "Non défini"}

**CONTEXTE SPOTCOACH:**
SpotBulle est une plateforme d'expression orale et de connexion humaine. Le profil doit mettre en avant:
- Les talents naturels en communication
- Le style de leadership et collaboration  
- Les synergies potentielles avec d'autres profils
- Les forces pour l'expression devant caméra

**FORMAT DE RÉPONSE STRICT (JSON):**
{
  "symbolic_archetype": "Nom de l'archétype (ex: 'Le Communicateur Visionnaire', 'Le Stratège Émotionnel')",
  "symbolic_color": "Couleur dominante avec signification (ex: 'Bleu Saphir - Profondeur et Confiance')",
  "symbolic_phrase": "Phrase inspirante personnalisée (1 ligne max)",
  "symbolic_profile_text": "Description détaillée de 200-300 mots incluant: forces en communication, style de leadership, conseils pour l'expression orale, synergies naturelles"
}

**IMPORTANT:** Sois précis, inspirant et basé sur les données astrologiques réelles. Évite les généralités.
  `.trim();
}

Deno.serve(async (req) => {
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
      .select("sun_sign, moon_sign, rising_sign, planetary_positions, houses_data, archetype_profile")
      .eq("user_id", user_id)
      .single();

    if (fetchError || !astroProfile) {
      return new Response(
        JSON.stringify({ error: "Profil astrologique non trouvé. Exécutez d'abord calculate-astro-profile." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Génération du profil symbolique avec GPT-4
    console.log("🧠 Generating symbolic profile with GPT-4...");
    const prompt = generateSymbolicProfilePrompt(astroProfile);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "Tu es SpotCoach, un expert en synergie humaine et performance. Tu analyses les profils astrologiques pour révéler les talents naturels en communication et leadership." 
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 1500,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const symbolicData = JSON.parse(completion.choices[0].message.content!);
    console.log("✅ Symbolic profile generated:", symbolicData.symbolic_archetype);

    // 3. Sauvegarde du profil symbolique
    const { error: updateError } = await supabaseAdmin
      .from("astro_profiles")
      .update({
        symbolic_profile_text: symbolicData.symbolic_profile_text,
        symbolic_phrase: symbolicData.symbolic_phrase,
        symbolic_archetype: symbolicData.symbolic_archetype,
        symbolic_color: symbolicData.symbolic_color,
        symbolic_generated_at: new Date().toISOString()
      })
      .eq("user_id", user_id);

    if (updateError) {
      console.error("❌ Database error:", updateError);
      return new Response(
        JSON.stringify({ error: "Erreur lors de la sauvegarde du profil symbolique" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Profil symbolique généré et sauvegardé avec succès",
        profile: symbolicData,
        tokens_used: completion.usage?.total_tokens
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ General error in generate-symbolic-profile:", error);
    return new Response(
      JSON.stringify({ 
        error: `Erreur lors de la génération du profil symbolique: ${error.message}` 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
