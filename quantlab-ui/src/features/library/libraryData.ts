export type LibraryCategory = "strategi" | "indikator";

export interface StrategyLibraryItem {
  id: string;
  name: string;
  category: LibraryCategory;
  style: string;
  timeframe: string;
  summary: string;
  defaults?: string[];
  strengths?: string[];
  watchouts?: string[];
  tags?: string[];
}

export interface MetricLibraryItem {
  key: string;
  label: string;
  description: string;
  whyItMatters: string;
  good: string;
  caution?: string;
  formula?: string;
}

export const STRATEGY_LIBRARY: StrategyLibraryItem[] = [
  {
    id: "obi",
    name: "Obi-Wan Kenobi",
    category: "strategi",
    style: "Mean reversion i upptrend",
    timeframe: "Daglig",
    summary: "Köper korta rekyler i starka aktier: priset måste ligga över ett långt glidande medelvärde och RSI2 falla ned i översålt läge.",
    defaults: ["SMA 250 som trendfilter", "RSI2 inträde < 20, exit > 75", "Stop-loss 10 %, tidsstopp 15 tradingdagar"],
    strengths: ["Filtrerar fram aktier i upptrend", "Snabb återgång när RSI normaliseras", "Tidsstopp begränsar slöa positioner"],
    watchouts: ["Känslig för gap ned efter nyheter", "Fungerar sämre i sidledes/bear-marknader"],
    tags: ["RSI2", "Trendfilter", "Mean reversion"],
  },
  {
    id: "darth",
    name: "Darth Vader",
    category: "strategi",
    style: "Breakout efter kraftig rekyl",
    timeframe: "Daglig",
    summary: "Letar lägstanivåer i procentuell nedgång och tar position när priset studsar samtidigt som aktien är i långsiktig upptrend.",
    defaults: ["SMA 200 som trendfilter", "Stop-loss 15 %, tidsstopp 14 tradingdagar"],
    strengths: ["Ger entry nära lokala bottnar", "Kombinerar prisnivå och momentum"],
    watchouts: ["Kräver snabb exekvering, bör handlas i likvida aktier"],
    tags: ["Breakout", "Mean reversion"],
  },
  {
    id: "ma8x_cross",
    name: "8x MA crossover",
    category: "strategi",
    style: "Trendföljande",
    timeframe: "Daglig",
    summary: "Ett paket av snabba glidande medelvärden (MA1–MA3) korsar de långsammare (MA4–MA8). Positionen hålls så länge snittet ligger över.",
    defaults: ["Stödjer både SMA/EMA-varianter", "Kan kombineras med volymfilter"],
    strengths: ["Robust trendindikator", "Fångar större rörelser snarare än brus"],
    watchouts: ["Whipsaws i sidledes marknad", "Kan missa den första delen av större uppgångar"],
    tags: ["Trendföljande", "Glidande medelvärden"],
  },
  {
    id: "bb_kc_squeeze",
    name: "BB/KC Squeeze (lång)",
    category: "strategi",
    style: "Volatilitetsbreakout",
    timeframe: "Daglig",
    summary: "Spanar efter perioder med låg volatilitet (Bollinger Bands innanför Keltner Channels). Köp triggas när priset bryter upp över övre KC-bandet.",
    defaults: ["Stop under KC-mid", "Möjligt att lägga take-profit / stop-loss"],
    strengths: ["Bra för att fånga volatilitets-expansioner", "Ger tydliga visuella signaler"],
    watchouts: ["Falska signaler i nyhetsdriven handel", "Kräver disciplin i stop-loss"],
    tags: ["Bollinger Bands", "Keltner Channel", "Breakout"],
  },
  {
    id: "r2d2",
    name: "R2-D2 (kort)",
    category: "strategi",
    style: "Mean reversion på nedsidan",
    timeframe: "Daglig",
    summary: "Går kort i svaga aktier när priset återstudsar mot motstånd: priset under SMA200 och flera dagars upprekyl utlöst.",
    defaults: ["Stop-loss 10 %, tidsstopp 15 dagar", "Exit vid snabb återgång över exit-SMA"],
    strengths: ["Utnyttjar överköpt läge i nedtrend", "Passar som hedge-komponent"],
    watchouts: ["Shorting kräver lånelimitar och kostnader", "Snabba trendvändningar kan trigga stop-loss"],
    tags: ["Short", "Mean reversion", "Trendfilter"],
  },
];

