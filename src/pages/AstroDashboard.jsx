import React, { useState, useEffect, useCallback } from "react";
import BirthDataForm from "../components/BirthDataForm";
import { getAstroProfile, triggerAdvancedMatching, getAdvancedMatches } from "../services/astroService";
import { useAuth } from "../context/AuthContext"; // ✅ CORRECTION : "context" au singulier
import { Link } from "react-router-dom";

const AstroDashboard = () => {
  const { user } = useAuth();
  const [astroProfile, setAstroProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAstroData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const profile = await getAstroProfile(user.id);
      setAstroProfile(profile);
      
      if (profile) {
        const advancedMatches = await getAdvancedMatches();
        setMatches(advancedMatches);
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
      setTimeout(fetchAstroData, 3000);
    }
  };

  const handleTriggerMatching = async () => {
    setMatchingLoading(true);
    setError(null);
    try {
      await triggerAdvancedMatching();
      alert("Matching avancé déclenché. Les résultats seront bientôt disponibles.");
      setTimeout(fetchAstroData, 5000);
    } catch (err) {
      setError(`Erreur lors du déclenchement du matching: ${err.message}`);
    } finally {
      setMatchingLoading(false);
    }
  };

  if (loading) {
    return <div className="dashboard-container">Chargement du tableau de bord Astro...</div>;
  }

  return (
    <div className="dashboard-container">
      <h1>Tableau de Bord Astrologique & Matching</h1>
      
      {error && <p className="error-message">{error}</p>}

      {!astroProfile ? (
        <BirthDataForm onProfileUpdated={handleProfileUpdate} />
      ) : (
        <div className="astro-profile-section">
          <h2>Mon Profil Astrologique</h2>
          
          {astroProfile.symbolic_archetype && (
            <div className="symbolic-profile-card bg-gray-800 p-6 rounded-xl shadow-lg border border-white/10 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div
                  className="w-5 h-5 rounded-full animate-pulse"
                  style={{ backgroundColor: astroProfile.symbolic_color || '#FFFFFF' }}
                ></div>
                <h3 className="text-xl font-bold text-white">{astroProfile.symbolic_archetype}</h3>
              </div>
              <p className="text-lg font-semibold text-yellow-400 mb-3">"{astroProfile.symbolic_phrase}"</p>
              <p className="text-gray-300 text-sm">{astroProfile.symbolic_profile_text}</p>
            </div>
          )}
          <div className="profile-details mt-4">
            <p><strong>Signe Solaire:</strong> {astroProfile.sun_sign}</p>
            <p><strong>Signe Lunaire:</strong> {astroProfile.moon_sign}</p>
            <p><strong>Ascendant:</strong> {astroProfile.rising_sign}</p>
            <p><strong>Archétype:</strong> {astroProfile.archetype_profile?.dominant_element} / {astroProfile.archetype_profile?.dominant_modality}</p>
          </div>

          <div className="matching-section">
            <h2>Matching Avancé</h2>
            <button onClick={handleTriggerMatching} disabled={matchingLoading}>
              {matchingLoading ? "Calcul en cours..." : "Relancer le Matching Avancé"}
            </button>

            {matches.length > 0 ? (
              <ul className="matches-list">
                {matches.map((match) => (
                  <li key={match.id} className="match-item">
                    <p>Match avec l'utilisateur {match.user_b_id.id} (Score: {match.overall_score})</p>
                    <p>Compatibilité Astro: {match.astro_compatibility}</p>
                    <p>Similarité Vectorielle: {match.vector_similarity}</p>
                    <Link to={`/profile/${match.user_b_id.id}`}>Voir le Profil</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aucun match trouvé pour le moment. Lancez le calcul !</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AstroDashboard;
