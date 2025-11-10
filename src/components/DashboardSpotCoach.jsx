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
        // 1. Récupérer les statistiques vidéo existantes (simulées ici)
        const { data: videoStats, error: videoError } = await supabase
          .from("user_video_stats") // Vue matérialisée existante
          .select("*")
          .eq("profile_id", user.id) // Supposons que user_video_stats utilise profile_id
          .single();

        if (videoError && videoError.code !== "PGRST116") throw videoError;

        // 2. Récupérer le profil astrologique
        const { data: astroProfile, error: astroError } = await supabase
          .from("astro_profiles")
          .select("sun_sign, archetype_profile")
          .eq("user_id", user.id)
          .single();

        if (astroError && astroError.code !== "PGRST116") throw astroError;

        // 3. Récupérer les scores de matching (meilleur score)
        const { data: bestMatch, error: matchError } = await supabase
          .from("advanced_matches")
          .select("overall_score")
          .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
          .order("overall_score", { ascending: false })
          .limit(1)
          .single();

        if (matchError && matchError.code !== "PGRST116") throw matchError;

        // 4. Calculer le "SpotCoach Score" (KPI avancé)
        const totalVideos = videoStats?.total_videos || 0;
        const totalDuration = videoStats?.total_duration_seconds || 0;
        const bestMatchScore = bestMatch?.overall_score || 0;

        // 4. Récupérer les recommandations de projets
        const projectRecommendations = await getProjectRecommendations();
        setRecommendations(projectRecommendations);
        const performanceScore = totalVideos > 0 ? (totalDuration / 60) * 0.5 + (totalVideos * 0.5) : 0;
        const spotCoachScore = Math.min(100, Math.round(performanceScore * 10 + bestMatchScore * 5));

        setStats({
          totalVideos: totalVideos,
          totalDuration: totalDuration,
          astroSign: astroProfile?.sun_sign || "Non défini",
          archetype: astroProfile?.archetype_profile?.dominant_element || "N/A",
          bestMatchScore: (bestMatchScore * 10).toFixed(1), // Afficher sur 10
          spotCoachScore: spotCoachScore,
        });

      } catch (err) {
        setError("Erreur lors du chargement des statistiques avancées.");
        toast.error(`Erreur: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchAdvancedStats();
  }, [user]);

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
          title="Archétype Dominant"
          value={stats.archetype}
          icon={ChartBarIcon}
          color="bg-green-600"
        />
      </div>

      {/* Section Détails Vidéo (à développer) */}
      <div className="bg-gray-800 p-6 rounded-xl shadow-inner">
        <h2 className="text-2xl font-semibold text-white mb-4">Analyse Vidéo Détaillée</h2>
        <p className="text-gray-400">
          Intégration future des visualisations d'embeddings vidéo, des courbes de performance et des suggestions d'amélioration basées sur l'IA.
        </p>
        <p className="text-gray-400 mt-2">
          Statistiques actuelles: {stats.totalVideos} vidéos, {Math.round(stats.totalDuration / 60)} minutes de contenu.
        </p>
      </div>

      {/* Section Recommandations (à développer) */}
      <div className="bg-gray-800 p-6 rounded-xl shadow-inner">
        <h2 className="text-2xl font-semibold text-white mb-4">Recommandations Personnalisées</h2>
        <h2 className="text-2xl font-semibold text-white mb-4">Recommandations de Projets Communs</h2>
        <button
          onClick={async () => {
            try {
              await triggerProjectRecommendations();
              toast.success("Recommandations générées !");
              // Recharger les stats pour mettre à jour les recommandations
              fetchAdvancedStats();
            } catch (e) {
              toast.error(`Erreur: ${e.message}`);
            }
          }}
          className="mb-4 px-4 py-2 bg-primary-600 text-white rounded-lg shadow-md hover:bg-primary-700 transition-colors"
        >
          <LightBulbIcon className="h-5 w-5 inline mr-2" /> Générer Recommandations
        </button>

        {recommendations.length > 0 ? (
          <ul className="space-y-3">
            {recommendations.map((rec) => (
              <li key={rec.id} className="p-3 bg-gray-700 rounded-lg border-l-4 border-yellow-500">
                <p className="text-lg font-semibold text-white">{rec.recommended_project}</p>
                <p className="text-sm text-gray-300">
                  Match avec l'utilisateur {rec.user_b_id.id} (Score: {(rec.match_score * 10).toFixed(1)}/10)
                </p>
                <p className="text-xs text-gray-400 mt-1">Raison: {rec.reasoning.details}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-400">
            Aucune recommandation de projet trouvée. Cliquez sur "Générer Recommandations" pour commencer.
          </p>
        )
      </div>
    </div>
  );
};

export default DashboardSpotCoach;
