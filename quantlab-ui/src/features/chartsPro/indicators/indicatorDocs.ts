/**
 * Indicator Documentation
 * 
 * TradingView-style documentation for each indicator.
 * Used in the info panel (? icon in indicator modal).
 */
import type { IndicatorDocs } from "./indicatorManifest";

// ============================================================================
// Moving Averages
// ============================================================================

export const SMA_DOCS: IndicatorDocs = {
  definition: "The Simple Moving Average (SMA) is the unweighted mean of the previous N data points. It smooths price data by creating a constantly updated average price.",
  explanation: "SMA gives equal weight to all prices in the period. When price is above the SMA, it suggests bullish momentum; below suggests bearish. Crossovers between fast and slow SMAs can signal trend changes.",
  calculations: "SMA = (Sum of closing prices over N periods) / N",
  takeaways: [
    "Lagging indicator - reacts after price has moved",
    "Longer periods = smoother but slower to react",
    "Best for identifying overall trend direction",
  ],
  whatToLookFor: [
    "Price crossing above/below the SMA",
    "SMA slope direction (up = bullish, down = bearish)",
    "Multiple SMA crossovers (golden cross / death cross)",
  ],
  limitations: [
    "Lags significantly during rapid price movements",
    "Equal weighting may not reflect recent price action",
    "Can generate false signals in choppy markets",
  ],
  goesGoodWith: ["ema", "rsi", "bb", "macd"],
  summary: "A foundational indicator for trend identification. Use longer periods for trend direction and shorter periods for entry/exit signals.",
  commonSettings: "Common periods: 20 (short-term), 50 (medium-term), 200 (long-term)",
  bestConditions: "Trending markets with clear directional movement",
};

export const EMA_DOCS: IndicatorDocs = {
  definition: "The Exponential Moving Average (EMA) is a type of moving average that gives more weight to recent prices, making it more responsive to new information.",
  explanation: "EMA reacts faster to price changes than SMA due to its exponential weighting. Popular for short-term trading and as a component in other indicators like MACD.",
  calculations: "EMA = (Current Price × k) + (Previous EMA × (1 - k)), where k = 2 / (N + 1)",
  takeaways: [
    "More responsive to recent price changes than SMA",
    "Reduces lag while still smoothing price data",
    "Widely used in MACD calculation (12, 26 EMAs)",
  ],
  whatToLookFor: [
    "Price crossing EMA for entry/exit signals",
    "EMA crossovers (9/21 EMA is popular)",
    "EMA as dynamic support/resistance",
  ],
  limitations: [
    "More susceptible to false signals than SMA",
    "Can be choppy in sideways markets",
    "Still a lagging indicator despite reduced lag",
  ],
  goesGoodWith: ["sma", "macd", "rsi", "atr"],
  summary: "The go-to moving average for traders who want faster signals. Essential for momentum-based strategies.",
  commonSettings: "Common periods: 9, 12, 21, 26, 50",
  bestConditions: "Trending markets with moderate volatility",
};

export const SMMA_DOCS: IndicatorDocs = {
  definition: "The Smoothed Moving Average (SMMA) applies equal weighting but is more smooth than SMA. Also known as Running Moving Average or Modified Moving Average.",
  explanation: "SMMA is similar to EMA but uses a different smoothing factor. It gives a smoother curve than both SMA and EMA, useful for longer-term trend analysis.",
  calculations: "First SMMA = SMA(N). After: SMMA = (Previous SMMA × (N-1) + Current Price) / N",
  takeaways: [
    "Smoothest of the basic moving averages",
    "Excellent for long-term trend identification",
    "Less reactive to short-term price spikes",
  ],
  whatToLookFor: [
    "Overall trend direction",
    "Major support/resistance levels",
    "Long-term trend changes",
  ],
  limitations: [
    "Too slow for short-term trading signals",
    "Significant lag in fast-moving markets",
  ],
  goesGoodWith: ["ema", "rsi", "adx"],
  summary: "Best for identifying major trends and filtering out noise. Not suitable for timing entries.",
  commonSettings: "Common periods: 14, 25, 50",
  bestConditions: "Long-term trend following strategies",
};

export const WMA_DOCS: IndicatorDocs = {
  definition: "The Weighted Moving Average (WMA) assigns linearly increasing weights to more recent data points, making it more responsive than SMA.",
  explanation: "WMA multiplies each price by a position weight (most recent = highest weight). Falls between SMA and EMA in terms of responsiveness.",
  calculations: "WMA = (P1×n + P2×(n-1) + ... + Pn×1) / (n×(n+1)/2)",
  takeaways: [
    "More responsive than SMA, less than EMA",
    "Linear weighting is intuitive",
    "Good balance between smoothness and responsiveness",
  ],
  whatToLookFor: [
    "Similar signals to EMA but slightly different timing",
    "Crossovers with other moving averages",
  ],
  limitations: [
    "Less commonly used than SMA/EMA",
    "Computationally more intensive than SMA",
  ],
  goesGoodWith: ["sma", "ema", "rsi"],
  summary: "A middle-ground option between SMA and EMA. Good for traders who find EMA too reactive.",
  commonSettings: "Similar to EMA: 9, 14, 21, 50",
  bestConditions: "Any trending market",
};

export const DEMA_DOCS: IndicatorDocs = {
  definition: "The Double Exponential Moving Average (DEMA) attempts to remove lag by applying EMA calculations twice.",
  explanation: "DEMA = 2×EMA - EMA(EMA). This formula reduces lag significantly while maintaining smoothness. Responds faster to price changes than standard EMA.",
  calculations: "DEMA = 2 × EMA(N) - EMA(EMA(N))",
  takeaways: [
    "Significantly reduces lag compared to EMA",
    "Good for faster trend identification",
    "Can be used as a signal line",
  ],
  whatToLookFor: [
    "Earlier crossover signals than EMA",
    "Faster reaction to trend reversals",
  ],
  limitations: [
    "More prone to whipsaws in choppy markets",
    "Can be too fast for some strategies",
  ],
  goesGoodWith: ["tema", "macd", "adx"],
  summary: "For traders who want reduced lag. Best used with confirmation from other indicators.",
  commonSettings: "Common periods: 8, 13, 21",
  bestConditions: "Clear trending markets with moderate noise",
};

export const TEMA_DOCS: IndicatorDocs = {
  definition: "The Triple Exponential Moving Average (TEMA) applies EMA three times to further reduce lag while maintaining a smooth curve.",
  explanation: "TEMA = 3×EMA - 3×EMA(EMA) + EMA(EMA(EMA)). Provides the fastest response among common moving averages while minimizing lag.",
  calculations: "TEMA = 3×EMA₁ - 3×EMA₂ + EMA₃ (where EMA₂ = EMA of EMA₁, EMA₃ = EMA of EMA₂)",
  takeaways: [
    "Minimal lag among moving averages",
    "Very responsive to price changes",
    "Best for short-term trading",
  ],
  whatToLookFor: [
    "Quick reversal signals",
    "Short-term trend direction",
  ],
  limitations: [
    "Very sensitive - many false signals possible",
    "Requires confirmation from other indicators",
  ],
  goesGoodWith: ["dema", "rsi", "stoch"],
  summary: "The speed demon of moving averages. Use with strict risk management and additional filters.",
  commonSettings: "Common periods: 8, 13, 21",
  bestConditions: "Active trading in volatile markets",
};

export const HMA_DOCS: IndicatorDocs = {
  definition: "The Hull Moving Average (HMA) uses weighted moving averages and square root of period to reduce lag while improving smoothness.",
  explanation: "Developed by Alan Hull, HMA aims to eliminate lag almost entirely while maintaining smoothness. Uses a unique calculation involving WMA.",
  calculations: "HMA = WMA(2×WMA(n/2) - WMA(n), sqrt(n))",
  takeaways: [
    "Virtually eliminates lag",
    "Very smooth curve despite fast response",
    "Good for identifying trend changes early",
  ],
  whatToLookFor: [
    "HMA direction changes for trend reversals",
    "Color changes (when plotted with directional coloring)",
  ],
  limitations: [
    "Can overshoot during rapid moves",
    "Less traditional, may not align with other traders",
  ],
  goesGoodWith: ["rsi", "adx", "atr"],
  summary: "Modern moving average that balances speed and smoothness. Excellent for trend-following systems.",
  commonSettings: "Common periods: 9, 16, 25",
  bestConditions: "Any trending market where quick signals are needed",
};

export const KAMA_DOCS: IndicatorDocs = {
  definition: "Kaufman's Adaptive Moving Average (KAMA) adjusts its smoothing based on market volatility and direction.",
  explanation: "KAMA speeds up in trending markets and slows down in choppy markets. Uses an Efficiency Ratio to measure market noise.",
  calculations: "ER = Direction / Volatility. SC = [ER × (fast - slow) + slow]². KAMA = Prior KAMA + SC × (Price - Prior KAMA)",
  takeaways: [
    "Adapts to market conditions automatically",
    "Reduces whipsaws in sideways markets",
    "Responsive during trends",
  ],
  whatToLookFor: [
    "KAMA flattening indicates ranging market",
    "KAMA moving = trending market",
    "Price crossing KAMA",
  ],
  limitations: [
    "More complex to understand and tune",
    "Multiple parameters to optimize",
  ],
  goesGoodWith: ["atr", "adx", "bb"],
  summary: "Intelligent MA that knows when to be fast and when to be slow. Great for all-around use.",
  commonSettings: "Period: 10, Fast: 2, Slow: 30",
  bestConditions: "All market conditions - adapts automatically",
};

export const VWMA_DOCS: IndicatorDocs = {
  definition: "The Volume Weighted Moving Average (VWMA) weights prices by their associated volume, giving more significance to high-volume price moves.",
  explanation: "VWMA differs from SMA by incorporating volume. High volume bars have more impact on the average, making it reflect institutional activity better.",
  calculations: "VWMA = Sum(Price × Volume) / Sum(Volume) over N periods",
  takeaways: [
    "Incorporates volume into trend analysis",
    "Better reflects significant price moves",
    "Can confirm or diverge from SMA",
  ],
  whatToLookFor: [
    "VWMA vs SMA divergence (volume confirming/rejecting moves)",
    "VWMA as dynamic support/resistance",
  ],
  limitations: [
    "Requires volume data (not available for all instruments)",
    "Can be distorted by volume spikes",
  ],
  goesGoodWith: ["obv", "vwap", "sma"],
  summary: "The volume-aware moving average. Essential for traders who believe volume validates price moves.",
  commonSettings: "Common periods: 20, 50",
  bestConditions: "Markets with reliable volume data",
};

export const MCGINLEY_DOCS: IndicatorDocs = {
  definition: "The McGinley Dynamic is an indicator that aims to solve the lag problem while avoiding whipsaws.",
  explanation: "Developed by John McGinley, it automatically adjusts its speed based on price changes. Appears like a moving average but is technically a smoothing mechanism.",
  calculations: "MD = MD₋₁ + (Price - MD₋₁) / (N × (Price/MD₋₁)⁴)",
  takeaways: [
    "Self-adjusting smoothing",
    "Hugs price better in fast moves",
    "Avoids whipsaws in slow moves",
  ],
  whatToLookFor: [
    "Price relationship to McGinley Dynamic",
    "Slope direction for trend",
  ],
  limitations: [
    "Less known, fewer traders use it",
    "Complex formula may behave unexpectedly",
  ],
  goesGoodWith: ["rsi", "macd", "adx"],
  summary: "A smart, adaptive smoothing line. Good alternative to traditional moving averages.",
  commonSettings: "Period: 14",
  bestConditions: "Any market - adapts to conditions",
};

export const ALMA_DOCS: IndicatorDocs = {
  definition: "The Arnaud Legoux Moving Average (ALMA) is a Gaussian-weighted moving average with adjustable offset and sigma parameters for reduced lag and smooth output.",
  explanation: "ALMA uses a Gaussian distribution to weight prices, with the offset parameter shifting the weighting toward more recent bars. Higher offset values (closer to 1) make it more responsive; lower values make it smoother. Sigma controls the shape of the Gaussian curve.",
  calculations: "m = floor(offset × (n-1)), s = n/sigma. Weight w(j) = exp(-((j-m)²)/(2×s²)). ALMA = Σ(w × price) / Σ(w)",
  takeaways: [
    "Reduced lag compared to SMA while maintaining smoothness",
    "Tunable responsiveness via offset parameter",
    "Gaussian weighting provides smooth, natural-looking curves",
    "Great as a trend filter or signal line",
  ],
  whatToLookFor: [
    "ALMA slope changes for early trend reversal signals",
    "Price crossing above/below ALMA",
    "ALMA crossovers with EMA or SMA for confirmation",
    "ALMA as dynamic support/resistance in trends",
  ],
  limitations: [
    "Can produce whipsaws in ranging/choppy markets",
    "Parameter sensitivity - requires tuning for different instruments",
    "Less widely known than traditional MAs",
  ],
  goesGoodWith: ["rsi", "macd", "atr", "bb", "ema"],
  summary: "A tunable moving average that blends smoothness and responsiveness. Excellent as a trend filter or for traders who want more control over MA behavior.",
  commonSettings: "Window: 9, Offset: 0.85, Sigma: 6 (TradingView defaults)",
  bestConditions: "Trending markets with moderate volatility",
};

export const LSMA_DOCS: IndicatorDocs = {
  definition: "The Least Squares Moving Average (LSMA), also known as Linear Regression Line or End Point Moving Average, fits a linear regression line over N bars and plots the predicted value at the last bar.",
  explanation: "LSMA uses statistical regression to find the best-fit line through price data. The result is smoother than SMA and often tracks price more closely. The slope of the regression provides valuable trend strength information.",
  calculations: "For x = 0, 1, ..., n-1: slope = (n×Σxy - Σx×Σy) / (n×Σx² - (Σx)²), intercept = (Σy - slope×Σx) / n. LSMA = intercept + slope×(n-1)",
  takeaways: [
    "Regression-based trend line with less lag than SMA",
    "Slope indicates trend direction and strength",
    "Often hugs price more closely than traditional MAs",
    "Good for identifying trend direction cleanly",
  ],
  whatToLookFor: [
    "LSMA slope changes (flattening or reversing)",
    "Price crossing above/below LSMA",
    "LSMA crossovers with EMA or SMA",
    "Divergence between LSMA slope and price momentum",
  ],
  limitations: [
    "Can overshoot during rapid price moves",
    "Noisy in volatile or ranging markets",
    "Regression assumes linear relationship which may not hold",
  ],
  goesGoodWith: ["rsi", "macd", "atr", "bb", "ema"],
  summary: "A regression-based MA that reads trend direction cleanly. Best used with momentum or volatility indicators for confirmation.",
  commonSettings: "Length: 25 (default), also 14, 50 for different timeframes",
  bestConditions: "Trending markets with clear directional movement",
};

export const MARIBBON_DOCS: IndicatorDocs = {
  definition: "The Moving Average Ribbon displays 8 moving averages with sequential periods (default: 20, 25, 30, 35, 40, 45, 50, 55) creating a 'ribbon' effect that visualizes trend strength and direction.",
  explanation: "When MAs are stacked in order (shortest on top in uptrend, bottom in downtrend), the trend is strong. When MAs are interweaving or crossing, the trend is weakening or reversing. The width of the ribbon indicates momentum strength.",
  calculations: `Each MA is calculated using the selected method (EMA or SMA):
  
MA1 = MA(Close, BasePeriod + 0 × Step)
MA2 = MA(Close, BasePeriod + 1 × Step)
...
MA8 = MA(Close, BasePeriod + 7 × Step)

Default: EMA with periods 20, 25, 30, 35, 40, 45, 50, 55`,
  takeaways: [
    "Parallel ordered MAs = strong trend (follow the trend)",
    "Wide ribbon = strong momentum, tight ribbon = consolidation",
    "Crossing/tangled MAs = trend weakness or reversal",
    "Color gradient makes it easy to identify short vs long-term MAs",
  ],
  whatToLookFor: [
    "Ribbon expansion: trend gaining strength",
    "Ribbon compression: trend losing steam, possible reversal",
    "MAs crossing each other: potential trend change",
    "Price above all MAs: strong uptrend; below all: strong downtrend",
  ],
  limitations: [
    "Lagging indicator - confirms rather than predicts",
    "Many lines can clutter the chart",
    "Less useful in choppy/ranging markets",
    "May give late signals in fast-moving markets",
  ],
  goesGoodWith: ["rsi", "macd", "atr", "adx", "volume"],
  summary: "A visual trend strength tool that shows 8 MAs as a ribbon. Ordered ribbon = strong trend, tangled ribbon = weak/changing trend. Great for trend following strategies.",
  commonSettings: "MA Type: EMA, Base Period: 20, Step: 5 (periods 20-55)",
  bestConditions: "Trending markets; useful for identifying trend direction and strength",
};

