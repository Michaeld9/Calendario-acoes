const EVENT_TYPE_EVENTO = "Evento";
const EVENT_TYPE_ACAO_PONTUAL = "A\u00e7\u00e3o Pontual";
const EVENT_TYPE_PROJETO_INSTITUCIONAL = "Projeto Institucional";
const EVENT_TYPE_PROJETO_PEDAGOGICO = "Projeto Pedag\u00f3gico";
const EVENT_TYPE_EXPEDICAO_PEDAGOGICA = "Expedi\u00e7\u00e3o Pedag\u00f3gica";
const EVENT_TYPE_FORMACAO = "Forma\u00e7\u00e3o";
const EVENT_TYPE_FESTA = "Festa";

interface EventTypeStyle {
  badgeClass: string;
  dayChipClass: string;
}

const DEFAULT_STYLE: EventTypeStyle = {
  badgeClass: "bg-cyan-100 text-cyan-800 hover:bg-cyan-100 border-transparent",
  dayChipClass: "bg-cyan-500 text-white",
};

const EVENT_TYPE_STYLES: Record<string, EventTypeStyle> = {
  [EVENT_TYPE_EVENTO]: {
    badgeClass: "bg-slate-200 text-slate-800 hover:bg-slate-200 border-transparent",
    dayChipClass: "bg-slate-500 text-white",
  },
  [EVENT_TYPE_ACAO_PONTUAL]: {
    badgeClass: "bg-amber-200 text-amber-900 hover:bg-amber-200 border-transparent",
    dayChipClass: "bg-amber-400 text-slate-900",
  },
  [EVENT_TYPE_PROJETO_INSTITUCIONAL]: {
    badgeClass: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-transparent",
    dayChipClass: "bg-emerald-500 text-white",
  },
  [EVENT_TYPE_PROJETO_PEDAGOGICO]: {
    badgeClass: "bg-sky-100 text-sky-800 hover:bg-sky-100 border-transparent",
    dayChipClass: "bg-sky-500 text-white",
  },
  [EVENT_TYPE_EXPEDICAO_PEDAGOGICA]: {
    badgeClass: "bg-blue-100 text-blue-800 hover:bg-blue-100 border-transparent",
    dayChipClass: "bg-blue-600 text-white",
  },
  [EVENT_TYPE_FORMACAO]: {
    badgeClass: "bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-100 border-transparent",
    dayChipClass: "bg-fuchsia-500 text-white",
  },
  [EVENT_TYPE_FESTA]: {
    badgeClass: "bg-rose-100 text-rose-800 hover:bg-rose-100 border-transparent",
    dayChipClass: "bg-rose-500 text-white",
  },
};

const getStyle = (eventType: string | null | undefined): EventTypeStyle => {
  const key = String(eventType || "").trim();
  return EVENT_TYPE_STYLES[key] || DEFAULT_STYLE;
};

export const getEventTypeBadgeClass = (eventType: string | null | undefined): string => {
  return getStyle(eventType).badgeClass;
};

export const getEventTypeDayChipClass = (eventType: string | null | undefined): string => {
  return getStyle(eventType).dayChipClass;
};
