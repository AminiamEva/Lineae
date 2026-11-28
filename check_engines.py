import json
engines = {}
with open('/root/aminiam/lineae/corpus/manifest/manifest.jsonl') as f:
    for line in f:
        item = json.loads(line)
        eng = item.get('engine', 'unknown')
        engines[eng] = engines.get(eng, 0) + 1
print('By engine:', engines)
print('Total:', sum(engines.values()))