export const MARIBBON4_DOCS: IndicatorDocs = {
  definition: "MA Ribbon (4) displays 4 moving averages with fully customizable periods per line (default: 20, 50, 100, 200). This TV-style variant gives exact control over each MA period.",
  explanation: "Unlike the 8-line ribbon that uses base+step periods, this 4-line variant lets you specify exact periods for each MA. Classic multi-MA setups like 20/50/100/200 EMA are easily configured. Trend strength is shown by MA alignment and spread.",
  calculations: `Each MA is calculated using the selected method (EMA or SMA):
  
MA1 = MA(Close, Length1)  // e.g., 20
MA2 = MA(Close, Length2)  // e.g., 50
MA3 = MA(Close, Length3)  // e.g., 100
MA4 = MA(Close, Length4)  // e.g., 200

Default: EMA with periods 20, 50, 100, 200`,
  takeaways: [
    "Exact period control per line - match any TV setup",
    "Classic 20/50/100/200 setup for multi-timeframe trend analysis",
    "Price above all 4 MAs = strong bullish bias",
    "MAs in order (20 > 50 > 100 > 200) = confirmed uptrend",
  ],
  whatToLookFor: [
    "Golden Cross: shorter MA crosses above longer MA",
    "Death Cross: shorter MA crosses below longer MA",
    "Price bouncing off key MAs (support/resistance)",
    "MA spread widening (trend strengthening) or narrowing (consolidation)",
  ],
  limitations: [
    "Lagging indicator - confirms rather than predicts",
    "Fewer lines = less ribbon effect but cleaner chart",
    "May miss intermediate trend changes",
    "Key levels (50/100/200) become crowded support/resistance",
  ],
  goesGoodWith: ["rsi", "macd", "atr", "volume", "bb"],
  summary: "A 4-MA ribbon with per-line period control. Perfect for classic setups like 20/50/100/200 EMA. Cleaner than 8-line ribbon while maintaining key trend levels.",
  commonSettings: "MA Type: EMA, Lengths: 20, 50, 100, 200 (TradingView defaults)",
  bestConditions: "Trending markets; multi-timeframe analysis; swing trading",
};

export const PSAR_DOCS: IndicatorDocs = {
  definition: "The Parabolic SAR (Stop and Reverse) is a trend-following indicator developed by J. Welles Wilder Jr. that provides potential entry and exit points by tracking price with an accelerating curve.",
  explanation: "PSAR plots dots above or below price based on trend direction. Dots below price indicate an uptrend (bullish); dots above indicate a downtrend (bearish). When price crosses the SAR, the indicator reverses (stops and reverses).",
  calculations: `SAR(n) = SAR(n-1) + AF × (EP - SAR(n-1))
  
Where:
AF = Acceleration Factor (starts at 'Start', increases by 'Increment' on new extreme, capped at 'Maximum')
EP = Extreme Point (highest high in uptrend, lowest low in downtrend)

On reversal: SAR resets to EP, AF resets to Start.`,
  takeaways: [
    "Provides clear visual trend direction",
    "Built-in trailing stop logic",
    "Best in trending markets with strong momentum",
    "Dot flip = potential trend change signal",
  ],
  whatToLookFor: [
    "SAR dots flipping from below to above price (bearish signal)",
    "SAR dots flipping from above to below price (bullish signal)",
    "Dots tightening toward price (acceleration)",
    "Use as trailing stop-loss placement",
  ],
  limitations: [
    "Generates many false signals in ranging/choppy markets",
    "Not ideal for sideways price action",
    "Continuous system - always in market (no neutral state)",
    "Default parameters may not suit all instruments",
  ],
  goesGoodWith: ["adx", "macd", "rsi", "atr", "ema"],
  summary: "A classic trend-following indicator ideal for trailing stops. Works best when combined with a trend filter (like ADX) to avoid whipsaws in range-bound markets.",
  commonSettings: "Start: 0.02, Increment: 0.02, Maximum: 0.2 (Wilder's original)",
  bestConditions: "Strong trending markets; avoid during consolidation",
};

export const SUPERTREND_DOCS: IndicatorDocs = {
  definition: "Supertrend is a trend-following indicator that uses Average True Range (ATR) to create dynamic support and resistance bands, showing clear buy/sell signals based on price crossing these bands.",
  explanation: "Supertrend plots as a single line that switches between acting as support (below price, green) and resistance (above price, red). When price closes above the upper band, it signals an uptrend; when price closes below the lower band, it signals a downtrend.",
  calculations: `Upper Band = HL/2 + (Factor × ATR)
Lower Band = HL/2 - (Factor × ATR)

Final bands persist (don't jump) unless broken:
- Upper band can only move down (tighten) unless price breaks above
- Lower band can only move up (tighten) unless price breaks below

Supertrend = Lower Band (uptrend) or Upper Band (downtrend)`,
  takeaways: [
    "Clear visual trend direction (green = bullish, red = bearish)",
    "Acts as dynamic trailing stop-loss",
    "Factor controls sensitivity (higher = fewer signals, smoother)",
    "ATR length affects responsiveness to volatility",
  ],
  whatToLookFor: [
    "Color change from red to green (buy signal)",
    "Color change from green to red (sell signal)",
    "Price bouncing off Supertrend as support/resistance",
    "Supertrend slope steepening (accelerating trend)",
  ],
  limitations: [
    "Lags in fast-moving markets due to ATR smoothing",
    "Whipsaws in ranging/choppy markets",
    "No neutral state - always indicates bullish or bearish",
    "May give late signals at trend reversals",
  ],
  goesGoodWith: ["rsi", "macd", "adx", "ema", "psar"],
  summary: "A popular trend indicator combining ATR-based volatility bands with trend persistence. Excellent for swing trading and position management in trending markets.",
  commonSettings: "ATR Length: 10, Factor: 3.0 (TradingView defaults). Lower factor = more signals, higher = smoother.",
  bestConditions: "Trending markets with sustained directional moves; pair with ADX to filter range-bound periods",
};

export const ICHIMOKU_DOCS: IndicatorDocs = {
  definition: "Ichimoku Kinko Hyo ('one glance equilibrium chart') is a comprehensive Japanese indicator showing trend, momentum, support/resistance, and future price action through five lines and the cloud (Kumo).",
  explanation: `The indicator consists of five lines:
• Tenkan-sen (Conversion): Fast line showing short-term momentum
• Kijun-sen (Base): Slower line acting as support/resistance
• Senkou Span A: Leading span (Tenkan+Kijun)/2 projected forward
• Senkou Span B: Leading span of longer period projected forward
• Chikou Span: Today's close projected backward for momentum confirmation

The Cloud (Kumo) between Senkou A & B shows future support/resistance zones. Green cloud (A>B) = bullish; Red cloud (A<B) = bearish.`,
  calculations: `Tenkan-sen = (9-period high + 9-period low) / 2
Kijun-sen = (26-period high + 26-period low) / 2
Senkou Span A = (Tenkan + Kijun) / 2, shifted forward 26 bars
Senkou Span B = (52-period high + low) / 2, shifted forward 26 bars
Chikou Span = Close, shifted backward 26 bars`,
  takeaways: [
    "Complete trading system in one indicator",
    "Cloud shows future support/resistance zones",
    "Tenkan/Kijun crosses for timing entries",
    "Chikou confirms trend by comparing to historical price",
    "Cloud color indicates trend direction at a glance",
  ],
  whatToLookFor: [
    "Price above cloud = bullish, below = bearish",
    "Tenkan crossing above Kijun = bullish signal",
    "Chikou above price (26 bars back) = momentum confirmation",
    "Cloud thickness = support/resistance strength",
    "Price entering cloud = consolidation/reversal potential",
    "All five lines aligned = strong trend confirmation",
  ],
  limitations: [
    "Complex visual - can be overwhelming initially",
    "Lagging indicator due to averaging",
    "Parameters optimized for Japanese markets (6-day week)",
    "Cloud projection can be misleading in choppy markets",
    "Requires time to learn all signal combinations",
  ],
  goesGoodWith: ["rsi", "macd", "adx", "vwap"],
  summary: "A complete trend-following system developed in Japan. The cloud (Kumo) is the signature feature, providing at-a-glance trend direction and future support/resistance. Best used for swing trading and position management.",
  commonSettings: "Tenkan: 9, Kijun: 26, Senkou B: 52, Displacement: 26 (TradingView defaults). These are traditional settings based on Japanese trading week.",
  bestConditions: "Trending markets on daily or longer timeframes. Most effective when cloud is well-formed and price is clearly above or below.",
};

// ============================================================================
// Momentum
// ============================================================================

export const RSI_DOCS: IndicatorDocs = {
  definition: "The Relative Strength Index (RSI) measures the speed and magnitude of price changes to identify overbought or oversold conditions.",
  explanation: "RSI oscillates between 0 and 100. Values above 70 suggest overbought (potential sell), below 30 suggest oversold (potential buy). Divergences from price can signal reversals.",
  calculations: "RSI = 100 - (100 / (1 + RS)), where RS = Average Gain / Average Loss over N periods",
  takeaways: [
    "Bounded oscillator (0-100) - easy to interpret",
    "Classic overbought (>70) / oversold (<30) levels",
    "Divergences are powerful reversal signals",
  ],
  whatToLookFor: [
    "Overbought/oversold readings",
    "RSI divergence from price",
    "RSI trend line breaks",
    "Failure swings (RSI breaks own support/resistance)",
  ],
  limitations: [
    "Can stay overbought/oversold in strong trends",
    "False signals in trending markets",
    "Requires confirmation for best results",
  ],
  goesGoodWith: ["macd", "bb", "sma", "stoch"],
  summary: "The most popular momentum oscillator. Essential for any trader's toolkit.",
  commonSettings: "Period: 14 (standard), 9 (short-term), 25 (long-term)",
  bestConditions: "Range-bound markets or for divergence analysis in trends",
};

export const MACD_DOCS: IndicatorDocs = {
  definition: "Moving Average Convergence Divergence (MACD) shows the relationship between two EMAs and includes a signal line for timing.",
  explanation: "MACD consists of: MACD Line (12 EMA - 26 EMA), Signal Line (9 EMA of MACD), and Histogram (MACD - Signal). Crossovers and divergences signal trades.",
  calculations: "MACD Line = EMA(12) - EMA(26). Signal Line = EMA(9) of MACD. Histogram = MACD - Signal",
  takeaways: [
    "Combines trend and momentum analysis",
    "Signal line crossovers for entries/exits",
    "Histogram shows momentum strength",
  ],
  whatToLookFor: [
    "MACD crossing above/below signal line",
    "MACD crossing zero line",
    "Histogram growing/shrinking",
    "Divergences between MACD and price",
  ],
  limitations: [
    "Lagging indicator - late signals in fast markets",
    "Can produce false signals in choppy markets",
    "Standard settings may not suit all timeframes",
  ],
  goesGoodWith: ["rsi", "bb", "adx", "ema"],
  summary: "The workhorse of technical analysis. Great for trend-following and momentum trading.",
  commonSettings: "Fast: 12, Slow: 26, Signal: 9 (standard)",
  bestConditions: "Trending markets with clear momentum",
};

export const STOCH_DOCS: IndicatorDocs = {
  definition: "The Stochastic Oscillator compares a closing price to its price range over a given time period.",
  explanation: "Shows where price closed relative to high-low range. %K is the main line, %D is the smoothed signal. Values above 80 = overbought, below 20 = oversold.",
  calculations: "%K = 100 × (Close - Lowest Low) / (Highest High - Lowest Low). %D = SMA(%K, 3)",
  takeaways: [
    "Works best in ranging markets",
    "%K/%D crossovers for signals",
    "Faster than RSI in detecting turns",
  ],
  whatToLookFor: [
    "%K crossing %D",
    "Overbought (>80) / Oversold (<20) levels",
    "Divergences from price",
    "Bull/bear setups",
  ],
  limitations: [
    "Noisy in strong trends",
    "Many false signals in trending markets",
    "Requires practice to interpret correctly",
  ],
  goesGoodWith: ["rsi", "macd", "bb"],
  summary: "Fast-reacting momentum oscillator. Excellent for range trading and quick trades.",
  commonSettings: "K Period: 14, D Period: 3, Smoothing: 3",
  bestConditions: "Range-bound, sideways markets",
};

export const STOCHRSI_DOCS: IndicatorDocs = {
  definition: "Stochastic RSI applies the Stochastic formula to RSI values instead of price, creating a more sensitive oscillator.",
  explanation: "StochRSI = (RSI - Lowest RSI) / (Highest RSI - Lowest RSI). Oscillates between 0 and 1 (or 0-100). Extremely sensitive to price changes.",
  calculations: "StochRSI = (Current RSI - Min RSI) / (Max RSI - Min RSI) over N periods",
  takeaways: [
    "More sensitive than RSI alone",
    "Generates more signals (good and false)",
    "Good for very short-term trading",
  ],
  whatToLookFor: [
    "Extreme readings (0.8/0.2 or 80/20)",
    "Crossovers of K and D lines",
    "Divergences",
  ],
  limitations: [
    "Very sensitive - many false signals",
    "Needs strong confirmation",
    "Can be erratic in volatile markets",
  ],
  goesGoodWith: ["ema", "atr", "bb"],
  summary: "For traders who want even faster signals than RSI. Use with caution and confirmation.",
  commonSettings: "RSI Period: 14, Stoch Period: 14, K: 3, D: 3",
  bestConditions: "Active trading in liquid markets",
};

export const CCI_DOCS: IndicatorDocs = {
  definition: "The Commodity Channel Index (CCI) measures the current price level relative to an average price level over a given period.",
  explanation: "CCI measures deviation from the mean. Readings above +100 = overbought, below -100 = oversold. Originally designed for commodities but works on any asset.",
  calculations: "CCI = (Typical Price - SMA) / (0.015 × Mean Deviation), where Typical Price = (H+L+C)/3",
  takeaways: [
    "Unbounded oscillator (can exceed ±100)",
    "Good for identifying cyclical trends",
    "Works on any tradeable instrument",
  ],
  whatToLookFor: [
    "Crosses above +100 or below -100",
    "Return to zero from extremes",
    "Divergences from price",
  ],
  limitations: [
    "Unbounded nature makes it harder to define extremes",
    "Can stay extended in strong trends",
  ],
  goesGoodWith: ["rsi", "macd", "adx"],
  summary: "Versatile oscillator for identifying overbought/oversold conditions and cycles.",
  commonSettings: "Period: 20 (standard), 14 (faster)",
  bestConditions: "Cyclical markets or for divergence trading",
};

export const ROC_DOCS: IndicatorDocs = {
  definition: "Rate of Change (ROC) measures the percentage change in price over a specified number of periods.",
  explanation: "Simple momentum indicator showing how much price has changed. Positive ROC = price increase, negative = decrease. Zero line is key reference.",
  calculations: "ROC = ((Current Price - Price N periods ago) / Price N periods ago) × 100",
  takeaways: [
    "Simple, intuitive interpretation",
    "Zero line crossings signal trend changes",
    "Extreme readings can signal reversals",
  ],
  whatToLookFor: [
    "Zero line crossings",
    "Extreme positive/negative readings",
    "Divergences from price",
  ],
  limitations: [
    "No defined overbought/oversold levels",
    "Can be erratic with high period settings",
  ],
  goesGoodWith: ["sma", "rsi", "macd"],
  summary: "Pure momentum measurement. Simple but effective for trend confirmation.",
  commonSettings: "Period: 9 (short-term), 14 (standard), 25 (long-term)",
  bestConditions: "Trending markets for confirmation",
};

export const MOM_DOCS: IndicatorDocs = {
  definition: "Momentum measures the rate of rise or fall in prices, showing the speed of price movement.",
  explanation: "Unlike ROC which is a percentage, Momentum shows absolute point difference. Positive = rising prices, negative = falling.",
  calculations: "Momentum = Current Price - Price N periods ago",
  takeaways: [
    "Raw speed of price movement",
    "Zero line is key reference point",
    "Leading indicator - can signal before price turns",
  ],
  whatToLookFor: [
    "Zero line crossings",
    "Momentum peaks/troughs before price",
    "Divergences",
  ],
  limitations: [
    "Scale depends on price level of instrument",
    "Hard to compare across different assets",
  ],
  goesGoodWith: ["roc", "rsi", "macd"],
  summary: "Basic momentum indicator. Good for comparing momentum across timeframes of same asset.",
  commonSettings: "Period: 10, 14, 20",
  bestConditions: "Any market for momentum analysis",
};

export const WILLR_DOCS: IndicatorDocs = {
  definition: "Williams %R is a momentum indicator showing the level of the close relative to the highest high over a lookback period.",
  explanation: "Oscillates between 0 and -100. Values between 0 and -20 = overbought, -80 to -100 = oversold. Inverted scale compared to Stochastic.",
  calculations: "%R = (Highest High - Close) / (Highest High - Lowest Low) × -100",
  takeaways: [
    "Fast momentum oscillator",
    "Inverted scale (0 = overbought, -100 = oversold)",
    "Good for short-term trading",
  ],
  whatToLookFor: [
    "Overbought (> -20) / Oversold (< -80)",
    "Divergences from price",
    "Failure swings",
  ],
  limitations: [
    "Very sensitive, many false signals",
    "Inverted scale can be confusing",
  ],
  goesGoodWith: ["stoch", "rsi", "ema"],
  summary: "Fast, sensitive oscillator similar to Stochastic but inverted. Good for active traders.",
  commonSettings: "Period: 14 (standard)",
  bestConditions: "Range-bound markets, short-term trading",
};

