import React, { useState, useEffect, useCallback, useRef } from "react";
import BirthDataForm from "../components/BirthDataForm";
import { 
  getAstroProfile, 
  triggerAdvancedMatching, 
  getAdvancedMatches, 
  generateSymbolicProfile,
  updateBirthData,
  getAstroBasedRecommendations
} from "../services/astroService";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { 
  StarIcon, 
  UsersIcon, 
  ChartBarIcon, 
  BoltIcon,
  RefreshIcon,
  InformationCircleIcon
} from "@heroicons/react/24/outline";

// Composant pour les cartes de statistiques
const StatCard = ({ title, value, icon: Icon, color, description }) => (
  <div className={`p-4 rounded-xl shadow-lg ${color} text-white`}>
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm opacity-90">{description}</p>
      </div>
      <Icon className="h-6 w-6" />
    </div>
    <p className="text-3xl font-bold mt-2">{value}</p>
  </div>
);

// Composant pour l'indicateur de calcul
const CalculationProgress = ({ message, progress }) => (
  <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-blue-300 font-medium">{message}</span>
      <span className="text-blue-400 text-sm">{progress}%</span>
    </div>
    <div className="w-full bg-blue-800 rounded-full h-2">
      <div 
        className="bg-blue-500 h-2 rounded-full transition-all duration-500"
        style={{ width: `${progress}%` }}
      ></div>
    </div>
  </div>
);

