import json
import unittest
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class TemplateParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.stack=[]
    def handle_starttag(self,tag,attrs):
        if tag not in ('input','image','icon','import','include','checkbox','radio','switch','slider','progress'):
            self.stack.append(tag)
    def handle_startendtag(self,tag,attrs): pass
    def handle_endtag(self,tag):
        if not self.stack or self.stack[-1]!=tag:
            raise AssertionError(f'Unexpected closing {tag}, open={self.stack[-4:]}')
        self.stack.pop()
class UiStructureTest(unittest.TestCase):
    def test_all_route_and_component_templates_have_balanced_structure(self):
        app=json.loads((ROOT/'app.json').read_text(encoding='utf-8'))
        templates=[ROOT/(route+'.wxml') for route in app['pages']]
        templates += list((ROOT/'components').glob('*/*.wxml')) + list((ROOT/'templates').glob('*.wxml'))
        for path in templates:
            with self.subTest(template=str(path.relative_to(ROOT))):
                parser=TemplateParser();parser.feed(path.read_text(encoding='utf-8'));parser.close()
                self.assertEqual([],parser.stack)
    def test_migration_manifest_matches_every_script(self):
        import hashlib
        manifest=json.loads((ROOT/'backend/db/migration-manifest.json').read_text(encoding='utf-8'))
        self.assertIn('V3__meal_workflow',[row['version'] for row in manifest['migrations']])
        for row in manifest['migrations']:
            self.assertEqual(row['checksumSha256'],hashlib.sha256((ROOT/'backend/db/migrations'/row['file']).read_bytes().replace(b'\r\n',b'\n')).hexdigest())
if __name__=='__main__':unittest.main()
