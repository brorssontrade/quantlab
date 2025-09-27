from __future__ import annotations
import math, time, json
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional, Tuple
import numpy as np
import pandas as pd
import typer
import torch
from torch import nn
from torch.utils.data import Dataset, DataLoader
from .features import FeatureConfig, build_ml_table

app = typer.Typer(add_completion=False)
RNG = 1337

@dataclass
class LSTMConfig:
    seq_len: int = 30
    hidden: int = 64
    layers: int = 1
    dropout: float = 0.1
    lr: float = 1e-3
    epochs: int = 10
    batch: int = 256
    task: str = "reg"  # "reg" eller "class"

class SeqDataset(Dataset):
    def __init__(self, df: pd.DataFrame, feat_cols: List[str], seq_len: int):
        self.seq_len = seq_len
        self.feats = df[feat_cols].to_numpy(np.float32)
        self.y = df["y"].to_numpy(np.float32)
        # Bygg sekvensindex per rad (enkelt “rolling window”)
        self.idxs = []
        for i in range(len(df)):
            if i - seq_len + 1 >= 0:
                self.idxs.append((i - seq_len + 1, i))
    def __len__(self): return len(self.idxs)
    def __getitem__(self, i):
        a, b = self.idxs[i]
        X = self.feats[a:b+1]   # [seq, feat]
        y = self.y[b]
        return torch.from_numpy(X), torch.tensor(y)

class LSTMRegressor(nn.Module):
    def __init__(self, in_dim: int, hidden: int, layers: int, dropout: float):
        super().__init__()
        self.lstm = nn.LSTM(in_dim, hidden, num_layers=layers, batch_first=True, dropout=dropout if layers>1 else 0.0)
        self.head = nn.Linear(hidden, 1)
    def forward(self, x):
        out, _ = self.lstm(x)           # [B, T, H]
        last = out[:, -1, :]            # [B, H]
        return self.head(last).squeeze(-1), last  # (pred, embedding)

@app.command()
def train(
    parquet: str = "storage/snapshots/breadth/symbols/latest.parquet",
    horizon: int = 5,
    label: str = "reg",  # "reg" för LSTM baseline
    seq_len: int = 30,
    hidden: int = 64,
    layers: int = 1,
    dropout: float = 0.1,
    lr: float = 1e-3,
    epochs: int = 10,
    batch: int = 256,
    out_model: str = "models/lstm_reg_5d.pt",
    out_embed: Optional[str] = "storage/signals/lstm_embed.parquet",
):
    torch.manual_seed(RNG)
    cfg = FeatureConfig(Path(parquet), horizon=horizon, label_type=label)
    df, feat_cols, _ = build_ml_table(cfg)

    ds = SeqDataset(df, feat_cols, seq_len)
    dl = DataLoader(ds, batch_size=batch, shuffle=True, drop_last=True)

    model = LSTMRegressor(in_dim=len(feat_cols), hidden=hidden, layers=layers, dropout=dropout)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()

    model.train()
    for ep in range(epochs):
        epoch_loss = 0.0
        for X, y in dl:
            opt.zero_grad()
            pred, _ = model(X)
            loss = loss_fn(pred, y)
            loss.backward()
            opt.step()
            epoch_loss += loss.item() * len(X)
        print(f"Epoch {ep+1}/{epochs}  loss={epoch_loss/len(ds):.6f}")

    Path(out_model).parent.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": model.state_dict(), "meta":{
        "features": feat_cols, "seq_len": seq_len, "horizon": horizon, "label": label
    }}, out_model)
    print(f"✓ Saved LSTM -> {out_model}")

    if out_embed:
        # Skriv ut embeddings för hela historiken (för Hybrid)
        model.eval()
        with torch.no_grad():
            embs = []
            # Gör sekvens-för-sekvens
            for i in range(len(df)):
                if i - seq_len + 1 < 0:
                    embs.append([np.nan]*hidden)
                else:
                    win = torch.from_numpy(df[feat_cols].to_numpy(np.float32)[i-seq_len+1:i+1]).unsqueeze(0)
                    _, e = model(win)
                    embs.append(e.squeeze(0).numpy().tolist())
        emb_df = df[["Ts","Symbol","Exchange","Price"]].copy()
        for j in range(hidden):
            emb_df[f"emb{j}"] = [row[j] if isinstance(row, list) else np.nan for row in embs]
        Path(out_embed).parent.mkdir(parents=True, exist_ok=True)
        emb_df.to_parquet(out_embed, index=False)
        print(f"✓ Wrote LSTM embeddings -> {out_embed}")

if __name__ == "__main__":
    app()
