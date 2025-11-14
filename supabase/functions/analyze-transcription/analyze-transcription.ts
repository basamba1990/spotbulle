// supabase/functions/analyze-transcription/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.44.0'
import OpenAI from 'npm:openai@4.28.0'

// Intégration de corsHeaders
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET, PUT, DELETE",
  "Content-Type": "application/json",
};

// Intégration de retryWithBackoff
const retryWithBackoff = async (
  fn,
  maxRetries = 3,
  baseDelay = 1000
) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxRetries - 1) throw e;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Should be unreachable
  throw new Error("Retry function failed after all attempts.");
};

// ✅ CACHE PERFORMANT
const analysisCache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

const VIDEO_STATUS = {
  UPLOADED: 'uploaded',
  PROCESSING: 'processing',
  TRANSCRIBED: 'transcribed',
  ANALYZING: 'analyzing',
  ANALYZED: 'analyzed',
  PUBLISHED: 'published',
  FAILED: 'failed'
};

// ✅ PROMPTS AVANCÉS POUR GPT-4
const ANALYSIS_PROMPTS = {
  fr: `En tant qu'expert en communication et analyse vocale, analyse cette transcription vidéo de manière approfondie.

Fournis une analyse détaillée en JSON avec cette structure :

{
  "summary": "Résumé concis et percutant (180-250 mots)",
  "key_topics": ["liste", "de", "thèmes", "principaux", "spécifiques"],
  "sentiment": "positif/négatif/neutre/mixte",
  "sentiment_score": 0.87,
  "communication_advice": [
    "Conseil concret 1 avec exemple",
    "Conseil actionnable 2",
    "Recommandation stratégique 3"
  ],
  "tone_analysis": {
    "primary_emotion": "joyeux/triste/colérique/neutre/enthousiaste/calme/énergique/stressé/confiant/serein",
    "secondary_emotions": ["émotion secondaire 1", "émotion secondaire 2"],
    "pace": "lent/moderé/rapide/très rapide",
    "clarity": "faible/moyen/bon/excellent",
    "energy": "faible/moyen/élevé/intense",
    "confidence_level": 0.82,
    "vocal_characteristics": {
      "articulation": "précise/moyenne/relâchée",
      "intonation": "monotone/expressif/très expressif",
      "pause_usage": "efficace/inefficace/optimal",
      "emphasis_points": ["point 1", "point 2"]
    },
    "improvement_opportunities": [
      "Opportunité spécifique 1",
      "Opportunité mesurable 2"
    ]
  },
  "content_analysis": {
    "structure_quality": "faible/moyenne/bonne/excellente",
    "key_message_clarity": "flou/clair/très clair",
    "storytelling_elements": ["élément 1", "élément 2"],
    "persuasion_techniques": ["technique 1", "technique 2"]
  },
  "audience_analysis": {
    "target_match": "faible/moyen/fort/excellent",
    "engagement_potential": 0.78,
    "accessibility_level": "débutant/intermédiaire/expert"
  },
  "performance_metrics": {
    "overall_score": 8.2,
    "clarity_score": 8.5,
    "engagement_score": 7.9,
    "impact_score": 8.1
  },
  "actionable_insights": {
    "immediate_actions": ["action 1", "action 2"],
    "strategic_recommendations": ["recommandation 1", "recommandation 2"],
    "development_areas": ["domaine 1", "domaine 2"]
  }
}

Transcription à analyser :
{text}

IMPORTANT : Sois précis, constructif et fournis des insights actionnables.`,

  en: `As a communication and vocal analysis expert, perform a deep analysis of this video transcription.

Provide detailed analysis in JSON with this structure:

{
  "summary": "Concise and impactful summary (180-250 words)",
  "key_topics": ["list", "of", "main", "specific", "themes"],
  "sentiment": "positive/negative/neutral/mixed", 
  "sentiment_score": 0.87,
  "communication_advice": [
    "Concrete advice 1 with example",
    "Actionable advice 2",
    "Strategic recommendation 3"
  ],
  "tone_analysis": {
    "primary_emotion": "joyful/sad/angry/neutral/enthusiastic/calm/energetic/stressed/confident/serene",
    "secondary_emotions": ["secondary emotion 1", "secondary emotion 2"],
    "pace": "slow/moderate/fast/very fast",
    "clarity": "poor/average/good/excellent",
    "energy": "low/medium/high/intense",
    "confidence_level": 0.82,
    "vocal_characteristics": {
      "articulation": "precise/average/relaxed",
      "intonation": "monotone/expressive/very expressive", 
      "pause_usage": "effective/ineffective/optimal",
      "emphasis_points": ["point 1", "point 2"]
    },
    "improvement_opportunities": [
      "Specific opportunity 1",
      "Measurable opportunity 2"
    ]
  },
  "content_analysis": {
    "structure_quality": "poor/average/good/excellent",
    "key_message_clarity": "unclear/clear/very clear",
    "storytelling_elements": ["element 1", "element 2"],
    "persuasion_techniques": ["technique 1", "technique 2"]
  },
  "audience_analysis": {
    "target_match": "weak/average/strong/excellent",
    "engagement_potential": 0.78,
    "accessibility_level": "beginner/intermediate/expert"
  },
  "performance_metrics": {
    "overall_score": 8.2,
    "clarity_score": 8.5,
    "engagement_score": 7.9,
    "impact_score": 8.1
  },
  "actionable_insights": {
    "immediate_actions": ["action 1", "action 2"],
    "strategic_recommendations": ["recommendation 1", "recommendation 2"],
    "development_areas": ["area 1", "area 2"]
  }
}

Text to analyze:
{text}

IMPORTANT: Be precise, constructive and provide actionable insights.`
};