// ============================================================================
// Volatility
// ============================================================================

export const BB_DOCS: IndicatorDocs = {
  definition: "Bollinger Bands® consist of a middle band (SMA) with upper and lower bands at standard deviations away, showing volatility and relative price levels.",
  explanation: "Bands expand during high volatility and contract during low volatility. Price touching bands doesn't necessarily mean reversal - it shows relative high/low.",
  calculations: "Middle Band = SMA(20). Upper Band = SMA + (2 × StdDev). Lower Band = SMA - (2 × StdDev)",
  takeaways: [
    "Volatility indicator (band width)",
    "Price relative to recent range",
    "Mean reversion tool",
  ],
  whatToLookFor: [
    "Band squeeze (low volatility → potential breakout)",
    "Price walking the band (strong trend)",
    "Double bottom at lower band",
    "W-patterns and M-patterns",
  ],
  limitations: [
    "Not a standalone entry signal",
    "Price can stay at bands in trends",
    "Standard settings may not suit all instruments",
  ],
  goesGoodWith: ["rsi", "macd", "keltner"],
  summary: "Essential volatility indicator. Shows when price is relatively high or low and when volatility is expanding/contracting.",
  commonSettings: "Period: 20, StdDev: 2 (standard)",
  bestConditions: "All markets - particularly useful for volatility analysis",
};

export const ATR_DOCS: IndicatorDocs = {
  definition: "Average True Range (ATR) measures market volatility by decomposing the entire range of an asset price for a period.",
  explanation: "ATR doesn't indicate direction, only volatility. Higher ATR = higher volatility. Used for position sizing, stop-loss placement, and volatility filtering.",
  calculations: "True Range = max(High-Low, |High-PrevClose|, |Low-PrevClose|). ATR = Average of TR over N periods",
  takeaways: [
    "Pure volatility measurement",
    "Essential for risk management",
    "Used to set stop-losses (e.g., 2×ATR)",
  ],
  whatToLookFor: [
    "ATR expansion = increased volatility",
    "ATR contraction = potential breakout coming",
    "Use for position sizing and stops",
  ],
  limitations: [
    "No directional information",
    "Absolute value depends on price level",
  ],
  goesGoodWith: ["adx", "bb", "keltner"],
  summary: "The go-to volatility indicator. Essential for stop-loss placement and position sizing.",
  commonSettings: "Period: 14 (standard)",
  bestConditions: "All markets - essential for risk management",
};

// ============================================================================
// Trend
// ============================================================================

export const ADX_DOCS: IndicatorDocs = {
  definition: "The Average Directional Index (ADX) measures trend strength without indicating trend direction. Comes with +DI and -DI for direction.",
  explanation: "ADX above 25 = strong trend (40+ = very strong). +DI above -DI = bullish trend, -DI above +DI = bearish trend. ADX itself is non-directional.",
  calculations: "+DI and -DI measure directional movement. ADX = smoothed average of |+DI - -DI| / (+DI + -DI)",
  takeaways: [
    "Measures trend strength (not direction)",
    "ADX > 25 = trending, < 20 = ranging",
    "+DI/-DI crossovers for direction",
  ],
  whatToLookFor: [
    "ADX rising above 25 = trend forming",
    "+DI/-DI crossovers for entry signals",
    "ADX declining = trend weakening",
  ],
  limitations: [
    "Lagging indicator",
    "ADX peaks can be late in trend",
    "Complex with three lines to interpret",
  ],
  goesGoodWith: ["macd", "ema", "rsi"],
  summary: "The definitive trend strength indicator. Tells you if you should use trend or range strategies.",
  commonSettings: "Period: 14 (standard)",
  bestConditions: "All markets - used to select appropriate strategy",
};

export const DMI_DOCS: IndicatorDocs = {
  definition: "The Directional Movement Index (DMI) quantifies trend direction by plotting the Average Directional Index (ADX) alongside the Positive Directional Indicator (+DI) and Negative Directional Indicator (-DI).",
  explanation: "When +DI is above -DI, prices are trending upward. When -DI is above +DI, prices are trending downward. The ADX line measures trend strength regardless of direction (values above 25 suggest a strong trend).",
  calculations: "+DM = High - prev High (if positive and greater than -DM, else 0). -DM = prev Low - Low (if positive and greater than +DM, else 0). TR = max(High-Low, |High-prevClose|, |Low-prevClose|). +DI = 100 * Wilder(+DM, n) / Wilder(TR, n). -DI = 100 * Wilder(-DM, n) / Wilder(TR, n). DX = 100 * |+DI - -DI| / (+DI + -DI). ADX = Wilder(DX, adxSmoothing)",
  takeaways: [
    "ADX > 25 indicates a strong trend",
    "+DI crossing above -DI is bullish",
    "-DI crossing above +DI is bearish",
  ],
  whatToLookFor: [
    "DI crossovers for entry signals",
    "ADX level for trend strength confirmation",
    "Rising ADX = strengthening trend",
  ],
  limitations: [
    "Lagging indicator",
    "ADX can remain high during reversals",
    "Works best in trending markets",
  ],
  goesGoodWith: ["atr", "bb", "macd"],
  summary: "DMI combines directional indicators with trend strength measurement. Use DI crossovers for direction and ADX for strength.",
  commonSettings: "ADX Smoothing: 14, DI Length: 14",
  bestConditions: "Trending markets with clear directional moves",
};

export const VORTEX_DOCS: IndicatorDocs = {
  definition: "The Vortex Indicator (VI) identifies the start of a new trend or continuation of an existing trend by comparing positive and negative trend movements.",
  explanation: "VI+ measures upward movement; VI- measures downward movement. When VI+ crosses above VI-, it signals bullish momentum. When VI- crosses above VI+, it signals bearish momentum.",
  calculations: "VM+ = |High - prevLow|. VM- = |Low - prevHigh|. TR = max(High-Low, |High-prevClose|, |Low-prevClose|). VI+ = sum(VM+, n) / sum(TR, n). VI- = sum(VM-, n) / sum(TR, n)",
  takeaways: [
    "VI+ crossing above VI- = bullish signal",
    "VI- crossing above VI+ = bearish signal",
    "Wide spread between VI+ and VI- = strong trend",
  ],
  whatToLookFor: [
    "Crossovers for trend change signals",
    "Divergence from price for reversal hints",
    "Spread width for trend strength",
  ],
  limitations: [
    "Can produce false signals in choppy markets",
    "Lagging during sharp reversals",
    "Works best with trend confirmation",
  ],
  goesGoodWith: ["adx", "dmi", "macd"],
  summary: "Vortex Indicator uses crossovers to identify trend direction. Simple but effective for trend following.",
  commonSettings: "Length: 14",
  bestConditions: "Trending markets with clear swings",
};

export const AROON_DOCS: IndicatorDocs = {
  definition: "Aroon measures how long it has been since the highest high and lowest low occurred within a given period, scaled to 0-100.",
  explanation: "Aroon Up measures recency of the period high; Aroon Down measures recency of the period low. Values near 100 indicate the extreme occurred recently, suggesting trend strength.",
  calculations: "Lookback = Length + 1 bars. barsSinceHigh = bars since highest high in lookback. barsSinceLow = bars since lowest low in lookback. Aroon Up = 100 × (Length - barsSinceHigh) / Length. Aroon Down = 100 × (Length - barsSinceLow) / Length",
  takeaways: [
    "Aroon Up > 70 and Aroon Down < 30 = strong uptrend",
    "Aroon Down > 70 and Aroon Up < 30 = strong downtrend",
    "Both around 50 = consolidation",
  ],
  whatToLookFor: [
    "Crossovers for trend changes",
    "Extreme values (>70 or <30) for trend strength",
    "Parallel movement = range-bound market",
  ],
  limitations: [
    "Sensitive to period selection",
    "May lag during sharp reversals",
    "Best used with confirmation",
  ],
  goesGoodWith: ["aroonosc", "adx", "macd"],
  summary: "Aroon identifies trend strength by measuring time since price extremes. Simple yet effective for trend timing.",
  commonSettings: "Length: 14 or 25",
  bestConditions: "Markets with clear trends or establishing new trends",
};

export const AROONOSC_DOCS: IndicatorDocs = {
  definition: "The Aroon Oscillator is the difference between Aroon Up and Aroon Down, providing a single line oscillator ranging from -100 to +100.",
  explanation: "Positive values indicate bullish trend (recent highs), negative values indicate bearish trend (recent lows). Zero line crossovers signal potential trend changes.",
  calculations: "Aroon Oscillator = Aroon Up - Aroon Down. Range: [-100, +100]",
  takeaways: [
    "Values > 0 indicate uptrend strength",
    "Values < 0 indicate downtrend strength",
    "Zero crossovers signal trend changes",
  ],
  whatToLookFor: [
    "Zero line crossovers for trend signals",
    "Extreme values (>90 or <-90) for strong trends",
    "Oscillator near zero = consolidation",
  ],
  limitations: [
    "Single line loses some nuance from Aroon pair",
    "Same lag as underlying Aroon",
    "Works best with trend confirmation",
  ],
  goesGoodWith: ["aroon", "adx", "rsi"],
  summary: "Aroon Oscillator simplifies Aroon into a single line. Positive = bullish, negative = bearish, zero crossovers = trend change.",
  commonSettings: "Length: 14 or 25, Levels: +90, 0, -90",
  bestConditions: "Trending markets with clear directional bias",
};

// ============================================================================
// Volume
// ============================================================================

export const VWAP_DOCS: IndicatorDocs = {
  definition: "Volume Weighted Average Price (VWAP) is the average price weighted by volume. It represents the true average price that volume transacted at during the period, making it the key benchmark for institutional traders.",
  explanation: "VWAP shows where institutional money is positioned. Price above VWAP indicates bullish bias - buyers in control. Price below VWAP indicates bearish bias - sellers in control. VWAP resets at each anchor period (typically daily session). Standard deviation bands show volatility around VWAP - price tends to revert to VWAP like a magnet.",
  calculations: "VWAP = Σ(Typical Price × Volume) / Σ(Volume), where Typical Price = (High + Low + Close) / 3. Standard Deviation = √(Σ(TP² × V) / Σ(V) - VWAP²). Upper Band = VWAP + StdDev × Multiplier. Lower Band = VWAP - StdDev × Multiplier.",
  takeaways: [
    "The institutional trader's benchmark - where the 'smart money' transacts",
    "Price above VWAP = bullish, below = bearish",
    "VWAP acts as dynamic intraday support/resistance",
    "Standard deviation bands show volatility extremes",
    "Price tends to revert to VWAP over time",
  ],
  whatToLookFor: [
    "Price position relative to VWAP (above/below)",
    "VWAP as intraday support and resistance",
    "Standard deviation band touches for mean reversion entries",
    "End-of-day price reversion toward VWAP",
    "Opening gaps that get 'filled' back to VWAP",
    "VWAP slope indicates intraday trend direction",
  ],
  limitations: [
    "Primarily intraday - resets each period (session/week/month)",
    "Less useful on daily+ timeframes",
    "Lag increases as day progresses (more data averaged)",
    "Not useful in pre/post market or low volume periods",
    "Single line doesn't show recent price action well",
  ],
  goesGoodWith: ["avwap", "vwma", "obv", "ema", "bb"],
  summary: "VWAP is THE institutional benchmark. It shows where the average dollar transacted. Essential for day traders, scalpers, and anyone wanting to trade with (or against) institutional flow. The standard deviation bands help identify overbought/oversold extremes.",
  commonSettings: "Anchor: Session (daily reset). Bands: 1.0, 2.0, 3.0 standard deviations. Source: HLC3 (typical price).",
  bestConditions: "Intraday trading with good volume. Most useful during regular market hours with active institutional participation.",
};

export const AVWAP_DOCS: IndicatorDocs = {
  definition: "Anchored VWAP is a Volume Weighted Average Price that starts from a user-defined anchor point and never resets. Unlike regular VWAP that resets daily, AVWAP accumulates from a specific event or date.",
  explanation: "AVWAP reveals institutional cost basis from a significant market event. Anchor from earnings, breakouts, highs, lows, or news events. Price interaction with AVWAP shows whether participants from that anchor point are profitable (and likely to defend) or underwater (and likely to sell).",
  calculations: "Same as VWAP but starting from anchor timestamp: AVWAP = Σ(TP × V) / Σ(V) from anchor point. No reset - continuous accumulation.",
  takeaways: [
    "Shows institutional cost basis from specific events",
    "No reset - accumulates from anchor indefinitely",
    "Anchor from breakouts to see if move has 'legs'",
    "Anchor from earnings for post-earnings bias",
    "Multiple AVWAPs can show key institutional levels",
  ],
  whatToLookFor: [
    "Price holding above AVWAP = participants profitable, likely to defend",
    "Price below AVWAP = participants underwater, may capitulate",
    "AVWAP as support after breakout anchor",
    "AVWAP as resistance from prior high anchor",
    "Confluence with regular VWAP for strong levels",
  ],
  limitations: [
    "Requires manual anchor selection",
    "Becomes less relevant over very long periods",
    "Subjective - different anchors give different levels",
    "Needs significant event for meaningful anchor",
  ],
  goesGoodWith: ["vwap", "vwma", "sma", "ema"],
  summary: "AVWAP shows institutional cost basis from key events. Anchor from breakouts, earnings, highs, or lows to see if participants are profitable. Essential for swing traders analyzing multi-day institutional positioning.",
  commonSettings: "Anchor: First bar (full history), Week Ago, Month Ago, Quarter Ago, Year Ago. Or anchor to specific events manually.",
  bestConditions: "Swing trading and position analysis. Best anchored from significant events like earnings, breakouts, or major highs/lows.",
};

export const OBV_DOCS: IndicatorDocs = {
  definition: "On Balance Volume (OBV) measures buying and selling pressure as a cumulative indicator that adds volume on up days and subtracts on down days.",
  explanation: "OBV should confirm price trends. Rising OBV with rising price = healthy trend. OBV diverging from price can signal reversal.",
  calculations: "If Close > Previous Close: OBV = Previous OBV + Volume. If Close < Previous Close: OBV = Previous OBV - Volume",
  takeaways: [
    "Volume confirms price",
    "Divergences signal potential reversals",
    "Trend of OBV matters more than absolute value",
  ],
  whatToLookFor: [
    "OBV trend matching price trend",
    "OBV divergence from price",
    "OBV breakouts before price",
  ],
  limitations: [
    "Cumulative nature means absolute value is meaningless",
    "Single day large volume can distort",
    "Requires reliable volume data",
  ],
  goesGoodWith: ["vwap", "vwma", "macd"],
  summary: "Classic volume indicator for trend confirmation. OBV divergences are powerful signals.",
  commonSettings: "No parameters",
  bestConditions: "Markets with reliable volume data",
};

export const MFI_DOCS: IndicatorDocs = {
  definition: "The Money Flow Index (MFI) is a volume-weighted RSI that measures buying and selling pressure using both price and volume data. It oscillates between 0 and 100.",
  explanation: "MFI combines price momentum with volume to provide a more comprehensive view of buying/selling pressure than RSI alone. Values above 80 indicate overbought conditions (potential selling opportunity), while values below 20 indicate oversold conditions (potential buying opportunity). MFI uses Typical Price (HLC/3) and volume to calculate positive and negative money flow.",
  calculations: "Typical Price (TP) = (High + Low + Close) / 3\nRaw Money Flow = TP × Volume\nPositive MF = Sum of RMF when TP > TP[1] over N periods\nNegative MF = Sum of RMF when TP < TP[1] over N periods\nMoney Flow Ratio = Positive MF / Negative MF\nMFI = 100 - (100 / (1 + Ratio))",
  takeaways: [
    "Volume-weighted version of RSI",
    "More accurate than RSI for detecting money flow",
    "80/20 levels indicate overbought/oversold",
    "Divergences between MFI and price signal reversals",
  ],
  whatToLookFor: [
    "MFI crossing above 80 (overbought - potential sell)",
    "MFI crossing below 20 (oversold - potential buy)",
    "Bullish divergence: price makes lower low but MFI makes higher low",
    "Bearish divergence: price makes higher high but MFI makes lower high",
    "MFI crossing the 50 level for momentum confirmation",
  ],
  limitations: [
    "Requires reliable volume data",
    "Can stay overbought/oversold for extended periods in strong trends",
    "May give premature signals in choppy markets",
    "Less effective in low-volume markets",
  ],
  goesGoodWith: ["rsi", "obv", "vwap", "macd"],
  summary: "Volume-weighted RSI for detecting buying/selling pressure. Use 80/20 levels for overbought/oversold signals and watch for divergences.",
  commonSettings: "Length: 14 (standard). Overbought: 80, Oversold: 20",
  bestConditions: "Markets with reliable volume data, works well for stocks and futures",
};

