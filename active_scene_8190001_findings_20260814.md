# Active Scene 8190001 Findings

The public saved-design payload confirms that the live Aspin kitchen persists its range, hood, and refrigerator as actual appliance placements, rather than legacy base-cabinet fallbacks. The range is `RANGE-30` at `(x: 0, y: 45)` with a 90-degree rotation, the hood is `HOOD-30` at `(x: 3.5, y: 45)` with a 90-degree rotation and a 66-inch mount bottom, and the refrigerator is `FRIDGE-36` at `(x: 0.75, y: 108)` with a 90-degree rotation. The design also carries the refrigerator-wall cabinet `WR3624` and a 96-inch refrigerator end panel.

The floor run includes CDB36, DB-18-3, SB-36, DB-30-3, and B-33 base records, all saved at 34.5 inches high. These records establish the real persisted scene to use for 4.5-inch toe-kick and appliance-alignment regression coverage; any remaining live mismatch is therefore in the shared transform or mesh construction, not in absent 2D placement data.
