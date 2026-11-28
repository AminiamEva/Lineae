import json, sys
d = json.load(sys.stdin)
items = list(d.values()) if isinstance(d, dict) else d
engines = {}
for i in items:
    eng = i.get("engine", "unknown")
    engines[eng] = engines.get(eng, 0) + 1
print("By engine:", engines)
print("Total:", len(items))