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
                 ('assistant-history', 'onOpenSession'),
                 ('calendar-detail', 'onAdjustMeal'), ('shopping-list', 'onToggleDish'),
                 ('shopping-preview', 'onToggleDish'), ('settings', 'onSave')]
        for page, handler in cases:
            with self.subTest(page=page, handler=handler):
                self.assertEqual('100%', self.style_for(page, handler).get('width'))

    def test_calendar_record_rows_fill_the_available_page_width(self):
        calendar = Template((ROOT / 'pages/calendar/calendar.wxml').read_text(encoding='utf-8'))
        self.assertTrue(any(node.tag == 'meal-card' and node.attrs.get('bind:open') == 'onOpenMeal'
                            for node in calendar.nodes))
        route = ROOT / 'components/meal-card/meal-card'
        component = Template(route.with_suffix('.wxml').read_text(encoding='utf-8'))
        row = next(node for node in component.nodes
                   if node.attrs.get('bindtap') == 'open' and 'card-navigation' in node.classes())
        result = styles(row, rules(route.with_suffix('.wxss')))
        self.assertEqual('100%', result.get('width'))
        self.assertEqual('72px', result.get('min-height'))

    def test_preference_save_reflows_with_large_text(self):
        result = self.style_for('settings', 'onSave')
        self.assertEqual('auto', result.get('height'))
        self.assertEqual('1.5', result.get('line-height'))


if __name__ == '__main__':
    unittest.main()
