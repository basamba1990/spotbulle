import { supabase } from "../lib/supabase";

/**
 * Service complet pour les fonctionnalités astrologiques et de matching avancé
 * Version réelle avec intégration API astrologique et IA
 */

/**
 * Récupère le profil astrologique complet d'un utilisateur
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<object>} Profil astrologique complet
 */
export async function getAstroProfile(userId) {
  try {
    console.log('🔍 Fetching astro profile for user:', userId);
    
    const { data, error } = await supabase
      .from('astro_profiles')
      .select(`
        *,
        user:profiles!inner(full_name, avatar_url, birth_date, birth_time, birth_place)
      `)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('ℹ️ No astro profile found for user:', userId);
        return null;
      }
      throw error;
    }

    // Vérifier si le profil nécessite une mise à jour
    if (data && shouldRefreshAstroProfile(data)) {
      console.log('🔄 Astro profile needs refresh, triggering update...');
      await triggerAstroProfileUpdate(userId);
    }

    console.log('✅ Astro profile found:', data ? 'yes' : 'no');
    return data;
  } catch (error) {
    console.error('❌ Error fetching astro profile:', error);
    throw new Error(`Erreur lors de la récupération du profil astrologique: ${error.message}`);
  }
}

/**
 * Vérifie si un profil astrologique doit être rafraîchi
 * @param {object} profile - Profil astrologique
 * @returns {boolean} True si besoin de rafraîchissement
 */
function shouldRefreshAstroProfile(profile) {
  if (!profile.calculated_at) return true;
  
  const calculatedDate = new Date(profile.calculated_at);
  const now = new Date();
  const diffDays = (now - calculatedDate) / (1000 * 60 * 60 * 24);
  
  // Rafraîchir si le calcul a plus de 30 jours ou si des données manquent
  return diffDays > 30 || 
         !profile.sun_sign || 
         !profile.astro_embedding ||
         !profile.symbolic_archetype;
}

/**
 * Met à jour les données de naissance et déclenche le calcul astrologique
 * @param {string} userId - ID de l'utilisateur
 * @param {object} birthData - Données de naissance
 * @returns {Promise<object>} Résultat de la mise à jour
 */
export async function updateBirthData(userId, birthData) {
  try {
    console.log('📝 Updating birth data for user:', userId);
    
    // Validation avancée des données
    if (!birthData.date || !birthData.time || !birthData.place) {
      throw new Error('Données de naissance incomplètes: date, heure et lieu sont requis');
    }

    // Validation de la date
    const birthDate = new Date(birthData.date);
    const now = new Date();
    if (birthDate > now) {
      throw new Error('La date de naissance ne peut pas être dans le futur');
    }

    if (birthDate < new Date('1900-01-01')) {
      throw new Error('La date de naissance semble invalide');
    }

    // Validation du format de l'heure
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(birthData.time)) {
      throw new Error('Format d\'heure invalide. Utilisez HH:MM (24h)');
    }

    // Mettre à jour le profil avec vérification de sécurité
    const { data, error } = await supabase
      .from('profiles')
      .update({
        birth_date: birthData.date,
        birth_time: birthData.time,
        birth_place: birthData.place.trim(),
        birth_data_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === '23514') { // Contrainte de validation
        throw new Error('Données de naissance invalides');
      }
      throw error;
    }

    // Déclencher le calcul astrologique complet
    console.log('🚀 Triggering comprehensive astro calculation...');
    await triggerCompleteAstroCalculation(userId);

    return {
      ...data,
      message: 'Données de naissance mises à jour. Calcul astrologique en cours...'
    };

  } catch (error) {
    console.error('❌ Error updating birth data:', error);
    throw new Error(`Erreur lors de la mise à jour des données de naissance: ${error.message}`);
  }
}

/**
 * Déclenche le calcul astrologique complet
 * @param {string} userId - ID de l'utilisateur
 */
