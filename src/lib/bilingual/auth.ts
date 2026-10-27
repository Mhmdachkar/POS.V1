import { bi } from './types'

export const AUTH = {
  signInToContinue: bi('Connectez-vous pour continuer', 'Sign in to continue'),
  username: bi("Nom d'utilisateur", 'Username'),
  password: bi('Mot de passe', 'Password'),
  enterUsername: bi("Saisissez votre nom d'utilisateur", 'Enter your username'),
  enterPassword: bi('Saisissez votre mot de passe', 'Enter your password'),
  signIn: bi('Connexion', 'Sign in'),
  signingIn: bi('Connexion…', 'Signing in…'),
  showPassword: bi('Afficher le mot de passe', 'Show password'),
  hidePassword: bi('Masquer le mot de passe', 'Hide password'),
  invalidCredentials: bi("Nom d'utilisateur ou mot de passe incorrect.", 'Invalid username or password.'),
  signInSlow: bi('La connexion prend trop de temps. Réessayez.', 'Sign-in is taking too long. Please try again.'),
  profileLoadFailed: bi("Profil introuvable. Contactez l'admin.", 'Profile not found. Contact your admin.'),
  welcomeBack: (name?: string) => {
    const fr = name ? `Bon retour, ${name}` : 'Bon retour'
    const en = name ? `Welcome back, ${name}` : 'Welcome back'
    return bi(fr, en)
  },
  accountDeactivated: bi('Compte désactivé', 'Account deactivated'),
  accountDeactivatedBody: bi('Votre compte a été désactivé.', 'Your account has been deactivated.'),
  accountDeactivatedNamed: (name: string) =>
    bi(`Votre compte (${name}) a été désactivé.`, `Your account (${name}) has been deactivated.`),
  contactAdmin: bi('Contactez votre admin.', 'Contact your admin.'),
  signOut: bi('Déconnexion', 'Sign out'),
  signingOut: bi('Déconnexion…', 'Signing out…'),
  signOutFailed: bi(
    'Échec de la déconnexion. Fermez l\'onglet du navigateur.',
    'Sign-out failed. Please close the browser tab.',
  ),
  signOutUnexpected: bi('Erreur inattendue lors de la déconnexion.', 'Unexpected error during sign-out.'),
  pageNotFound: bi('Page introuvable', 'Page not found'),
  pageNotFoundBody: bi(
    'Cette page n\'existe pas ou vous n\'y avez pas accès.',
    "The page you're looking for doesn't exist or you don't have access to it.",
  ),
  goHome: bi('Accueil', 'Home'),
  systemTagline: bi('Aquilux POS — caisse et stock multi-dépôts', 'Aquilux POS — multi-depot POS and stock'),
  usernameRequired: bi("Nom d'utilisateur requis", 'Username is required'),
  usernameTooLong: bi("Nom d'utilisateur trop long", 'Username too long'),
  usernameInvalid: bi('Lettres, chiffres, . _ - uniquement.', 'Letters, numbers, . _ - only.'),
  passwordRequired: bi('Mot de passe requis', 'Password is required'),
} as const
