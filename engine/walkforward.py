import pandas as pd
from .optimize import grid


def walk_forward(df, bars, param_grid, train_months=12, test_months=3, objective_fn=None):
# Dela in på rullande fönster
results = []
start = bars.index.min().normalize()
end = bars.index.max().normalize()


cur = start
while True:
train_end = (cur + pd.DateOffset(months=train_months))
test_end = (train_end + pd.DateOffset(months=test_months))
if test_end > end:
break
train_mask = (bars.index > cur) & (bars.index <= train_end)
test_mask = (bars.index > train_end) & (bars.index <= test_end)


best_score, best_params = None, None
for p in grid(param_grid):
score = objective_fn(p, train_mask)
if (best_score is None) or (score > best_score):
best_score, best_params = score, p
# Validera på test
test_score = objective_fn(best_params, test_mask)
results.append({
"train_start": cur, "train_end": train_end,
"test_end": test_end, "best_params": best_params,
"train_score": best_score, "test_score": test_score,
})
cur = cur + pd.DateOffset(months=test_months)
return pd.DataFrame(results)