async function triggerCompleteAstroCalculation(userId) {
  try {
    const calculationSteps = [
      { function: 'calculate-astro-profile', name: 'Calcul du thème astral' },
      { function: 'generate-astro-embedding', name: 'Génération des embeddings' },
      { function: 'generate-symbolic-profile', name: 'Profil symbolique' }
    ];

    // Exécuter les étapes séquentiellement
    for (const step of calculationSteps) {
      console.log(`🔄 Executing: ${step.name}`);
      
      const { data, error } = await supabase.functions.invoke(step.function, {
        body: { user_id: userId }
      });

      if (error) {
        console.warn(`⚠️ ${step.name} warning:`, error.message);
        // Continuer avec l'étape suivante même en cas d'erreur
        continue;
      }

      console.log(`✅ ${step.name} completed successfully`);
      
      // Attendre un peu entre les étapes pour éviter la surcharge
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('🎉 Complete astro calculation finished');

  } catch (error) {
    console.error('❌ Error in complete astro calculation:', error);
    // Ne pas propager l'erreur pour ne pas bloquer l'utilisateur
  }
}

/**
 * Déclenche la mise à jour du profil astrologique
 * @param {string} userId - ID de l'utilisateur
 */
async function triggerAstroProfileUpdate(userId) {
  try {
    await supabase.functions.invoke('calculate-astro-profile', {
      body: { user_id: userId, force_refresh: true }
    });
  } catch (error) {
    console.warn('⚠️ Astro profile update trigger failed:', error.message);
  }
}

/**
 * Récupère les matchs avancés avec filtres et pagination
 * @param {object} options - Options de filtrage
 * @returns {Promise<Array<object>>} Liste des matchs
 */
export async function getAdvancedMatches(options = {}) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('Utilisateur non authentifié');
    }

    const {
      minScore = 0.6,
      maxResults = 20,
      includeProfiles = true,
      sortBy = 'overall_score'
    } = options;

    console.log('🔍 Fetching advanced matches for user:', user.id);

    let query = supabase
      .from('advanced_matches')
      .select(`
        *,
        user_a:profiles!advanced_matches_user_a_id_fkey(
          id,
          full_name,
          avatar_url,
          bio,
          skills,
          interests
        ),
        user_b:profiles!advanced_matches_user_b_id_fkey(
          id,
          full_name,
          avatar_url,
          bio,
          skills,
          interests
        )
      `)
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .gte('overall_score', minScore)
      .order(sortBy, { ascending: false })
      .limit(maxResults);

    const { data, error } = await query;

    if (error) {
      if (error.code === 'PGRST116') {
        return [];
      }
      throw error;
    }

    // Enrichir avec les données astrologiques des matchs
    const enrichedMatches = await Promise.all(
      (data || []).map(async (match) => {
        const otherUserId = match.user_a_id === user.id ? match.user_b_id : match.user_a_id;
        
        try {
          const astroProfile = await getAstroProfile(otherUserId);
          return {
            ...match,
            other_user_astro: astroProfile,
            compatibility_breakdown: {
              astro: match.astro_compatibility,
              vector: match.vector_similarity,
              overall: match.overall_score
            }
          };
        } catch (astroError) {
          console.warn('⚠️ Could not fetch astro profile for match:', astroError.message);
          return match;
        }
      })
    );

    console.log(`✅ Found ${enrichedMatches.length} advanced matches`);
    return enrichedMatches;

  } catch (error) {
    console.error('❌ Error fetching advanced matches:', error);
    throw new Error(`Erreur lors de la récupération des matchs avancés: ${error.message}`);
  }
}

/**
 * Déclenche le calcul de matching avancé
 * @param {object} options - Options du matching
 * @returns {Promise<object>} Résultat du matching
 */
