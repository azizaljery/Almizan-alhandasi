"""Independent Draft202012 schema QA; jsonschema is a QA tool, not a runtime dependency."""
import sys, json, pathlib, importlib.metadata
from jsonschema import Draft202012Validator
root=pathlib.Path(__file__).resolve().parents[3]
schema=json.loads((root/'contracts/mizan-envelope-v1.schema.json').read_text())
Draft202012Validator.check_schema(schema)
v=Draft202012Validator(schema)
results=[]
for group in ['requests','candidates','reviews','decisions','negative']:
    for p in sorted((root/'fixtures'/group).glob('*.json')):
        errors=list(v.iter_errors(json.loads(p.read_text())))
        results.append({'file':str(p),'expectedValid':group!='negative','actualValid':not errors,'passed':bool(errors)==(group=='negative')})
for p in sorted(pathlib.Path(sys.argv[1]).glob('*.json')):
    if p.name=='RESULTS.json':continue
    errors=list(v.iter_errors(json.loads(p.read_text())))
    results.append({'file':str(p),'expectedValid':True,'actualValid':not errors,'passed':not errors,'errors':[e.message for e in errors]})
print(json.dumps({'validator':'jsonschema','version':importlib.metadata.version('jsonschema'),'passed':sum(x['passed'] for x in results),'failed':sum(not x['passed'] for x in results),'results':results},indent=2))
sys.exit(0 if all(x['passed'] for x in results) else 1)
