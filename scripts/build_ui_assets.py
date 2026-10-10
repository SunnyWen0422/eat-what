"""Rebuild deterministic SVG masters, mini-program PNG exports and token bindings."""
from pathlib import Path
import json
import re
import cairosvg

ROOT = Path(__file__).resolve().parents[1]
TOKENS = json.loads((ROOT / "design/tokens.json").read_text(encoding="utf-8"))
COLOR = TOKENS["colors"]
PATHS = {
    "today": 'M3 11h18c0 6-4 9-9 9s-9-3-9-9z M8 7c-2-2 2-3 0-4m4 4c-2-2 2-3 0-4m4 4c-2-2 2-3 0-4',
    "recipes": 'M12 5C9 3 6 3 3 4v16c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1z M12 5v16',
    "plan": 'M7 5h10a3 3 0 0 1 3 3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a3 3 0 0 1 3-3z M8 3v4m8-4v4 M4 11h16 M8 15h.1m4 0h.1m4 0h.1',
    "profile": 'M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M4 21v-2a8 7 0 0 1 16 0v2',
    "arrow-left": 'M20 12H4 M10 6l-6 6 6 6',
    "chevron-right": 'M9 5l7 7-7 7',
    "close": 'M6 6l12 12 M18 6 6 18',
    "more": 'M4 12h.1 M12 12h.1 M20 12h.1',
    "search": 'M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M15 15l6 6',
    "filter": 'M4 6h16 M7 12h10 M10 18h4',
    "add": 'M12 4v16 M4 12h16',
    "edit": 'M16 4l4 4 M4 20l2-6L17 3l4 4-11 11z M4 20h7',
    "delete": 'M3 6h18 M8 6V3h8v3 M5 6l1 15h12l1-15 M10 10v7m4-7v7',
    "share": 'M9 8l7-4 M9 16l7 4 M3 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M16 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M16 20a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    "refresh": 'M20 8a9 9 0 0 0-16 0 M20 3v5h-5 M4 16a9 9 0 0 0 16 0 M4 21v-5h5',
    "check": 'M4 12l5 5L20 6',
    "favorite": 'M12 21S2 15 2 8a5 5 0 0 1 10-1a5 5 0 0 1 10 1c0 7-10 13-10 13z',
    "favorite-filled": 'M12 21S2 15 2 8a5 5 0 0 1 10-1a5 5 0 0 1 10 1c0 7-10 13-10 13z',
    "settings": 'M4 6h16 M4 12h16 M4 18h16 M8 3v6m8 0v6m-6 0v6',
    "info": 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0 M12 11v6m0-10h.1',
    "history": 'M4 7a9 9 0 1 1-1 8 M3 3v5h5 M12 7v5l4 2',
    "calendar": 'M6 5h12a3 3 0 0 1 3 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a3 3 0 0 1 3-3z M8 3v4m8-4v4 M3 11h18 M8 15h.1m4 0h.1m4 0h.1',
    "statistics": 'M3 3v18h18 M7 17v-5m5 5V8m5 9V4',
    "clock": 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0 M12 6v6l4 3',
    "users": 'M4 7a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M14 7a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M2 20v-3a5 4 0 0 1 10 0v3 M14 20v-3a4 4 0 0 1 8 0v3',
    "recipe": 'M7 3h10a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z M4 17h16 M9 7h6m-6 4h6',
    "ingredient": 'M4 19C3 7 11 3 21 3c0 12-6 18-17 16z M4 19 17 7 M10 13v-4m0 4h4',
    "shopping-basket": 'M3 9h18l-3 11H6z M7 9l4-6m6 6-4-6 M9 13v3m6-3v3',
    "nutrition": 'M12 21C3 20 1 8 6 6c3-2 4 0 6 0s3-2 6 0c5 2 3 14-6 15z M12 6c0-3 3-4 6-4 M12 7V4',
    "servings": 'M3 11h18c0 6-4 9-9 9s-9-3-9-9z M8 7c-2-2 2-3 0-5m4 5c-2-2 2-3 0-5m4 5c-2-2 2-3 0-5',
    "cooking-pot": 'M5 9h14v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9z M3 9h18 M9 5h6m-3 0V3 M2 13h3m14 0h3',
    "warning": 'M10.3 3.8L2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 3.8a2 2 0 0 0-3.4 0z M12 9v5m0 3h.1',
    "agent-spark": 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
    "agent-arrange": 'M3 5h11m-11 7h11m-11 7h11 M18 8l2 4 3 1-3 1-2 4-2-4-3-1 3-1z',
    "agent-regenerate": 'M20 9a8 8 0 0 0-15-3 M20 4v5h-5 M4 15a8 8 0 0 0 15 3 M4 20v-5h5 M12 9l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
    "agent-replace-dish": 'M3 8h17l-4-4 M21 16H4l4 4 M9 12h6',
    "agent-adjust": 'M4 6h16 M4 12h16 M4 18h16 M8 3v6m8 0v6m-6 0v6',
}
ILLUSTRATIONS = {
    "empty-favorites": '<path d="M58 48h44l8 8 8-8h44v104h-44l-8 8-8-8H58z" fill="#fff"/><path d="M110 56v101 M74 74h22m-22 20h22m32 35c-30-17-34-36-21-39 7-3 14 3 16 8 4-8 11-11 17-8 16 7 5 23-12 39z"/>',
    "empty-shopping": '<path d="M44 85h132l-18 68H62z" fill="#fff"/><path d="M70 85l30-38m50 38-30-38 M82 109v20m28-20v20m28-20v20"/><path d="M159 62c3-20 15-22 28-19-2 21-12 27-28 19z" fill="#EDF3ED"/>',
    "empty-plan": '<rect x="55" y="46" width="112" height="110" rx="14" fill="#fff"/><path d="M78 35v25m65-25v25 M56 77h110 M80 99h22m20 0h22 M80 125h22"/><circle cx="156" cy="148" r="26" fill="#EDF3ED"/><path d="M156 133v16l10 6"/>',
    "agent-thinking": '<path d="M45 111h130c-4 44-28 54-65 54s-61-10-65-54z" fill="#fff"/><path d="M71 86c-14-17 14-21 0-38m39 38c-14-17 14-21 0-38m39 38c-14-17 14-21 0-38"/><path d="M182 30l5 12 12 5-12 5-5 12-5-12-12-5 12-5z" fill="#EDF3ED"/>',
    "meal-success": '<circle cx="110" cy="105" r="63" fill="#fff"/><circle cx="110" cy="105" r="45"/><path d="M82 104l19 20 39-39"/><path d="M34 154c-5-24 5-31 23-28-1 24-10 30-23 28z M161 54c2-22 15-25 28-22-2 21-13 27-28 22z" fill="#EDF3ED"/>',
}


