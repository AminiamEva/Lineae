import json
count = 0
with open('/root/aminiam/lineae/corpus/manifest/manifest.jsonl') as f:
    for line in f:
        item = json.loads(line)
        if item.get('engine') == 'pdflatex' and count < 5:
            print(json.dumps({k: v for k, v in item.items() if k != 'files'}, indent=2))
            print('---')
            count += 1