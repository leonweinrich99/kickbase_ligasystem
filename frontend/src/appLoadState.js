// Einfache modul-weite Markierung, ob der animierte Splash-Screen (Logo +
// Schriftzug) in dieser Sitzung schon einmal gezeigt wurde. Danach soll beim
// Wechseln zwischen Tabs/Ansichten nur noch eine stille, dunkle Fläche
// erscheinen statt der Animation erneut abzuspielen.
let hasShownSplash = false;

export const shouldShowSplash = () => !hasShownSplash;

export const markSplashShown = () => {
  hasShownSplash = true;
};