export const CMF_DOCS: IndicatorDocs = {
  definition: "Chaikin Money Flow (CMF) is a volume-weighted average of accumulation and distribution over a specified period. It measures the buying and selling pressure for a given period, typically 20 periods.",
  explanation: "CMF measures institutional buying/selling pressure by analyzing where price closes within the high-low range, weighted by volume. Values range from -1 to +1. Positive values indicate buying pressure (accumulation), while negative values indicate selling pressure (distribution). The closer to +1 or -1, the stronger the pressure.",
  calculations: "Money Flow Multiplier (MFM) = ((Close - Low) - (High - Close)) / (High - Low)\nMoney Flow Volume (MFV) = MFM × Volume\nCMF = Sum(MFV, N) / Sum(Volume, N)\n\nNote: MFM can also be written as (2×Close - High - Low) / (High - Low)",
  takeaways: [
    "CMF > 0 indicates buying pressure (accumulation)",
    "CMF < 0 indicates selling pressure (distribution)",
    "Values closer to +1/-1 indicate stronger pressure",
    "Zero line crosses signal shifts in money flow direction",
    "Trending CMF confirms price trend strength",
  ],
  whatToLookFor: [
    "CMF crossing above zero = buying pressure emerging",
    "CMF crossing below zero = selling pressure emerging",
    "CMF trending higher with price = confirmed uptrend",
    "CMF trending lower with price dropping = confirmed downtrend",
    "Bullish divergence: price makes lower low but CMF makes higher low",
    "Bearish divergence: price makes higher high but CMF makes lower high",
  ],
  limitations: [
    "Requires reliable volume data",
    "Can give false signals during low-volume periods",
    "Lagging indicator in fast-moving markets",
    "May oscillate around zero in ranging markets",
  ],
  goesGoodWith: ["obv", "mfi", "vwap", "macd", "adx"],
  summary: "CMF tracks institutional buying/selling pressure using volume-weighted price location. Watch for zero line crosses and divergences with price for trade signals.",
  commonSettings: "Length: 20 (TradingView default). Shorter lengths = more responsive but noisier.",
  bestConditions: "Trending markets with reliable volume data. Works well for stocks, ETFs, and futures.",
};

export const PVT_DOCS: IndicatorDocs = {
  definition: "Price Volume Trend (PVT) is a cumulative indicator that correlates volume with price changes. It adds or subtracts a percentage of the daily volume based on the percentage change in price.",
  explanation: "PVT is similar to OBV but weights volume by the percentage price change rather than just the direction. This makes it more sensitive to the magnitude of price movements. Rising PVT confirms uptrends; falling PVT confirms downtrends. Divergences between PVT and price signal potential reversals.",
  calculations: "PVT = ((Close - Close[1]) / Close[1]) × Volume + PVT[1]\n\nFirst bar: PVT = 0\n\nThe formula adds the current day's volume multiplied by the percentage change in price to the previous PVT value.",
  takeaways: [
    "Cumulative indicator - trending direction matters more than absolute value",
    "More precise than OBV because it weights by price change magnitude",
    "Rising PVT in uptrend = healthy accumulation",
    "Falling PVT in downtrend = healthy distribution",
    "Divergences signal potential trend reversals",
  ],
  whatToLookFor: [
    "PVT confirming price trend direction",
    "Bullish divergence: price makes lower low but PVT makes higher low",
    "Bearish divergence: price makes higher high but PVT makes lower high",
    "PVT breakout ahead of price breakout",
    "Trend line breaks on PVT",
  ],
  limitations: [
    "Cumulative nature means absolute value is meaningless",
    "Large volume days have outsized impact",
    "Requires reliable volume data",
    "Less effective in low-volume or illiquid markets",
  ],
  goesGoodWith: ["obv", "mfi", "cmf", "macd", "rsi"],
  summary: "PVT measures volume-weighted price momentum. Watch for divergences with price and trend line breaks for trade signals.",
  commonSettings: "No parameters required. Simply add to chart.",
  bestConditions: "Trending markets with reliable volume data. Works well for stocks, ETFs, and crypto.",
};

export const PVI_DOCS: IndicatorDocs = {
  definition: "Positive Volume Index (PVI) is a cumulative indicator that tracks price changes on days when volume increases compared to the previous day. It starts at 1000 and is believed to reflect uninformed (retail) trading activity.",
  explanation: "PVI only changes when volume is higher than the previous bar. The theory is that on high-volume days, the \"crowd\" (uninformed traders) is active. When PVI is above its EMA, conditions favor a bull market; when below, conditions favor a bear market.",
  calculations: "PVI[0] = 1000\nIf Volume > Volume[1]:\n  PVI = PVI[1] × (1 + (Close - Close[1]) / Close[1])\nElse:\n  PVI = PVI[1]\nPVI EMA = EMA(PVI, 255)",
  takeaways: [
    "PVI tracks \"uninformed\" crowd activity on high-volume days",
    "PVI above its EMA = bullish bias (70-75% bull market probability)",
    "PVI below its EMA = bearish bias (bear market likely)",
    "Works best with NVI as a complementary pair",
    "Developed by Paul Dysart in the 1930s",
  ],
  whatToLookFor: [
    "PVI crossing above its EMA = bull market signal",
    "PVI crossing below its EMA = bear market warning",
    "PVI trend direction diverging from price",
    "PVI/NVI together for confirmation",
  ],
  limitations: [
    "Best used on daily or weekly timeframes",
    "EMA length (255) means slow signals",
    "Cumulative nature makes absolute values meaningless",
    "Less effective on low-volume securities",
  ],
  goesGoodWith: ["nvi", "obv", "mfi", "sma", "ema"],
  summary: "PVI tracks price movement on high-volume days. When PVI is above its 255 EMA, odds favor a bull market. Best used with NVI for a complete picture.",
  commonSettings: "EMA Length: 255 (TradingView default). Longer for smoother signals.",
  bestConditions: "Long-term trend analysis on daily/weekly charts. Best with NVI as a pair.",
};

export const NVI_DOCS: IndicatorDocs = {
  definition: "Negative Volume Index (NVI) is a cumulative indicator that tracks price changes on days when volume decreases compared to the previous day. It starts at 1000 and is believed to reflect smart money activity.",
  explanation: "NVI only changes when volume is lower than the previous bar. The theory is that on low-volume days, 'smart money' (informed traders) is operating without the crowd. When NVI is above its EMA, it suggests smart money is bullish.",
  calculations: "NVI[0] = 1000\nIf Volume < Volume[1]:\n  NVI = NVI[1] × (1 + (Close - Close[1]) / Close[1])\nElse:\n  NVI = NVI[1]\nNVI EMA = EMA(NVI, 255)",
  takeaways: [
    "NVI tracks 'smart money' activity on low-volume days",
    "NVI above its EMA = smart money is bullish",
    "NVI below its EMA = smart money is bearish",
    "NVI is considered a leading indicator",
    "Works best with PVI as a complementary pair",
  ],
  whatToLookFor: [
    "NVI crossing above its EMA = smart money turning bullish",
    "NVI crossing below its EMA = smart money turning bearish",
    "NVI diverging from price action",
    "NVI/PVI divergence for contrarian signals",
  ],
  limitations: [
    "Best used on daily or weekly timeframes",
    "EMA length (255) means slow signals",
    "Cumulative nature makes absolute values meaningless",
    "Theory of 'smart money' is debatable",
  ],
  goesGoodWith: ["pvi", "obv", "mfi", "sma", "ema"],
  summary: "NVI tracks price movement on low-volume days (smart money). When NVI is above its 255 EMA, smart money appears bullish. Use with PVI for full picture.",
  commonSettings: "EMA Length: 255 (TradingView default). Longer for smoother signals.",
  bestConditions: "Long-term trend analysis on daily/weekly charts. Best with PVI as a pair.",
};

export const RELVOL_DOCS: IndicatorDocs = {
  definition: "Relative Volume at Time (RelVol) compares current volume to the historical average volume at the same time offset within the anchor period. Values above 1 indicate higher-than-normal volume.",
  explanation: "RelVol helps identify unusual volume activity by comparing current volume to what's typical at that time of day/week. For example, on a 5-minute chart with daily anchor, it compares current bar's volume to the average volume at the same time-of-day over the last N days. Values > 1 show above-average activity; values < 1 show below-average activity.",
  calculations: "Cumulative mode: currentVol = sum(volume from anchor start)\nRegular mode: currentVol = current bar volume\nhistVols = volumes at same offset in previous N anchor periods\nRelVol = currentVol / avg(histVols)",
  takeaways: [
    "RelVol > 1 = above-average volume (unusual activity)",
    "RelVol < 1 = below-average volume (quiet)",
    "High RelVol at key levels may confirm breakouts",
    "Low RelVol during moves may indicate weakness",
    "Most useful on intraday timeframes",
  ],
  whatToLookFor: [
    "RelVol spikes at breakout points",
    "RelVol confirmation of price moves",
    "RelVol divergence (price move without volume)",
    "Unusual volume at market open/close",
    "Volume patterns at specific times of day",
  ],
  limitations: [
    "Requires sufficient historical data for comparison",
    "Less meaningful on higher timeframes (daily+)",
    "Anchor timeframe must be larger than chart timeframe",
    "Holiday/irregular trading days may skew averages",
  ],
  goesGoodWith: ["vwap", "obv", "mfi", "volumeDelta"],
  summary: "RelVol shows if current volume is unusually high or low compared to typical volume at this time. Great for identifying unusual activity and confirming breakouts.",
  commonSettings: "Anchor: 1 Day, Length: 10, Mode: Cumulative (TradingView defaults)",
  bestConditions: "Intraday trading on liquid instruments. Best on 1-30 minute charts with daily anchor.",
};

export const KLINGER_DOCS: IndicatorDocs = {
  definition: "The Klinger Oscillator (KO) measures long-term money flow trends while remaining sensitive to short-term fluctuations. It compares volume flowing through a security with its price movements.",
  explanation: "KO uses Volume Force (VF) which considers trend direction, daily range, and volume. VF is smoothed with two EMAs (34 and 55 periods) and their difference creates the oscillator. A 13-period EMA signal line helps identify crossover signals. KO above zero indicates buying pressure; below zero indicates selling pressure.",
  calculations: "Trend = +1 if (H+L+C) > (H[1]+L[1]+C[1]), else -1\ndm = High - Low\ncm = cm[1] + dm (if same trend) or dm[1] + dm (if trend changed)\nVolume Force (VF) = Volume × abs(2 × ((dm/cm) - 1)) × Trend\nKO = EMA(VF, 34) - EMA(VF, 55)\nSignal = EMA(KO, 13)",
  takeaways: [
    "KO above zero = net buying pressure",
    "KO below zero = net selling pressure",
    "Signal line crossovers generate trade signals",
    "Divergence between KO and price signals reversals",
    "More sophisticated than OBV due to trend/range analysis",
  ],
  whatToLookFor: [
    "KO crossing above signal line = bullish signal",
    "KO crossing below signal line = bearish signal",
    "KO crossing above zero = uptrend confirmation",
    "KO crossing below zero = downtrend confirmation",
    "Bullish divergence: price lower low, KO higher low",
    "Bearish divergence: price higher high, KO lower high",
  ],
  limitations: [
    "Frequent signal line crossovers can cause whipsaws",
    "Zero line crossovers may lag in fast markets",
    "Divergences can persist before price reverses",
    "Complex calculation makes manual verification difficult",
  ],
  goesGoodWith: ["obv", "mfi", "cmf", "macd", "adx"],
  summary: "Klinger Oscillator tracks money flow using volume force analysis. Watch for signal line crossovers and divergences with price for trade signals.",
  commonSettings: "Fast Length: 34, Slow Length: 55, Signal Length: 13 (TradingView defaults)",
  bestConditions: "Trending markets with reliable volume data. Best used with trend confirmation indicators.",
};

export const VOLUME_DELTA_DOCS: IndicatorDocs = {
  definition: "Volume Delta measures the difference between buying volume and selling volume using lower-timeframe (intrabar) data. It plots OHLC candles showing cumulative delta for each chart bar.",
  explanation: "Each chart bar is broken down into intrabars at a lower timeframe. Intrabars are classified as buying (close > open) or selling (close < open) volume. The cumulative sum creates a delta candle: Open=0, Close=final delta, High/Low=extremes reached during the bar.",
  calculations: "For each intrabar:\n• If close > open: volume is buying (+)\n• If close < open: volume is selling (−)\n• If close = open (doji): use previous close comparison\n\nDelta Candle:\n• Open = 0 (always)\n• Close = Σ(signed volume)\n• High = max cumulative delta\n• Low = min cumulative delta",
  takeaways: [
    "Green candles indicate net buying pressure for the bar",
    "Red candles indicate net selling pressure for the bar",
    "Large wicks show intra-bar reversals in pressure",
    "Strong delta in trend direction confirms momentum",
    "Delta divergence with price may signal trend exhaustion",
  ],
  whatToLookFor: [
    "Climax volume with delta reversal = potential exhaustion",
    "Persistent positive delta = sustained buying pressure",
    "Persistent negative delta = sustained selling pressure",
    "Delta divergence: price up but delta negative = weakness",
    "Delta divergence: price down but delta positive = strength",
    "Long wicks indicate absorption of contrary flow",
  ],
  limitations: [
    "Requires lower-timeframe data availability",
    "Higher timeframe charts have reduced intrabar coverage",
    "Does not distinguish market vs limit orders",
    "Less history available due to intrabar data requirements",
    "Simplified estimation used when true intrabar unavailable",
  ],
  goesGoodWith: ["obv", "vwap", "mfi", "cmf"],
  summary: "Volume Delta shows net buying vs selling pressure using intrabar volume classification. Watch for divergences with price and climax patterns.",
  commonSettings: "Custom Timeframe: OFF (auto-selects appropriate intrabar TF). Lower TF = more precision but less history.",
  bestConditions: "Intraday charts (1min-4H) with reliable volume data. Most effective on liquid instruments.",
};

export const CVD_DOCS: IndicatorDocs = {
  definition: "Cumulative Volume Delta (CVD) accumulates the net buying/selling volume over an anchor period, resetting at each new period boundary.",
  explanation: "CVD extends Volume Delta by tracking the running sum within a time period (Session, Week, Month, etc.). At each anchor period boundary, the accumulation resets to zero. This reveals cumulative order flow patterns within periods.",
  calculations: "For each bar:\n• Open = previous CVD close (or 0 if new anchor period)\n• Close = Open + bar's net delta\n• High/Low = running extremes during bar\n\nDelta Classification:\n• close > open: buying volume (+)\n• close < open: selling volume (−)\n• Doji: use previous close comparison",
  takeaways: [
    "Rising CVD confirms accumulation during the period",
    "Falling CVD confirms distribution during the period",
    "Session CVD resets reveal daily institutional flow",
    "CVD divergence with price signals potential reversals",
  ],
  whatToLookFor: [
    "CVD making new highs/lows with price confirms trend",
    "CVD flattening while price rises = weakening buying",
    "CVD rising while price falls = hidden accumulation",
    "Period resets show fresh start for analysis",
  ],
  limitations: [
    "Requires intrabar data for accurate classification",
    "Earnings/Dividends/Splits anchors need event data",
    "Higher timeframes have reduced intrabar coverage",
    "Cumulative nature makes absolute levels less meaningful",
  ],
  goesGoodWith: ["volumeDelta", "obv", "vwap", "mfi"],
  summary: "CVD tracks cumulative order flow within anchor periods. Watch for divergences and period-boundary resets for flow analysis.",
  commonSettings: "Anchor Period: Session (most common). Week/Month for swing analysis.",
  bestConditions: "Intraday to daily charts on liquid instruments. Best for tracking institutional flow patterns.",
};

export const CVI_DOCS: IndicatorDocs = {
  definition: "Cumulative Volume Index (CVI) measures the running sum of advancing volume minus declining volume for an exchange.",
  explanation: "CVI tracks broad market participation by comparing volume flowing into rising stocks vs falling stocks. A rising CVI indicates more volume going to advancing issues; a falling CVI indicates more volume going to declining issues.",
  calculations: "CVI = Previous CVI + (Advancing Volume − Declining Volume)\n\nAdvancing Volume = total volume of stocks that closed higher\nDeclining Volume = total volume of stocks that closed lower",
  takeaways: [
    "Rising CVI = broad buying pressure across the market",
    "Falling CVI = broad selling pressure across the market",
    "CVI confirms index trends when moving in same direction",
    "CVI divergence with index may signal internal weakness",
  ],
  whatToLookFor: [
    "CVI new highs with index confirms uptrend health",
    "CVI failing to confirm index highs = bearish divergence",
    "CVI making higher lows during correction = underlying strength",
    "Persistent CVI direction shows institutional commitment",
  ],
  limitations: [
    "Requires exchange-level breadth data",
    "Only available for supported exchanges",
    "May lag during intraday due to data frequency",
    "Volume spikes can distort short-term readings",
  ],
  goesGoodWith: ["obv", "mfi", "cmf"],
  summary: "CVI tracks exchange-wide buying vs selling pressure. Use for market breadth analysis and confirming index moves.",
  commonSettings: "Exchange: NYSE (most common). Select based on your trading focus.",
  bestConditions: "Daily charts for swing analysis. Useful for confirming index trends and spotting divergences.",
};

