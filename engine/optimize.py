import itertools
import optuna


# Grid search över angivna parameterintervall


def grid(param_grid: dict):
keys = list(param_grid.keys())
for values in itertools.product(*param_grid.values()):
yield dict(zip(keys, values))


# Optuna-exempel (Bayes)


def bayes_opt(objective_fn, param_space: dict, n_trials: int = 50):
def suggest(trial):
params = {}
for k, v in param_space.items():
if isinstance(v, list) and all(isinstance(x, (int, float)) for x in v):
lo, hi = min(v), max(v)
if any(isinstance(x, float) for x in v):
params[k] = trial.suggest_float(k, lo, hi)
else:
params[k] = trial.suggest_int(k, lo, hi)
else:
params[k] = trial.suggest_categorical(k, v)
return params


def _obj(trial):
params = suggest(trial)
return objective_fn(params)


study = optuna.create_study(direction="maximize")
study.optimize(_obj, n_trials=n_trials)
return study.best_params, study.best_value