const SYSTEM_MESSAGES = {
  fr: "Tu es un expert en communication, analyse vocale et psychologie du langage. Tu analyses les transcriptions vidéo avec une expertise approfondie pour fournir des insights actionnables, constructifs et précis. Tes analyses combinent intelligence artificielle et compréhension humaine.",
  en: "You are an expert in communication, vocal analysis and language psychology. You analyze video transcripts with deep expertise to provide actionable, constructive and precise insights. Your analyses combine artificial intelligence and human understanding."
};

// Fonctions utilitaires
function generateTextHash(text) {
  let hash = 0;
  if (text.length === 0) return hash;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(16);
}

function detectLanguage(text) {
  // Implémentation simple de détection de langue (peut être améliorée)
  const frenchKeywords = ['le', 'la', 'les', 'un', 'une', 'des', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'est', 'sont', 'mais', 'ou', 'et', 'donc', 'or', 'ni', 'car'];
  const englishKeywords = ['the', 'a', 'an', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'is', 'are', 'but', 'or', 'and', 'so', 'nor', 'for'];

  let frenchCount = 0;
  let englishCount = 0;
  const words = text.toLowerCase().split(/\s+/);

  for (const word of words) {
    if (frenchKeywords.includes(word)) {
      frenchCount++;
    } else if (englishKeywords.includes(word)) {
      englishCount++;
    }
  }

  if (frenchCount > englishCount * 1.5) {
    return 'fr';
  } else if (englishCount > frenchCount * 1.5) {
    return 'en';
  } else {
    return 'fr'; // Par défaut
  }
}

