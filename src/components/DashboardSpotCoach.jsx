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

const DashboardSpotCoach = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [astroProfile, setAstroProfile] = useState(null);

  const loadSpotCoachData = async () => {
    if (!user) {
      setError("Utilisateur non connecté");
      setLoading(false);
      return;
    }

    console.log("🔄 Loading SpotCoach data for user:", user.id);
    setLoading(true);
    setError(null);

    try {
      // 1. Charger le profil astrologique avec gestion d'erreur robuste
      let astroData = null;
      try {
        const { data, error: astroError } = await supabase
          .from("astro_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (astroError) {
          console.warn("⚠️ Astro profile load warning:", astroError.message);
        } else {
          astroData = data;
          setAstroProfile(data);
          console.log("✅ Astro profile loaded:", data ? "Yes" : "No");
        }
      } catch (astroErr) {
        console.warn("⚠️ Astro profile load failed:", astroErr.message);
      }

      // 2. Charger les statistiques vidéo
      let videoStats = { totalVideos: 0, totalDuration: 0, analyzedVideos: 0 };
      try {
        const { data: videos, error: videosError } = await supabase
          .from("videos")
          .select("id, duration, status, created_at")
          .eq("user_id", user.id);

        if (!videosError && videos) {
          videoStats = {
            totalVideos: videos.length,
            totalDuration: videos.reduce((sum, video) => sum + (video.duration || 0), 0),
            analyzedVideos: videos.filter(v => v.status === 'analyzed').length
          };
        }
      } catch (videoErr) {
        console.warn("⚠️ Video stats load failed:", videoErr.message);
      }

      // 3. Charger les matches
      let bestMatchScore = 0;
      try {
        const { data: matches, error: matchesError } = await supabase
          .from("advanced_matches")
          .select("overall_score")
          .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
          .order("overall_score", { ascending: false })
          .limit(1);

        if (!matchesError && matches && matches.length > 0) {
          bestMatchScore = matches[0].overall_score;
        }
      } catch (matchErr) {
        console.warn("⚠️ Matches load failed:", matchErr.message);
      }

      // 4. Charger les recommandations
      let projectRecs = [];
      try {
        const { data: recs, error: recError } = await supabase
          .from("project_recommendations")
          .select("*, user_b_id:profiles!project_recommendations_user_b_id_fkey(full_name)")
          .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
          .order("match_score", { ascending: false })
          .limit(3);

        if (!recError && recs) {
          projectRecs = recs;
        }
        setRecommendations(projectRecs);
      } catch (recErr) {
        console.warn("⚠️ Recommendations load failed:", recErr.message);
      }

      // 5. Calculer le SpotCoach Score (avec fallback)
      const performanceScore = videoStats.totalVideos > 0 
        ? (videoStats.totalDuration / 60) * 0.3 + (videoStats.analyzedVideos * 0.7) 
        : 0;
      
      const spotCoachScore = Math.min(100, Math.round(
        performanceScore * 8 + bestMatchScore * 20
      ));

      // 6. Préparer les stats finales avec fallbacks
      const finalStats = {
        spotCoachScore: spotCoachScore,
        bestMatchScore: (bestMatchScore * 10).toFixed(1),
        astroSign: astroData?.sun_sign || "Non défini",
        archetype: astroData?.symbolic_archetype || astroData?.archetype_profile?.dominant_element || "N/A",
        totalVideos: videoStats.totalVideos,
        totalDuration: videoStats.totalDuration,
        analyzedVideos: videoStats.analyzedVideos,
        symbolicColor: astroData?.symbolic_color || "#6366F1",
        hasAstroProfile: !!astroData
      };

      console.log("📊 Final stats calculated:", finalStats);
      setStats(finalStats);

    } catch (err) {
      console.error("❌ Critical error loading SpotCoach:", err);
      setError("Erreur critique lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSpotCoachData();
  }, [user]);

  const handleGenerateRecommendations = async () => {
    if (!user) return;
    
    try {
      toast.loading("Génération des recommandations...");
      
      const { data, error } = await supabase.functions.invoke("generate-project-recommendations", {
        body: { user_id: user.id }
      });

      if (error) throw error;

      toast.success("Recommandations générées avec succès !");
      
      // Recharger les données après un délai
      setTimeout(() => {
        loadSpotCoachData();
      }, 3000);
    } catch (err) {
      console.error("❌ Error generating recommendations:", err);
      toast.error("Erreur lors de la génération des recommandations");
    }
  };

  const handleCalculateAstroProfile = async () => {
    if (!user) return;
    
    try {
      toast.loading("Calcul du profil astrologique...");
      
      // Vérifier d'abord si l'utilisateur a des données de naissance
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("birth_date, birth_time, birth_place")
        .eq("id", user.id)
        .single();

      if (profileError || !profile.birth_date || !profile.birth_time || !profile.birth_place) {
        toast.error("Veuillez d'abord compléter vos données de naissance");
        window.location.href = '/astro-dashboard';
        return;
      }

      const { data, error } = await supabase.functions.invoke("calculate-astro-profile", {
        body: { user_id: user.id }
      });

      if (error) throw error;

      toast.success("Profil astrologique calculé avec succès !");
      
      // Recharger les données
      setTimeout(() => {
        loadSpotCoachData();
      }, 5000);
    } catch (err) {
      console.error("❌ Error calculating astro profile:", err);
      toast.error("Erreur lors du calcul du profil astrologique");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p className="ml-4 text-white">Chargement du Dashboard SpotCoach...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-6 max-w-md mx-auto">
          <div className="text-red-400 text-4xl mb-4">⚠️</div>
          <h3 className="text-red-300 text-lg font-semibold mb-2">Erreur de chargement</h3>
          <p className="text-red-200 mb-4">{error}</p>
          <button
            onClick={loadSpotCoachData}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 mr-2"
          >
            Réessayer
          </button>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Aller au Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center p-8">
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-6 max-w-md mx-auto">
          <div className="text-yellow-400 text-4xl mb-4">📊</div>
          <h3 className="text-yellow-300 text-lg font-semibold mb-2">Dashboard SpotCoach</h3>
          <p className="text-yellow-200 mb-4">
            Analyse avancée de vos performances et compatibilités
          </p>
          <div className="space-y-2">
            <button
              onClick={() => window.location.href = '/astro-dashboard'}
              className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
            >
              🪐 Configurer Profil Astro
            </button>
            <button
              onClick={() => window.location.href = '/record-video'}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              🎥 Créer une Vidéo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 bg-gray-900 rounded-xl shadow-2xl">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-bold text-primary-400 border-b border-primary-400/50 pb-3">
          Dashboard SpotCoach Avancé
        </h1>
        <div className="flex gap-2">
          {!stats.hasAstroProfile && (
            <button
              onClick={handleCalculateAstroProfile}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
            >
              <BoltIcon className="h-5 w-5" />
              Calculer Profil Astro
            </button>
          )}
          <button
            onClick={handleGenerateRecommendations}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <LightBulbIcon className="h-5 w-5" />
            Générer Recommandations
          </button>
        </div>
      </div>

      {/* KPI Avancés */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="SpotCoach Score"
          value={`${stats.spotCoachScore}%`}
          icon={StarIcon}
          color="bg-gradient-to-br from-yellow-600 to-orange-600"
        />
        <StatCard
          title="Meilleur Match"
          value={`${stats.bestMatchScore}/10`}
          icon={UsersIcon}
          color="bg-gradient-to-br from-indigo-600 to-purple-600"
        />
        <StatCard
          title="Signe Solaire"
          value={stats.astroSign}
          icon={BoltIcon}
          color="bg-gradient-to-br from-purple-600 to-pink-600"
        />
        <StatCard
          title="Archétype"
          value={stats.archetype}
          icon={ChartBarIcon}
          color="bg-gradient-to-br from-green-600 to-teal-600"
        />
      </div>

      {/* Message si pas de profil astro */}
      {!stats.hasAstroProfile && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="text-blue-400 text-xl">🪐</div>
            <div>
              <h3 className="text-blue-300 font-semibold">Profil Astrologique Manquant</h3>
              <p className="text-blue-200 text-sm">
                Complétez votre profil astrologique pour débloquer l'analyse avancée des compatibilités.
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/astro-dashboard'}
              className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              Configurer
            </button>
          </div>
        </div>
      )}

      {/* Profil Symbolique */}
      {astroProfile?.symbolic_archetype && (
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl border border-gray-700">
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-6 h-6 rounded-full animate-pulse"
              style={{ backgroundColor: stats.symbolicColor }}
            ></div>
            <h2 className="text-2xl font-bold text-white">Profil Symbolique</h2>
          </div>
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-yellow-400 mb-2">
                {astroProfile.symbolic_archetype}
              </h3>
              <p className="text-lg text-gray-300 italic">
                "{astroProfile.symbolic_phrase}"
              </p>
            </div>
            {astroProfile.symbolic_profile_text && (
              <p className="text-gray-300 leading-relaxed">
                {astroProfile.symbolic_profile_text}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Statistiques Vidéo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-800 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.totalVideos}</div>
          <div className="text-gray-300">Vidéos totales</div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-green-400">
            {Math.round(stats.totalDuration / 60)} min
          </div>
          <div className="text-gray-300">Durée totale</div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg text-center">
          <div className="text-2xl font-bold text-purple-400">{stats.analyzedVideos}</div>
          <div className="text-gray-300">Vidéos analysées</div>
        </div>
      </div>

      {/* Recommandations */}
      <div className="bg-gray-800 p-6 rounded-xl">
        <h2 className="text-2xl font-semibold text-white mb-4">
          Recommandations de Projets
        </h2>
        
        {recommendations.length > 0 ? (
          <div className="space-y-4">
            {recommendations.map((rec, index) => (
              <div key={rec.id || index} className="bg-gray-700 p-4 rounded-lg border-l-4 border-yellow-500">
                <h3 className="text-lg font-semibold text-white mb-2">
                  {rec.recommended_project}
                </h3>
                <p className="text-gray-300 text-sm mb-2">
                  Match avec {rec.user_b_id?.full_name || `l'utilisateur`} 
                  (Score: {(rec.match_score * 10).toFixed(1)}/10)
                </p>
                {rec.project_description && (
                  <p className="text-gray-400 text-sm">{rec.project_description}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-gray-400 text-4xl mb-4">💡</div>
            <p className="text-gray-300 mb-4">
              {stats.hasAstroProfile 
                ? "Générez vos premières recommandations basées sur votre profil"
                : "Complétez votre profil astrologique pour générer des recommandations"
              }
            </p>
            <button
              onClick={stats.hasAstroProfile ? handleGenerateRecommendations : () => window.location.href = '/astro-dashboard'}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              {stats.hasAstroProfile ? "Générer des recommandations" : "Configurer le profil astro"}
            </button>
          </div>
        )}
      </div>

      {/* Actions rapides */}
      <div className="bg-gray-800 p-6 rounded-xl">
        <h2 className="text-2xl font-semibold text-white mb-4">Actions Rapides</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => window.location.href = '/record-video'}
            className="p-4 bg-blue-600 rounded-lg text-white hover:bg-blue-700 transition-colors"
          >
            🎥 Nouvelle Vidéo
          </button>
          <button
            onClick={() => window.location.href = '/astro-dashboard'}
            className="p-4 bg-purple-600 rounded-lg text-white hover:bg-purple-700 transition-colors"
          >
            🪐 Profil Astro
          </button>
          <button
            onClick={() => window.location.href = '/video-vault'}
            className="p-4 bg-green-600 rounded-lg text-white hover:bg-green-700 transition-colors"
          >
            📁 Mes Vidéos
          </button>
          <button
            onClick={handleGenerateRecommendations}
            className="p-4 bg-orange-600 rounded-lg text-white hover:bg-orange-700 transition-colors"
          >
            🤖 Générer Matchs
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardSpotCoach;
