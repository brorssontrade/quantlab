#!/usr/bin/env python3
"""Debug HV calculation"""
import math

# Last 15 closes from META.US Daily (actual from verify script)
closes = [
    632.72, 637.67, 628.74, 636.2, 637.0,     # Jan 16-22
    658.76, 672.36, 672.97, 668.73, 738.31,   # Jan 23-29
    716.5, 706.41, 691.7, 668.99, 670.21      # Jan 30 - Feb 5
]

# Calculate log returns
log_returns = []
for i in range(1, len(closes)):
    log_returns.append(math.log(closes[i] / closes[i-1]))

print("Log returns:", [f"{r:.6f}" for r in log_returns])

# HV(10) uses last 10 log returns
window = log_returns[-10:]
print(f"Window (last 10): {[f'{r:.6f}' for r in window]}")

# Mean
mean = sum(window) / 10
print(f"Mean: {mean:.8f}")

# Sample variance (N-1)
sum_sq = sum((r - mean)**2 for r in window)
variance = sum_sq / 9
stdev = math.sqrt(variance)
print(f"Stdev: {stdev:.8f}")

# Annualize with 329
hv329 = 100 * stdev * math.sqrt(329)
hv252 = 100 * stdev * math.sqrt(252)
print(f"\nHV(10) with 329: {hv329:.4f}")
print(f"HV(10) with 252: {hv252:.4f}")