async function saveAnalysisToDB(supabase, videoId, analysisData) {
  const { error } = await supabase
    .from('videos')
    .update({
      status: VIDEO_STATUS.ANALYZED,
      analysis_data: analysisData,
      performance_score: analysisData.performance_metrics?.overall_score || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', videoId);

  if (error) {
    console.error('❌ Erreur sauvegarde analyse:', error);
    throw new Error(`Erreur sauvegarde analyse: ${error.message}`);
  }
}

function createSuccessResponse(analysisData, fromCache = false) {
  return new Response(
    JSON.stringify({
      message: fromCache ? 'Analyse récupérée du cache et sauvegardée' : 'Analyse générée et sauvegardée avec succès',
      analysis: analysisData,
      from_cache: fromCache
    }),
    {
      status: 200,
      headers: corsHeaders
    }
  );
}

Deno.serve(async (req) => {
  console.log("🔍 Fonction analyze-transcription (GPT-4 optimisée) appelée");

  // Gestion OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: {
        ...corsHeaders,
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  let videoId = null;

  try {
    // PARSING ROBUSTE
    let requestBody;
    try {
      const rawBody = await req.text();
      if (!rawBody || rawBody.trim().length === 0) {
        throw new Error('Corps vide');
      }
      requestBody = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('❌ Erreur parsing JSON:', parseError);
      return new Response(
        JSON.stringify({ 
          error: 'JSON invalide', 
          details: parseError.message 
        }),
        { 
          status: 400, 
          headers: corsHeaders 
        }
      );
    }
    
    const { videoId: vidId, transcriptionText, userId, transcriptionLanguage } = requestBody;
    videoId = vidId;

    // VALIDATION RENFORCÉE
    if (!videoId || !transcriptionText) {
      return new Response(
        JSON.stringify({ 
          error: 'Paramètres manquants: videoId et transcriptionText requis',
          received: { videoId: !!videoId, transcriptionText: !!transcriptionText }
        }),
        { 
          status: 400, 
          headers: corsHeaders 
        }
      );
    }

    if (transcriptionText.trim().length < 20) {
      return new Response(
        JSON.stringify({ 
          error: 'Texte de transcription trop court (minimum 20 caractères)',
          length: transcriptionText.trim().length 
        }),
        { 
          status: 400, 
          headers: corsHeaders 
        }
      );
    }

    // CONFIGURATION
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
      console.error('❌ Configuration manquante:', {
        supabaseUrl: !!supabaseUrl,
        supabaseServiceKey: !!supabaseServiceKey,
        openaiApiKey: !!openaiApiKey
      });
      throw new Error('Configuration serveur incomplète');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // VÉRIFICATION VIDÉO
    console.log(`🔍 Vérification vidéo: ${videoId}`);
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .single();

    if (videoError || !video) {
      console.error('❌ Vidéo non trouvée:', videoError);
      throw new Error(`Vidéo non trouvée: ${videoError?.message || 'Aucune donnée'}`);
    }

    // PERMISSIONS
    if (userId && video.user_id !== userId) {
      throw new Error('Accès non autorisé');
    }

    console.log("🔄 Mise à jour statut ANALYZING");
    const { error: updateError } = await supabase
      .from('videos')
      .update({ 
        status: VIDEO_STATUS.ANALYZING,
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId);

    if (updateError) {
      console.error('❌ Erreur mise à jour statut:', updateError);
      throw new Error(`Erreur mise à jour: ${updateError.message}`);
    }

    // OPTIMISATION TEXTE
    const cleanText = transcriptionText.trim().substring(0, 12000);
    console.log(`📝 Texte à analyser: ${cleanText.length} caractères`);

    // CACHE
    const textHash = generateTextHash(cleanText);
    const cacheKey = `${videoId}_${textHash}`;
    
    const cachedAnalysis = analysisCache.get(cacheKey);
    if (cachedAnalysis && (Date.now() - cachedAnalysis.timestamp < CACHE_TTL)) {
      console.log("✅ Utilisation du cache");
      await saveAnalysisToDB(supabase, videoId, cachedAnalysis.data);
      return createSuccessResponse(cachedAnalysis.data, true);
    }

    // DÉTECTION LANGUE
    const analysisLanguage = transcriptionLanguage || detectLanguage(cleanText) || 'fr';
    console.log(`🌐 Langue d'analyse: ${analysisLanguage}`);

    const systemMessage = SYSTEM_MESSAGES[analysisLanguage] || SYSTEM_MESSAGES['fr'];
    const promptTemplate = ANALYSIS_PROMPTS[analysisLanguage] || ANALYSIS_PROMPTS['fr'];
    const finalPrompt = promptTemplate.replace('{text}', cleanText.substring(0, 8000));

    console.log("🤖 Appel GPT-4 pour analyse avancée...");

    // APPEL GPT-4 AVEC RETRY
    const completion = await retryWithBackoff(async () => {
      return await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: finalPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.7,
        response_format: { type: "json_object" },
      });
    });

    const analysisJson = JSON.parse(completion.choices[0].message.content);
    
    // SAUVEGARDE
    await saveAnalysisToDB(supabase, videoId, analysisJson);

    // MISE À JOUR CACHE
    analysisCache.set(cacheKey, {
      data: analysisJson,
      timestamp: Date.now()
    });

    console.log("✅ Analyse terminée et sauvegardée.");
    return createSuccessResponse(analysisJson);

  } catch (error) {
    console.error(`❌ Erreur fatale dans analyze-transcription pour videoId ${videoId}:`, error);
    
    // Mise à jour du statut en cas d'échec
    if (videoId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase
          .from('videos')
          .update({ 
            status: VIDEO_STATUS.FAILED,
            updated_at: new Date().toISOString(),
            error_message: `Analyse échouée: ${error.message}`
          })
          .eq('id', videoId)
          .select();
      }
    }

    return new Response(
      JSON.stringify({ 
        error: `Erreur interne du serveur: ${error.message}`,
        videoId: videoId
      }),
      { 
        status: 500, 
        headers: corsHeaders 
      }
    );
  }
});
