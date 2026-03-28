export type Expert = {
  id: string;         // URL slug — used in /chat/[expertId]
  routeName: string;  // Amplify conversation route — used in useAIConversation
  name: string;
  emoji: string;
  subtitle: string;
  welcome: string;
};

export const experts: Expert[] = [
  {
    id: "vita",
    routeName: "vitaChat",
    emoji: "🧬",
    name: "Vita",
    subtitle: "Metabolic Optimization",
    welcome:
      "Jestem Vita — Twój ekspert od metabolizmu i długowieczności. Dekoduję Twoją biochemię i tworzę spersonalizowane protokoły żywieniowe. Zapytaj mnie o post przerywany, autofagię, suplementację lub mikrobiom.",
  },
  {
    id: "synapse",
    routeName: "synapseChat",
    emoji: "🧠",
    name: "Synapse",
    subtitle: "Mind & Identity",
    welcome:
      "Jestem Synapse — ekspert od psychologicznych fundamentów długowieczności. Relacje są #1 czynnikiem długowieczności wg Harvard Study.",
  },
  {
    id: "glow",
    routeName: "glowChat",
    emoji: "✨",
    name: "Glow",
    subtitle: "Skin & Appearance",
    welcome:
      "Jestem Glow — Twój wygląd to okno na Twoje zdrowie. Łączę naukę o skórze z biologią komórkową.",
  },
  {
    id: "dreamer",
    routeName: "dreamerChat",
    emoji: "🌙",
    name: "Dreamer",
    subtitle: "Sleep & Recovery",
    welcome:
      "Jestem Dreamer — ekspert od snu i rytmów dobowych. Sen to najpotężniejsza interwencja longevity.",
  },
  {
    id: "pulse",
    routeName: "pulseChat",
    emoji: "💓",
    name: "Pulse",
    subtitle: "Physical Vitality",
    welcome:
      "Jestem Pulse — ruch to najpotężniejszy sygnał długowieczności dla każdej komórki Twojego ciała.",
  },
  {
    id: "cipher",
    routeName: "cipherChat",
    emoji: "🔐",
    name: "Cipher",
    subtitle: "Data & Biomarkers",
    welcome:
      "Jestem Cipher. Nie pytam jak się czujesz — pytam co pokazują dane.",
  },
];

export const expertMap = Object.fromEntries(experts.map((e) => [e.id, e]));