export async function triggerAdvancedMatching(options = {}) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('Utilisateur non authentifié');
    }

    const {
      algorithm = 'hybrid',
      maxMatches = 50,
      minCompatibility = 0.5,
      forceRefresh = false
    } = options;

    console.log('🚀 Triggering advanced matching for user:', user.id);

    const { data, error } = await supabase.functions.invoke('find-advanced-matches', {
      body: { 
        user_id: user.id,
        algorithm,
        max_matches: maxMatches,
        min_compatibility: minCompatibility,
        force_refresh: forceRefresh
      }
    });

    if (error) {
      // Si l'erreur est due à un calcul déjà en cours, on retourne un statut
      if (error.message?.includes('already in progress')) {
        return {
          status: 'in_progress',
          message: 'Calcul de matching déjà en cours'
        };
      }
      throw error;
    }

    console.log('✅ Advanced matching triggered successfully');
    
    return {
      status: 'success',
      message: 'Calcul de matching avancé démarré',
      data: data,
      estimated_completion: '2-5 minutes'
    };

  } catch (error) {
    console.error('❌ Error triggering advanced matching:', error);
    throw new Error(`Erreur lors du déclenchement du matching avancé: ${error.message}`);
  }
}

/**
 * Génère le profil symbolique via IA
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<object>} Profil symbolique généré
 */
export async function generateSymbolicProfile(userId) {
  try {
    console.log('🎨 Generating symbolic profile for user:', userId);

    const { data, error } = await supabase.functions.invoke('generate-symbolic-profile', {
      body: { 
        user_id: userId,
        enhance_with_ai: true,
        language: 'fr'
      }
    });

    if (error) {
      throw error;
    }

    console.log('✅ Symbolic profile generated successfully');
    return data;

  } catch (error) {
    console.error('❌ Error generating symbolic profile:', error);
    throw new Error(`Erreur lors de la génération du profil symbolique: ${error.message}`);
  }
}

/**
 * Récupère les recommandations de projets basées sur l'astrologie
 * @param {object} options - Options de filtrage
 * @returns {Promise<Array<object>>} Recommandations de projets
 */
export async function getProjectRecommendations(options = {}) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('Utilisateur non authentifié');
    }

    const { maxResults = 10, minScore = 0.7 } = options;

    console.log('💡 Fetching project recommendations for user:', user.id);

    const { data, error } = await supabase
      .from('project_recommendations')
      .select(`
        *,
        user_a:profiles!project_recommendations_user_a_id_fkey(
          id, full_name, avatar_url, skills
        ),
        user_b:profiles!project_recommendations_user_b_id_fkey(
          id, full_name, avatar_url, skills
        )
      `)
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .gte('match_score', minScore)
      .order('match_score', { ascending: false })
      .limit(maxResults);

    if (error) {
      if (error.code === 'PGRST116') {
        return [];
      }
      throw error;
    }

    console.log(`✅ Found ${data?.length || 0} project recommendations`);
    return data || [];

  } catch (error) {
    console.error('❌ Error fetching project recommendations:', error);
    throw new Error(`Erreur lors de la récupération des recommandations: ${error.message}`);
  }
}

/**
 * Déclenche la génération de recommandations de projets
 * @returns {Promise<object>} Résultat de la génération
 */
export async function triggerProjectRecommendations() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Utilisateur non authentifié');
    }

    console.log('🚀 Triggering project recommendations for user:', user.id);

    const { data, error } = await supabase.functions.invoke('generate-project-recommendations', {
      body: { user_id: user.id }
    });

    if (error) throw error;

    console.log('✅ Project recommendations triggered successfully');
    return data;

  } catch (error) {
    console.error('❌ Error triggering project recommendations:', error);
    throw new Error(`Erreur lors de la génération des recommandations: ${error.message}`);
  }
}

/**
 * Récupère la compatibilité détaillée entre deux utilisateurs
 * @param {string} otherUserId - ID de l'autre utilisateur
 * @returns {Promise<object>} Analyse de compatibilité
 */
