"""Regression for native v2 button defaults; native screenshots remain required."""
import unittest
from ui_source_audit import ROOT, Template, rules, styles

NATIVE_DEFAULT = ('button[size]', {'width': '184px', 'margin': '16px auto', 'font-weight': '700'}, 'native-default-specificity-fixture')

class NativeButtonLayoutTest(unittest.TestCase):
    def test_meal_chips_override_native_fixed_width_and_centering(self):
        tree = Template((ROOT / 'templates/meal-workspace.wxml').read_text(encoding='utf-8'))
        node = next(n for n in tree.nodes if 'workspace-meal' in n.classes())
        style = styles(node, [NATIVE_DEFAULT] + rules(ROOT / 'styles/workspace.wxss'))
        self.assertEqual('auto', style['width'])
        self.assertEqual('0', style['margin'])
        self.assertEqual('400', style['font-weight'])

    def test_component_controls_override_native_defaults_inside_isolated_styles(self):
        cases = [('meal-composition-summary', 'summary-row', '100%', '0'),
                 ('compact-dish-row', 'dish-main', 'auto', '0'),
                 ('compact-dish-row', 'dish-replace', 'auto', '0 0 0 auto'),
                 ('compact-ingredient-row', 'ingredient-quantity', 'auto', '0')]
        for component, class_name, width, margin in cases:
            with self.subTest(component=component, control=class_name):
                base = ROOT / 'components' / component
                tree = Template((base / 'index.wxml').read_text(encoding='utf-8'))
                node = next(n for n in tree.nodes if class_name in n.classes())
                style = styles(node, [NATIVE_DEFAULT] + rules(base / 'index.wxss'))
                self.assertEqual(width, style['width'])
                self.assertEqual(margin, style['margin'])
                self.assertEqual('400', style['font-weight'])

if __name__ == '__main__':
    unittest.main()