// ============================================================================
// Momentum (Additional)
// ============================================================================

export const AO_DOCS: IndicatorDocs = {
  definition: "The Awesome Oscillator (AO) is a momentum indicator developed by Bill Williams. It measures the difference between a 5-period and 34-period simple moving average of the median price (HL/2).",
  explanation: "AO shows the market momentum by comparing recent and older price data. Positive values indicate bullish momentum, negative values indicate bearish. The histogram color changes based on whether the oscillator is rising (green) or falling (red), not based on above/below zero.",
  calculations: "AO = SMA(HL/2, 5) - SMA(HL/2, 34), where HL/2 = (High + Low) / 2",
  takeaways: [
    "Zero line crossovers signal momentum shifts",
    "Rising AO (green bars) shows strengthening momentum",
    "Falling AO (red bars) shows weakening momentum",
    "Part of the Bill Williams trading system",
  ],
  whatToLookFor: [
    "Zero line crossovers for trend confirmation",
    "Twin peaks pattern (bullish/bearish)",
    "Saucer pattern for quick momentum changes",
    "Divergences with price for reversal signals",
  ],
  limitations: [
    "Lagging indicator due to SMA calculations",
    "Can give false signals in choppy markets",
    "Fixed periods may not suit all timeframes",
  ],
  goesGoodWith: ["macd", "rsi", "fractals", "alligator"],
  summary: "Bill Williams' momentum oscillator using median price. Watch for zero line crosses, twin peaks, and saucer patterns.",
  commonSettings: "Fixed: 5/34 SMA of HL/2 (no adjustable parameters in TradingView)",
  bestConditions: "Trending markets with clear directional moves",
};

export const FISHER_DOCS: IndicatorDocs = {
  definition: "The Fisher Transform is a technical indicator developed by John Ehlers that converts price data into a Gaussian normal distribution, making extreme price movements more apparent.",
  explanation: "The Fisher Transform normalizes prices over a lookback period, then applies a mathematical transformation that amplifies extremes. When Fisher crosses above its trigger line (previous Fisher value), it suggests bullish momentum; crossing below suggests bearish. Values beyond ±1.5 indicate extreme conditions.",
  calculations: "1. Normalize HL/2 to [-1, 1] range over N periods\n2. Apply smoothing: value = 0.66 × normalized + 0.67 × value[1]\n3. Clamp to [-0.999, 0.999]\n4. Fisher = 0.5 × ln((1+value)/(1-value)) + 0.5 × Fisher[1]\n5. Trigger = Fisher[1]",
  takeaways: [
    "Fisher crossing trigger signals momentum shifts",
    "Values beyond ±1.5 indicate extreme conditions",
    "Sharper peaks than traditional oscillators",
    "Transforms any price distribution to near-Gaussian",
  ],
  whatToLookFor: [
    "Fisher/Trigger crossovers for entry signals",
    "Reversal when Fisher reaches extreme levels (±1.5 or beyond)",
    "Divergences between price and Fisher",
    "Rate of change in Fisher slope",
  ],
  limitations: [
    "Can whipsaw in sideways/ranging markets",
    "Sensitive to length parameter selection",
    "May generate premature reversal signals",
    "Extreme values don't guarantee reversals",
  ],
  goesGoodWith: ["rsi", "stoch", "macd", "bb"],
  summary: "Ehlers' oscillator that amplifies extreme price moves. Fisher/Trigger crosses and extreme levels (±1.5) provide trading signals.",
  commonSettings: "Length: 9 (default). Shorter = more responsive, longer = smoother.",
  bestConditions: "Works in both trending and ranging markets, best for identifying reversals",
};

export const TRIX_DOCS: IndicatorDocs = {
  definition: "TRIX (Triple Exponential Average) is a momentum oscillator developed by Jack Hutson. It shows the percent rate of change of a triple-smoothed exponential moving average.",
  explanation: "TRIX applies three successive EMAs to the closing price to filter out minor price fluctuations, then calculates the 1-period percent change of the result. This triple smoothing makes TRIX excellent at identifying significant trend changes while filtering out noise. When TRIX crosses above zero, it signals bullish momentum; crossing below zero signals bearish momentum.",
  calculations: "1. Single EMA = EMA(close, length)\n2. Double EMA = EMA(Single EMA, length)\n3. Triple EMA = EMA(Double EMA, length)\n4. TRIX = 100 × (Triple EMA[t] - Triple EMA[t-1]) / Triple EMA[t-1]",
  takeaways: [
    "Triple smoothing filters out minor price movements",
    "Zero line crossovers signal trend direction changes",
    "Positive TRIX = bullish momentum, negative = bearish",
    "Divergences with price can predict reversals",
  ],
  whatToLookFor: [
    "Zero line crossovers (bullish when crossing up, bearish when crossing down)",
    "Divergences between TRIX and price action",
    "TRIX slope direction for momentum confirmation",
    "Signal line crossovers (if using signal line)",
  ],
  limitations: [
    "Lagging indicator due to triple EMA smoothing",
    "Slow to react to sudden price changes",
    "May miss early entry points in fast-moving markets",
    "Whipsaws possible in ranging markets",
  ],
  goesGoodWith: ["macd", "rsi", "bb", "sma"],
  summary: "Momentum oscillator using triple-smoothed EMA percent change. Watch for zero line crossovers and divergences with price.",
  commonSettings: "Length: 18 (default). Shorter = more responsive, longer = smoother with fewer false signals.",
  bestConditions: "Trending markets, medium to long-term trend identification",
};

export const TSI_DOCS: IndicatorDocs = {
  definition: "The True Strength Index (TSI) is a double-smoothed momentum oscillator developed by William Blau. It uses double-smoothed price change to measure trend direction and identify overbought/oversold conditions.",
  explanation: "TSI applies double exponential smoothing to both price change and absolute price change, then calculates their ratio scaled to percentage. The result oscillates around zero, with positive values indicating bullish momentum and negative values indicating bearish momentum. A signal line (EMA of TSI) provides crossover signals similar to MACD.",
  calculations: "1. m[t] = close[t] - close[t-1] (momentum)\n2. absM[t] = |m[t]|\n3. num = EMA(EMA(m, longLen), shortLen)\n4. den = EMA(EMA(absM, longLen), shortLen)\n5. TSI = 100 × (num / den)\n6. Signal = EMA(TSI, signalLen)",
  takeaways: [
    "Double smoothing filters noise while preserving trend signals",
    "Zero line crossovers indicate trend direction changes",
    "Signal line crossovers provide entry/exit signals",
    "Bounded between -100 and +100 by construction",
  ],
  whatToLookFor: [
    "Zero line crossovers (bullish when TSI crosses above 0, bearish below)",
    "Signal line crossovers (bullish when TSI crosses above signal)",
    "Divergences between TSI and price action",
    "Extreme readings (±25-50) for overbought/oversold conditions",
  ],
  limitations: [
    "Lagging due to double smoothing",
    "Can give late signals in fast-moving markets",
    "May whipsaw in choppy/ranging conditions",
    "Requires multiple parameters to optimize",
  ],
  goesGoodWith: ["ema", "macd", "rsi", "bb"],
  summary: "Double-smoothed momentum oscillator with signal line. Watch for zero line and signal crossovers, and divergences with price.",
  commonSettings: "Long: 25, Short: 13, Signal: 13 (TradingView defaults). Some use 7-13 for signal line.",
  bestConditions: "Trending markets, swing trading, identifying momentum shifts",
};

export const SMII_DOCS: IndicatorDocs = {
  definition: "The SMI Ergodic Indicator (SMII) is a momentum oscillator that measures the distance of price from its median range. It is essentially the TSI without the 100× scaling, resulting in values typically between -1 and +1.",
  explanation: "SMII applies double exponential smoothing to both price change and absolute price change, then calculates their ratio. Unlike TSI, SMII does not multiply by 100, keeping values in the -1 to +1 range. The signal line (EMA of SMI) provides crossover signals for entry and exit.",
  calculations: "1. change = close - close[1]\n2. absChange = |change|\n3. tempChange = EMA(EMA(change, shortLen), longLen)\n4. tempAbs = EMA(EMA(absChange, shortLen), longLen)\n5. SMI = tempChange / tempAbs (no ×100)\n6. Signal = EMA(SMI, signalLen)",
  takeaways: [
    "Values oscillate around zero between -1 and +1",
    "Positive values indicate bullish momentum",
    "Negative values indicate bearish momentum",
    "Signal line crossovers provide trade signals",
  ],
  whatToLookFor: [
    "Zero line crossovers for trend direction",
    "SMI crossing above/below Signal line for entries",
    "Divergences between SMII and price action",
    "Extreme readings near ±1 for reversal potential",
  ],
  limitations: [
    "Lagging due to double smoothing",
    "Can whipsaw in ranging/choppy markets",
    "Less intuitive scale compared to TSI percentage",
    "Requires parameter optimization for different markets",
  ],
  goesGoodWith: ["ema", "macd", "rsi", "bb"],
  summary: "Unscaled momentum oscillator similar to TSI. Watch for zero line and signal crossovers. Values near ±1 suggest extremes.",
  commonSettings: "Long: 20, Short: 5, Signal: 5 (TradingView defaults).",
  bestConditions: "Trending markets, swing trading, momentum confirmation",
};

export const SMIO_DOCS: IndicatorDocs = {
  definition: "The SMI Ergodic Oscillator (SMIO) is a histogram that displays the difference between the SMI (from SMII) and its Signal line. It oscillates around zero and highlights momentum shifts.",
  explanation: "SMIO is derived from SMII by subtracting the Signal line from the SMI line: SMIO = SMI - Signal. Positive values (histogram above zero) indicate the SMI is above its signal, suggesting bullish momentum. Negative values indicate bearish momentum. The histogram helps visualize crossover events as zero-line crosses.",
  calculations: "1. Calculate SMI and Signal using SMII formula\n2. SMIO = SMI - Signal\n\nNo ×100 scaling - values are typically in the ±0.5 range on daily charts.",
  takeaways: [
    "Histogram above zero = bullish momentum (SMI > Signal)",
    "Histogram below zero = bearish momentum (SMI < Signal)",
    "Zero line crosses correspond to SMI/Signal crossovers",
    "Histogram expansion shows momentum acceleration",
  ],
  whatToLookFor: [
    "Zero line crosses for trade entries (long when crossing above, short below)",
    "Histogram divergence from price for reversal signals",
    "Histogram contraction before potential reversals",
    "Increasing histogram bars for trend confirmation",
  ],
  limitations: [
    "Lagging due to underlying double smoothing",
    "Can produce choppy signals in ranging markets",
    "Small value range may be hard to read visually",
    "Derived indicator - doesn't add new information vs SMII",
  ],
  goesGoodWith: ["smii", "ema", "macd", "rsi"],
  summary: "Histogram oscillator showing SMI-Signal difference. Zero crosses are trade signals. Use with SMII for confirmation.",
  commonSettings: "Long: 20, Short: 5, Signal: 5 (TradingView defaults). Same params as SMII.",
  bestConditions: "Trending markets, momentum-based entries, visualizing SMII crossovers",
};

export const COPPOCK_DOCS: IndicatorDocs = {
  definition: "The Coppock Curve is a long-term momentum oscillator developed by Edwin Coppock in 1962. It was originally designed to identify major market bottoms in the stock market.",
  explanation: "The indicator sums the Rate of Change (ROC) over two different periods, then smooths the result with a Weighted Moving Average (WMA). Positive readings indicate bullish momentum; negative readings indicate bearish. Zero-line crossovers signal potential trend changes.",
  calculations: "1. ROC_long = 100 × (close / close[longLen] - 1)\n2. ROC_short = 100 × (close / close[shortLen] - 1)\n3. Sum = ROC_long + ROC_short\n4. Coppock = WMA(Sum, wmaLength)\n\nTradingView defaults: WMA=10, Long ROC=14, Short ROC=11",
  takeaways: [
    "Designed for long-term trend analysis (monthly charts originally)",
    "Zero-line crossovers are key signals",
    "Best for identifying market bottoms, less reliable for tops",
    "Smooth curve reduces false signals",
  ],
  whatToLookFor: [
    "Buy signal: Coppock crosses above zero from below",
    "Sell signal: Coppock crosses below zero from above",
    "Divergence between price and Coppock for early reversal hints",
    "Trend confirmation when Coppock stays consistently positive/negative",
  ],
  limitations: [
    "Lagging indicator due to WMA smoothing",
    "Originally designed for monthly charts, less reliable on shorter timeframes",
    "Better at identifying bottoms than tops",
    "May give late signals in fast-moving markets",
  ],
  goesGoodWith: ["ema", "macd", "rsi", "bb"],
  summary: "Long-term momentum oscillator using smoothed ROC sums. Watch for zero-line crossovers as buy/sell signals. Best for identifying major trend changes.",
  commonSettings: "WMA: 10, Long ROC: 14, Short ROC: 11 (TradingView defaults). Originally used on monthly charts.",
  bestConditions: "Long-term trend analysis, identifying major market bottoms, confirming trend direction",
};

export const CMO_DOCS: IndicatorDocs = {
  definition: "The Chande Momentum Oscillator (CMO) is a technical momentum indicator developed by Tushar Chande. It measures the momentum of price changes by comparing the sum of gains to the sum of losses over a specified period.",
  explanation: "The CMO oscillates between -100 and +100. Values above zero indicate bullish momentum (gains exceed losses), while values below zero indicate bearish momentum (losses exceed gains). The absolute value reflects the strength of the momentum.",
  calculations: "1. delta = src[i] - src[i-1]\n2. up = max(delta, 0), down = max(-delta, 0)\n3. UpSum = SUM(up, length)\n4. DownSum = SUM(down, length)\n5. CMO = 100 × (UpSum - DownSum) / (UpSum + DownSum)\n\nTradingView default: Length=9, Source=close",
  takeaways: [
    "Bounded between -100 and +100",
    "+50 and above indicates strong bullish momentum",
    "-50 and below indicates strong bearish momentum",
    "Zero-line crossovers signal momentum shifts",
  ],
  whatToLookFor: [
    "Overbought when CMO > +50 (potential reversal down)",
    "Oversold when CMO < -50 (potential reversal up)",
    "Zero-line crossovers for trend direction changes",
    "Divergence between price and CMO for early reversal signals",
  ],
  limitations: [
    "Can stay overbought/oversold for extended periods in strong trends",
    "Short lookback periods increase noise and false signals",
    "Lagging indicator like all momentum oscillators",
    "Works best in ranging/mean-reverting markets",
  ],
  goesGoodWith: ["ema", "bb", "rsi", "macd"],
  summary: "Momentum oscillator measuring the ratio of gains to losses. Watch for overbought/oversold extremes and zero-line crossovers. Best for timing entries in ranging markets.",
  commonSettings: "Length: 9 (default). Source: close. Overbought: +50, Oversold: -50.",
  bestConditions: "Range-bound markets, identifying momentum extremes, confirming trend changes",
};

export const UO_DOCS: IndicatorDocs = {
  definition: "The Ultimate Oscillator (UO) is a momentum indicator developed by Larry Williams in 1976. It uses a weighted average of three different time periods to reduce volatility and false signals while capturing short, medium, and long-term market trends.",
  explanation: "The UO oscillates between 0 and 100. It measures buying pressure relative to true range across three timeframes (default: 7, 14, 28 periods) with weights of 4, 2, and 1 respectively. Values above 70 indicate overbought conditions; below 30 indicate oversold. The multi-timeframe approach provides more reliable signals than single-period oscillators.",
  calculations: "1. BP (Buying Pressure) = Close - min(Low, PrevClose)\n2. TR (True Range) = max(High, PrevClose) - min(Low, PrevClose)\n3. Avg1 = SUM(BP, 7) / SUM(TR, 7)\n4. Avg2 = SUM(BP, 14) / SUM(TR, 14)\n5. Avg3 = SUM(BP, 28) / SUM(TR, 28)\n6. UO = 100 × (4×Avg1 + 2×Avg2 + 1×Avg3) / 7\n\nTradingView defaults: Fast=7, Middle=14, Slow=28",
  takeaways: [
    "Bounded between 0 and 100",
    "Multi-timeframe reduces false signals compared to single-period oscillators",
    "Overbought above 70, oversold below 30",
    "Divergences are key trading signals",
  ],
  whatToLookFor: [
    "Bullish divergence: price makes lower low but UO makes higher low (buy signal)",
    "Bearish divergence: price makes higher high but UO makes lower high (sell signal)",
    "Overbought (>70) after bullish divergence confirms reversal",
    "Oversold (<30) after bearish divergence confirms reversal",
  ],
  limitations: [
    "Divergence signals may take time to play out",
    "Can stay overbought/oversold for extended periods in strong trends",
    "Less effective in low-volatility, ranging markets",
    "Requires confirmation from other indicators for best results",
  ],
  goesGoodWith: ["ema", "adx", "rsi", "mfi", "macd"],
  summary: "Multi-timeframe momentum oscillator using weighted BP/TR ratios. Watch for divergences and overbought/oversold extremes. Best for timing reversals with confirmation.",
  commonSettings: "Fast: 7, Middle: 14, Slow: 28 (TradingView defaults). Overbought: 70, Oversold: 30.",
  bestConditions: "Trending markets for divergence signals, reversal trading, confirming trend exhaustion",
};