const AstroDashboard = () => {
  const { user } = useAuth();
  const [astroProfile, setAstroProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [projectRecommendations, setProjectRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [symbolicLoading, setSymbolicLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [calculationProgress, setCalculationProgress] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [userStats, setUserStats] = useState(null);

  const progressIntervalRef = useRef();

  // Simulation de progression pour les calculs longs
  const startProgressSimulation = (message, duration = 30000) => {
    let progress = 0;
    setCalculationProgress({ message, progress });
    
    progressIntervalRef.current = setInterval(() => {
      progress += 100 / (duration / 1000);
      if (progress >= 90) {
        clearInterval(progressIntervalRef.current);
        setCalculationProgress(prev => ({ ...prev, progress: 90 }));
      } else {
        setCalculationProgress(prev => ({ ...prev, progress: Math.floor(progress) }));
      }
    }, 1000);
  };

  const stopProgressSimulation = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setCalculationProgress(null);
  };

  const fetchAstroData = useCallback(async (showRefresh = false) => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    setError(null);
    
    try {
      console.log('🔄 Fetching astro data for user:', user.id);
      
      const [profile, advancedMatches, recommendations, stats] = await Promise.all([
        getAstroProfile(user.id).catch(err => {
          console.warn('Could not fetch astro profile:', err.message);
          return null;
        }),
        getAdvancedMatches().catch(err => {
          console.warn('Could not fetch matches:', err.message);
          return [];
        }),
        getAstroBasedRecommendations().catch(err => {
          console.warn('Could not fetch recommendations:', err.message);
          return [];
        }),
        fetchUserStats().catch(err => {
          console.warn('Could not fetch user stats:', err.message);
          return null;
        })
      ]);

      setAstroProfile(profile);
      setMatches(advancedMatches || []);
      setProjectRecommendations(recommendations || []);
      setUserStats(stats);
      
      // Si le calcul est terminé, arrêter la simulation de progression
      if (profile && calculationProgress) {
        setCalculationProgress(prev => ({ ...prev, progress: 100 }));
        setTimeout(stopProgressSimulation, 2000);
      }
      
    } catch (err) {
      console.error('Error in fetchAstroData:', err);
      setError(err.message);
      toast.error('Erreur lors du chargement des données astrologiques');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, calculationProgress]);

  const fetchUserStats = async () => {
    if (!user) return null;

    try {
      const { data: videos, error } = await supabase
        .from('videos')
        .select('id, status, created_at, performance_score')
        .eq('user_id', user.id);

      if (error) throw error;

      const totalVideos = videos?.length || 0;
      const analyzedVideos = videos?.filter(v => v.status === 'analyzed').length || 0;
      const averageScore = videos?.filter(v => v.performance_score)?.reduce((acc, v) => acc + v.performance_score, 0) / analyzedVideos || 0;

      return {
        totalVideos,
        analyzedVideos,
        averageScore: Math.round(averageScore * 100) / 100,
        completionRate: totalVideos > 0 ? Math.round((analyzedVideos / totalVideos) * 100) : 0
      };
    } catch (error) {
      console.error('Error fetching user stats:', error);
      return null;
    }
  };

  useEffect(() => {
    fetchAstroData();
  }, [fetchAstroData]);

  const handleProfileUpdate = async (birthData) => {
    if (!user) return;
    
    try {
      setError(null);
      toast.loading('Mise à jour des données de naissance...');
      
      await updateBirthData(user.id, birthData);
      
      toast.success('Données de naissance mises à jour ! Calcul astrologique en cours...');
      
      // Démarrer la simulation de progression
      startProgressSimulation('Calcul de votre thème astral en cours...', 45000);
      
      // Polling pour vérifier le statut du calcul
      const pollInterval = setInterval(async () => {
        try {
          const profile = await getAstroProfile(user.id);
          if (profile && profile.sun_sign && profile.sun_sign !== "Non calculé") {
            clearInterval(pollInterval);
            setAstroProfile(profile);
            toast.success('Profil astrologique calculé avec succès !');
            setCalculationProgress(prev => ({ ...prev, progress: 100 }));
            setTimeout(stopProgressSimulation, 2000);
            
            // Déclencher les calculs suivants
            setTimeout(() => {
              handleGenerateSymbolicProfile();
              handleTriggerMatching();
            }, 2000);
          }
        } catch (error) {
          console.warn('Polling error:', error);
        }
      }, 5000);

      // Arrêter le polling après 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 120000);

    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err.message);
      toast.error('Erreur lors de la mise à jour des données');
      stopProgressSimulation();
    }
  };

  const handleTriggerMatching = async () => {
    if (!user) return;
    
    setMatchingLoading(true);
    setError(null);
    
    try {
      startProgressSimulation('Recherche de synergies et compatibilités...', 25000);
      
      await triggerAdvancedMatching();
      toast.success('Matching avancé déclenché ! Analyse des compatibilités en cours...');
      
      // Polling pour les résultats du matching
      setTimeout(async () => {
        try {
          await fetchAstroData(true);
          toast.success('Matching terminé ! Découvrez vos nouvelles synergies.');
        } catch (error) {
          console.error('Error fetching matches after calculation:', error);
        }
      }, 10000);

    } catch (err) {
      console.error('Error triggering matching:', err);
      setError(err.message);
      toast.error('Erreur lors du matching avancé');
      stopProgressSimulation();
    } finally {
      setMatchingLoading(false);
    }
  };

  const handleGenerateSymbolicProfile = async () => {
    if (!user) return;
    
    setSymbolicLoading(true);
    setError(null);
    
    try {
      startProgressSimulation('Génération de votre profil symbolique...', 20000);
      
      await generateSymbolicProfile(user.id);
      toast.success('Profil symbolique généré !');
      
      setTimeout(() => {
        fetchAstroData(true);
      }, 3000);

    } catch (err) {
      console.error('Error generating symbolic profile:', err);
      setError(err.message);
      toast.error('Erreur lors de la génération du profil symbolique');
      stopProgressSimulation();
    } finally {
      setSymbolicLoading(false);
    }
  };

  const handleRefreshData = async () => {
    await fetchAstroData(true);
    toast.success('Données actualisées');
  };

  // Nettoyage des intervalles
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white text-lg mb-2">Chargement du tableau de bord astrologique</p>
          <p className="text-gray-400 text-sm">Récupération de vos données célestes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* En-tête avec statistiques */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Tableau de Bord Astrologique
          </h1>
          <p className="text-gray-400 text-lg mb-6">
            Découvrez votre profil astrologique et explorez vos synergies
          </p>

          {userStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                title="Vidéos"
                value={userStats.totalVideos}
                icon={ChartBarIcon}
                color="bg-blue-600"
                description="Total"
              />
              <StatCard
                title="Analysées"
                value={userStats.analyzedVideos}
                icon={BoltIcon}
                color="bg-green-600"
                description="Vidéos traitées"
              />
              <StatCard
                title="Score Moyen"
                value={userStats.averageScore}
                icon={StarIcon}
                color="bg-purple-600"
                description="Performance"
              />
              <StatCard
                title="Compatibilités"
                value={matches.length}
                icon={UsersIcon}
                color="bg-indigo-600"
                description="Synergies trouvées"
              />
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <InformationCircleIcon className="h-5 w-5 text-red-400 mr-3" />
                <div>
                  <h4 className="font-semibold text-red-300">Erreur</h4>
                  <p className="text-red-200 text-sm mt-1">{error}</p>
                </div>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-300"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Indicateur de calcul en cours */}
        {calculationProgress && (
          <CalculationProgress 
            message={calculationProgress.message}
            progress={calculationProgress.progress}
          />
        )}

        {/* Navigation par onglets */}
        <div className="flex space-x-1 mb-6 bg-gray-800 rounded-lg p-1">
          {[
            { id: 'profile', name: '🌟 Profil Astro', icon: '🌟' },
            { id: 'matching', name: '💫 Matching', icon: '💫' },
            { id: 'recommendations', name: '🚀 Projets', icon: '🚀' },
            { id: 'data', name: '📊 Données', icon: '📊' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.name}
            </button>
          ))}
        </div>

        {/* Bouton de rafraîchissement */}
        <div className="flex justify-end mb-6">
          <button
            onClick={handleRefreshData}
            disabled={refreshing}
            className="flex items-center px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            <RefreshIcon className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Actualisation...' : 'Actualiser'}
          </button>
        </div>

        {!astroProfile ? (
          <div className="bg-gray-800 rounded-xl p-6 shadow-2xl border border-gray-700">
            <BirthDataForm onProfileUpdated={handleProfileUpdate} />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Onglet Profil Astrologique */}
            {activeTab === 'profile' && (
              <div className="bg-gray-800 rounded-xl p-6 shadow-2xl border border-gray-700">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-white flex items-center">
                    <span className="mr-3">🌟</span>
                    Mon Profil Astrologique
                  </h2>
                  <div className="flex gap-2">
                    {!astroProfile.symbolic_archetype && (
                      <button 
                        onClick={handleGenerateSymbolicProfile}
                        disabled={symbolicLoading}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition-colors flex items-center"
                      >
                        {symbolicLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                            Génération...
                          </>
                        ) : (
                          '🎨 Profil Symbolique'
                        )}
                      </button>
                    )}
                  </div>
                </div>
                
                {astroProfile.symbolic_archetype ? (
                  <div className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 p-6 rounded-xl border border-purple-500/30 mb-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div
                        className="w-6 h-6 rounded-full animate-pulse shadow-lg"
                        style={{ backgroundColor: astroProfile.symbolic_color || '#8B5CF6' }}
                      ></div>
                      <h3 className="text-xl font-bold text-white">{astroProfile.symbolic_archetype}</h3>
                    </div>
                    <p className="text-lg font-semibold text-yellow-400 mb-3 italic">
                      "{astroProfile.symbolic_phrase}"
                    </p>
                    <p className="text-gray-300 leading-relaxed whitespace-pre-line">
                      {astroProfile.symbolic_profile_text}
                    </p>
                  </div>
                ) : (
                  <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-yellow-200 font-medium">
                          Profil symbolique non généré
                        </p>
                        <p className="text-yellow-300 text-sm mt-1">
                          Obtenez une analyse personnalisée de votre profil astrologique
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Signes Principaux */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-gray-700/50 p-4 rounded-lg text-center border border-gray-600 hover:border-yellow-500 transition-colors">
                    <div className="text-3xl mb-2">🌞</div>
                    <h4 className="font-semibold text-white mb-1">Soleil</h4>
                    <p className="text-yellow-400 text-lg font-bold">
                      {astroProfile.sun_sign || "Non calculé"}
                    </p>
                    <p className="text-gray-400 text-sm mt-1">Énergie vitale, identité</p>
                  </div>
                  <div className="bg-gray-700/50 p-4 rounded-lg text-center border border-gray-600 hover:border-blue-500 transition-colors">
                    <div className="text-3xl mb-2">🌙</div>
                    <h4 className="font-semibold text-white mb-1">Lune</h4>
                    <p className="text-blue-400 text-lg font-bold">
                      {astroProfile.moon_sign || "Non calculé"}
                    </p>
                    <p className="text-gray-400 text-sm mt-1">Émotions, intuition</p>
                  </div>
                  <div className="bg-gray-700/50 p-4 rounded-lg text-center border border-gray-600 hover:border-purple-500 transition-colors">
                    <div className="text-3xl mb-2">⬆️</div>
                    <h4 className="font-semibold text-white mb-1">Ascendant</h4>
                    <p className="text-purple-400 text-lg font-bold">
                      {astroProfile.rising_sign || "Non calculé"}
                    </p>
                    <p className="text-gray-400 text-sm mt-1">Personnalité sociale</p>
                  </div>
                </div>

                {/* Informations supplémentaires */}
                {astroProfile.archetype_profile && (
                  <div className="bg-gray-700/30 p-4 rounded-lg border border-gray-600">
                    <h4 className="font-semibold text-white mb-2">Archétype Dominant</h4>
                    <p className="text-gray-300">
                      {astroProfile.archetype_profile.dominant_element} / {astroProfile.archetype_profile.dominant_modality}
                    </p>
                  </div>
                )}

                {/* Calcul des planètes si disponible */}
                {astroProfile.planetary_positions && Object.keys(astroProfile.planetary_positions).length > 0 && (
                  <div className="mt-6">
                    <h4 className="font-semibold text-white mb-3">Positions Planétaires</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(astroProfile.planetary_positions).slice(0, 8).map(([planet, data]) => (
                        <div key={planet} className="bg-gray-700/30 p-3 rounded-lg text-center">
                          <div className="text-sm text-gray-300 capitalize">{planet}</div>
                          <div className="text-white font-medium">{data.sign}</div>
                          <div className="text-xs text-gray-400">{data.house}°</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Onglet Matching Avancé */}
            {activeTab === 'matching' && (
              <div className="bg-gray-800 rounded-xl p-6 shadow-2xl border border-gray-700">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                  <h2 className="text-2xl font-bold text-white flex items-center">
                    <span className="mr-3">💫</span>
                    Matching Avancé
                  </h2>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleTriggerMatching} 
                      disabled={matchingLoading}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-300 flex items-center"
                    >
                      {matchingLoading ? (
                        <span className="flex items-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                          Calcul en cours...
                        </span>
                      ) : (
                        <>
                          <RefreshIcon className="h-4 w-4 mr-2" />
                          Relancer le Matching
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {matches.length > 0 ? (
                  <div className="space-y-4">
                    <div className="text-gray-400 text-sm">
                      {matches.length} compatibilité(s) trouvée(s)
                    </div>
                    {matches.map((match, index) => (
                      <div key={match.id} className="bg-gray-700/50 p-4 rounded-lg border-l-4 border-green-500 hover:border-green-400 transition-all duration-300 hover:bg-gray-700/70">
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                                {index + 1}
                              </div>
                              <p className="text-white font-semibold text-lg">
                                Match avec {match.user_b?.full_name || `Utilisateur ${match.user_b_id}`}
                              </p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
                              <div>
                                <span className="text-gray-400">Compatibilité Astro:</span>
                                <span className="text-yellow-400 font-bold ml-2">
                                  {(match.astro_compatibility * 10).toFixed(1)}/10
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">Similarité Vectorielle:</span>
                                <span className="text-blue-400 font-bold ml-2">
                                  {(match.vector_similarity * 10).toFixed(1)}/10
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">Score Global:</span>
                                <span className="text-green-400 font-bold ml-2">
                                  {(match.overall_score * 10).toFixed(1)}/10
                                </span>
                              </div>
                            </div>
                            {match.match_details && (
                              <div className="mt-3 text-xs text-gray-400">
                                Synergies: {Object.values(match.match_details).slice(0, 2).join(', ')}
                              </div>
                            )}
                          </div>
                          {match.user_b?.id && (
                            <Link 
                              to={`/profile/${match.user_b.id}`}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap flex items-center"
                            >
                              <UsersIcon className="h-4 w-4 mr-2" />
                              Voir Profil
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-700/30 rounded-lg border border-gray-600">
                    <div className="text-6xl mb-4">🔍</div>
                    <p className="text-gray-300 mb-4 text-lg">
                      Aucun match trouvé pour le moment.
                    </p>
                    <p className="text-gray-400 mb-6 max-w-md mx-auto">
                      Lancez le calcul de matching pour découvrir vos synergies potentielles basées sur votre profil astrologique et vos contenus vidéo.
                    </p>
                    <button 
                      onClick={handleTriggerMatching}
                      disabled={matchingLoading}
                      className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-300 text-lg font-semibold flex items-center mx-auto"
                    >
                      {matchingLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                          Calcul en cours...
                        </>
                      ) : (
                        <>
                          <BoltIcon className="h-5 w-5 mr-2" />
                          🚀 Lancer le Calcul de Matching
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Onglet Recommandations de Projets */}
            {activeTab === 'recommendations' && (
              <div className="bg-gray-800 rounded-xl p-6 shadow-2xl border border-gray-700">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
                  <span className="mr-3">🚀</span>
                  Projets Recommandés
                </h2>

                {projectRecommendations.length > 0 ? (
                  <div className="space-y-4">
                    {projectRecommendations.map((rec, index) => (
                      <div key={index} className="bg-gradient-to-br from-gray-700 to-gray-800 p-4 rounded-lg border border-gray-600 hover:border-blue-500 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="text-lg font-semibold text-white">{rec.project_title}</h3>
                          <span className="px-2 py-1 bg-blue-600 text-white text-sm rounded-full">
                            Score: {((rec.match_score || 0.7) * 10).toFixed(1)}/10
                          </span>
                        </div>
                        <p className="text-gray-300 mb-3">{rec.project_description}</p>
                        <div className="flex justify-between items-center text-sm text-gray-400">
                          <span>Catégorie: {rec.category}</span>
                          <span>Synergie détectée</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-700/30 rounded-lg border border-gray-600">
                    <div className="text-6xl mb-4">💡</div>
                    <p className="text-gray-300 mb-4 text-lg">
                      Aucune recommandation de projet pour le moment.
                    </p>
                    <p className="text-gray-400 mb-6">
                      Complétez votre profil et lancez le matching pour obtenir des recommandations personnalisées.
                    </p>
                    <button 
                      onClick={handleTriggerMatching}
                      className="px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 transition-all duration-300"
                    >
                      Générer des Recommandations
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Onglet Données Techniques */}
            {activeTab === 'data' && (
              <div className="bg-gray-800 rounded-xl p-6 shadow-2xl border border-gray-700">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
                  <span className="mr-3">📊</span>
                  Données Techniques
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-700/30 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-white mb-3">Informations de Calcul</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Source:</span>
                        <span className="text-white">{astroProfile.calculation_source || 'API Réelle'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Calculé le:</span>
                        <span className="text-white">
                          {astroProfile.calculated_at ? new Date(astroProfile.calculated_at).toLocaleDateString() : 'Non calculé'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Embedding généré:</span>
                        <span className="text-white">
                          {astroProfile.embedding_generated_at ? 'Oui' : 'Non'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-700/30 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-white mb-3">Statistiques</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Compatibilités trouvées:</span>
                        <span className="text-white">{matches.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Profil symbolique:</span>
                        <span className="text-white">
                          {astroProfile.symbolic_archetype ? 'Généré' : 'Non généré'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Dernière mise à jour:</span>
                        <span className="text-white">{new Date().toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions techniques */}
                <div className="mt-6 p-4 bg-gray-900/50 rounded-lg">
                  <h3 className="text-lg font-semibold text-white mb-3">Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleRefreshData}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Actualiser les données
                    </button>
                    <button
                      onClick={() => {
                        localStorage.removeItem('astro_cache');
                        toast.success('Cache nettoyé');
                      }}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Nettoyer le cache
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AstroDashboard;
