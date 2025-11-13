import React, { useState, useEffect, useCallback } from "react";
import BirthDataForm from "../components/BirthDataForm";
import { getAstroProfile, triggerAdvancedMatching, getAdvancedMatches, generateSymbolicProfile } from "../services/astroService";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";

const AstroDashboard = () => {
  const { user } = useAuth();
  const [astroProfile, setAstroProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [symbolicLoading, setSymbolicLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAstroData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const profile = await getAstroProfile(user.id);
      setAstroProfile(profile);
      
      if (profile) {
        try {
          const advancedMatches = await getAdvancedMatches();
          setMatches(advancedMatches || []);
        } catch (matchError) {
          console.warn("Matches non disponibles:", matchError.message);
          setMatches([]);
        }
        
        // Vérifier si le profil est complet (pour l'affichage du message de chargement)
        if (profile && !profile.sun_sign) {
            setError("Calcul astrologique en cours... Veuillez patienter quelques secondes.");
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAstroData();
  }, [fetchAstroData]);

  const handleProfileUpdate = (success) => {
    if (success) {
      // Afficher un message de chargement explicite pendant que le backend travaille
      setLoading(true); 
      setTimeout(fetchAstroData, 8000); // Augmenter le délai pour laisser le temps aux Edge Functions de s'exécuter
    }
  };

  const handleTriggerMatching = async () => {
    setMatchingLoading(true);
    setError(null);
    try {
      await triggerAdvancedMatching();
      alert("Matching avancé déclenché. Les résultats seront bientôt disponibles.");
      setTimeout(fetchAstroData, 8000);
    } catch (err) {
      setError(`Erreur lors du déclenchement du matching: ${err.message}`);
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
      alert("Profil symbolique généré ! Actualisation dans quelques secondes...");
      setTimeout(fetchAstroData, 5000);
    } catch (err) {
      setError(`Erreur génération profil symbolique: ${err.message}`);
    } finally {
      setSymbolicLoading(false);
    }
  };

  if (loading) {
    return <div className="dashboard-container text-center p-10 text-xl text-primary-400">Chargement du tableau de bord Astro...</div>;
  }

  return (
    <div className="dashboard-container space-y-8 p-6">
      <h1 className="text-4xl font-bold text-primary-400 border-b border-primary-400/50 pb-3">
        Tableau de Bord Astrologique & Matching
      </h1>
      
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-200">
          {error}
        </div>
      )}

      {!astroProfile ? (
        <BirthDataForm onProfileUpdated={handleProfileUpdate} />
      ) : (
        <div className="astro-profile-section space-y-8">
          <div className="bg-gray-800 rounded-xl p-6 shadow-lg">
            <h2 className="text-2xl font-bold text-white mb-6">Mon Profil Astrologique</h2>
            
            {astroProfile.symbolic_archetype ? (
              <div className="symbolic-profile-card bg-gradient-to-br from-purple-900 to-blue-900 p-6 rounded-xl shadow-lg border border-white/10 mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className="w-5 h-5 rounded-full animate-pulse"
                    style={{ backgroundColor: astroProfile.symbolic_color || '#FFFFFF' }}
                  ></div>
                  <h3 className="text-xl font-bold text-white">{astroProfile.symbolic_archetype}</h3>
                </div>
                <p className="text-lg font-semibold text-yellow-400 mb-3">"{astroProfile.symbolic_phrase}"</p>
                <p className="text-gray-300 text-sm leading-relaxed">{astroProfile.symbolic_profile_text}</p>
              </div>
            ) : (
              <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-6">
                <p className="text-yellow-200 mb-3">
                  Profil symbolique non généré. Obtenez une analyse personnalisée de votre profil astrologique.
                </p>
                <button 
                  onClick={handleGenerateSymbolicProfile}
                  disabled={symbolicLoading}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                >
                  {symbolicLoading ? "Génération..." : "Générer mon Profil Symbolique"}
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
              <div className="profile-detail-card bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl mb-2">🌞</div>
                <h4 className="font-semibold text-white">Soleil</h4>
                <p className="text-yellow-400">{astroProfile.sun_sign || "Non calculé"}</p>
              </div>
              <div className="profile-detail-card bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl mb-2">🌙</div>
                <h4 className="font-semibold text-white">Lune</h4>
                <p className="text-blue-400">{astroProfile.moon_sign || "Non calculé"}</p>
              </div>
              <div className="profile-detail-card bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl mb-2">⬆️</div>
                <h4 className="font-semibold text-white">Ascendant</h4>
                <p className="text-purple-400">{astroProfile.rising_sign || "Non calculé"}</p>
              </div>
            </div>

            {astroProfile.archetype_profile && (
              <div className="mt-6 p-4 bg-gray-700 rounded-lg">
                <h4 className="font-semibold text-white mb-2">Archétype Dominant</h4>
                <p className="text-gray-300">
                  {astroProfile.archetype_profile.dominant_element} / {astroProfile.archetype_profile.dominant_modality}
                </p>
              </div>
            )}
          </div>

          <div className="matching-section bg-gray-800 rounded-xl p-6 shadow-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Matching Avancé</h2>
              <div className="flex gap-2">
                <button 
                  onClick={handleTriggerMatching} 
                  disabled={matchingLoading}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {matchingLoading ? "Calcul en cours..." : "Relancer le Matching"}
                </button>
              </div>
            </div>

            {matches.length > 0 ? (
              <div className="space-y-4">
                {matches.map((match) => (
                  <div key={match.id} className="match-item bg-gray-700 p-4 rounded-lg border-l-4 border-green-500">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-semibold">
                          Match avec {match.user_b_id?.full_name || `Utilisateur ${match.user_b_id}`}
                        </p>
                        <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                          <p className="text-gray-300">
                            Compatibilité Astro: {(match.astro_compatibility * 10).toFixed(1)}/10
                          </p>
                          <p className="text-gray-300">
                            Similarité Vectorielle: {(match.vector_similarity * 10).toFixed(1)}/10
                          </p>
                        </div>
                        <p className="text-yellow-400 font-bold mt-2">
                          Score Global: {(match.overall_score * 10).toFixed(1)}/10
                        </p>
                      </div>
                      {match.user_b_id?.id && (
                        <Link 
                          to={`/profile/${match.user_b_id.id}`}
                          className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                        >
                          Voir Profil
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-700 rounded-lg">
                <p className="text-gray-300 mb-4">Aucun match trouvé pour le moment.</p>
                <button 
                  onClick={handleTriggerMatching}
                  disabled={matchingLoading}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {matchingLoading ? "Calcul en cours..." : "Lancer le Calcul de Matching"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AstroDashboard;
