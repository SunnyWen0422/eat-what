"""Declared-style audit, not a native layout or pixel renderer."""
import itertools
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VOID = {'input', 'image', 'icon', 'import', 'include', 'checkbox', 'radio', 'switch', 'slider', 'progress'}


class Node:
    def __init__(self, tag, attrs, parent=None, line=0):
        self.tag, self.attrs, self.parent, self.line = tag, dict(attrs), parent, line
        self.text = ''

    def classes(self, selected=False):
        value = self.attrs.get('class', '')
        literals = ' '.join(re.findall(r"'([^']*)'", value)) if selected else ''
        return set((re.sub(r'\{\{.*?\}\}', '', value) + ' ' + literals).split())


class Template(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.nodes, self.stack = [], []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.stack[-1] if self.stack else None, self.getpos()[0])
        self.nodes.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        node = Node(tag, attrs, self.stack[-1] if self.stack else None, self.getpos()[0])
        self.nodes.append(node)

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1].tag == tag:
            self.stack.pop()

    def handle_data(self, text):
        if self.stack:
            self.stack[-1].text += text


def rules(file, seen=None):
    seen = set() if seen is None else seen
    if file in seen:
        return []
    seen.add(file)
    text = re.sub(r'/\*.*?\*/', '', file.read_text(encoding='utf-8'), flags=re.S)
    result = []
    for imported in re.findall(r'@import\s+["\']([^"\']+)', text):
        result.extend(rules((file.parent / imported).resolve(), seen))
    text = re.sub(r'@import[^;]+;', '', text)
    for match in re.finditer(r'([^{}]+)\{([^{}]*)\}', text):
        declarations = {}
        for declaration in match[2].split(';'):
            key, separator, value = declaration.partition(':')
            if separator:
                declarations[key.strip()] = value.strip().replace('!important', '').strip()
        for selector in match[1].strip().split(','):
            selector = selector.strip()
            if selector and not selector.startswith('@') and not re.match(r'^\d+%$', selector):
                result.append((selector, declarations, str(file.relative_to(ROOT)) if file.is_relative_to(ROOT) else str(file)))
    return result


def matches_simple(node, selector, selected):
    if '::' in selector:
        return False
    if '[disabled]' in selector and (not selected or 'disabled' not in node.attrs):
        return False
    selector = re.sub(r'\[[^\]]+\]|:[\w-]+(?:\([^)]*\))?', '', selector)
    tag = re.match(r'^[\w-]+', selector)
    return (not tag or tag[0] == node.tag) and set(re.findall(r'\.([\w-]+)', selector)) <= node.classes(selected)


def matches(node, selector, selected):
    parts = selector.replace('>', ' > ').split()
    if not parts or not matches_simple(node, parts[-1], selected):
        return False
    parent = node.parent
    for part in reversed(parts[:-1]):
        if part == '>':
            continue
        while parent and not matches_simple(parent, part, selected):
            parent = parent.parent
        if not parent:
            return False
        parent = parent.parent
    return True


def styles(node, stylesheet, selected=False):
    chosen = {}
    for order, (selector, declarations, evidence) in enumerate(stylesheet):
        if matches(node, selector, selected):
            specificity = (len(re.findall(r'[.\[:]', selector)), len(re.findall(r'(?:^|\s|>)\w', selector)), order)
            for key, value in declarations.items():
                if key not in chosen or specificity >= chosen[key][0]:
                    chosen[key] = (specificity, value, evidence)
    return {key: value[1] for key, value in chosen.items()}


def declared_hit_bounds(node, stylesheet):
    """Conservative matching scale declarations on the real ancestor chain, not native layout."""
    style = styles(node, stylesheet)
    minimum = [style.get('min-width', ''), style.get('min-height', '')]
    width, height = [float(value[:-2]) if re.fullmatch(r'[\d.]+px', value) else None for value in minimum]
    ancestor, transforms, unresolved = node, [], []
    while ancestor:
        for selector, declarations, evidence in stylesheet:
            if not matches(ancestor, selector, False) or 'transform' not in declarations:
                continue
            transform = declarations['transform']
            functions = re.findall(r'([\w]+)\(([^)]*)\)', transform)
            transforms.append({'selector': selector, 'transform': transform, 'file': evidence})
            if not functions and transform != 'none':
                unresolved.append(transform)
            for function, arguments in functions:
                if function == 'scale':
                    factors = [float(value) for value in re.split(r'[,\s]+', arguments.strip())]
                    if width is not None:
                        width *= min(1, abs(factors[0]))
                    if height is not None:
                        height *= min(1, abs(factors[-1]))
                elif function == 'scaleX' and width is not None:
                    width *= min(1, abs(float(arguments)))
                elif function == 'scaleY' and height is not None:
                    height *= min(1, abs(float(arguments)))
                elif not function.startswith('translate'):
                    unresolved.append(transform)
        ancestor = ancestor.parent
    return {'minWidthAfterDeclaredScale': width, 'minHeightAfterDeclaredScale': height,
            'ancestorTransforms': transforms, 'unresolvedTransformGeometry': unresolved}