export async function getCompatibilityAnalysis(otherUserId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Utilisateur non authentifié');
    }

    console.log('💞 Calculating compatibility between:', user.id, 'and', otherUserId);

    const [userAstro, otherUserAstro] = await Promise.all([
      getAstroProfile(user.id),
      getAstroProfile(otherUserId)
    ]);

    if (!userAstro || !otherUserAstro) {
      throw new Error('Profils astrologiques incomplets pour les deux utilisateurs');
    }

    // Calculer la compatibilité locale en attendant l'Edge Function
    const compatibility = calculateLocalCompatibility(userAstro, otherUserAstro);

    return {
      users: {
        current_user: user.id,
        other_user: otherUserId
      },
      compatibility_scores: compatibility,
      astro_profiles: {
        current_user: userAstro,
        other_user: otherUserAstro
      },
      recommendations: generateCompatibilityRecommendations(compatibility),
      generated_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error in compatibility analysis:', error);
    throw new Error(`Erreur lors de l'analyse de compatibilité: ${error.message}`);
  }
}

/**
 * Calcule la compatibilité locale entre deux profils astrologiques
 * @param {object} profileA - Premier profil
 * @param {object} profileB - Deuxième profil
 * @returns {object} Scores de compatibilité
 */
function calculateLocalCompatibility(profileA, profileB) {
  const sunCompatibility = calculateSignCompatibility(profileA.sun_sign, profileB.sun_sign);
  const moonCompatibility = calculateSignCompatibility(profileA.moon_sign, profileB.moon_sign);
  const risingCompatibility = calculateSignCompatibility(profileA.rising_sign, profileB.rising_sign);

  const overallScore = (sunCompatibility * 0.4 + moonCompatibility * 0.35 + risingCompatibility * 0.25);

  return {
    overall: parseFloat(overallScore.toFixed(3)),
    sun_sign: parseFloat(sunCompatibility.toFixed(3)),
    moon_sign: parseFloat(moonCompatibility.toFixed(3)),
    rising_sign: parseFloat(risingCompatibility.toFixed(3)),
    element_compatibility: calculateElementCompatibility(profileA.sun_sign, profileB.sun_sign)
  };
}

/**
 * Calcule la compatibilité entre deux signes
 * @param {string} signA - Premier signe
 * @param {string} signB - Deuxième signe
 * @returns {number} Score de compatibilité
 */
function calculateSignCompatibility(signA, signB) {
  if (!signA || !signB) return 0.5;

  if (signA === signB) return 0.8; // Même signe = bonne compatibilité

  const compatiblePairs = {
    'Bélier': ['Balance', 'Lion', 'Sagittaire'],
    'Taureau': ['Scorpion', 'Vierge', 'Capricorne'],
    'Gémeaux': ['Sagittaire', 'Balance', 'Verseau'],
    'Cancer': ['Capricorne', 'Scorpion', 'Poissons'],
    'Lion': ['Verseau', 'Balance', 'Sagittaire'],
    'Vierge': ['Poissons', 'Capricorne', 'Taureau'],
    'Balance': ['Bélier', 'Lion', 'Gémeaux'],
    'Scorpion': ['Taureau', 'Cancer', 'Poissons'],
    'Sagittaire': ['Gémeaux', 'Bélier', 'Lion'],
    'Capricorne': ['Cancer', 'Taureau', 'Vierge'],
    'Verseau': ['Lion', 'Gémeaux', 'Balance'],
    'Poissons': ['Vierge', 'Cancer', 'Scorpion']
  };

  return compatiblePairs[signA]?.includes(signB) ? 0.9 : 0.6;
}

/**
 * Calcule la compatibilité des éléments
 * @param {string} signA - Premier signe
 * @param {string} signB - Deuxième signe
 * @returns {number} Bonus de compatibilité élémentaire
 */
