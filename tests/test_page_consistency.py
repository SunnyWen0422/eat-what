"""Guard actual page row geometry and typography against shared/native cascades."""
import unittest
from ui_source_audit import ROOT, Template, rules, styles


class PageConsistencyTest(unittest.TestCase):
    def style_for(self, page, handler):
        route = ROOT / 'pages' / page / page
        template = Template(route.with_suffix('.wxml').read_text(encoding='utf-8'))
        node = next(n for n in template.nodes if n.attrs.get('bindtap') == handler)
        return styles(node, rules(ROOT / 'app.wxss') + rules(route.with_suffix('.wxss')))

    def test_reading_rows_fill_the_available_page_width(self):
        cases = [('profile', 'onUserInfoTap'), ('profile', 'onMenuTap'),
                 ('assistant-history', 'onOpenSession'), ('calendar', 'onPurchaseRange'),
                 ('calendar-detail', 'onAdjustMeal'), ('shopping-list', 'onToggleDish'),
                 ('shopping-preview', 'onToggleDish'), ('settings', 'onSave')]
        for page, handler in cases:
            with self.subTest(page=page, handler=handler):
                self.assertEqual('100%', self.style_for(page, handler).get('width'))

    def test_preference_save_reflows_with_large_text(self):
        result = self.style_for('settings', 'onSave')
        self.assertEqual('auto', result.get('height'))
        self.assertEqual('1.5', result.get('line-height'))


if __name__ == '__main__':
    unittest.main()
