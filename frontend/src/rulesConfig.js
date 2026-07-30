import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export const DEFAULT_RULES = {
  season: 'Saison 26/27',
  league: [
    { id: 'fairplay', section: 'Fairplay & Verantwortung', title: 'Fairplay & Mindset', text: 'Fairness und Spaß stehen an erster Stelle. Die Regeln sind einzuhalten und Strafen umzusetzen. Niederlagen sollen sportlich genommen werden.', color: 'blue' },
    { id: 'discussion', section: 'Fairplay & Verantwortung', title: 'Diskussion', text: 'Jeder ist für die Regeleinhaltung verantwortlich. Verstöße werden liga-intern diskutiert, Strafen im Zweifel per Mehrheitsentscheid festgelegt.', color: 'blue' },
    { id: 'team-limits', section: 'Limits & Transfers', title: 'Team-Limits', text: 'Maximal 2 Spieler desselben Teams in der Startelf. Im gesamten Kader sind bis zu 3 Spieler eines Teams erlaubt.', color: 'green' },
    { id: 'loans', section: 'Limits & Transfers', title: 'Spielerleihen', text: 'Leihgebühren müssen mindestens 500k pro Spieltag betragen.', color: 'orange' },
    { id: 'underpay', section: 'Limits & Transfers', title: 'Underpay-Verbot', text: 'Kauf unter Marktwert ist verboten. 1. Verstoß = Gelb, 2. Verstoß = Rot (Strafe).', color: 'red' },
    { id: 'top-three', section: 'Spieltags-Regeln', title: 'Zwangsverkauf Top 3', text: 'Top 3 Manager der Woche müssen ihren besten Spieler (Startelf) bis Montag 22 Uhr an den Transfermarkt verkaufen.', color: 'orange' },
    { id: 'penalties', section: 'Spieltags-Regeln', title: 'Strafen', text: 'Bei Verstoß muss am nächsten Spieltag ein Spieler weniger aufgestellt werden. Nichtbefolgung ist ein weiterer Verstoß.', color: 'red' },
    { id: 'entry-fee', section: 'Einsatz & Gewinn', title: 'Startgeld', text: 'Jede*r zahlende Teilnehmer*in überweist 5 € in den gemeinsamen Preispool. Frist: bis Donnerstag, 13.08. (1 Tag vor Start der Vorbereitungsphase).', color: 'green' },
    { id: 'prize-pool', section: 'Einsatz & Gewinn', title: 'Preispool', text: 'Bei 26 zahlenden Manager*innen stehen insgesamt 130 € Preisgeld zur Verfügung, aufgeteilt nach Liga. Die Verteilung gilt unter der Voraussetzung, dass alle 26 Personen ihren Einsatz überweisen.\n\nLiga 1: 1. 25 € · 2. 18 € · 3. 12 €\nLiga 2: 1. 20 € · 2. 15 € · 3. 8 €\nLiga 3: 1. 15 € · 2. 10 € · 3. 7 €', color: 'orange' },
    { id: 'no-stake', section: 'Einsatz & Gewinn', title: 'Sonderregel: Spiel ohne Einsatz', text: 'Wer nicht um Geld mitspielt, zahlt die 5 € nicht ein und kann dementsprechend auch kein Preisgeld gewinnen. Erreicht diese Person dennoch einen Treppchenplatz, wird das Preisgeld an den nächsten Platz dahinter ausgezahlt.', color: 'red' },
    { id: 'promotion', section: 'Aufstieg & Abstieg', title: 'Auf- und Abstieg', text: 'Greift nach Hin- und Rückrunde. Platz 1&2 steigen auf, Platz 8&9 steigen ab.', color: 'green' },
    { id: 'relegation', section: 'Aufstieg & Abstieg', title: 'Relegation', text: 'Letzter Spieltag: Platz 3 vs Platz 7 der höheren Liga. Vergleich via Matchday Challenge (Rushmodus).', color: 'orange' },
  ],
  cup: [
    { id: 'draw', section: 'Turniermodus & Einstellungen', title: 'Die Auslosung', text: 'Zu Beginn der Pokal-Saison gibt es eine erste Auslosung, die auf den bestehenden Qualigruppenergebnissen basiert. Dafür werden zwei Lostöpfe gebildet, aus denen die Kontrahenten für das Sechzehntelfinale gezogen werden. Für alle darauffolgenden Runden bzw. Spieltage werden die Partien immer wieder neu ausgelost.', color: 'blue' },
    { id: 'head-to-head', section: 'Turniermodus & Einstellungen', title: 'Head-to-Head Modus', text: 'Die Spieler treten an einem festen Spieltag direkt gegeneinander an. Das Duell im Head-to-Head entscheidet über das Weiterkommen.', color: 'purple' },
    { id: 'arena', section: 'Turniermodus & Einstellungen', title: 'Arena-Modus', text: 'Der Pokal wird im speziellen Arenamodus von Kickbase gespielt. Alle Teams haben somit dieselben Voraussetzungen.', color: 'blue' },
    { id: 'budget', section: 'Turniermodus & Einstellungen', title: 'Budget', text: 'Jeder Teilnehmer erhält ein festes Startbudget in Höhe von 250 Millionen Euro, um seinen Kader für den Pokal-Spieltag aufzustellen.', color: 'orange' },
    { id: 'knockout', section: 'Verlauf & Belohnung', title: 'K.O.-System', text: 'Der Gewinner jedes Duells zieht direkt in die nächste Runde ein. Der Verlierer scheidet aus dem Pokalwettbewerb aus.', color: 'green' },
    { id: 'reward', section: 'Verlauf & Belohnung', title: 'Die ultimative Belohnung', text: 'Der Pokalsieger erhält die einmalige Chance, eine Liga aufzusteigen! Er darf in der Relegation um den Aufstieg in die nächst höhere Liga spielen.', color: 'red' },
  ],
};

export const mergeRules = (value) => ({
  ...DEFAULT_RULES,
  ...value,
  league: value?.league || DEFAULT_RULES.league,
  cup: value?.cup || DEFAULT_RULES.cup,
});

export const subscribeToRules = (onChange) => {
  if (!db) {
    onChange(DEFAULT_RULES);
    return () => {};
  }
  return onSnapshot(doc(db, 'settings', 'rules'), (snapshot) => {
    onChange(snapshot.exists() ? mergeRules(snapshot.data()) : DEFAULT_RULES);
  }, () => onChange(DEFAULT_RULES));
};

export const saveRules = (rules) => setDoc(doc(db, 'settings', 'rules'), rules);

export const loadRules = async () => {
  if (!db) return DEFAULT_RULES;
  const snapshot = await getDoc(doc(db, 'settings', 'rules'));
  return snapshot.exists() ? mergeRules(snapshot.data()) : DEFAULT_RULES;
};