function calculateElementCompatibility(signA, signB) {
  const elements = {
    'Bélier': 'Feu', 'Lion': 'Feu', 'Sagittaire': 'Feu',
    'Taureau': 'Terre', 'Vierge': 'Terre', 'Capricorne': 'Terre',
    'Gémeaux': 'Air', 'Balance': 'Air', 'Verseau': 'Air',
    'Cancer': 'Eau', 'Scorpion': 'Eau', 'Poissons': 'Eau'
  };

  const elementA = elements[signA];
  const elementB = elements[signB];

  if (!elementA || !elementB) return 0;

  const complementaryPairs = {
    'Feu': ['Air', 'Feu'],
    'Terre': ['Eau', 'Terre'],
    'Air': ['Feu', 'Air'],
    'Eau': ['Terre', 'Eau']
  };

  return complementaryPairs[elementA]?.includes(elementB) ? 0.2 : 0;
}

/**
 * Génère des recommandations basées sur la compatibilité
 * @param {object} compatibility - Scores de compatibilité
 * @returns {Array<string>} Liste de recommandations
 */
function generateCompatibilityRecommendations(compatibility) {
  const recommendations = [];

  if (compatibility.overall > 0.8) {
    recommendations.push(
      "✨ Compatibilité exceptionnelle ! Idéal pour des projets ambitieux",
      "🤝 Synergie naturelle pour le travail d'équipe",
      "💡 Excellente complémentarité pour l'innovation"
    );
  } else if (compatibility.overall > 0.6) {
    recommendations.push(
      "🌟 Bonne compatibilité pour des collaborations durables",
      "🎯 Focus sur des projets à moyen terme",
      "📚 Apprentissage mutuel bénéfique"
    );
  } else {
    recommendations.push(
      "🔄 Compatibilité modérée - projets courts recommandés",
      "🎪 Explorer des domaines créatifs ensemble",
      "📝 Communication claire essentielle"
    );
  }

  // Recommandations spécifiques basées sur les signes
  if (compatibility.sun_sign > 0.8) {
    recommendations.push("☀️ Excellente synergie d'énergie et de vision");
  }

  if (compatibility.moon_sign > 0.8) {
    recommendations.push("🌙 Harmonie émotionnelle et intuitive remarquable");
  }

  return recommendations;
}

/**
 * Récupère les statistiques du système astrologique
 * @returns {Promise<object>} Statistiques globales
 */
export async function getAstroStats() {
  try {
    console.log('📊 Fetching astro system statistics');

    const [
      { count: totalProfiles },
      { count: calculatedProfiles },
      { count: totalMatches },
      { data: recentActivity }
    ] = await Promise.all([
      supabase.from('astro_profiles').select('*', { count: 'exact', head: true }),
      supabase.from('astro_profiles').select('*', { count: 'exact', head: true }).not('calculated_at', 'is', null),
      supabase.from('advanced_matches').select('*', { count: 'exact', head: true }),
      supabase.from('astro_profiles')
        .select('calculated_at')
        .not('calculated_at', 'is', null)
        .order('calculated_at', { ascending: false })
        .limit(10)
    ]);

    const stats = {
      total_profiles: totalProfiles || 0,
      calculated_profiles: calculatedProfiles || 0,
      total_matches: totalMatches || 0,
      calculation_rate: totalProfiles ? (calculatedProfiles / totalProfiles * 100).toFixed(1) : 0,
      recent_activity: recentActivity?.length || 0
    };

    console.log('✅ Astro stats fetched successfully');
    return stats;

  } catch (error) {
    console.error('❌ Error fetching astro stats:', error);
    throw new Error(`Erreur lors de la récupération des statistiques: ${error.message}`);
  }
}

export default {
  getAstroProfile,
  updateBirthData,
  getAdvancedMatches,
  triggerAdvancedMatching,
  generateSymbolicProfile,
  getProjectRecommendations,
  triggerProjectRecommendations,
  getCompatibilityAnalysis,
  getAstroStats
};
