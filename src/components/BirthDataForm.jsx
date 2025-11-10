import React, { useState, useEffect } from "react";
import { updateBirthData, getAstroProfile } from "../services/astroService";
import { useAuth } from "../contexts/AuthContext"; // Supposition d'un contexte d'authentification

const BirthDataForm = ({ onProfileUpdated }) => {
  const { user } = useAuth(); // Récupérer l'utilisateur connecté
  const [birthData, setBirthData] = useState({
    date: "",
    time: "",
    place: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Pré-remplir le formulaire si le profil astro existe déjà
    const fetchAstroProfile = async () => {
      if (user) {
        const profile = await getAstroProfile(user.id);
        if (profile) {
          // Si le profil existe, on peut supposer que les données de naissance sont dans la table profiles
          // Pour cet exemple, on ne peut pas les récupérer directement sans un service dédié,
          // mais en production, on chargerait les données de 'profiles' ici.
          setMessage("Votre profil astrologique a déjà été calculé.");
        }
      }
    };
    fetchAstroProfile();
  }, [user]);

  const handleChange = (e) => {
    setBirthData({
      ...birthData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      setMessage("Erreur: Utilisateur non authentifié.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await updateBirthData(user.id, birthData);
      setMessage("Données de naissance mises à jour. Calcul astrologique en cours...");
      if (onProfileUpdated) {
        onProfileUpdated(true);
      }
    } catch (error) {
      setMessage(`Erreur lors de la mise à jour: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="birth-data-form">
      <h2>Saisissez vos données de naissance</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="date">Date de naissance:</label>
          <input
            type="date"
            id="date"
            name="date"
            value={birthData.date}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="time">Heure de naissance:</label>
          <input
            type="time"
            id="time"
            name="time"
            value={birthData.time}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="place">Lieu de naissance:</label>
          <input
            type="text"
            id="place"
            name="place"
            value={birthData.place}
            onChange={handleChange}
            placeholder="Ville, Pays"
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Traitement..." : "Calculer mon Profil Astro"}
        </button>
      </form>
      {message && <p className="message">{message}</p>}
    </div>
  );
};

export default BirthDataForm;
