import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { ChartBarIcon, StarIcon, UsersIcon, BoltIcon, LightBulbIcon } from "@heroicons/react/24/outline";

const StatCard = ({ title, value, icon: Icon, color }) => (
  <div className={`p-4 rounded-xl shadow-lg ${color} text-white`}>
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">{title}</h3>
      <Icon className="h-6 w-6" />
    </div>
    <p className="text-3xl font-bold mt-2">{value}</p>
  </div>
);

import { getProjectRecommendations, triggerProjectRecommendations } from "../services/recommendationService";

const DashboardSpotCoach = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAdvancedStats = async () => {
      if (!user) return;
      setLoading(true);
      setError(null);

      try {
        // 1. Récupérer les statistiques vidéo
        const { data: videoStats, error: videoError } = await supabase
          .from("user_video_stats")
          .select("*")
          .eq("profile_id", user.id)
          .single();

        if (videoError && videoError.code !== "PGRST116") {
          console.warn("Stats vidéo non disponibles:", videoError.message);
        }

        // 2. Récupérer le profil astrologique réel
        const { data: astroProfile, error: astroError } = await supabase
          .from("astro_profiles")
          .select("sun_sign, moon_sign, rising_sign, archetype_profile, symbolic_archetype, symbolic_color")
          .eq("user_id", user.id)
          .single();

        if (astroError && astroError.code !== "PGRST116") {
          console.warn("Profil astro non trouvé:", astroError.message);
        }

        // 3. Récupérer les scores de matching
        const { data: bestMatch, error: matchError } = await supabase
          .from("advanced_matches")
          .select("overall_score")
          .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
          .order("overall_score", { ascending: false })
          .limit(1)
          .single();

        if (matchError && matchError.code !== "PGRST116") {
          console.warn("Matches non trouvés:", matchError.message);
        }

        // 4. Récupérer les recommandations de projets
        try {
          const projectRecommendations = await getProjectRecommendations();
          setRecommendations(projectRecommendations || []);
        } catch (recError) {
          console.warn("Recommandations non disponibles:", recError.message);
        }

        // 5. Calculer le "SpotCoach Score" (KPI avancé)
        const totalVideos = videoStats?.total_videos || 0;
        const totalDuration = videoStats?.total_duration_seconds || 0;
        const bestMatchScore = bestMatch?.overall_score || 0;

        const performanceScore = totalVideos > 0 ? (totalDuration / 60) * 0.5 + (totalVideos * 0.5) : 0;
        const spotCoachScore = Math.min(100, Math.round(performanceScore * 10 + bestMatchScore * 5));

        setStats({
          totalVideos: totalVideos,
          totalDuration: totalDuration,
          astroSign: astroProfile?.sun_sign || "Non défini",
          moonSign: astroProfile?.moon_sign || "Non défini",
          risingSign: astroProfile?.rising_sign || "Non défini",
          archetype: astroProfile?.symbolic_archetype || astroProfile?.archetype_profile?.dominant_element || "N/A",
          symbolicColor: astroProfile?.symbolic_color || "#FFFFFF",
          bestMatchScore: (bestMatchScore * 10).toFixed(1),
          spotCoachScore: spotCoachScore,
        });

      } catch (err) {
        console.error("Erreur chargement stats:", err);
        setError("Erreur lors du chargement des statistiques avancées.");
        toast.error(`Erreur: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchAdvancedStats();
  }, [user]);

  const handleGenerateRecommendations = async () => {
    try {
      await triggerProjectRecommendations();
      toast.success("Recommandations générées !");
      
      // Recharger les recommandations
      const updatedRecommendations = await getProjectRecommendations();
      setRecommendations(updatedRecommendations || []);
    } catch (e) {
      toast.error(`Erreur: ${e.message}`);
    }
  };

  if (loading) {
    return <div className="text-center text-white">Chargement du Dashboard SpotCoach...</div>;
  }

  if (error) {
    return <div className="text-center text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-8 p-6 bg-gray-900 rounded-xl shadow-2xl">
      <h1 className="text-4xl font-bold text-primary-400 border-b border-primary-400/50 pb-3">
        Dashboard SpotCoach Avancé
      </h1>

      {/* KPI Avancés */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="SpotCoach Score"
          value={`${stats.spotCoachScore}%`}
          icon={StarIcon}
          color="bg-yellow-600"
        />
        <StatCard
          title="Meilleur Match (Astro/Vector)"
          value={`${stats.bestMatchScore}/10`}
          icon={UsersIcon}
          color="bg-indigo-600"
        />
        <StatCard
          title="Signe Solaire"
          value={stats.astroSign}
          icon={BoltIcon}
          color="bg-purple-600"
        />
        <StatCard
          title="Archétype Symbolique"
          value={stats.archetype}
          icon={ChartBarIcon}
          color="bg-green-600"
        />
      </div>

      {/* Section Profil Astro Détail */}
      {stats.astroSign !== "Non défini" && (
        <div className="bg-gray-800 p-6 rounded-xl shadow-inner">
          <h2 className="text-2xl font-semibold text-white mb-4">Profil Astrologique Complet</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-white">
            <div className="text-center p-4 bg-gray-700 rounded-lg">
              <div className="text-lg font-bold text-yellow-400">🌞 Solaire</div>
              <div className="text-xl">{stats.astroSign}</div>
            </div>
            <div className="text-center p-4 bg-gray-700 rounded-lg">
              <div className="text-lg font-bold text-blue-400">🌙 Lunaire</div>
              <div className="text-xl">{stats.moonSign}</div>
            </div>
            <div className="text-center p-4 bg-gray-700 rounded-lg">
              <div className="text-lg font-bold text-purple-400">⬆️ Ascendant</div>
              <div className="text-xl">{stats.risingSign}</div>
            </div>
          </div>
        </div>
      )}

      {/* Section Détails Vidéo */}
      <div className="bg-gray-800 p-6 rounded-xl shadow-inner">
        <h2 className="text-2xl font-semibold text-white mb-4">Analyse Vidéo Détaillée</h2>
        <p className="text-gray-400 mb-4">
          Intégration future des visualisations d'embeddings vidéo, des courbes de performance et des suggestions d'amélioration basées sur l'IA.
        </p>
        <div className="grid grid-cols-2 gap-4 text-white">
          <div className="text-center p-4 bg-gray-700 rounded-lg">
            <div className="text-2xl font-bold text-blue-400">{stats.totalVideos}</div>
            <div className="text-sm">Vidéos totales</div>
          </div>
          <div className="text-center p-4 bg-gray-700 rounded-lg">
            <div className="text-2xl font-bold text-green-400">
              {Math.round(stats.totalDuration / 60)} min
            </div>
            <div className="text-sm">Durée totale</div>
          </div>
        </div>
      </div>

      {/* Section Recommandations */}
      <div className="bg-gray-800 p-6 rounded-xl shadow-inner">
        <h2 className="text-2xl font-semibold text-white mb-4">Recommandations de Projets Communs</h2>
        
        <button
          onClick={handleGenerateRecommendations}
          className="mb-4 px-4 py-2 bg-primary-600 text-white rounded-lg shadow-md hover:bg-primary-700 transition-colors flex items-center"
        >
          <LightBulbIcon className="h-5 w-5 inline mr-2" /> 
          Générer Recommandations
        </button>

        {recommendations.length > 0 ? (
          <ul className="space-y-3">
            {recommendations.map((rec, index) => (
              <li key={rec.id || index} className="p-3 bg-gray-700 rounded-lg border-l-4 border-yellow-500">
                <p className="text-lg font-semibold text-white">{rec.recommended_project}</p>
                <p className="text-sm text-gray-300">
                  Match avec l'utilisateur {rec.user_b_id?.id || 'Inconnu'} 
                  (Score: {(rec.match_score * 10).toFixed(1)}/10)
                </p>
                {rec.reasoning?.details && (
                  <p className="text-xs text-gray-400 mt-1">
                    Raison: {rec.reasoning.details}
                  </p>
                )}
                {rec.project_description && (
                  <p className="text-sm text-gray-300 mt-2">{rec.project_description}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-400">
            Aucune recommandation de projet trouvée. Cliquez sur "Générer Recommandations" pour commencer.
          </p>
        )}
      </div>
    </div>
  );
};

export default DashboardSpotCoach;
