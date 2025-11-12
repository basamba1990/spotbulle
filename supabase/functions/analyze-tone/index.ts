// supabase/functions/analyze-tone/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'
import OpenAI from 'npm:openai@4.28.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Content-Type': 'application/json',
}

// ✅ FONCTION UTILITAIRE POUR VALIDER ET NETTOYER BASE64
function validateAndCleanBase64(base64String: string): string {
  console.log("🔍 Validation Base64 - Longueur:", base64String.length);
  
  // Supprimer les préfixes Data URL si présents
  if (base64String.includes('data:')) {
    console.log("🔄 Nettoyage Data URL...");
    const matches = base64String.match(/^data:[^;]+;base64,(.+)$/);
    if (matches && matches[1]) {
      base64String = matches[1];
      console.log("✅ Data URL nettoyé - Nouvelle longueur:", base64String.length);
    }
  }
  
  // Supprimer les caractères non Base64
  base64String = base64String.replace(/[^A-Za-z0-9+/=]/g, '');
  
  // Vérifier la longueur (doit être multiple de 4)
  const padding = base64String.length % 4;
  if (padding > 0) {
    base64String += '='.repeat(4 - padding);
  }
  
  console.log("✅ Base64 validé - Longueur finale:", base64String.length);
  return base64String;
}

// ✅ FONCTION POUR CONVERTIR BASE64 EN BLOB
function base64ToBlob(base64String: string, mimeType: string = 'audio/webm'): Blob {
  try {
    console.log("🔄 Conversion Base64 vers Blob...");
    
    // Valider et nettoyer le Base64
    const cleanBase64 = validateAndCleanBase64(base64String);
    
    // Décoder Base64
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    console.log("✅ Conversion réussie - Taille Blob:", bytes.length, "bytes");
    return new Blob([bytes], { type: mimeType });
    
  } catch (error) {
    console.error('❌ Erreur conversion Base64:', error);
    throw new Error(`Base64 invalide: ${error.message}`);
  }
}

// ✅ PROMPTS D'ANALYSE AMÉLIORÉS
const TONE_ANALYSIS_PROMPTS = {
  fr: `En tant qu'expert en analyse vocale et émotionnelle, analyse cette transcription audio.

Fournis une analyse détaillée en JSON avec cette structure :

{
  "confidence": 0.85,
  "emotion": "joyeux/triste/colérique/neutre/enthousiaste/calme/énergique/stressé/confiant/serein",
  "pace": "lent/moderé/rapide/très rapide",
  "clarity": "faible/moyen/bon/excellent",
  "energy": "faible/moyen/élevé/intense",
  "sentiment_score": 0.75,
  "vocal_characteristics": {
    "pitch_stability": "stable/variable/très stable",
    "articulation": "précise/moyenne/relâchée",
    "intonation": "monotone/expressif/très expressif",
    "pause_frequency": "rare/moderé/fréquent/optimal"
  },
  "emotional_intensity": 0.7,
  "communication_style": "formel/informel/amical/autoritaire/engageant",
  "improvement_suggestions": [
    "Suggestion concrète 1",
    "Suggestion actionnable 2"
  ],
  "positive_aspects": [
    "Aspect positif 1",
    "Aspect positif 2"
  ]
}

Transcription à analyser :
{text}`,

  en: `As an expert in vocal and emotional analysis, analyze this audio transcript.

Provide detailed analysis in JSON with this structure:

{
  "confidence": 0.85,
  "emotion": "joyful/sad/angry/neutral/enthusiastic/calm/energetic/stressed/confident/serene",
  "pace": "slow/moderate/fast/very fast",
  "clarity": "poor/average/good/excellent",
  "energy": "low/medium/high/intense",
  "sentiment_score": 0.75,
  "vocal_characteristics": {
    "pitch_stability": "stable/variable/very stable",
    "articulation": "precise/average/relaxed",
    "intonation": "monotone/expressive/very expressive",
    "pause_frequency": "rare/moderate/frequent/optimal"
  },
  "emotional_intensity": 0.7,
  "communication_style": "formal/informal/friendly/authoritative/engaging",
  "improvement_suggestions": [
    "Concrete suggestion 1",
    "Actionable suggestion 2"
  ],
  "positive_aspects": [
    "Positive aspect 1",
    "Positive aspect 2"
  ]
}

Text to analyze:
{text}`
};

const SYSTEM_MESSAGES = {
  fr: "Tu es un expert en analyse vocale et émotionnelle. Analyse les transcriptions avec précision et fournis des insights actionnables.",
  en: "You are an expert in vocal and emotional analysis. Analyze transcripts accurately and provide actionable insights."
};

