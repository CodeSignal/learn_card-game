#!/usr/bin/env python3
"""
Parses solution.json from the card game simulation into a human-readable
summary for AI grading.
"""

import json
import sys
import os

SOLUTION_FILE = "solution.json"
OUTPUT_FILE = "architecture_summary.txt"

METRIC_UNITS = {
    "latency": "ms",
    "throughput": "req/s",
    "reliability": "%",
    "monthlyCost": "$/mo",
}

METRIC_NAMES = {
    "latency": "Response Time",
    "throughput": "Throughput",
    "reliability": "Uptime",
    "monthlyCost": "Monthly Cost",
}


def parse_solution():
    if not os.path.exists(SOLUTION_FILE):
        msg = "No solution found. The student has not deployed any technologies."
        print(msg)
        with open(OUTPUT_FILE, "w") as f:
            f.write(msg + "\n")
        return

    with open(SOLUTION_FILE, "r") as f:
        try:
            state = json.load(f)
        except json.JSONDecodeError:
            msg = "Solution file is corrupted or empty."
            print(msg)
            with open(OUTPUT_FILE, "w") as f:
                f.write(msg + "\n")
            return

    lines = []

    # Scenario info
    lines.append(f"## Scenario: {state.get('scenarioId', 'unknown')}")
    lines.append(f"## Deck: {state.get('deckId', 'unknown')}")
    lines.append("")

    # Cards deployed
    cards = state.get("cardsOnBoard", [])
    lines.append(f"## Architecture ({len(cards)} technologies deployed)")
    if cards:
        for i, card_id in enumerate(cards, 1):
            lines.append(f"  {i}. {card_id}")
    else:
        lines.append("  (no technologies deployed)")
    lines.append("")

    # Metrics achieved
    lines.append("## Metrics Achieved")
    metrics = state.get("metrics", {})
    for key, data in metrics.items():
        name = METRIC_NAMES.get(key, key)
        unit = METRIC_UNITS.get(key, "")
        value = data.get("value", "?")
        base = data.get("base", "?")
        if isinstance(value, float):
            value = round(value, 1)
        lines.append(f"  {name}: {value} {unit} (base: {base} {unit})")
    lines.append("")

    # Goals
    goals_met = state.get("goalsMetCount", 0)
    total_goals = state.get("totalGoals", 0)
    all_met = state.get("allGoalsMet", False)
    lines.append(f"## Goals: {goals_met}/{total_goals} met {'(ALL GOALS MET)' if all_met else '(NOT ALL GOALS MET)'}")
    lines.append("")

    # Resources
    used = state.get("resourcesUsed", 0)
    total = state.get("totalResources", 0)
    lines.append(f"## Resources: {used}/{total} used ({total - used} remaining)")
    lines.append("")

    # Synergies
    synergies = state.get("synergiesTriggered", [])
    if synergies:
        lines.append(f"## Synergies Found ({len(synergies)})")
        for syn in synergies:
            cards_involved = " + ".join(syn.get("cards", []))
            reason = syn.get("reason", "")
            metric = syn.get("metric", "")
            bonus = syn.get("bonus", 0)
            lines.append(f"  - {cards_involved}: {reason} ({metric} {'+' if bonus > 0 else ''}{bonus})")
    else:
        lines.append("## Synergies: None found")
    lines.append("")

    output = "\n".join(lines)
    print(output)

    with open(OUTPUT_FILE, "w") as f:
        f.write(output)


if __name__ == "__main__":
    parse_solution()