export const DC_DOCS: IndicatorDocs = {
  definition: "Donchian Channels (DC) are a volatility indicator developed by Richard Donchian. They display the highest high and lowest low over a specified period, with a basis line at the midpoint.",
  explanation: "The upper band represents the highest price over N periods, the lower band represents the lowest price, and the basis is their average. Price touching the upper band suggests bullish momentum; touching the lower band suggests bearish. Breakouts above/below the channels often signal new trends.",
  calculations: "Upper = Highest High over N periods\nLower = Lowest Low over N periods\nBasis = (Upper + Lower) / 2",
  takeaways: [
    "Upper/lower bands show volatility range",
    "Breakouts signal potential trend starts",
    "Basis line acts as dynamic support/resistance",
    "Channel width indicates volatility",
  ],
  whatToLookFor: [
    "Price breakouts above upper band (bullish)",
    "Price breakouts below lower band (bearish)",
    "Channel contraction before breakouts",
    "Basis line as trend filter",
  ],
  limitations: [
    "Lagging indicator based on past data",
    "No prediction of breakout direction",
    "Can give false signals in choppy markets",
    "Wide channels in volatile periods reduce utility",
  ],
  goesGoodWith: ["atr", "bb", "macd", "adx"],
  summary: "Classic breakout indicator showing price range over a period. Watch for breakouts and use basis as trend filter.",
  commonSettings: "Length: 20 (default). The 'Turtle Trading' system uses 20-day for entry, 10-day for exit.",
  bestConditions: "Trending markets, breakout trading strategies",
};

export const KC_DOCS: IndicatorDocs = {
  definition: "Keltner Channels (KC) are a volatility-based indicator developed by Chester Keltner. They consist of a middle line (EMA or SMA of price) with upper and lower bands based on the Average True Range (ATR) or other range measures.",
  explanation: "The middle line represents the trend direction, while the upper and lower bands adapt to volatility. Price touching or breaking through the bands indicates potential overbought/oversold conditions or trend continuation. The bands expand during high volatility and contract during low volatility.",
  calculations: "1. Basis = EMA(source, length) or SMA(source, length)\n2. RangeMa depends on Bands Style:\n   - ATR: ta.atr(atrLength)\n   - TR: True Range per bar\n   - Range: RMA(high - low, length)\n3. Upper = Basis + RangeMa × Multiplier\n4. Lower = Basis - RangeMa × Multiplier\n\nTradingView defaults: Length=20, Multiplier=2, ATR Length=10, Use Exponential MA=true, Bands Style=ATR",
  takeaways: [
    "Bands adapt to volatility via ATR/TR",
    "EMA basis is more responsive than SMA",
    "Price outside bands suggests strong momentum",
    "Band width indicates current volatility level",
  ],
  whatToLookFor: [
    "Breakout above upper band (bullish momentum)",
    "Breakout below lower band (bearish momentum)",
    "Price riding the upper/lower band during trends",
    "Band squeeze for potential breakout setups",
    "Mean reversion when price touches outer bands in ranging markets",
  ],
  limitations: [
    "Lagging indicator due to moving average calculation",
    "May give late signals in fast-moving markets",
    "Overbought/oversold levels less defined than oscillators",
    "Works best with trend confirmation from other indicators",
  ],
  goesGoodWith: ["rsi", "macd", "adx", "bb", "stoch"],
  summary: "Volatility channels using ATR-based bands around an EMA. Watch for band breakouts and squeezes. Best for trend following and volatility-based entries.",
  commonSettings: "Length: 20, Multiplier: 2, ATR Length: 10 (TradingView defaults). Use EMA for faster response, SMA for smoother signals.",
  bestConditions: "Trending markets, breakout trading, volatility analysis, mean reversion in ranges",
};

export const VSTOP_DOCS: IndicatorDocs = {
  definition: "The Volatility Stop (VStop) is a trailing stop indicator that uses ATR (Average True Range) to set stop levels that adapt to market volatility. It was popularized by various trading systems including the Wilder Volatility Stop.",
  explanation: "VStop plots markers (typically crosses or dots) below price during uptrends and above price during downtrends. The stop level trails price during trends and flips direction when price crosses through the stop. Green markers indicate an uptrend (stop below price), red markers indicate a downtrend (stop above price). The stop only moves in the trend direction, creating a 'ratchet' effect.",
  calculations: "1. Calculate ATR = RMA(True Range, length)\n2. Track running max/min since trend start\n3. In uptrend: stop = max - multiplier × ATR (trails up only)\n4. In downtrend: stop = min + multiplier × ATR (trails down only)\n5. Trend flips when price crosses the stop level\n6. On flip, reset max/min to current price and recalculate stop\n\nTradingView defaults: Length=20, Multiplier=2, Source=Close",
  takeaways: [
    "Adapts to volatility via ATR calculation",
    "Green = uptrend (stop below price)",
    "Red = downtrend (stop above price)",
    "Stop only moves in trend direction (never retraces)",
    "Color change signals potential trend reversal",
  ],
  whatToLookFor: [
    "Color changes from green to red (bearish reversal)",
    "Color changes from red to green (bullish reversal)",
    "Using stop levels for trade exit points",
    "Wide stops in volatile markets, tight stops in calm markets",
    "Confirmation of trend with other indicators",
  ],
  limitations: [
    "Lagging indicator - responds after price moves",
    "May whipsaw in choppy/ranging markets",
    "Stop placement is mechanical, not based on support/resistance",
    "Lower multiplier = tighter stops = more whipsaws",
    "Higher multiplier = wider stops = later exits",
  ],
  goesGoodWith: ["atr", "adx", "supertrend", "macd", "rsi"],
  summary: "Trailing stop indicator that uses ATR-based volatility. Watch for color changes as trend reversal signals. Use as exit points in trend-following strategies.",
  commonSettings: "Length: 20 (ATR period), Multiplier: 2 (ATR multiplier), Source: Close. Higher multiplier = wider stops, lower = tighter.",
  bestConditions: "Trending markets with clear directional moves. Less effective in choppy, sideways markets.",
};

export const CHOP_DOCS: IndicatorDocs = {
  definition: "The Choppiness Index (CHOP) is a volatility indicator developed by Australian commodity trader E.W. Dreiss. It measures whether the market is choppy (consolidating/ranging) or trending, using the ratio of summed True Range to the price range over a period.",
  explanation: "CHOP oscillates between 0 and 100. High values (above 61.8) indicate a choppy, sideways market - this is NOT a good time for trend-following strategies. Low values (below 38.2) indicate a strong trend - ideal for trend-following. The 38.2 and 61.8 levels are Fibonacci-based thresholds. CHOP tells you whether to trade (trending) or wait (choppy), but NOT which direction to trade.",
  calculations: "TR[i] = True Range = max(High - Low, |High - PrevClose|, |Low - PrevClose|)\nSUM(TR, n) = Sum of True Range over n periods\nHH = Highest High over n periods\nLL = Lowest Low over n periods\n\nCHOP = 100 × log₁₀(SUM(TR, n) / (HH - LL)) / log₁₀(n)\n\nTradingView defaults: Length=14, Offset=0",
  takeaways: [
    "High CHOP (>61.8) = choppy/ranging market - avoid trend trades",
    "Low CHOP (<38.2) = trending market - good for trend-following",
    "CHOP measures trendiness, NOT direction",
    "Use other indicators to determine trend direction",
    "38.2 and 61.8 levels are Fibonacci-based thresholds",
  ],
  whatToLookFor: [
    "CHOP dropping from above 61.8 (market transitioning from chop to trend)",
    "CHOP rising from below 38.2 (trend potentially exhausting)",
    "Extended periods above 61.8 (consolidation/accumulation zones)",
    "Extended periods below 38.2 (strong trend continuation)",
    "Combine with directional indicators (ADX, moving averages) for trade direction",
  ],
  limitations: [
    "Does NOT indicate trend direction - only trendiness",
    "Lagging indicator - responds after price action",
    "Can give false signals in volatile but directionless markets",
    "Threshold levels (38.2/61.8) may need adjustment for different assets",
    "Works best as a filter, not a standalone trading signal",
  ],
  goesGoodWith: ["adx", "atr", "bb", "macd", "ema", "sma"],
  summary: "Measures market choppiness vs trendiness. High values = avoid trend trades. Low values = trend-following opportunities. Always combine with a directional indicator.",
  commonSettings: "Length: 14 (standard). Some traders use 21 or 28 for longer-term analysis.",
  bestConditions: "All markets and timeframes. Most useful as a filter for trend-following systems to avoid whipsaws during consolidation.",
};

export const HV_DOCS: IndicatorDocs = {
  definition: "Historical Volatility (HV) measures the annualized standard deviation of logarithmic returns over a specified period. It quantifies how much an asset's price has fluctuated in the past, expressed as a percentage.",
  explanation: "HV calculates the natural log of daily price changes, then computes the standard deviation of these returns and annualizes the result. Higher HV values indicate more price movement and risk, while lower values suggest calmer markets. Unlike implied volatility (from options), HV is purely backward-looking. Traders use HV to gauge risk, size positions, and compare current volatility to historical norms.",
  calculations: "1. Log Returns: r[t] = ln(close[t] / close[t-1])\n2. Standard Deviation: σ = stdev(r, length) using sample variance (N-1)\n3. Annualized HV: HV = 100 × σ × √(periodsPerYear)\n\nTradingView default: Length = 10, periodsPerYear = 252 (trading days)",
  takeaways: [
    "Measures realized price fluctuations over time",
    "Higher HV = more risk/movement, lower HV = calmer market",
    "Expressed as annualized percentage",
    "Useful for comparing volatility across timeframes",
    "Backward-looking (unlike implied volatility)",
  ],
  whatToLookFor: [
    "HV rising = increasing volatility, potential breakout or trend move",
    "HV falling = decreasing volatility, potential consolidation",
    "HV at historical extremes = mean reversion opportunity",
    "Compare HV to Implied Volatility (IV) for options trading",
    "Use HV percentile rank to identify unusual volatility conditions",
  ],
  limitations: [
    "Backward-looking - doesn't predict future volatility",
    "Sensitive to the length parameter chosen",
    "Large gaps can distort readings",
    "Doesn't indicate price direction, only magnitude",
    "Annualization assumes consistent trading days",
  ],
  goesGoodWith: ["atr", "bb", "kc", "adx", "chop"],
  summary: "Measures annualized standard deviation of log returns. Use to gauge market risk, identify volatility extremes, and compare to implied volatility for options trading.",
  commonSettings: "Length: 10 (default), 20 or 30 for longer-term. Uses 252 trading days for annualization.",
  bestConditions: "All markets, especially useful for options trading (comparing HV to IV), position sizing, and volatility-based strategies.",
};

export const BBW_DOCS: IndicatorDocs = {
  definition: "Bollinger BandWidth (BBW) measures the width of Bollinger Bands as a percentage of the middle band. It quantifies volatility expansion and contraction, helping traders identify potential breakouts and squeeze conditions.",
  explanation: "BBW calculates the percentage difference between the upper and lower Bollinger Bands relative to the middle SMA. When BBW is low (narrow bands), it signals a 'squeeze' - a period of low volatility that often precedes significant price moves. When BBW is high (wide bands), volatility is elevated. The indicator also tracks the highest and lowest BBW values over specified lookback periods to identify extreme conditions.",
  calculations: "1. Middle = SMA(source, length)\n2. Upper = Middle + (StdDev × σ)\n3. Lower = Middle - (StdDev × σ)\n4. BBW = (Upper - Lower) / Middle × 100\n5. Highest Expansion = highest(BBW, highestExpansionLength)\n6. Lowest Contraction = lowest(BBW, lowestContractionLength)\n\nTradingView defaults: Length = 20, StdDev = 2, Highest/Lowest Lookback = 125",
  takeaways: [
    "Measures volatility as % width of Bollinger Bands",
    "Low BBW = squeeze/consolidation, potential breakout setup",
    "High BBW = elevated volatility, potential exhaustion",
    "Tracks historical highs/lows for context",
    "Useful for identifying volatility cycles",
  ],
  whatToLookFor: [
    "BBW at or near Lowest Contraction = potential breakout setup",
    "BBW expanding from lows = breakout in progress",
    "BBW at or near Highest Expansion = potential reversal/consolidation",
    "Narrowing BBW after expansion = trend losing momentum",
    "Compare current BBW to historical range for relative volatility",
  ],
  limitations: [
    "Doesn't indicate breakout direction",
    "Squeezes can last longer than expected",
    "False breakouts common - combine with price action",
    "High BBW doesn't guarantee reversal",
    "Settings-dependent results",
  ],
  goesGoodWith: ["bb", "atr", "adx", "kc", "rsi", "macd"],
  summary: "Measures Bollinger Band width as a percentage. Low values signal potential breakouts (squeeze), high values indicate elevated volatility. Use to identify volatility cycles and breakout setups.",
  commonSettings: "Length: 20, StdDev: 2, Lookback for Highest/Lowest: 125. Same length as Bollinger Bands for consistency.",
  bestConditions: "All markets and timeframes. Especially useful for swing trading and identifying low-volatility setups before breakouts.",
};

export const BBTREND_DOCS: IndicatorDocs = {
  definition: "BBTrend (Bollinger Bands Trend) measures trend strength and direction by comparing short-term and long-term Bollinger Bands. Positive values indicate bullish conditions, negative values indicate bearish conditions.",
  explanation: "BBTrend calculates the relationship between two sets of Bollinger Bands - a shorter-period (default 20) and longer-period (default 50). It compares the positioning of the lower bands versus upper bands to determine trend strength. When the short-term bands are well-positioned above the long-term bands, BBTrend is positive (bullish). When positioned below, BBTrend is negative (bearish). The magnitude indicates trend strength.",
  calculations: "1. Short: middle = SMA(close, 20), upper/lower = middle ± 2×stdev\n2. Long: middle = SMA(close, 50), upper/lower = middle ± 2×stdev\n3. BBTrend = (|shortLower - longLower| - |shortUpper - longUpper|) / shortMiddle × 100\n\nTradingView defaults: Short Length = 20, Long Length = 50, StdDev = 2",
  takeaways: [
    "Positive values = bullish trend condition",
    "Negative values = bearish trend condition",
    "Magnitude indicates trend strength",
    "Zero line crossovers signal potential trend changes",
    "4-color histogram shows trend direction and momentum",
  ],
  whatToLookFor: [
    "Crossing above zero = bullish signal",
    "Crossing below zero = bearish signal",
    "Growing positive bars = strengthening uptrend",
    "Fading positive bars = weakening uptrend",
    "Growing negative bars = strengthening downtrend",
    "Fading negative bars = weakening downtrend",
  ],
  limitations: [
    "Lagging indicator based on moving averages",
    "Can give false signals in choppy markets",
    "Magnitude interpretation is relative",
    "Works best in trending markets",
    "Settings should match timeframe traded",
  ],
  goesGoodWith: ["bb", "bbw", "macd", "adx", "supertrend", "rsi"],
  summary: "Compares short and long Bollinger Bands to measure trend strength. Positive = bullish, negative = bearish. 4-color histogram shows both direction and momentum changes.",
  commonSettings: "Short Length: 20, Long Length: 50, StdDev: 2. Match your trading timeframe - shorter for day trading, longer for swing trading.",
  bestConditions: "Trending markets on all timeframes. Best combined with other trend indicators for confirmation. Less reliable in ranging/choppy conditions.",
};

