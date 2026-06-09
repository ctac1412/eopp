"""Common ranking helpers for solver outputs."""

from __future__ import annotations

from typing import Any


def sort_results(results: list[dict[str, Any]], reverse: bool = False) -> list[dict[str, Any]]:
    """Sort solver results by score, best first."""
    return sorted(results, key=lambda item: item["score"], reverse=reverse)


def assign_ranks(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return result copies with a 1-based rank field."""
    return [
        {
            **result,
            "rank": rank,
        }
        for rank, result in enumerate(sort_results(results), 1)
    ]


def top_variants(results: list[dict[str, Any]], limit: int = 3) -> list[int]:
    """Return top variant indexes from sorted solver results."""
    return [int(result["variant"]) for result in sort_results(results)[:limit]]
