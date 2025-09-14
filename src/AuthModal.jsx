import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog.jsx';
import { Button } from './components/ui/button.jsx';
import { Input } from './components/ui/input.jsx';
import { Label } from './components/ui/label.jsx';
import { useAuth } from './context/AuthContext.jsx';

const AuthModal = ({ isOpen, onClose, onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const { signIn, signUp, loading: authLoading } = useAuth();

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFirstName('');
    setLastName('');
    setError(null);
    setShowConfirmation(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Validation simple
    if (!email || !password) {
      setError('Veuillez remplir tous les champs');
      setLoading(false);
      return;
    }

    if (!isLogin && (!firstName || !lastName)) {
      setError('Veuillez remplir tous les champs');
      setLoading(false);
      return;
    }

    try {
      let result;
      if (isLogin) {
        console.log('Tentative de connexion avec:', email);
        result = await signIn(email, password);
        console.log('Résultat de connexion:', result);
      } else {
        console.log('Tentative d\'inscription avec:', email);
        result = await signUp(email, password, firstName, lastName);
        console.log('Résultat d\'inscription:', result);
        
        // Pour l'inscription, vérifier si l'email de confirmation est nécessaire
        if (result?.user?.identities?.length === 0) {
          setShowConfirmation(true);
          setError(null);
          setLoading(false);
          // Ne pas appeler onClose() ici pour laisser le message visible
          return;
        }
      }
      
      // Si l'inscription a réussi et qu'aucun email de confirmation n'est nécessaire (par exemple, si l'utilisateur est déjà confirmé ou si la configuration Supabase ne l'exige pas)
      // Ou si la connexion a réussi
      if (result && result.user) {
        console.log("Authentification réussie, fermeture du modal");
        
        // Attendre un peu pour que les triggers de base de données s'exécutent
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        onAuthSuccess(result.user);
        onClose(); // Fermer le modal après un succès d'authentification direct
        resetForm();
      } else {
        setError('Erreur d\'authentification - Veuillez réessayer');
      }
    } catch (err) {
      console.error('Erreur d\'authentification dans AuthModal:', err);
      
      // Afficher l'erreur spécifique du contexte d'authentification
      const errorMessage = err.message || "Une erreur s'est produite lors de l'authentification";
      setError(errorMessage);
      
      // Si c'est une erreur de credentials, suggérer l'inscription
      if (errorMessage.includes('Email ou mot de passe incorrect') && isLogin) {
        setTimeout(() => {
          setError(errorMessage + ' - Vous pouvez également créer un nouveau compte en cliquant sur "Pas de compte ? Inscrivez-vous"');
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
        resetForm();
      }
    }}>
      <DialogContent className="sm:max-w-[425px]">
        {showConfirmation ? (
          // Écran de confirmation après inscription
          <>
            <DialogHeader>
              <DialogTitle className="text-center text-green-600">✅ Inscription réussie !</DialogTitle>
              <DialogDescription className="text-center">
                Votre compte a été créé avec succès.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 text-center space-y-4">
              <div className="text-6xl">📧</div>
              <div className="space-y-2">
                <p className="text-lg font-semibold">Vérifiez votre email</p>
                <p className="text-sm text-gray-600">
                  Un email de confirmation a été envoyé à <strong>{email}</strong>
                </p>
                <p className="text-sm text-gray-600">
                  Cliquez sur le lien dans l'email pour activer votre compte et vous connecter.
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                💡 <strong>Astuce :</strong> Vérifiez aussi votre dossier spam si vous ne voyez pas l'email.
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowConfirmation(false);
                  setIsLogin(true);
                }}
                className="flex-1"
              >
                Se connecter
              </Button>
              <Button 
                onClick={() => {
                  onClose();
                  resetForm();
                }}
                className="flex-1"
              >
                Fermer
              </Button>
            </div>
          </>
        ) : (
          // Formulaire de connexion/inscription normal
          <>
            <DialogHeader>
              <DialogTitle>{isLogin ? 'Connexion' : 'Inscription'}</DialogTitle>
              <DialogDescription>
                {isLogin ? 'Connectez-vous à votre compte.' : 'Créez un nouveau compte.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-4 py-4">
              {!isLogin && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="firstName" className="text-right">
                    Prénom
                  </Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="col-span-3"
                    required
                  />
                </div>
              )}
              {!isLogin && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="lastName" className="text-right">
                    Nom
                  </Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="col-span-3"
                    required
                  />
                </div>
              )}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="col-span-3"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="password" className="text-right">
                  Mot de passe
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="col-span-3"
                  required
                  minLength={6}
                />
              </div>
              {error && (
                <div className={`text-sm p-3 rounded-md ${
                  error.startsWith('✅') 
                    ? 'text-green-700 bg-green-50 border border-green-200' 
                    : 'text-red-500'
                }`}>
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading || authLoading}>
                {loading ? 'Chargement...' : (isLogin ? 'Connexion' : 'Inscription')}
              </Button>
              <Button
                variant="link"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                }}
                className="w-full"
              >
                {isLogin ? 'Pas de compte ? Inscrivez-vous' : 'Déjà un compte ? Connectez-vous'}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AuthModal;