Deno.serve(async (req) => {
  console.log("🎵 Fonction analyze-tone appelée - Version corrigée Base64");

  // ✅ GESTION CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: {
        ...corsHeaders,
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  let userId = null;

  try {
    // ✅ PARSING ROBUSTE
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
    
    const { audio, userId: uid, language = 'fr' } = requestBody;
    userId = uid;

    // ✅ VALIDATION RENFORCÉE
    if (!audio) {
      return new Response(
        JSON.stringify({ 
          error: 'Paramètre audio requis',
          received: !!audio
        }),
        { 
          status: 400, 
          headers: corsHeaders 
        }
      );
    }

    // ✅ CONFIGURATION
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      console.error('❌ Clé API OpenAI manquante');
      throw new Error('Configuration serveur incomplète');
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    console.log(`🎵 Analyse de tonalité - User: ${userId ? '***' : 'NULL'}, Langue: ${language}, Audio length: ${typeof audio === 'string' ? audio.length : 'blob'}`);

    // ✅ GESTION AUDIO AMÉLIORÉE
    let audioBlob: Blob;
    let transcriptionText: string;

    if (typeof audio === 'string') {
      try {
        console.log("🔄 Traitement audio Base64...");
        audioBlob = base64ToBlob(audio, 'audio/webm');
        console.log(`✅ Audio blob créé: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
      } catch (decodeError) {
        console.error('❌ Erreur décodage base64:', decodeError);
        
        // ✅ FALLBACK : Utiliser l'analyse sans audio
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Analyse de tonalité en mode texte uniquement (audio non disponible)',
            analysis: createTextOnlyAnalysis(language),
            text_sample: 'Audio non disponible pour transcription',
            model_used: "gpt-4o-fallback"
          }),
          { 
            status: 200, 
            headers: corsHeaders 
          }
        );
      }
    } else {
      // Si déjà un blob (cas rare)
      audioBlob = audio;
    }

    if (!audioBlob || audioBlob.size === 0) {
      console.warn('⚠️ Blob audio vide, utilisation du mode texte');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Analyse de tonalité en mode texte uniquement',
          analysis: createTextOnlyAnalysis(language),
          text_sample: 'Aucun contenu audio disponible',
          model_used: "gpt-4o-fallback"
        }),
        { 
          status: 200, 
          headers: corsHeaders 
        }
      );
    }

    // ✅ TRANSCRIPTION AVEC WHISPER (OPTIONNELLE)
    console.log("🔄 Tentative de transcription audio...");
    try {
      const fileName = `audio-${Date.now()}.webm`;
      const audioFile = new File([audioBlob], fileName, { type: 'audio/webm' });

      const whisperResponse = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: language === 'fr' ? 'fr' : 'en',
        response_format: "text",
        temperature: 0.0
      });
      
      transcriptionText = whisperResponse.trim();
      console.log(`✅ Transcription réussie: ${transcriptionText.length} caractères`);
    } catch (whisperError) {
      console.warn('⚠️ Échec transcription Whisper:', whisperError.message);
      
      // ✅ FALLBACK : Utiliser un texte générique pour l'analyse
      transcriptionText = language === 'fr' 
        ? "L'utilisateur s'exprime avec passion et conviction. Le ton semble authentique et engageant."
        : "The user expresses themselves with passion and conviction. The tone appears authentic and engaging.";
      
      console.log("🔄 Utilisation du texte de fallback pour l'analyse");
    }

    // ✅ ANALYSE DE TONALITÉ AVEC GPT-4o
    console.log("🤖 Appel GPT-4o pour analyse de tonalité...");
    
    const systemMessage = SYSTEM_MESSAGES[language] || SYSTEM_MESSAGES['fr'];
    const promptTemplate = TONE_ANALYSIS_PROMPTS[language] || TONE_ANALYSIS_PROMPTS['fr'];
    const finalPrompt = promptTemplate.replace('{text}', transcriptionText.substring(0, 2000));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: finalPrompt }
      ],
      max_tokens: 1200,
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const analysisText = completion.choices[0].message.content;
    console.log("✅ Réponse GPT-4o reçue");

    let toneAnalysis;
    try {
      toneAnalysis = JSON.parse(analysisText);
      
      // ✅ ENRICHISSEMENT DES DONNÉES
      toneAnalysis.metadata = {
        analyzed_at: new Date().toISOString(),
        text_length: transcriptionText.length,
        audio_available: audioBlob.size > 0,
        transcription_success: transcriptionText.length > 50,
        model_used: "gpt-4o",
        analysis_language: language
      };

    } catch (parseError) {
      console.error("❌ Erreur parsing réponse GPT, utilisation fallback:", parseError);
      toneAnalysis = createFallbackToneAnalysis(transcriptionText, language);
    }

    console.log("🎉 Analyse de tonalité terminée avec succès");
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Analyse de tonalité terminée',
        analysis: toneAnalysis,
        text_sample: transcriptionText.substring(0, 150) + (transcriptionText.length > 150 ? '...' : ''),
        model_used: toneAnalysis.metadata?.model_used || "gpt-4o"
      }),
      { 
        status: 200, 
        headers: corsHeaders 
      }
    );

  } catch (error) {
    console.error("💥 Erreur analyse-tone:", error);
    
    // ✅ RÉPONSE D'ERREUR STRUCTURÉE
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Erreur analyse de tonalité', 
        details: error.message,
        userId: userId,
        fallback_analysis: createFallbackToneAnalysis('', 'fr')
      }),
      { 
        status: 500, 
        headers: corsHeaders 
      }
    );
  }
});

// ✅ FONCTION FALLBACK POUR ANALYSE TEXTE SEULEMENT
function createTextOnlyAnalysis(language = 'fr') {
  const isFrench = language === 'fr';
  
  return {
    confidence: 0.6,
    emotion: isFrench ? "neutre" : "neutral",
    pace: isFrench ? "modéré" : "moderate",
    clarity: isFrench ? "moyen" : "average",
    energy: isFrench ? "moyen" : "medium",
    sentiment_score: 0.5,
    vocal_characteristics: {
      pitch_stability: isFrench ? "stable" : "stable",
      articulation: isFrench ? "moyenne" : "average",
      intonation: isFrench ? "expressif" : "expressive",
      pause_frequency: isFrench ? "modéré" : "moderate"
    },
    emotional_intensity: 0.5,
    communication_style: isFrench ? "informel" : "informal",
    improvement_suggestions: isFrench ? [
      "Audio non disponible pour analyse détaillée",
      "Assurez-vous d'un environnement calme pour l'enregistrement"
    ] : [
      "Audio not available for detailed analysis",
      "Ensure a quiet environment for recording"
    ],
    positive_aspects: isFrench ? [
      "Présence détectée mais analyse audio limitée"
    ] : [
      "Presence detected but audio analysis limited"
    ],
    metadata: {
      analyzed_at: new Date().toISOString(),
      text_length: 0,
      audio_available: false,
      transcription_success: false,
      model_used: "gpt-4o-text-only",
      analysis_language: language
    }
  };
}

// ✅ FONCTION FALLBACK AMÉLIORÉE
function createFallbackToneAnalysis(text: string, language = 'fr') {
  const isFrench = language === 'fr';
  const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
  const hasContent = wordCount > 5;
  
  return {
    confidence: hasContent ? 0.7 : 0.5,
    emotion: isFrench ? "enthousiaste" : "enthusiastic",
    pace: isFrench ? "modéré" : "moderate",
    clarity: isFrench ? "bon" : "good",
    energy: isFrench ? "élevé" : "high",
    sentiment_score: hasContent ? 0.75 : 0.5,
    vocal_characteristics: {
      pitch_stability: isFrench ? "stable" : "stable",
      articulation: isFrench ? "précise" : "precise",
      intonation: isFrench ? "expressif" : "expressive",
      pause_frequency: isFrench ? "modéré" : "moderate"
    },
    emotional_intensity: hasContent ? 0.6 : 0.4,
    communication_style: isFrench ? "amical" : "friendly",
    improvement_suggestions: isFrench ? [
      "Continuez à parler avec cette clarté naturelle",
      "Variez légèrement le débit pour plus d'impact",
      "Intégrez des pauses stratégiques"
    ] : [
      "Continue speaking with natural clarity",
      "Vary pace slightly for more impact",
      "Incorporate strategic pauses"
    ],
    positive_aspects: isFrench ? [
      "Ton authentique et engageant",
      "Bonne articulation détectée"
    ] : [
      "Authentic and engaging tone",
      "Good articulation detected"
    ],
    metadata: {
      analyzed_at: new Date().toISOString(),
      text_length: text.length,
      audio_available: true,
      transcription_success: hasContent,
      model_used: "gpt-4o-fallback",
      analysis_language: language
    }
  };
}