def render_template(source):
    """Bind dimensions explicitly: px, rpx (2x), and fonts relative to body em.

    A multiplier keeps small decorative offsets tied to the nearest scale token.
    Zero, percentages, borders and image geometry are not spacing scale values.
    """
    def replace(match):
        key = match[1]
        if key in COLOR:
            return COLOR[key]
        dimension = re.fullmatch(r"(font|space|radius|controls)\.([\w]+)\.(px|rpx|em)(?:\*([\d.]+))?", key)
        if not dimension:
            raise ValueError(f"Unknown token binding: {key}")
        group, name, unit, multiplier = dimension.groups()
        values = TOKENS[group]
        value = values[int(name)] if isinstance(values, list) else values[name]
        value *= float(multiplier or 1)
        if unit == "rpx":
            value *= 2
        elif unit == "em":
            if group != "font":
                raise ValueError(f"Only typography can use em: {key}")
            value /= TOKENS["font"]["body"]
        precision = 6 if unit == "em" else 4
        return f"{value:.{precision}f}".rstrip("0").rstrip(".") + unit

    return re.sub(r"\{\{([^{}]+)\}\}", replace, source)


def build():
    tokens = {**COLOR, **TOKENS["controls"], **{key: TOKENS[key] for key in ("font", "space", "radius", "controls", "motion")}}
    (ROOT / "utils/ui-tokens.js").write_text("// Generated by scripts/build_ui_assets.py; edit design/tokens.json.\nmodule.exports = " + json.dumps(tokens, indent=2) + "\n", encoding="utf-8")
    template = (ROOT / "design/theme.wxss.tpl").read_text(encoding="utf-8")
    template = render_template(template)
    (ROOT / "styles/theme.wxss").write_text("/* Generated from design/tokens.json and theme.wxss.tpl. */\n" + template, encoding="utf-8")
    component_template = render_template((ROOT / "design/component-theme.wxss.tpl").read_text(encoding="utf-8"))
    (ROOT / "styles/component-theme.wxss").write_text("/* Generated component-safe theme. */\n" + component_template, encoding="utf-8")
    for item in json.loads((ROOT / "design/wxss-manifest.json").read_text(encoding="utf-8")):
        contents = (ROOT / item["source"]).read_text(encoding="utf-8")
        contents = render_template(contents)
        (ROOT / item["output"]).write_text("/* Generated token bindings; edit corresponding design/wxss template. */\n" + contents, encoding="utf-8")
    icons = ROOT / "assets/icons"
    illustrations = ROOT / "assets/illustrations"
    icons.mkdir(parents=True, exist_ok=True)
    illustrations.mkdir(parents=True, exist_ok=True)
    tabs = ["today", "recipes", "plan", "profile"]
    for name, path in PATHS.items():
        for selected in ([False, True] if name in tabs else [False]):
            variant = name + ("-selected" if selected else "")
            color = COLOR["brand"] if selected or name not in tabs else COLOR["muted"]
            fill = color if name == "favorite-filled" else "none"
            selection = f'<rect x="2" y="2" width="20" height="20" rx="6" fill="{COLOR["brandSoft"]}"/>' if selected else ''
            svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">{selection}<path d="{path}" fill="{fill}" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            (icons / (variant + ".svg")).write_text(svg, encoding="utf-8")
            cairosvg.svg2png(bytestring=svg.encode(), output_width=72, output_height=72, write_to=str(icons / (variant + ".png")))
    for name, path in PATHS.items():
        fill = COLOR['muted'] if name == 'favorite-filled' else 'none'
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="{path}" fill="{fill}" stroke="{COLOR["muted"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        (icons / (name + '-muted.svg')).write_text(svg, encoding='utf-8')
        cairosvg.svg2png(bytestring=svg.encode(), output_width=72, output_height=72, write_to=str(icons / (name + '-muted.png')))
    for name, contents in ILLUSTRATIONS.items():
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 200"><ellipse cx="110" cy="178" rx="69" ry="7" fill="{COLOR["brandSoft"]}"/><g stroke="{COLOR["brand"]}" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">{contents}</g></svg>'
        (illustrations / (name + ".svg")).write_text(svg, encoding="utf-8")
        cairosvg.svg2png(bytestring=svg.encode(), output_width=440, output_height=400, write_to=str(illustrations / (name + ".png")))
    manifest = {"style": "warm-rounded-line", "icons": list(PATHS), "tabs": tabs, "illustrations": list(ILLUSTRATIONS)}
    (ROOT / "design/asset-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (ROOT / "utils/ui-assets.js").write_text("// Generated by scripts/build_ui_assets.py; edit its asset definitions.\nmodule.exports = " + json.dumps(manifest) + ";\n", encoding="utf-8")
    app_file = ROOT / "app.json"
    app = json.loads(app_file.read_text(encoding="utf-8"))
    for item, name in zip(app["tabBar"]["list"], tabs):
        item.update(iconPath=f"assets/icons/{name}.png", selectedIconPath=f"assets/icons/{name}-selected.png")
    app_file.write_text(json.dumps(app, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
    print(f"Built token bindings, {len(PATHS)*2+4} icon variants and {len(ILLUSTRATIONS)} illustrations")
