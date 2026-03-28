export type Expert = {
  id: string;
  routeName: string;
  name: string;
  emoji: string;
  subtitle: string;
  welcome: string;
  description: string;
  accent: {
    cardBorder: string;
    subtitleText: string;
    buttonClass: string;
    headerBorderLeft: string;
  };
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
    description: "Practical protocols grounded in biochemistry",
    accent: {
      cardBorder: "ring-emerald-500/20 hover:ring-emerald-500/50",
      subtitleText: "text-emerald-400",
      buttonClass:
        "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/60",
      headerBorderLeft: "border-l-emerald-500",
    },
  },
  {
    id: "synapse",
    routeName: "synapseChat",
    emoji: "🧠",
    name: "Synapse",
    subtitle: "Mind & Identity",
    welcome:
      "Jestem Synapse — ekspert od psychologicznych fundamentów długowieczności. Relacje są #1 czynnikiem długowieczności wg Harvard Study.",
    description: "Philosophy grounded in neuroscience",
    accent: {
      cardBorder: "ring-violet-500/20 hover:ring-violet-500/50",
      subtitleText: "text-violet-400",
      buttonClass:
        "border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:border-violet-500/60",
      headerBorderLeft: "border-l-violet-500",
    },
  },
  {
    id: "glow",
    routeName: "glowChat",
    emoji: "✨",
    name: "Glow",
    subtitle: "Skin & Appearance",
    welcome:
      "Jestem Glow — Twój wygląd to okno na Twoje zdrowie. Łączę naukę o skórze z biologią komórkową.",
    description: "Your appearance decoded as biological signal",
    accent: {
      cardBorder: "ring-amber-500/20 hover:ring-amber-500/50",
      subtitleText: "text-amber-400",
      buttonClass:
        "border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/60",
      headerBorderLeft: "border-l-amber-500",
    },
  },
  {
    id: "dreamer",
    routeName: "dreamerChat",
    emoji: "🌙",
    name: "Dreamer",
    subtitle: "Sleep & Recovery",
    welcome:
      "Jestem Dreamer — ekspert od snu i rytmów dobowych. Sen to najpotężniejsza interwencja longevity.",
    description: "Sleep as your most powerful longevity tool",
    accent: {
      cardBorder: "ring-indigo-500/20 hover:ring-indigo-500/50",
      subtitleText: "text-indigo-400",
      buttonClass:
        "border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/60",
      headerBorderLeft: "border-l-indigo-500",
    },
  },
  {
    id: "pulse",
    routeName: "pulseChat",
    emoji: "💓",
    name: "Pulse",
    subtitle: "Physical Vitality",
    welcome:
      "Jestem Pulse — ruch to najpotężniejszy sygnał długowieczności dla każdej komórki Twojego ciała.",
    description: "Movement is medicine. No exceptions.",
    accent: {
      cardBorder: "ring-rose-500/20 hover:ring-rose-500/50",
      subtitleText: "text-rose-400",
      buttonClass:
        "border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/60",
      headerBorderLeft: "border-l-rose-500",
    },
  },
  {
    id: "cipher",
    routeName: "cipherChat",
    emoji: "🔐",
    name: "Cipher",
    subtitle: "Data & Biomarkers",
    welcome:
      "Jestem Cipher. Nie pytam jak się czujesz — pytam co pokazują dane.",
    description: "Cold. Precise. Your data tells the truth.",
    accent: {
      cardBorder: "ring-slate-500/20 hover:ring-slate-500/50",
      subtitleText: "text-slate-400",
      buttonClass:
        "border border-slate-500/40 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20 hover:border-slate-500/60",
      headerBorderLeft: "border-l-slate-500",
    },
  },
];

export const expertMap = Object.fromEntries(experts.map((e) => [e.id, e]));