export const INDICATOR_LIBRARY: StrategyLibraryItem[] = [
  {
    id: "rsi",
    name: "Relative Strength Index (RSI)",
    category: "indikator",
    style: "Momentum/mean reversion",
    timeframe: "Multi timeframe",
    summary: "RSI mäter styrkan i upp- respektive nedgångar. Vanligtvis används 14 perioder men korta varianter (RSI2/RSI4) är populära för snabba swing-signaler.",
    strengths: ["Identifierar överköpta/översålda lägen", "Kan kombineras med trendfilter"],
    watchouts: ["Kan fastna i extremzoner under kraftiga trender", "Bör inte användas isolerat"],
    tags: ["Momentum", "Oscillator"],
  },
  {
    id: "sma",
    name: "Simple Moving Average (SMA)",
    category: "indikator",
    style: "Trendfilter",
    timeframe: "Multi timeframe",
    summary: "SMA jämnar ut prisrörelser och används för att definiera trender eller generera korsningssignaler.",
    strengths: ["Enkel att tolka", "Bra som långsiktigt filter (t.ex. SMA200)"],
    watchouts: ["Sent i signaleringen", "Likaviktar gamla och nya observationer"],
    tags: ["Trend", "Glidande medelvärde"],
  },
  {
    id: "ema",
    name: "Exponential Moving Average (EMA)",
    category: "indikator",
    style: "Trend/momentum",
    timeframe: "Multi timeframe",
    summary: "EMA viktar de senaste datapunkterna högre och reagerar snabbare än SMA.",
    strengths: ["Bättre för kortare swingstrategier", "Bra i crossover-system"],
    watchouts: ["Kan ge fler falska signaler i brusig data"],
    tags: ["Trend", "Glidande medelvärde"],
  },
  {
    id: "bollinger",
    name: "Bollinger Bands",
    category: "indikator",
    style: "Volatilitetskanal",
    timeframe: "Multi timeframe",
    summary: "Band placerade ± standardavvikelser från ett medelvärde. Fångar volatilitet och används för breakout eller mean reversion.",
    strengths: ["Ger både trend- och kontrariansignaler", "Visar tydligt när volatilitet krymper/expanderar"],
    watchouts: ["Behöver kompletteras med volym eller trendfilter"],
    tags: ["Volatilitet", "Kanal"],
  },
  {
    id: "atr",
    name: "Average True Range (ATR)",
    category: "indikator",
    style: "Volatilitetsmått",
    timeframe: "Multi timeframe",
    summary: "ATR mäter genomsnittlig rörelsestyrka per dag och används för stop-loss, position sizing och volatility breaks.",
    strengths: ["Robust riskmått", "Bra för dynamiska stoppar"],
    watchouts: ["Stiger ofta i nedgångsperioder – kan ge stora stops"],
    tags: ["Volatilitet", "Risk"],
  },
];

