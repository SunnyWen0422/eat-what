"""Keep decorative gradient borders out of text-background contrast checks."""
import unittest
import ui_source_audit as audit


class BackgroundLayerTest(unittest.TestCase):
    def test_opaque_content_layer_covers_the_gradient_border(self):
        result = audit.page_audit('pages/index/index')
        label = next(pair for pair in result['pairs']
                     if pair['selector'] == 'text.workspace-assistant-label' and not pair['selected'])
        self.assertNotIn((97, 188, 164, 1), label['backgrounds'])
        self.assertIn((237, 247, 240, 1), label['backgrounds'])

    def test_transparent_top_layer_keeps_lower_layer_contribution(self):
        backgrounds = audit.text_backgrounds(
            'linear-gradient(rgba(255,255,255,.5),rgba(255,255,255,.5)) padding-box, '
            'linear-gradient(#000000,#000000) border-box', [(255, 0, 0, 1)])
        self.assertEqual([(127.5, 127.5, 127.5, 1)], backgrounds)

    def test_single_gradient_preserves_all_declared_stops(self):
        self.assertEqual([(0, 0, 0, 1), (255, 255, 255, 1)],
                         audit.text_backgrounds('linear-gradient(120deg,#000000,#FFFFFF)', [(255, 0, 0, 1)]))


if __name__ == '__main__':
    unittest.main()
