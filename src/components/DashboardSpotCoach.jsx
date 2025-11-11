import React, { useState, useEffect, useCallback } from "react";
import BirthDataForm from "../components/BirthDataForm";
import { getAstroProfile, triggerAdvancedMatching, getAdvancedMatches, generateSymbolicProfile } from "../services/astroService";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const AstroDashboard = () => {
  const { user } = useAuth();
  const [astroProfile, setAstroProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [symbolicLoading, setSymbolicLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAstroData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log('🔄 Fetching astro data for user:', user.id);
      
      const [profile, advancedMatches] = await Promise.all([
        getAstroProfile(user.id).catch(err => {
          console.warn('Could not fetch astro profile:', err.message);
          return null;
        }),
        getAdvancedMatches().catch(err => {
          console.warn('Could not fetch matches:', err.message);
          return [];
        })
      ]);

      setAstroProfile(profile);
      setMatches(advancedMatches || []);
      
    } catch (err) {
      console.error('Error in fetchAstroData:', err);
      setError(err.message);
      toast.error('Erreur lors du chargement des données astrologiques');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAstroData();
  }, [fetchAstroData]);

  const handleProfileUpdate = async (success) => {
    if (success) {
      toast.success('Données de naissance mises à jour ! Calcul astrologique en cours...');
      
      // Attendre le calcul et rafraîchir
      setTimeout(() => {
        fetchAstroData();
      }, 5000);
    }
  };

  const handleTriggerMatching = async () => {
    if (!user) return;
    
    setMatchingLoading(true);
    setError(null);
    
    try {
      await triggerAdvancedMatching();
      toast.success('Matching avancé déclenché ! Les résultats arriveront sous peu.');
      
      // Rafraîchir après un délai
      setTimeout(() => {
        fetchAstroData();
      }, 8000);
    } catch (err) {
      console.error('Error triggering matching:', err);
      setError(err.message);
      toast.error('Erreur lors du matching avancé');
    } finally {
      setMatchingLoading(false);
    }
  };

  const handleGenerateSymbolicProfile = async () => {
    if (!user) return;
    
    setSymbolicLoading(true);
    setError(null);
    
    try {
      await generateSymbolicProfile(user.id);
      toast.success('Profil symbolique généré !');
      
      setTimeout(() => {
        fetchAstroData();
      }, 5000);
    } catch (err) {
      console.error('Error generating symbolic profile:', err);
      setError(err.message);
      toast.error('Erreur lors de la génération du profil symbolique');
    } finally {
      setSymbolicLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-white mt-4">Chargement du tableau de bord astrologique...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <h1 className="text-4xl font-bold text-white text-center mb-2">
          Tableau de Bord Astrologique
        </h1>
        <p className="text-gray-400 text-center mb-8">
          Découvrez votre profil astrologique et vos synergies
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <div className="text-red-400 mr-3">⚠️</div>
              <div>
                <h4 className="font-semibold text-red-300">Erreur</h4>
                <p className="text-red-200 text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {!astroProfile ? (
          <div className="bg-gray-800 rounded-xl p-6 shadow-2xl border border-gray-700">
            <BirthDataForm onProfileUpdated={handleProfileUpdate} />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Profil Astrologique */}
            <div className="bg-gray-800 rounded-xl p-6 shadow-2xl border border-gray-700">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
                <span className="mr-3">🌟</span>
                Mon Profil Astrologique
              </h2>
              
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
                  <p className="text-gray-300 leading-relaxed">
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
                    <button 
                      onClick={handleGenerateSymbolicProfile}
                      disabled={symbolicLoading}
                      className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                    >
                      {symbolicLoading ? "Génération..." : "Générer"}
                    </button>
                  </div>
                </div>
              )}

              {/* Signes Principaux */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-700/50 p-4 rounded-lg text-center border border-gray-600">
                  <div className="text-3xl mb-2">🌞</div>
                  <h4 className="font-semibold text-white mb-1">Soleil</h4>
                  <p className="text-yellow-400 text-lg font-bold">
                    {astroProfile.sun_sign || "Non calculé"}
                  </p>
                </div>
                <div className="bg-gray-700/50 p-4 rounded-lg text-center border border-gray-600">
                  <div className="text-3xl mb-2">🌙</div>
                  <h4 className="font-semibold text-white mb-1">Lune</h4>
                  <p className="text-blue-400 text-lg font-bold">
                    {astroProfile.moon_sign || "Non calculé"}
                  </p>
                </div>
                <div className="bg-gray-700/50 p-4 rounded-lg text-center border border-gray-600">
                  <div className="text-3xl mb-2">⬆️</div>
                  <h4 className="font-semibold text-white mb-1">Ascendant</h4>
                  <p className="text-purple-400 text-lg font-bold">
                    {astroProfile.rising_sign || "Non calculé"}
                  </p>
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
            </div>

            {/* Matching Avancé */}
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
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-300"
                  >
                    {matchingLoading ? (
                      <span className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                        Calcul en cours...
                      </span>
                    ) : (
                      "🔄 Relancer le Matching"
                    )}
                  </button>
                </div>
              </div>

              {matches.length > 0 ? (
                <div className="space-y-4">
                  {matches.map((match) => (
                    <div key={match.id} className="bg-gray-700/50 p-4 rounded-lg border-l-4 border-green-500 hover:border-green-400 transition-colors">
                      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                        <div className="flex-1">
                          <p className="text-white font-semibold text-lg">
                            Match avec {match.user_b?.full_name || `Utilisateur ${match.user_b_id}`}
                          </p>
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
                        </div>
                        {match.user_b?.id && (
                          <Link 
                            to={`/profile/${match.user_b.id}`}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                          >
                            👤 Voir Profil
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-700/30 rounded-lg border border-gray-600">
                  <div className="text-4xl mb-4">🔍</div>
                  <p className="text-gray-300 mb-4 text-lg">
                    Aucun match trouvé pour le moment.
                  </p>
                  <p className="text-gray-400 mb-6">
                    Lancez le calcul de matching pour découvrir vos synergies potentielles.
                  </p>
                  <button 
                    onClick={handleTriggerMatching}
                    disabled={matchingLoading}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-300 text-lg font-semibold"
                  >
                    {matchingLoading ? "Calcul en cours..." : "🚀 Lancer le Calcul de Matching"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AstroDashboard;