export const FUNDAMENTAL_METRIC_LIBRARY: MetricLibraryItem[] = [
  {
    key: "ROIC",
    label: "ROIC (%)",
    description: "Avkastning på investerat kapital visar hur effektivt bolaget använder kapitalet för att skapa rörelseresultat.",
    whyItMatters: "Företag med konsekvent hög ROIC har ofta konkurrensfördelar och god kapitalallokering.",
    good: "Över 12 % under flera år är ett styrketecken.",
    caution: "Fallande ROIC kan signalera prispress eller ineffektiva investeringar.",
  },
  {
    key: "FCF_MARGIN",
    label: "Fritt kassaflöde-marginal",
    description: "Andel av omsättningen som blir kvar som fritt kassaflöde efter investeringar.",
    whyItMatters: "Högt fritt kassaflöde möjliggör utdelningar, återköp och strategiska satsningar utan att belåna balansräkningen.",
    good: "Stabilt > 10 % är attraktivt i mogna bolag.",
    caution: "Volatilt eller negativt kassaflöde kräver förklaring (t.ex. tillfälliga investeringar).",
  },
  {
    key: "REVENUE_GROWTH_YOY",
    label: "Omsättningstillväxt (YoY)",
    description: "Årlig tillväxt i omsättning indikerar efterfrågan och bolagets förmåga att vinna marknadsandelar.",
    whyItMatters: "Tillväxt är ofta en förutsättning för multipel-expansion och högre vinster.",
    good: "Över 8 % i mogna marknader, högre krav på tillväxtbolag.",
    caution: "Kombinera med marginaltrend så att tillväxten inte sker på bekostnad av lönsamhet.",
  },
  {
    key: "EPS_GROWTH_YOY",
    label: "Vinst per aktie (YoY)",
    description: "Tillväxt i vinst per aktie visar hur resultatet utvecklas justerat för antal aktier.",
    whyItMatters: "EPS driver direkt värdering och utdelningspotential.",
    good: "Tvåsiffrig EPS-tillväxt över flera år är starkt.",
    caution: "Engångsvinster eller återköp kan ge skenbar EPS-tillväxt – granska kvaliteten.",
  },
  {
    key: "GROSS_MARGIN",
    label: "Bruttomarginal",
    description: "Visar hur mycket av intäkterna som återstår efter direkt kostnad för sålda varor/tjänster.",
    whyItMatters: "Hög och stabil bruttomarginal tyder på prissättningskraft eller skalfördelar.",
    good: "Över 40 % inom mjukvara/varumärken, över 25 % i industri anses bra.",
    caution: "Snabb marginalkompression kräver förklaring (prispress, mixeffekter).",
  },
  {
    key: "OPERATING_MARGIN",
    label: "Rörelsemarginal",
    description: "Andel av omsättningen som finns kvar efter rörelsekostnader – indikator på kostnadskontroll.",
    whyItMatters: "Mäter den löpande lönsamheten innan finansiering och skatt.",
    good: "Över 15 % är starkt för mogna bolag.",
    caution: "Jämför mot branschsiffror – kapitalintensiva sektorer har ofta lägre marginaler.",
  },
  {
    key: "NET_MARGIN",
    label: "Nettomarginal",
    description: "Nettovinst i relation till omsättningen efter skatt och finansnetto.",
    whyItMatters: "Visar vad som i slutänden tillfaller aktieägarna.",
    good: "Över 10 % är bra, men varierar starkt mellan sektorer.",
    caution: "Titta även på kassaflödet för att säkerställa kvaliteten i vinsten.",
  },
  {
    key: "NET_DEBT_TO_EBITDA",
    label: "Nettoskuld/EBITDA",
    description: "Hur många år det tar att amortera nettoskulden med nuvarande EBITDA.",
    whyItMatters: "Hög skuldsättning ökar risken vid sämre tider eller stigande räntor.",
    good: "< 2,0x anses tryggt; över 3x kräver stabila kassaflöden.",
    caution: "Jämför mot bransch – kapitaltunga bolag tolererar högre nivåer.",
  },
  {
    key: "DEBT_TO_EQUITY",
    label: "Skuldsättningsgrad",
    description: "Förhållandet mellan totala skulder och eget kapital.",
    whyItMatters: "Visar balansräkningens hävstång och finansiell flexibilitet.",
    good: "< 1,0 i de flesta branscher, bank/finans är undantag.",
    caution: "Snabb ökning kan signalera aggressiva investeringar eller pressade kassaflöden.",
  },
  {
    key: "CURRENT_RATIO",
    label: "Current ratio",
    description: "Kortfristiga tillgångar dividerat med kortfristiga skulder – mått på likvid buffert.",
    whyItMatters: "Ger signal om bolaget kan möta sina korta förpliktelser utan extern finansiering.",
    good: "1,5–2,5 är normalt; lägre kräver klar bild av kassaflöde.",
    caution: "För höga nivåer kan tyda på dålig kapitalallokering (onödigt lager/kassa).",
  },
  {
    key: "FREE_CASH_FLOW_YIELD",
    label: "Fritt kassaflöde-yield",
    description: "Fritt kassaflöde i relation till börsvärde.",
    whyItMatters: "Hjälper till att bedöma hur attraktivt bolaget är ur kassaflödesperspektiv.",
    good: "> 5 % är attraktivt för bolag med stabil tillväxt.",
    caution: "Negativ yield kan accepteras i unga bolag men måste följas upp.",
  },
];

export const normalizeMetricKey = (source: string): string => source.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();

export const METRIC_FACT_MAP: Record<string, MetricLibraryItem> = FUNDAMENTAL_METRIC_LIBRARY.reduce<Record<string, MetricLibraryItem>>(
  (acc, item) => {
    acc[normalizeMetricKey(item.key)] = item;
    return acc;
  },
  {},
);