def colors(value):
    result = []
    for value in re.findall(r'#[\da-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b', value):
        if value in ('white', 'black'):
            result.append((255, 255, 255, 1) if value == 'white' else (0, 0, 0, 1))
        elif value.startswith('#'):
            raw = value[1:]
            if len(raw) == 3:
                raw = ''.join(c * 2 for c in raw)
            if len(raw) in (6, 8):
                result.append((*[int(raw[i:i+2], 16) for i in (0, 2, 4)], int(raw[6:8], 16) / 255 if len(raw) == 8 else 1))
        else:
            numbers = [float(n) for n in re.findall(r'\d*\.?\d+', value)]
            result.append((*numbers[:3], numbers[3] if len(numbers) == 4 else 1))
    return result


def blend(foreground, background, opacity=1):
    alpha = foreground[3] * opacity
    return tuple(foreground[i] * alpha + background[i] * (1 - alpha) for i in range(3)) + (1,)


def contrast(first, second):
    def luminance(value):
        rgb = [channel / 255 for channel in value[:3]]
        rgb = [channel / 12.92 if channel <= .04045 else ((channel + .055) / 1.055) ** 2.4 for channel in rgb]
        return sum(a * b for a, b in zip(rgb, (.2126, .7152, .0722)))
    a, b = sorted([luminance(first), luminance(second)])
    return (b + .05) / (a + .05)


def page_audit(route):
    file = ROOT / (route + '.wxml')
    source = file.read_text(encoding='utf-8')
    segments = [(1, source.count('\n') + 1, str(file.relative_to(ROOT)))]
    # Shared workspace is evaluated in every route that includes it.
    for include in re.findall(r'<include\s+src="([^"]+)"', source):
        include_file = (file.parent / include).resolve()
        start = source.count('\n') + 1
        source += include_file.read_text(encoding='utf-8')
        segments.append((start, source.count('\n') + 1, str(include_file.relative_to(ROOT))))
    template = Template(source)
    for node in list(template.nodes):
        if node.tag in ('input', 'textarea') and 'placeholder' in node.attrs:
            placeholder = Node('text', [('class', node.attrs.get('placeholder-class', ''))], node, node.line)
            placeholder.text = node.attrs['placeholder']
            template.nodes.append(placeholder)
    stylesheet = (rules(ROOT / 'app.wxss') if route.startswith('pages/') else []) + rules(ROOT / (route + '.wxss'))
    animation_opacity = {}
    for css_file in dict.fromkeys(evidence for _, _, evidence in stylesheet):
        css_text = (ROOT / css_file).read_text(encoding='utf-8')
        for name, frames in re.findall(r'@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}', css_text):
            values = [float(value) for value in re.findall(r'opacity\s*:\s*([\d.]+)', frames)]
            if values:
                animation_opacity[name] = min(values)
    default = json.loads((ROOT / 'design/tokens.json').read_text(encoding='utf-8'))['colors']
    pairs, clicks = [], []
    for node in template.nodes:
        start, _, template_source = next(segment for segment in reversed(segments) if segment[0] <= node.line <= segment[1])
        local_line = node.line - start + 1
        if node.tag in ('view', 'text', 'picker') and any(key.endswith('tap') or node.tag == 'picker' and key.endswith('change') for key in node.attrs):
            style = styles(node, stylesheet)
            clicks.append({'selector': node.tag + '.' + '.'.join(sorted(node.classes())), 'file': template_source, 'line': local_line, 'minWidth': style.get('min-width'), 'minHeight': style.get('min-height'), **declared_hit_bounds(node, stylesheet)})
        if not node.text.strip() and node.tag not in ('input', 'textarea'):
            continue
        for selected in (False, True):
            # A selection-only glyph is absent in the unselected branch; do not invent white text there.
            condition = node.attrs.get('wx:if', '').strip('{} ')
            if not selected and re.fullmatch(r'[\w.]+', condition) and node.parent and condition in node.parent.attrs.get('class', ''):
                continue
            chain, current = [], node
            while current:
                chain.append(current)
                current = current.parent
            backgrounds = colors(default['background'])
            foreground, opacity, image_dependent = colors(default['text'])[0], 1, False
            for ancestor in reversed(chain):
                style = styles(ancestor, stylesheet, selected)
                if style.get('color') and colors(style['color']):
                    foreground = colors(style['color'])[0]
                opacity *= float(style.get('opacity', 1))
                if style.get('animation'):
                    opacity *= animation_opacity.get(style['animation'].split()[0], 1)
                declared = style.get('background-color', style.get('background', ''))
                layer = colors(declared)
                if layer:
                    backgrounds = [blend(a, b) for a, b in itertools.product(layer, backgrounds)]
                if 'url(' in declared:
                    image_dependent = not layer or any(c[3] < 1 for c in layer)
            ratios = [contrast(blend(foreground, bg, opacity), bg) for bg in backgrounds]
            pairs.append({'selector': node.tag + '.' + '.'.join(sorted(node.classes(selected))), 'file': template_source, 'line': local_line, 'selected': selected, 'text': node.text.strip()[:90], 'foreground': foreground, 'backgrounds': backgrounds, 'opacity': opacity, 'ratio': round(min(ratios), 3), 'imageDependent': image_dependent})
    return {'route': route, 'clicks': clicks, 'pairs': pairs}
