from __future__ import annotations

import math
from typing import Any


def _mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _std(values: list[float], center: float) -> float:
    if not values:
        return 1.0
    variance = sum((value - center) ** 2 for value in values) / len(values)
    return max(math.sqrt(variance), 1e-9)


def _normalize_vector(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm <= 1e-12:
        return [0.0 for _ in vector]
    return [value / norm for value in vector]


def _mat_vec(matrix: list[list[float]], vector: list[float]) -> list[float]:
    return [sum(row[i] * vector[i] for i in range(len(vector))) for row in matrix]


def _dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _power_iteration(covariance: list[list[float]], rounds: int = 72) -> tuple[list[float], float]:
    dimension = len(covariance)
    seed = [math.sin((i + 1) * 1.618) for i in range(dimension)]
    vector = _normalize_vector(seed)

    for _ in range(rounds):
        next_vector = _mat_vec(covariance, vector)
        vector = _normalize_vector(next_vector)

    projected = _mat_vec(covariance, vector)
    eigenvalue = _dot(vector, projected)
    return vector, eigenvalue


def _deflate(matrix: list[list[float]], vector: list[float], eigenvalue: float) -> list[list[float]]:
    size = len(matrix)
    updated = [[0.0] * size for _ in range(size)]
    for i in range(size):
        for j in range(size):
            updated[i][j] = matrix[i][j] - eigenvalue * vector[i] * vector[j]
    return updated


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def build_probability_embedding(
    rows: list[dict[str, Any]],
    components: int = 3,
    window: int = 5,
) -> list[dict[str, Any]]:
    if not rows:
        return []

    market_values = [_to_float(row.get("market_prob")) for row in rows]
    precognition_values = [_to_float(row.get("precognition_prob")) for row in rows]
    divergence_values = [_to_float(row.get("divergence")) for row in rows]
    confidence_values = [_to_float(row.get("confidence")) for row in rows]

    feature_rows: list[list[float]] = []
    total = len(rows)
    for idx in range(total):
        market = market_values[idx]
        precognition = precognition_values[idx]
        divergence = divergence_values[idx]
        confidence = confidence_values[idx]

        prev_market = market_values[idx - 1] if idx > 0 else market
        prev_precognition = precognition_values[idx - 1] if idx > 0 else precognition
        prev_divergence = divergence_values[idx - 1] if idx > 0 else divergence

        left = max(0, idx - window + 1)
        market_window = market_values[left : idx + 1]
        precognition_window = precognition_values[left : idx + 1]
        divergence_window = divergence_values[left : idx + 1]
        confidence_window = confidence_values[left : idx + 1]

        t_norm = idx / max(1, total - 1)
        phase = t_norm * math.pi * 2.0
        feature_rows.append(
            [
                market,
                precognition,
                divergence,
                confidence,
                market - prev_market,
                precognition - prev_precognition,
                divergence - prev_divergence,
                _mean(market_window),
                _mean(precognition_window),
                _mean(divergence_window),
                _mean(confidence_window),
                math.sin(phase),
                math.cos(phase),
                t_norm,
            ]
        )

    feature_dimension = len(feature_rows[0])
    means = [_mean([row[i] for row in feature_rows]) for i in range(feature_dimension)]
    stds = [_std([row[i] for row in feature_rows], means[i]) for i in range(feature_dimension)]

    normalized: list[list[float]] = []
    for row in feature_rows:
        normalized.append([(row[i] - means[i]) / stds[i] for i in range(feature_dimension)])

    covariance = [[0.0] * feature_dimension for _ in range(feature_dimension)]
    denom = max(1, len(normalized) - 1)
    for i in range(feature_dimension):
        for j in range(feature_dimension):
            covariance[i][j] = sum(row[i] * row[j] for row in normalized) / denom

    effective_components = max(1, min(components, feature_dimension))
    basis: list[list[float]] = []
    working = [row[:] for row in covariance]
    for _ in range(effective_components):
        vector, eigenvalue = _power_iteration(working)
        if abs(eigenvalue) < 1e-8:
            break
        basis.append(vector)
        working = _deflate(working, vector, eigenvalue)

    while len(basis) < effective_components:
        unit = [0.0] * feature_dimension
        unit[len(basis)] = 1.0
        basis.append(unit)

    coordinates = [[_dot(row, axis) for axis in basis] for row in normalized]
    for axis_idx in range(effective_components):
        axis_max = max(abs(point[axis_idx]) for point in coordinates) if coordinates else 1.0
        axis_scale = axis_max if axis_max > 1e-9 else 1.0
        for point in coordinates:
            point[axis_idx] = point[axis_idx] / axis_scale

    result: list[dict[str, Any]] = []
    for idx, row in enumerate(rows):
        embedding = coordinates[idx]
        padded_embedding = embedding + [0.0] * max(0, 3 - len(embedding))
        result.append(
            {
                "snapshot_time": row.get("snapshot_time"),
                "market_prob": _to_float(row.get("market_prob")),
                "precognition_prob": _to_float(row.get("precognition_prob")),
                "divergence": _to_float(row.get("divergence")),
                "confidence": _to_float(row.get("confidence")),
                "embedding": padded_embedding[:effective_components],
                "x": padded_embedding[0],
                "y": padded_embedding[1],
                "z": padded_embedding[2],
                "index": idx,
            }
        )
    return result
