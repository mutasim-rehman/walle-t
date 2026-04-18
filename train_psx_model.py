"""
Train a directional next-day model on PSX historical CSV.

Split (by trading calendar, chronological):
  65% earliest dates -> training
  next 15% -> validation (tuning)
  remaining 20% -> held-out test

Rows are only kept in a split if both the row date and the next trading day
(for that symbol) fall in the same split, so the next-day target does not leak
across boundaries.

Task:
  Binary classification on next-trading-day direction:
    target_up = 1 if next day return > 0 else 0
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Set, Tuple

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler


def parse_volume(s: pd.Series) -> pd.Series:
    s = s.astype(str).str.replace(",", "", regex=False).str.strip()
    s = s.replace({"": np.nan, "nan": np.nan})
    return pd.to_numeric(s, errors="coerce")


def parse_change_pct(s: pd.Series) -> pd.Series:
    s = s.astype(str).str.replace("%", "", regex=False).str.strip()
    return pd.to_numeric(s, errors="coerce")


def load_and_features(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path, low_memory=False)
    df["query_date"] = pd.to_datetime(df["query_date"])

    for col in ("ldcp", "open", "high", "low", "close", "change"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["volume"] = parse_volume(df["volume"])
    if "change_pct" in df.columns:
        df["change_pct_num"] = parse_change_pct(df["change_pct"])
    else:
        df["change_pct_num"] = np.nan

    # Drop unusable rows
    df = df.loc[np.isfinite(df["close"]) & (df["close"] > 0)].copy()
    df = df.dropna(subset=["open", "high", "low", "close", "symbol"]).copy()

    df = df.sort_values(["symbol", "query_date"]).copy()

    g = df.groupby("symbol", sort=False)
    df["next_close"] = g["close"].shift(-1)
    df["next_date"] = g["query_date"].shift(-1)

    df["target_return"] = (df["next_close"] - df["close"]) / df["close"]
    df = df.loc[np.isfinite(df["target_return"]) & df["next_date"].notna()].copy()
    df["target_up"] = (df["target_return"] > 0).astype(int)

    open_safe = df["open"].replace(0, np.nan)
    g = df.groupby("symbol", sort=False)
    close = g["close"]
    volume = g["volume"]

    # Core relative and technical features for a global model across symbols.
    sma_10 = close.transform(lambda s: s.rolling(10, min_periods=10).mean())
    sma_20 = close.transform(lambda s: s.rolling(20, min_periods=20).mean())
    sma_50 = close.transform(lambda s: s.rolling(50, min_periods=50).mean())
    ema_10 = close.transform(lambda s: s.ewm(span=10, adjust=False).mean())
    ema_20 = close.transform(lambda s: s.ewm(span=20, adjust=False).mean())
    ema_12 = close.transform(lambda s: s.ewm(span=12, adjust=False).mean())
    ema_26 = close.transform(lambda s: s.ewm(span=26, adjust=False).mean())
    macd = ema_12 - ema_26
    macd_signal = macd.groupby(df["symbol"]).transform(
        lambda s: s.ewm(span=9, adjust=False).mean()
    )

    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.groupby(df["symbol"]).transform(
        lambda s: s.rolling(14, min_periods=14).mean()
    )
    avg_loss = loss.groupby(df["symbol"]).transform(
        lambda s: s.rolling(14, min_periods=14).mean()
    )
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi_14 = 100 - (100 / (1 + rs))

    df = df.assign(
        hl_range=(df["high"] - df["low"]) / df["close"],
        oc_range=(df["close"] - df["open"]) / open_safe,
        log_volume=np.log1p(df["volume"].clip(lower=0)),
        ret_1=g["close"].pct_change(1),
        ret_3=g["close"].pct_change(3),
        ret_5=g["close"].pct_change(5),
        vol_5=g["target_return"].shift(1).rolling(5, min_periods=5).std(),
        vol_10=g["target_return"].shift(1).rolling(10, min_periods=10).std(),
        vol_14=g["target_return"].shift(1).rolling(14, min_periods=14).std(),
        sma_10=sma_10,
        sma_20=sma_20,
        sma_50=sma_50,
        ema_10=ema_10,
        ema_20=ema_20,
        rsi_14=rsi_14,
        macd=macd,
        macd_signal=macd_signal,
        macd_hist=macd - macd_signal,
        volume_ma_10=volume.transform(lambda s: s.rolling(10, min_periods=10).mean()),
    )
    df["close_vs_ldcp"] = (df["close"] - df["ldcp"]) / df["ldcp"].replace(0, np.nan)
    df["close_vs_sma10"] = (df["close"] - df["sma_10"]) / df["sma_10"].replace(0, np.nan)
    df["close_vs_sma20"] = (df["close"] - df["sma_20"]) / df["sma_20"].replace(0, np.nan)
    df["close_vs_sma50"] = (df["close"] - df["sma_50"]) / df["sma_50"].replace(0, np.nan)
    df["volume_ratio_10"] = df["volume"] / df["volume_ma_10"].replace(0, np.nan)
    df["ema_gap_10_20"] = (df["ema_10"] - df["ema_20"]) / df["ema_20"].replace(0, np.nan)
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna(
        subset=[
            "hl_range",
            "oc_range",
            "log_volume",
            "ret_1",
            "ret_3",
            "ret_5",
            "vol_5",
            "vol_10",
            "vol_14",
            "close_vs_sma10",
            "close_vs_sma20",
            "close_vs_sma50",
            "volume_ratio_10",
            "ema_gap_10_20",
            "rsi_14",
            "macd",
            "macd_signal",
            "macd_hist",
            "close_vs_ldcp",
            "target_up",
        ]
    ).copy()

    return df


def date_splits(
    unique_dates: np.ndarray, train_ratio: float, val_ratio: float
) -> Tuple[Set[pd.Timestamp], Set[pd.Timestamp], Set[pd.Timestamp]]:
    n = len(unique_dates)
    i_train = int(train_ratio * n)
    i_val = int((train_ratio + val_ratio) * n)
    i_train = max(1, min(i_train, n - 2))
    i_val = max(i_train + 1, min(i_val, n - 1))

    train_dates = set(unique_dates[:i_train])
    val_dates = set(unique_dates[i_train:i_val])
    test_dates = set(unique_dates[i_val:])
    return train_dates, val_dates, test_dates


def mask_same_split(
    dates: pd.Series,
    next_dates: pd.Series,
    allowed: Set[pd.Timestamp],
) -> pd.Series:
    return dates.dt.normalize().isin(allowed) & next_dates.dt.normalize().isin(allowed)


def numeric_feature_cols() -> list[str]:
    return [
        "ldcp",
        "open",
        "high",
        "low",
        "close",
        "change",
        "change_pct_num",
        "volume",
        "log_volume",
        "hl_range",
        "oc_range",
        "ret_1",
        "ret_3",
        "ret_5",
        "vol_5",
        "vol_10",
        "vol_14",
        "close_vs_ldcp",
        "close_vs_sma10",
        "close_vs_sma20",
        "close_vs_sma50",
        "volume_ratio_10",
        "ema_gap_10_20",
        "rsi_14",
        "macd",
        "macd_signal",
        "macd_hist",
    ]


def build_tree_pipeline() -> Pipeline:
    numeric = [
        *numeric_feature_cols(),
    ]
    categorical = ["symbol"]

    pre = ColumnTransformer(
        [
            ("num", StandardScaler(), numeric),
            ("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1), categorical),
        ],
        remainder="drop",
    )

    model = HistGradientBoostingClassifier(
        max_iter=350,
        learning_rate=0.05,
        max_depth=8,
        min_samples_leaf=80,
        l2_regularization=1e-3,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=25,
        random_state=42,
    )
    return Pipeline([("prep", pre), ("clf", model)])


def build_logistic_pipeline() -> Pipeline:
    numeric = [*numeric_feature_cols()]
    categorical = ["symbol"]

    pre = ColumnTransformer(
        [
            ("num", StandardScaler(), numeric),
            ("cat", OneHotEncoder(handle_unknown="ignore"), categorical),
        ],
        remainder="drop",
    )
    model = LogisticRegression(
        max_iter=1200,
        class_weight="balanced",
        solver="saga",
        n_jobs=-1,
        random_state=42,
    )
    return Pipeline([("prep", pre), ("clf", model)])


def tune_threshold(
    y_true: pd.Series,
    y_prob: np.ndarray,
    objective: str = "balanced_accuracy",
) -> tuple[float, float]:
    y_true_np = y_true.to_numpy()
    best_t = 0.5
    best_score = -1.0

    for t in np.linspace(0.30, 0.70, 81):
        y_pred = (y_prob >= t).astype(int)
        if objective == "f1":
            score = f1_score(y_true_np, y_pred, zero_division=0)
        else:
            score = balanced_accuracy_score(y_true_np, y_pred)
        if score > best_score:
            best_score = score
            best_t = float(t)
    return best_t, float(best_score)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, default=Path("psx_5years.csv"))
    parser.add_argument("--train-ratio", type=float, default=0.65)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.20)
    parser.add_argument("--sample-rows", type=int, default=0, help="If >0, use random subset for quick runs.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--threshold-objective",
        choices=["balanced_accuracy", "f1"],
        default="balanced_accuracy",
        help="Metric to optimize on validation split for probability threshold.",
    )
    args = parser.parse_args()

    if abs(args.train_ratio + args.val_ratio + args.test_ratio - 1.0) > 1e-6:
        print("train + val + test ratios must sum to 1.0", file=sys.stderr)
        sys.exit(1)

    df = load_and_features(args.csv)
    if args.sample_rows > 0 and args.sample_rows < len(df):
        df = df.sample(n=args.sample_rows, random_state=args.seed).copy()

    unique_dates = np.sort(df["query_date"].unique())
    train_dates, val_dates, test_dates = date_splits(
        unique_dates, args.train_ratio, args.val_ratio
    )

    mt = mask_same_split(df["query_date"], df["next_date"], train_dates)
    mv = mask_same_split(df["query_date"], df["next_date"], val_dates)
    mtest = mask_same_split(df["query_date"], df["next_date"], test_dates)

    feature_cols = [
        "symbol",
        *numeric_feature_cols(),
    ]

    X_train = df.loc[mt, feature_cols]
    y_train = df.loc[mt, "target_up"]
    X_val = df.loc[mv, feature_cols]
    y_val = df.loc[mv, "target_up"]
    X_test = df.loc[mtest, feature_cols]
    y_test = df.loc[mtest, "target_up"]

    print(
        "Date ranges:",
        f"all {pd.to_datetime(unique_dates[0]).date()} .. {pd.to_datetime(unique_dates[-1]).date()}",
        f"| train days {len(train_dates)} | val days {len(val_dates)} | test days {len(test_dates)}",
    )
    print(
        "Rows (strict same-split):",
        f"train {len(X_train)} | val {len(X_val)} | test {len(X_test)}",
    )

    if len(X_train) < 1000 or len(X_val) < 100 or len(X_test) < 100:
        print("Not enough rows in one of the splits; check CSV or ratios.", file=sys.stderr)
        sys.exit(1)

    def report(name: str, y_true: pd.Series, y_prob: np.ndarray, threshold: float) -> dict:
        y_pred = (y_prob >= threshold).astype(int)
        acc = accuracy_score(y_true, y_pred)
        bacc = balanced_accuracy_score(y_true, y_pred)
        prec = precision_score(y_true, y_pred, zero_division=0)
        rec = recall_score(y_true, y_pred, zero_division=0)
        f1 = f1_score(y_true, y_pred, zero_division=0)
        auc = roc_auc_score(y_true, y_prob) if len(np.unique(y_true)) > 1 else float("nan")

        base_up = int(np.round(y_true.mean()))
        base_pred = np.full(len(y_true), base_up, dtype=int)
        base_acc = accuracy_score(y_true, base_pred)

        print(f"\n{name}")
        print(f"  Threshold:         {threshold:.3f}")
        print(f"  Accuracy:          {acc:.4f}")
        print(f"  Balanced accuracy: {bacc:.4f}")
        print(f"  Precision (up):    {prec:.4f}")
        print(f"  Recall (up):       {rec:.4f}")
        print(f"  F1 (up):           {f1:.4f}")
        print(f"  ROC AUC:           {auc:.4f}")
        print(f"  Baseline accuracy: {base_acc:.4f}")
        print(f"  Positive rate:     {y_true.mean():.4f}")
        return {
            "threshold": float(threshold),
            "accuracy": float(acc),
            "balanced_accuracy": float(bacc),
            "precision_up": float(prec),
            "recall_up": float(rec),
            "f1_up": float(f1),
            "roc_auc": float(auc),
            "baseline_accuracy": float(base_acc),
            "positive_rate": float(y_true.mean()),
        }

    def run_one_model(model_name: str, pipe: Pipeline) -> tuple[dict, dict, dict]:
        print(f"\n=== {model_name} ===")
        pipe.fit(X_train, y_train)
        y_val_prob = pipe.predict_proba(X_val)[:, 1]
        y_test_prob = pipe.predict_proba(X_test)[:, 1]
        best_t, best_obj = tune_threshold(
            y_true=y_val,
            y_prob=y_val_prob,
            objective=args.threshold_objective,
        )
        print(
            f"\nChosen threshold on validation: {best_t:.3f} "
            f"(objective={args.threshold_objective}, score={best_obj:.4f})"
        )
        val_metrics_local = report("Validation", y_val, y_val_prob, best_t)
        test_metrics_local = report("Test (held-out)", y_test, y_test_prob, best_t)
        tuning = {
            "objective": args.threshold_objective,
            "chosen_threshold": float(best_t),
            "validation_objective_score": float(best_obj),
        }
        return val_metrics_local, test_metrics_local, tuning

    log_val, log_test, log_tune = run_one_model("Logistic Baseline", build_logistic_pipeline())
    tree_val, tree_test, tree_tune = run_one_model(
        "HistGradientBoosting (Global Tree Model)", build_tree_pipeline()
    )

    if args.threshold_objective == "f1":
        log_score = log_val["f1_up"]
        tree_score = tree_val["f1_up"]
    else:
        log_score = log_val["balanced_accuracy"]
        tree_score = tree_val["balanced_accuracy"]

    best_model = "logistic_baseline" if log_score >= tree_score else "global_tree_model"
    print(f"\nSelected best model by validation {args.threshold_objective}: {best_model}")

    out = {
        "splits": {
            "train_ratio": args.train_ratio,
            "val_ratio": args.val_ratio,
            "test_ratio": args.test_ratio,
            "train_rows": int(len(X_train)),
            "val_rows": int(len(X_val)),
            "test_rows": int(len(X_test)),
            "date_start": str(pd.to_datetime(unique_dates[0]).date()),
            "date_end": str(pd.to_datetime(unique_dates[-1]).date()),
        },
        "metrics": {
            "logistic_baseline": {
                "val": log_val,
                "test": log_test,
                "threshold_tuning": log_tune,
            },
            "global_tree_model": {
                "val": tree_val,
                "test": tree_test,
                "threshold_tuning": tree_tune,
            },
        },
        "selected_best_model": best_model,
    }
    metrics_path = Path("psx_model_metrics.json")
    metrics_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\nMetrics written to {metrics_path}")


if __name__ == "__main__":
    main()
