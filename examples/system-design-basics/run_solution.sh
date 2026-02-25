#!/bin/bash
# Runs on every "Run" / "Submit" click

cd /usercode/FILESYSTEM

# Copy the solution state from the running simulation
cp card-game/solution.json ./solution.json 2>/dev/null

# Parse solution into human-readable format for AI grading
python3 parse_solution.py

# File propagation delay
sleep 1