export const ULCER_DOCS: IndicatorDocs = {
  definition: "The Ulcer Index, devised by Peter Martin in 1987, is a volatility indicator that estimates downside risk. It gauges the depth and duration of relative price declines from previous highs over a defined lookback period.",
  explanation: "Unlike volatility measures such as standard deviation, which capture both upside and downside volatility, the Ulcer Index isolates drawdowns to provide an estimate of downside volatility. The indicator calculates the root mean square of percentage drawdowns from the rolling highest price. Lower values indicate stable/rising prices with minimal drawdowns; higher values indicate larger, more sustained price declines.",
  calculations: "1. Highest[t] = highest(source, length) — the rolling highest ending at bar t\n2. Drawdown[t] = 100 × (source[t] - Highest[t]) / Highest[t]  (≤ 0, one per bar)\n3. SquaredDD[t] = Drawdown[t]²\n4. Ulcer Index[t] = √(SMA(SquaredDD, length))\n\nTradingView defaults: Source = close, Length = 14",
  takeaways: [
    "Measures downside volatility only (not upside)",
    "Lower values = stable or rising prices",
    "Higher values = larger/sustained price declines",
    "Named after the stress of price drops causing 'ulcers'",
    "Used to evaluate risk and compare instruments",
  ],
  whatToLookFor: [
    "Rising Ulcer Index = increasing drawdown risk",
    "Low Ulcer Index values = stable price action",
    "Spikes indicate significant price declines",
    "Compare across instruments for relative risk",
    "Use to time entries (buy when UI is falling from highs)",
  ],
  limitations: [
    "Only measures downside - ignores upside volatility",
    "Lagging indicator (reacts to past drawdowns)",
    "Doesn't predict future price direction",
    "Sensitivity depends on length setting",
    "Not a timing indicator - more for risk assessment",
  ],
  goesGoodWith: ["atr", "hv", "bb", "rsi", "macd", "adx"],
  summary: "Measures downside volatility as the root mean square of percentage drawdowns from rolling highs. Lower = stable prices, higher = significant price declines. Useful for risk assessment.",
  commonSettings: "Length: 14 (default). Shorter periods react faster but with more noise. Longer periods give smoother readings.",
  bestConditions: "All markets and timeframes. Particularly useful for comparing risk across different instruments and for assessing drawdown risk before entering positions.",
};

// ============================================================================
// Support/Resistance
// ============================================================================

export const PIVOT_POINTS_STANDARD_DOCS: IndicatorDocs = {
  definition: "Pivot Points Standard calculates support and resistance levels based on the previous period's high, low, and close prices. These levels are commonly used to identify potential reversal points and price targets.",
  explanation: `Pivot points are horizontal lines that indicate potential support and resistance levels. The central Pivot (P) is calculated from the prior period's HLC, and additional S1-S5 (support) and R1-R5 (resistance) levels are derived from it.

Six calculation methods are supported:
• Traditional: Classic floor trader pivots with P, S1-S3, R1-R3
• Fibonacci: Uses Fibonacci ratios (0.382, 0.618, 1.0) applied to the range
• Woodie: Weights the close price (H + L + 2C) / 4
• Classic: Similar to Traditional with extended S4/R4 levels
• DM (Demark): Pivot calculation varies based on open vs close relationship
• Camarilla: Designed for intraday trading with tight levels (S1-S5, R1-R5)`,
  calculations: `Traditional:
P = (H + L + C) / 3
S1 = P × 2 - H, R1 = P × 2 - L
S2 = P - (H - L), R2 = P + (H - L)
S3 = P - 2(H - L), R3 = P + 2(H - L)

Fibonacci:
P = (H + L + C) / 3
S1/R1 = P ∓ 0.382 × Range
S2/R2 = P ∓ 0.618 × Range
S3/R3 = P ∓ Range

Camarilla:
S1/R1 = C ∓ Range × 1.1/12
S2/R2 = C ∓ Range × 1.1/6
S3/R3 = C ∓ Range × 1.1/4
S4/R4 = C ∓ Range × 1.1/2`,
  takeaways: [
    "Key levels for support and resistance",
    "Calculated fresh each period (day/week/month)",
    "P level acts as the balance point",
    "S1/R1 are first targets, S2/R2 are extended",
    "Different types suit different trading styles",
  ],
  whatToLookFor: [
    "Price approaching pivot levels for potential bounces",
    "Breaks above R1/R2 indicate bullish strength",
    "Breaks below S1/S2 indicate bearish pressure",
    "P level as intraday bias (above = bullish, below = bearish)",
    "Confluence with other indicators at pivot levels",
    "Gap fills often target the previous day's pivot",
  ],
  limitations: [
    "Static levels - don't adapt to intraday price action",
    "Less effective in strongly trending markets",
    "Require entire previous period to calculate",
    "May generate many levels causing chart clutter",
    "Not predictive - historical reference points only",
  ],
  goesGoodWith: ["rsi", "vwap", "bb", "macd", "atr"],
  summary: "Classic floor trader support/resistance levels calculated from previous period's OHLC. The P level sets the tone, while S1-S5 and R1-R5 provide price targets. Essential tool for intraday and swing trading.",
  commonSettings: "Traditional type with Daily timeframe is most common. Use Auto timeframe to match chart resolution. Camarilla is popular for scalping.",
  bestConditions: "Best in range-bound or mean-reverting markets. On intraday charts, pivots from daily data are most relevant. Less useful in strong directional moves.",
};

export const PIVOT_POINTS_HIGH_LOW_DOCS: IndicatorDocs = {
  definition: "Pivot Points High Low automatically identifies significant swing highs and lows based on pivot length, marking key turning points in price action.",
  explanation: "The indicator scans for local maxima (pivot highs) and minima (pivot lows) using a lookback window. A point qualifies as a pivot if it's the highest high or lowest low in the surrounding bars.",
  calculations: "Pivot High: High[n] is highest in n bars left AND n bars right. Pivot Low: Low[n] is lowest in n bars left AND n bars right.",
  takeaways: [
    "Automatically marks significant swing points",
    "Higher pivot length = fewer but more significant pivots",
    "Useful for drawing trendlines and identifying structure",
  ],
  whatToLookFor: [
    "Series of higher pivot highs/lows = uptrend",
    "Series of lower pivot highs/lows = downtrend",
    "Price breaking prior pivot levels",
    "Confluence with other support/resistance",
  ],
  limitations: [
    "Repainting - pivots confirmed only after n bars",
    "Very lagging due to confirmation requirement",
    "Subjective - depends on pivot length chosen",
  ],
  goesGoodWith: ["zigzag", "autoFib", "bb", "atr"],
  summary: "Pivot Points High Low marks significant swing points for structure analysis. Use for identifying trend direction and key levels.",
  commonSettings: "Pivot Length: 10 bars (left and right)",
  bestConditions: "All markets - useful for structure analysis and swing trading",
};

export const ZIGZAG_DOCS: IndicatorDocs = {
  definition: "Zig Zag connects swing highs and lows, filtering out minor price movements below the deviation threshold to highlight the underlying trend structure.",
  explanation: "The indicator identifies significant price reversals by requiring a minimum percentage move in the opposite direction before confirming a new swing point. This filters noise and shows the market's major swings.",
  calculations: "Starting from first extreme, track current trend direction. When price deviates by >= N% in opposite direction, confirm swing and reverse trend.",
  takeaways: [
    "Higher deviation = fewer, more significant swings",
    "Useful for identifying trend structure",
    "Last segment can repaint until confirmed",
    "Great for Fibonacci retracement analysis",
  ],
  whatToLookFor: [
    "Series of higher highs and higher lows (uptrend)",
    "Series of lower highs and lower lows (downtrend)",
    "Breakout of prior swing levels",
    "Fibonacci retracements of zigzag swings",
  ],
  limitations: [
    "Last segment repaints as new bars form",
    "Historical swings are fixed but current updates real-time",
    "Not predictive - purely reactive indicator",
  ],
  goesGoodWith: ["autoFib", "pivotPointsHighLow", "vwap"],
  summary: "Zig Zag filters price noise to show major swings. Excellent for structure analysis and Fibonacci studies.",
  commonSettings: "5% deviation with 10 depth for daily charts. Lower deviation for intraday.",
  bestConditions: "Trending markets with clear swing structure",
};

export const AUTO_FIB_DOCS: IndicatorDocs = {
  definition: "Auto Fib Retracement automatically draws Fibonacci retracement levels from the most recent swing high to swing low (or vice versa) detected by the Zig Zag algorithm.",
  explanation: "The indicator combines Zig Zag swing detection with automatic Fibonacci level plotting. It finds the most recent significant swing and draws retracement levels (23.6%, 38.2%, 50%, 61.8%, 78.6%) between those points.",
  calculations: "Uses Zig Zag to find swings, then: Fib Level = Low + (High - Low) × Fib Ratio for uptrend. For downtrend: Fib Level = High - (High - Low) × Fib Ratio.",
  takeaways: [
    "Automatically identifies key Fibonacci levels",
    "Updates as new swings form",
    "61.8% is the 'golden ratio' level",
    "50% level is psychological, not a true Fib ratio",
  ],
  whatToLookFor: [
    "Pullbacks to 38.2% or 50% for trend continuation",
    "Deep retracements to 61.8% or 78.6% for potential reversal",
    "Price reaction at Fib levels (bounce or break)",
    "Confluence with other support/resistance",
  ],
  limitations: [
    "Repaints as Zig Zag updates",
    "Many Fib levels can clutter chart",
    "Self-fulfilling prophecy aspect",
  ],
  goesGoodWith: ["zigzag", "pivotPointsHighLow", "vwap", "bb"],
  summary: "Auto Fib automatically draws Fibonacci retracements from detected swings. Essential for traders using Fibonacci analysis.",
  commonSettings: "Deviation: 5%, Depth: 10. Standard Fib levels: 23.6%, 38.2%, 50%, 61.8%, 78.6%",
  bestConditions: "Trending markets with clear swings. Works best after a strong move for pullback entries.",
};

export const ENV_DOCS: IndicatorDocs = {
  definition: "Envelope is a technical indicator consisting of two moving averages that form an upper and lower band around a basis line at a fixed percentage distance.",
  explanation: "The upper and lower bands are calculated by adding and subtracting a percentage from the basis moving average. This creates a channel that typically contains price action. When price touches the bands, it may signal overbought/oversold conditions.",
  calculations: "Basis = MA(source, length) where MA is SMA or EMA. Upper = Basis + (Basis × percent/100). Lower = Basis − (Basis × percent/100).",
  takeaways: [
    "Price touching upper band may indicate overbought",
    "Price touching lower band may indicate oversold",
    "Fixed percentage bands don't adapt to volatility",
    "Works best in ranging or mean-reverting markets",
  ],
  whatToLookFor: [
    "Price bouncing off upper or lower bands",
    "Breakouts beyond the bands as trend signals",
    "Price oscillating within envelope in ranges",
    "Confluence with other support/resistance",
  ],
  limitations: [
    "Fixed percentage doesn't adapt to market volatility",
    "May generate false signals in trending markets",
    "Optimal percent setting varies by instrument",
  ],
  goesGoodWith: ["rsi", "stoch", "bb", "atr"],
  summary: "Envelope creates a price channel using fixed percentage bands around a moving average. Useful for mean-reversion strategies.",
  commonSettings: "20-period SMA with 10% bands for daily charts. Shorter periods and narrower bands for intraday.",
  bestConditions: "Mean-reverting markets or consolidation phases where price oscillates.",
};

export const MEDIAN_DOCS: IndicatorDocs = {
  definition: "The Median indicator uses a rolling median price with an EMA smoothing and ATR-based bands. It provides a cloud visualization showing trend direction.",
  explanation: "Unlike moving averages, the median is resistant to outlier spikes. The cloud between the median and its EMA is colored based on direction: green when median is above EMA (bullish), violet when below (bearish). ATR bands show expected price range.",
  calculations: "Median = rolling median of source price over medianLength. EMA = exponential moving average of Median. Bands = Median ± (ATR × multiplier).",
  takeaways: [
    "Median is more robust to outliers than mean-based MAs",
    "Cloud color shows current trend direction",
    "ATR bands adapt to market volatility",
    "Green cloud = bullish, violet cloud = bearish",
  ],
  whatToLookFor: [
    "Cloud color transitions as trend change signals",
    "Price touching ATR bands as support/resistance",
    "Median crossing above/below EMA line",
    "Cloud thickness indicates trend strength",
  ],
  limitations: [
    "Short median length (default 3) can be noisy",
    "Cloud crossings may lag in fast markets",
    "Less common indicator - may lack community analysis",
  ],
  goesGoodWith: ["atr", "rsi", "bb", "supertrend"],
  summary: "A median-based trend indicator with direction-aware cloud and ATR channels. Useful for trend following with outlier resistance.",
  commonSettings: "Median Length: 3, ATR Length: 14, ATR Multiplier: 2. Source: HL2.",
  bestConditions: "Trending markets where outlier resistance is valuable. Works in both trending and range-bound conditions.",
};

// ============================================================================
// Williams Alligator
// ============================================================================

export const WILLIAMS_ALLIGATOR_DOCS: IndicatorDocs = {
  definition: "The Williams Alligator is a trend-following indicator consisting of three smoothed moving averages (SMMA) with forward offsets, representing the Jaw, Teeth, and Lips of an alligator.",
  explanation: "When the lines are intertwined, the Alligator is 'sleeping' and the market is range-bound. When the lines spread apart and move in the same direction, the Alligator is 'eating' and the market is trending. The Lips (fastest) crossing the Teeth and Jaw signals a new trend.",
  calculations: "Jaw = SMMA(hl2, 13) offset +8. Teeth = SMMA(hl2, 8) offset +5. Lips = SMMA(hl2, 5) offset +3. SMMA formula: smma[1] = na ? sma : (smma[0] * (n-1) + price) / n.",
  takeaways: [
    "Intertwined lines indicate consolidation (sleeping)",
    "Spread lines indicate trending market (eating/hunting)",
    "Lips crossing Teeth and Jaw confirms trend direction",
    "Works best with Williams Fractals for entry signals",
  ],
  whatToLookFor: [
    "Lines spreading apart after consolidation",
    "Lips above all lines = bullish, below all = bearish",
    "Awakening pattern: lines beginning to separate",
    "Sated pattern: lines converging after trend",
  ],
  limitations: [
    "Lagging due to SMMA smoothing",
    "Forward offset means last bars are projected",
    "False signals in choppy, low-volatility markets",
  ],
  goesGoodWith: ["williamsFractals", "ao", "rsi", "adx"],
  summary: "Bill Williams' trend indicator using three SMAs with different periods and forward offsets. The sleeping/awake metaphor helps identify trending vs ranging conditions.",
  commonSettings: "Jaw: 13/8, Teeth: 8/5, Lips: 5/3 (period/offset).",
  bestConditions: "Trending markets with clear directional momentum.",
};

// ============================================================================
// Williams Fractals
// ============================================================================

export const WILLIAMS_FRACTALS_DOCS: IndicatorDocs = {
  definition: "Williams Fractals identify potential turning points by marking local highs and lows based on a simple pivot detection algorithm.",
  explanation: "A fractal high (down arrow) forms when a candle's high is the highest among 2×Periods+1 bars. A fractal low (up arrow) forms when a candle's low is the lowest. Fractals are plotted at the pivot bar once confirmed by subsequent bars.",
  calculations: "Fractal High: high[n] > all highs in [n-periods, n+periods]. Fractal Low: low[n] < all lows in [n-periods, n+periods]. Default periods=2 creates 5-bar patterns.",
  takeaways: [
    "Up fractals indicate potential support levels",
    "Down fractals indicate potential resistance levels",
    "Combine with Alligator for filtered trade signals",
    "Use fractals for stop-loss placement",
  ],
  whatToLookFor: [
    "Price breaking above recent fractal high (bullish)",
    "Price breaking below recent fractal low (bearish)",
    "Clusters of fractals as strong S/R zones",
    "Fractals in direction of Alligator trend for entries",
  ],
  limitations: [
    "Delayed by periods bars due to confirmation requirement",
    "Many false fractals in choppy markets",
    "Historical fractals are fixed (no repainting)",
  ],
  goesGoodWith: ["williamsAlligator", "ao", "bb", "macd"],
  summary: "Bill Williams' pivot detection indicator. Simple but effective for identifying key reversal points and support/resistance levels.",
  commonSettings: "Periods: 2 (creates standard 5-bar fractal pattern).",
  bestConditions: "Clear swing structures in trending or range-bound markets.",
};

// ============================================================================
// RSI Divergence
// ============================================================================

export const RSI_DIVERGENCE_DOCS: IndicatorDocs = {
  definition: "RSI Divergence Indicator combines the Relative Strength Index with automatic detection of regular and hidden divergences between price and momentum.",
  explanation: "Regular bullish divergence occurs when price makes a lower low but RSI makes a higher low, suggesting weakening selling pressure. Regular bearish divergence occurs when price makes a higher high but RSI makes a lower high. Hidden divergences signal trend continuation.",
  calculations: "RSI = standard 14-period calculation. Pivots detected using configurable left/right lookback. Divergence = compare pivot values between price and RSI within range limits.",
  takeaways: [
    "Regular divergence signals potential reversals",
    "Hidden divergence signals trend continuation",
    "Most reliable near overbought/oversold levels",
    "Requires confirmation (don't trade divergence alone)",
  ],
  whatToLookFor: [
    "Regular bullish divergence near RSI 30 for longs",
    "Regular bearish divergence near RSI 70 for shorts",
    "Hidden bullish in uptrends for continuation entries",
    "Hidden bearish in downtrends for continuation entries",
  ],
  limitations: [
    "Divergence can persist for extended periods",
    "False signals common in strong trends",
    "Pivot detection is backward-looking (delayed)",
  ],
  goesGoodWith: ["bb", "macd", "adx", "williamsAlligator"],
  summary: "Enhanced RSI with automatic divergence detection. Useful for identifying momentum shifts and potential reversal points.",
  commonSettings: "RSI Period: 14. Pivot Lookback: 5/5. Range: 5-60 bars.",
  bestConditions: "Range-bound markets or at trend exhaustion points.",
};

