import React, { useState, useEffect } from "react";
import { getChallenges, submitChallenge, getUserSubmission } from "../services/challengeService";
import { toast } from "sonner";

const ChallengeList = () => {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideoId, setSelectedVideoId] = useState(null); // Pour la soumission

  useEffect(() => {
    const fetchChallenges = async () => {
      try {
        const data = await getChallenges();
        setChallenges(data);
      } catch (error) {
        toast.error(`Erreur chargement défis: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchChallenges();
  }, []);

  const handleSubmission = async (challengeId) => {
    if (!selectedVideoId) {
      toast.error("Veuillez sélectionner une vidéo à soumettre.");
      return;
    }

    try {
      await submitChallenge(challengeId, selectedVideoId);
      toast.success("Soumission au défi réussie !");
      // Recharger les défis pour mettre à jour le statut
      const data = await getChallenges();
      setChallenges(data);
    } catch (error) {
      toast.error(`Erreur soumission: ${error.message}`);
    }
  };

  if (loading) {
    return <div className="text-center text-white">Chargement des défis...</div>;
  }

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-bold text-white">SpotBulle Challenges</h2>
      
      {/* Sélecteur de Vidéo (Simplifié) */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <label htmlFor="video-select" className="text-white block mb-2">Sélectionner une Vidéo pour Soumission (Simulé):</label>
        <select
          id="video-select"
          className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600"
          onChange={(e) => setSelectedVideoId(e.target.value)}
          value={selectedVideoId || ""}
        >
          <option value="" disabled>-- Choisir une vidéo --</option>
          {/* En production, vous feriez un appel à videoService.getVideos() */}
          <option value="video-id-1">Vidéo de Pitch - 2025-10-20</option>
          <option value="video-id-2">Entraînement Football - 2025-11-01</option>
          <option value="video-id-3">Présentation Projet - 2025-11-07</option>
        </select>
      </div>

      {challenges.length === 0 ? (
        <p className="text-gray-400">Aucun défi disponible pour le moment.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {challenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              onSubmission={handleSubmission}
              selectedVideoId={selectedVideoId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ChallengeCard = ({ challenge, onSubmission, selectedVideoId }) => {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubmission = async () => {
      try {
        const sub = await getUserSubmission(challenge.id);
        setSubmission(sub);
      } catch (error) {
        // Ignorer l'erreur si aucune soumission n'est trouvée
      } finally {
        setLoading(false);
      }
    };
    fetchSubmission();
  }, [challenge.id]);

  const isSubmitted = submission !== null;

  return (
    <div className={`bg-gray-800 p-6 rounded-xl shadow-lg border ${isSubmitted ? 'border-green-500' : 'border-gray-700'}`}>
      <h3 className="text-xl font-bold text-white mb-2">{challenge.title}</h3>
      <p className="text-gray-400 mb-4">{challenge.description}</p>
      
      <div className="mb-4 text-sm">
        <p className="text-gray-300">Catégorie: <span className="font-semibold text-primary-400">{challenge.category || 'Général'}</span></p>
        <p className="text-gray-300">Compétences: <span className="font-semibold">{challenge.required_skills?.join(', ') || 'Non spécifié'}</span></p>
      </div>

      {loading ? (
        <p className="text-gray-500">Vérification de la soumission...</p>
      ) : isSubmitted ? (
        <div className="mt-4 p-3 bg-green-900/50 rounded">
          <p className="text-green-400 font-semibold">✅ Soumis !</p>
          <p className="text-sm text-green-300">Vidéo: {submission.videos.title}</p>
          {submission.score && <p className="text-sm text-green-300">Score: {submission.score}/10</p>}
        </div>
      ) : (
        <button
          onClick={() => onSubmission(challenge.id)}
          disabled={!selectedVideoId}
          className={`w-full py-2 rounded font-semibold transition-colors ${
            selectedVideoId
              ? 'bg-primary-600 hover:bg-primary-700 text-white'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          Soumettre la Vidéo Sélectionnée
        </button>
      )}
    </div>
  );
};

export default ChallengeList;
