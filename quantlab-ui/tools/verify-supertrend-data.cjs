// Quick script to verify Supertrend data structure
// Run with: node tools/verify-supertrend-data.cjs

// Simulated compute logic (copy from compute.ts)
function computeSupertrend(data, atrLength = 10, factor = 3.0) {
  const up = [];
  const down = [];
  
  if (data.length === 0) {
    return { up, down };
  }

  // Calculate True Range
  const tr = [];
  tr.push(data[0].high - data[0].low);
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trueRange);
  }

  // Calculate ATR using Wilder's RMA
  const atr = new Array(data.length).fill(NaN);
  
  if (data.length >= atrLength) {
    let atrSum = 0;
    for (let i = 0; i < atrLength; i++) {
      atrSum += tr[i];
    }
    atr[atrLength - 1] = atrSum / atrLength;
    
    for (let i = atrLength; i < data.length; i++) {
      const prevAtr = atr[i - 1];
      atr[i] = (prevAtr * (atrLength - 1) + tr[i]) / atrLength;
    }
  }

  let prevFinalUpperBand = 0;
  let prevFinalLowerBand = 0;
  let prevSupertrend = 0;
  let isUptrend = true;
  const startIdx = atrLength - 1;

  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    
    if (i < startIdx || !Number.isFinite(atr[i])) {
      up.push({ time: bar.time, value: NaN });
      down.push({ time: bar.time, value: NaN });
      continue;
    }
    
    const currentAtr = atr[i];
    const hl2 = (bar.high + bar.low) / 2;
    const basicUpperBand = hl2 + (factor * currentAtr);
    const basicLowerBand = hl2 - (factor * currentAtr);
    
    let finalUpperBand;
    let finalLowerBand;
    
    if (i === startIdx) {
      finalUpperBand = basicUpperBand;
      finalLowerBand = basicLowerBand;
      isUptrend = bar.close >= hl2;
      prevSupertrend = isUptrend ? finalLowerBand : finalUpperBand;
    } else {
      const prevClose = data[i - 1].close;
      
      if (basicUpperBand < prevFinalUpperBand || prevClose > prevFinalUpperBand) {
        finalUpperBand = basicUpperBand;
      } else {
        finalUpperBand = prevFinalUpperBand;
      }
      
      if (basicLowerBand > prevFinalLowerBand || prevClose < prevFinalLowerBand) {
        finalLowerBand = basicLowerBand;
      } else {
        finalLowerBand = prevFinalLowerBand;
      }
      
      if (prevSupertrend === prevFinalUpperBand) {
        if (bar.close > finalUpperBand) {
          isUptrend = true;
        } else {
          isUptrend = false;
        }
      } else {
        if (bar.close < finalLowerBand) {
          isUptrend = false;
        } else {
          isUptrend = true;
        }
      }
    }
    
    const supertrend = isUptrend ? finalLowerBand : finalUpperBand;
    const safeValue = Number.isFinite(supertrend) ? supertrend : prevSupertrend;
    
    if (isUptrend) {
      up.push({ time: bar.time, value: safeValue });
      down.push({ time: bar.time, value: NaN });
    } else {
      up.push({ time: bar.time, value: NaN });
      down.push({ time: bar.time, value: safeValue });
    }
    
    prevFinalUpperBand = finalUpperBand;
    prevFinalLowerBand = finalLowerBand;
    prevSupertrend = supertrend;
  }

  return { up, down };
}

// Generate sample OHLC data
const data = [];
let price = 100;
for (let i = 0; i < 50; i++) {
  const change = (Math.random() - 0.5) * 4;
  const open = price;
  const close = price + change;
  const high = Math.max(open, close) + Math.random() * 2;
  const low = Math.min(open, close) - Math.random() * 2;
  data.push({
    time: 1700000000 + i * 3600,
    open,
    high,
    low,
    close,
  });
  price = close;
}

const result = computeSupertrend(data, 10, 3.0);

// Convert to WhitespaceData
const upValues = result.up.map(pt => 
  Number.isFinite(pt.value) ? { time: pt.time, value: pt.value } : { time: pt.time }
);
const downValues = result.down.map(pt => 
  Number.isFinite(pt.value) ? { time: pt.time, value: pt.value } : { time: pt.time }
);

// Verify XOR property
console.log("\n=== Supertrend Data Verification ===\n");

let xorViolations = 0;
let bothNaN = 0;
let upOnly = 0;
let downOnly = 0;

for (let i = 0; i < upValues.length; i++) {
  const upHasValue = 'value' in upValues[i];
  const downHasValue = 'value' in downValues[i];
  
  if (upHasValue && downHasValue) {
    xorViolations++;
    console.log(`VIOLATION at ${i}: Both have values!`);
  } else if (!upHasValue && !downHasValue) {
    bothNaN++;
  } else if (upHasValue) {
    upOnly++;
  } else {
    downOnly++;
  }
}

console.log(`Total bars: ${upValues.length}`);
console.log(`XOR violations (both have value): ${xorViolations}`);
console.log(`Both whitespace (warmup): ${bothNaN}`);
console.log(`Up only (uptrend): ${upOnly}`);
console.log(`Down only (downtrend): ${downOnly}`);
console.log(`Sum (should equal total): ${bothNaN + upOnly + downOnly}`);

// Show a few sample points
console.log("\n=== Sample Data (bars 8-15) ===\n");
for (let i = 8; i < 16 && i < upValues.length; i++) {
  const upStr = 'value' in upValues[i] ? upValues[i].value.toFixed(2) : '---';
  const downStr = 'value' in downValues[i] ? downValues[i].value.toFixed(2) : '---';
  console.log(`Bar ${i}: up=${upStr}, down=${downStr}`);
}

// Check for NaN values that slipped through
const badUp = upValues.filter(pt => 'value' in pt && !Number.isFinite(pt.value));
const badDown = downValues.filter(pt => 'value' in pt && !Number.isFinite(pt.value));
console.log(`\nBad up values (NaN): ${badUp.length}`);
console.log(`Bad down values (NaN): ${badDown.length}`);

if (xorViolations === 0 && badUp.length === 0 && badDown.length === 0) {
  console.log("\n✅ Data structure is correct for TV-style rendering!");
} else {
  console.log("\n❌ Data has issues that need fixing!");
}