// ============================================================================
// Knoxville Divergence
// ============================================================================

export const KNOXVILLE_DIVERGENCE_DOCS: IndicatorDocs = {
  definition: "Knoxville Divergence (Rob Booker) identifies momentum divergences at price extremes, confirmed by RSI overbought/oversold conditions.",
  explanation: "Bullish KD (+KD) occurs when price makes a new low with momentum divergence while RSI was recently oversold. Bearish KD (-KD) occurs when price makes a new high with momentum divergence while RSI was recently overbought. The RSI gate filters noise.",
  calculations: "Momentum = close - close[momPeriod]. Find divergence: current momentum vs prior. Gate: RSI > 70 (bearish) or RSI < 30 (bullish). Confirm: extreme price (highest high or lowest low in lookback).",
  takeaways: [
    "+KD signals potential bullish reversal at lows",
    "-KD signals potential bearish reversal at highs",
    "RSI confirmation improves signal quality",
    "Best at major market turning points",
  ],
  whatToLookFor: [
    "+KD below candle for potential long entry",
    "-KD above candle for potential short entry",
    "Multiple consecutive signals for stronger conviction",
    "Combine with trend indicators for context",
  ],
  limitations: [
    "Relatively rare signals in trending markets",
    "May miss fast reversals",
    "Requires RSI OB/OS confirmation",
  ],
  goesGoodWith: ["rsi", "williamsAlligator", "bb", "macd"],
  summary: "Rob Booker's reversal indicator combining momentum divergence with RSI confirmation. Designed to catch major tops and bottoms.",
  commonSettings: "Bars Back: 150. RSI Period: 21. Momentum Period: 20.",
  bestConditions: "Market extremes, tops and bottoms, exhaustion points.",
};

export const LINREG_DOCS: IndicatorDocs = {
  definition: "Linear Regression Channel draws a best-fit line through price data with parallel deviation bands. Pearson's R measures the correlation strength.",
  explanation: "The channel is calculated using least squares regression over a rolling window. Upper and lower deviation lines are drawn at fixed standard deviation distances. Pearson's R (0 to ±1) shows how well prices fit the linear trend.",
  calculations: "LinReg = best-fit line using least squares. Deviation = stdDev(price - linreg). Bands = LinReg ± (deviation × multiplier). R = Pearson correlation coefficient.",
  takeaways: [
    "High R (near ±1) indicates strong linear trend",
    "Low R (near 0) suggests consolidation or ranging",
    "Deviation bands show expected price dispersion",
    "Line slope indicates trend direction and strength",
  ],
  whatToLookFor: [
    "Price bouncing off upper/lower deviation bands",
    "R value confirming trend strength",
    "Channel breakouts as reversal signals",
    "Slope changes in the regression line",
  ],
  limitations: [
    "Repaints as new data arrives",
    "Fixed lookback may miss regime changes",
    "Assumes linear price relationships",
  ],
  goesGoodWith: ["rsi", "bb", "adx", "stoch"],
  summary: "A statistical regression channel with deviation bands and correlation measure. Ideal for identifying linear trends and mean-reversion opportunities.",
  commonSettings: "Count: 100 bars, Upper/Lower Deviation: 2. Source: Close.",
  bestConditions: "Trending markets with clear directional bias. R > 0.8 suggests strong trend.",
};

// ============================================================================
// Breadth Indicators
// ============================================================================

export const ADRB_DOCS: IndicatorDocs = {
  definition: "Advance/Decline Ratio (Bars) counts the number of 'up' and 'down' bars over N periods and calculates their ratio.",
  explanation: "An 'up' bar occurs when close > previous close, a 'down' bar when close < previous close. Unchanged bars are excluded. The ratio shows whether advances or declines dominate.",
  calculations: "ADR_B = Up Bars / Down Bars over length periods. When Down = 0, value is NaN.",
  takeaways: [
    "Values > 1 indicate bullish momentum",
    "Values < 1 indicate bearish momentum",
    "Value = 1 means equilibrium",
  ],
  whatToLookFor: [
    "Ratio crossing above 1 for improving momentum",
    "Extreme readings for overbought/oversold",
  ],
  limitations: [
    "Only considers bar direction, not magnitude",
    "Does not account for volume",
  ],
  goesGoodWith: ["rsi", "macd", "obv"],
  summary: "Simple breadth oscillator based on up vs down bar counts (close > close[1]).",
  commonSettings: "Length: 9 bars.",
  bestConditions: "Trending markets to confirm momentum.",
};

export const ADR_DOCS: IndicatorDocs = {
  definition: "Advance/Decline Ratio measures the ratio of advancing to declining symbols in a market.",
  explanation: "True ADR requires market-wide data. This single-symbol proxy uses up/down bar counts as a stand-in until breadth data is available.",
  calculations: "ADR = Advancing Issues / Declining Issues. Single-symbol uses bar direction as proxy.",
  takeaways: [
    "ADR > 1 indicates more advances than declines",
    "ADR < 1 indicates more declines than advances",
    "Helps gauge overall market participation",
  ],
  whatToLookFor: [
    "Extreme readings at market turning points",
    "Divergences between ADR and price",
  ],
  limitations: [
    "Single-symbol version is a proxy only",
    "Requires breadth data for true ADR",
  ],
  goesGoodWith: ["adl", "adrb", "rsi"],
  summary: "Market breadth ratio indicator (single-symbol proxy).",
  commonSettings: "Length: 14 bars.",
  bestConditions: "Confirming broad market moves.",
};

export const ADL_DOCS: IndicatorDocs = {
  definition: "Advance/Decline Line is a cumulative running total of advancing minus declining issues.",
  explanation: "True ADL tracks all stocks in a market. This single-symbol proxy uses bar direction (+1 for up, -1 for down) as a stand-in.",
  calculations: "ADL = Previous ADL + (Advances - Declines). Single-symbol: +1 for up bar, -1 for down bar.",
  takeaways: [
    "Rising ADL confirms uptrend health",
    "Falling ADL suggests weakening breadth",
    "Divergences can signal reversals",
  ],
  whatToLookFor: [
    "ADL making new highs with price for confirmation",
    "Negative divergence: price up, ADL down",
  ],
  limitations: [
    "Single-symbol version is a proxy only",
    "Requires breadth data for true ADL",
  ],
  goesGoodWith: ["adr", "adrb", "obv"],
  summary: "Cumulative breadth indicator (single-symbol proxy).",
  commonSettings: "N/A - cumulative indicator.",
  bestConditions: "Confirming trend strength and breadth.",
};

// ============================================================================
// Volume Profile Indicators
// ============================================================================

export const VRVP_DOCS: IndicatorDocs = {
  definition: "Visible Range Volume Profile displays volume distribution at each price level for the currently visible chart range.",
  explanation: "VRVP aggregates volume from lower timeframe bars into horizontal bins, showing where the most trading occurred. Point of Control (POC) marks the highest volume level. Value Area (VA) encompasses the price range containing a specified percentage of total volume.",
  calculations: "LTF bars are aggregated into price bins. Volume is split by bar direction (up/down). POC = bin with max volume. VA = expand from POC until valueAreaPct is reached.",
  takeaways: [
    "POC often acts as support/resistance",
    "High Volume Nodes (HVN) attract price",
    "Low Volume Nodes (LVN) allow fast price movement",
  ],
  whatToLookFor: [
    "Price approaching POC for potential support/resistance",
    "Breakouts through LVN for momentum moves",
    "Value Area bounds for mean reversion trades",
  ],
  limitations: [
    "Data quality depends on LTF availability",
    "Redraws as visible range changes",
    "EODHD limited to 5m/1h/1d (TV uses 1m)",
  ],
  goesGoodWith: ["vwap", "bb", "pivotPointsStandard"],
  summary: "Volume distribution overlay showing POC and Value Area for visible range.",
  commonSettings: "Rows: 24, Row Size: Auto, Value Area %: 70.",
  bestConditions: "Range-bound markets, day trading, identifying support/resistance.",
};

export const VPFR_DOCS: IndicatorDocs = {
  definition: "Fixed Range Volume Profile displays volume distribution for a user-specified time range.",
  explanation: "Unlike VRVP which updates with scroll, VPFR stays anchored to specific start/end coordinates. Good for analyzing specific events or comparing periods.",
  calculations: "Same as VRVP but range is user-defined via start/end timestamps.",
  takeaways: [
    "Good for analyzing specific events",
    "Profile remains stable as you scroll",
    "Extend Right option continues accumulating",
  ],
  whatToLookFor: [
    "Volume distribution around earnings",
    "POC as future support/resistance",
  ],
  limitations: [
    "Requires manual range selection",
    "EODHD limited to 5m resolution",
  ],
  goesGoodWith: ["vwap", "vrvp"],
  summary: "Fixed range volume profile for specific period analysis.",
  commonSettings: "24 rows, 70% VA.",
  bestConditions: "Event analysis, gap studies.",
};

export const AAVP_DOCS: IndicatorDocs = {
  definition: "Auto Anchored Volume Profile automatically determines anchor points based on timeframe or swing detection.",
  explanation: "In Auto mode: Session on intraday, Month on 1D, Quarter on 2D-10D, Year on 11D-60D. Can also anchor to Highest High/Lowest Low.",
  calculations: "Anchor start determined by mode, then same VP calculation as VRVP.",
  takeaways: [
    "Adapts automatically to timeframe",
    "Good for swing traders",
    "Highest High/Low modes track extremes",
  ],
  whatToLookFor: [
    "POC as dynamic support/resistance",
    "Value Area for mean reversion",
  ],
  limitations: [
    "Auto mode may not match preferences",
    "Length parameter only for High/Low modes",
  ],
  goesGoodWith: ["vwap", "supertrend"],
  summary: "Auto-anchoring volume profile that adapts to timeframe.",
  commonSettings: "Auto anchor, 24 rows, 70% VA.",
  bestConditions: "Swing trading, trend following.",
};

export const SVP_DOCS: IndicatorDocs = {
  definition: "Session Volume Profile displays volume profiles for each trading session.",
  explanation: "Creates separate profiles per session (day). Session boundaries can be customized. Uses fixed LTF table based on chart TF.",
  calculations: "LTF selected from chart TF table. 6000 total row limit. Profiles aligned by year.",
  takeaways: [
    "Shows developing intraday structure",
    "Each session has own POC/VA",
    "Great for day trading",
  ],
  whatToLookFor: [
    "Yesterday's POC as today's S/R",
    "Session POC migrations",
    "Initial balance breakouts",
  ],
  limitations: [
    "Max 6000 total rows",
    "Year boundary resets",
    "Requires intraday timeframe",
  ],
  goesGoodWith: ["vwap", "avwap"],
  summary: "Per-session volume profiles for intraday analysis.",
  commonSettings: "All sessions, 24 rows.",
  bestConditions: "Day trading, intraday S/R.",
};

export const SVPHD_DOCS: IndicatorDocs = {
  definition: "Session Volume Profile HD auto-adjusts row count as you zoom the chart.",
  explanation: "Unlike regular SVP, HD version shows more detail when zoomed in. Uses rough calculation for history, detailed for visible area.",
  calculations: "Rough + detailed dual calculation. Detailed uses VRVP-style LTF selection.",
  takeaways: [
    "More detail when zoomed in",
    "Rough view for historical overview",
    "Best of both worlds",
  ],
  whatToLookFor: [
    "Fine-grained POC when zoomed",
    "Broad structure when zoomed out",
  ],
  limitations: [
    "More CPU intensive",
    "No Row Size input (auto-calculated)",
  ],
  goesGoodWith: ["vwap", "svp", "vrvp"],
  summary: "High-definition session profiles with auto-adjusting detail.",
  commonSettings: "All sessions, 70% VA.",
  bestConditions: "Multi-timeframe analysis.",
};

export const PVP_DOCS: IndicatorDocs = {
  definition: "Periodic Volume Profile creates profiles for each custom period (weekly, monthly, etc).",
  explanation: "Similar to SVP but with flexible period definition. Good for higher timeframe position trading.",
  calculations: "Same LTF table as SVP. 6000 row limit. Year boundary alignment.",
  takeaways: [
    "Weekly/monthly profiles for positions",
    "Customizable period multiplier",
    "Good for swing trading",
  ],
  whatToLookFor: [
    "Weekly POC levels",
    "Monthly Value Areas",
    "Period transitions",
  ],
  limitations: [
    "Max 6000 total rows",
    "Year boundary resets",
  ],
  goesGoodWith: ["vwap", "svp"],
  summary: "Periodic volume profiles with customizable timeframes.",
  commonSettings: "1 Week period, 24 rows.",
  bestConditions: "Swing and position trading.",
};

// ============================================================================
// Documentation Map
// ============================================================================

export const INDICATOR_DOCS: Record<string, IndicatorDocs> = {
  // Moving Averages
  sma: SMA_DOCS,
  ema: EMA_DOCS,
  smma: SMMA_DOCS,
  wma: WMA_DOCS,
  dema: DEMA_DOCS,
  tema: TEMA_DOCS,
  hma: HMA_DOCS,
  kama: KAMA_DOCS,
  vwma: VWMA_DOCS,
  mcginley: MCGINLEY_DOCS,
  alma: ALMA_DOCS,
  lsma: LSMA_DOCS,
  maribbon: MARIBBON_DOCS,
  maribbon4: MARIBBON4_DOCS,
  
  // Trend
  psar: PSAR_DOCS,
  sar: PSAR_DOCS,  // Alias - manifest uses "sar", aliases to psar docs
  supertrend: SUPERTREND_DOCS,
  ichimoku: ICHIMOKU_DOCS,
  adx: ADX_DOCS,
  dmi: DMI_DOCS,
  vortex: VORTEX_DOCS,
  aroon: AROON_DOCS,
  aroonosc: AROONOSC_DOCS,
  williamsAlligator: WILLIAMS_ALLIGATOR_DOCS,
  williamsFractals: WILLIAMS_FRACTALS_DOCS,
  
  // Momentum
  rsi: RSI_DOCS,
  macd: MACD_DOCS,
  stoch: STOCH_DOCS,
  stochrsi: STOCHRSI_DOCS,
  cci: CCI_DOCS,
  roc: ROC_DOCS,
  mom: MOM_DOCS,
  willr: WILLR_DOCS,
  ao: AO_DOCS,
  fisher: FISHER_DOCS,
  trix: TRIX_DOCS,
  tsi: TSI_DOCS,
  smii: SMII_DOCS,
  smio: SMIO_DOCS,
  coppock: COPPOCK_DOCS,
  cmo: CMO_DOCS,
  uo: UO_DOCS,
  rsiDivergence: RSI_DIVERGENCE_DOCS,
  knoxvilleDivergence: KNOXVILLE_DIVERGENCE_DOCS,
  
  // Volatility
  bb: BB_DOCS,
  atr: ATR_DOCS,
  dc: DC_DOCS,
  kc: KC_DOCS,
  vstop: VSTOP_DOCS,
  chop: CHOP_DOCS,
  hv: HV_DOCS,
  bbw: BBW_DOCS,
  bbtrend: BBTREND_DOCS,
  ulcer: ULCER_DOCS,
  
  // Volume
  vwap: VWAP_DOCS,
  avwap: AVWAP_DOCS,
  obv: OBV_DOCS,
  mfi: MFI_DOCS,
  cmf: CMF_DOCS,
  pvt: PVT_DOCS,
  pvi: PVI_DOCS,
  nvi: NVI_DOCS,
  relvol: RELVOL_DOCS,
  klinger: KLINGER_DOCS,
  volumeDelta: VOLUME_DELTA_DOCS,
  cvd: CVD_DOCS,
  cvi: CVI_DOCS,
  
  // Support/Resistance
  pivotPointsStandard: PIVOT_POINTS_STANDARD_DOCS,
  pivotPointsHighLow: PIVOT_POINTS_HIGH_LOW_DOCS,
  zigzag: ZIGZAG_DOCS,
  autoFib: AUTO_FIB_DOCS,
  
  // Envelope
  env: ENV_DOCS,
  
  // Median & Regression
  median: MEDIAN_DOCS,
  linreg: LINREG_DOCS,
  
  // Breadth Indicators
  adrb: ADRB_DOCS,
  adr: ADR_DOCS,
  adl: ADL_DOCS,
  
  // Volume Profiles
  vrvp: VRVP_DOCS,
  vpfr: VPFR_DOCS,
  aavp: AAVP_DOCS,
  svp: SVP_DOCS,
  svphd: SVPHD_DOCS,
  pvp: PVP_DOCS,
};

/**
 * Get documentation for an indicator by ID
 */
export function getIndicatorDocs(indicatorId: string): IndicatorDocs | undefined {
  return INDICATOR_DOCS[indicatorId];
}
