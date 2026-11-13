#!/usr/bin/env python3
"""Builds assets/data/poe1-tiers.json (the tier picker's mod table) from RePoE data.

Usage: python3 scripts/build-tier-data.py <folder with RePoE json files> <output .json file>

The RePoE files (mods.json, base_items.json, item_classes.json,
stat_translations.json, stat_value_handlers.json) come from
https://github.com/repoe-fork/repoe-fork.github.io (folder "data").
Re-run this after a game patch that changes item mods.
"""
import json
import re
import sys
from collections import defaultdict, OrderedDict

src, out = sys.argv[1].rstrip('/') + '/', sys.argv[2]
load = lambda name: json.load(open(src + name + '.json'))
mods, bases, item_classes = load('mods'), load('base_items'), load('item_classes')
translations, handlers = load('stat_translations'), load('stat_value_handlers')

# Item class id -> label used by the trade site's Item Category list.
CLASSES = OrderedDict([
    ('Claw', 'Claw'), ('Dagger', 'Dagger'), ('Rune Dagger', 'Rune Dagger'), ('Wand', 'Wand'),
    ('One Hand Sword', 'One-Handed Sword'), ('Thrusting One Hand Sword', 'One-Handed Sword'),
    ('One Hand Axe', 'One-Handed Axe'), ('One Hand Mace', 'One-Handed Mace'), ('Sceptre', 'Sceptre'),
    ('Bow', 'Bow'), ('Staff', 'Staff'), ('Warstaff', 'Warstaff'), ('Two Hand Sword', 'Two-Handed Sword'),
    ('Two Hand Axe', 'Two-Handed Axe'), ('Two Hand Mace', 'Two-Handed Mace'), ('Quiver', 'Quiver'),
    ('Body Armour', 'Body Armour'), ('Helmet', 'Helmet'), ('Gloves', 'Gloves'), ('Boots', 'Boots'),
    ('Shield', 'Shield'), ('Amulet', 'Amulet'), ('Ring', 'Ring'), ('Belt', 'Belt'),
    ('Jewel', 'Base Jewel'), ('AbyssJewel', 'Abyss Jewel'),
])
DOMAINS = {'item', 'misc', 'abyss_jewel'}
ARMOUR_TAGS = OrderedDict([
    ('str_dex_int_armour', 'Armour/Evasion/ES'), ('str_dex_armour', 'Armour/Evasion'),
    ('str_int_armour', 'Armour/ES'), ('dex_int_armour', 'Evasion/ES'),
    ('str_armour', 'Armour'), ('dex_armour', 'Evasion'), ('int_armour', 'Energy Shield'),
])
INFLUENCES = {'shaper': 'Shaper', 'elder': 'Elder', 'crusader': 'Crusader', 'basilisk': 'Hunter',
              'eyrie': 'Redeemer', 'adjudicator': 'Warlord'}

# ---- stat translations -----------------------------------------------------
by_stat = {}
for entry in translations:
    for stat_id in entry['ids']:
        by_stat.setdefault(stat_id, entry)

norm = lambda text: re.sub(r'\s+', ' ', re.sub(r'\s*\(local\)', '', text.lower())).strip()


def variant_text(variant):
    text = variant['string']
    for index, fmt in enumerate(variant['format']):
        text = text.replace('{%d}' % index, '' if fmt == 'ignore' else fmt)
    return norm(text)


def apply_handlers(value, names):
    for name in names:
        handler = handlers.get(name) or {}
        if handler.get('type') not in ('int', 'float'):
            continue
        if handler.get('multiplier') is not None:
            value *= handler['multiplier']
        if handler.get('divisor'):
            value /= handler['divisor']
        if handler.get('addend') is not None:
            value += handler['addend']
    return value


def condition_ok(variant, values):
    for cond, (_lo, hi) in zip(variant['condition'], values):
        if cond.get('min') is not None and hi < cond['min']:
            return False
        if cond.get('max') is not None and hi > cond['max']:
            return False
    return True


fmt_num = lambda v: ('%.2f' % v).rstrip('0').rstrip('.')


def stat_lines(mod):
    """Yields (trade text, lo, hi, display or None) for every stat line of a mod."""
    values = {s['id']: (s['min'], s['max']) for s in mod['stats']}
    seen = []
    for stat in mod['stats']:
        entry = by_stat.get(stat['id'])
        if not entry or any(entry is e for e in seen):
            continue
        seen.append(entry)
        trade = [t for t in entry.get('trade_stats') or [] if t['type'] == 'explicit']
        if not trade:
            continue
        vals = [values.get(i, (0, 0)) for i in entry['ids']]
        trade_texts = {norm(t['text']): t['text'] for t in trade}
        variants = entry['English']
        chosen = next((v for v in variants if variant_text(v) in trade_texts and condition_ok(v, vals)), None)
        if not chosen:
            continue
        text = trade_texts[variant_text(chosen)]
        shown = []
        for (lo, hi), fmt, names in zip(vals, chosen['format'], chosen['index_handlers']):
            if fmt == 'ignore':
                continue
            lo, hi = sorted((apply_handlers(lo, names), apply_handlers(hi, names)))
            shown.append((lo, hi))
        if not shown:
            continue
        lo = sum(v[0] for v in shown) / len(shown)
        hi = sum(v[1] for v in shown) / len(shown)
        display = ' to '.join('%s-%s' % (fmt_num(a), fmt_num(b)) if a != b else fmt_num(a) for a, b in shown) \
            if len(shown) > 1 else None
        yield norm(text), round(lo, 2), round(hi, 2), display


# ---- which mods can roll on which bases -------------------------------------
candidates = {}
for mod_id, mod in mods.items():
    if mod['domain'] not in DOMAINS or mod['generation_type'] not in ('prefix', 'suffix'):
        continue
    if mod.get('is_essence_only') or not mod.get('name'):
        continue
    if not any(w['weight'] > 0 for w in mod['spawn_weights']):
        continue
    lines = list(stat_lines(mod))
    if lines:
        candidates[mod_id] = (mod, lines)


def can_spawn(mod, tags):
    for weight in mod['spawn_weights']:
        if weight['tag'] in tags:
            return weight['weight'] > 0
    return False


DOMAIN_OF_CLASS = {'Jewel': 'misc', 'AbyssJewel': 'abyss_jewel'}

# variant = (class label, sub label, influence label) -> set of mod ids
variants = OrderedDict()
for class_id, label in CLASSES.items():
    domain = DOMAIN_OF_CLASS.get(class_id, 'item')
    influence_tags = item_classes.get(class_id, {}).get('influence_tags') or []
    class_mods = {i: m for i, (m, _l) in candidates.items() if m['domain'] == domain}
    groups = OrderedDict()
    for base in bases.values():
        if base.get('item_class') != class_id or base.get('release_state') != 'released':
            continue
        if base.get('domain') not in (domain, 'item'):
            continue
        tags = set(base['tags'])
        sub = next((name for tag, name in ARMOUR_TAGS.items() if tag in tags), '')
        plain = frozenset(i for i, m in class_mods.items() if can_spawn(m, tags))
        groups.setdefault((sub, ''), set()).update(plain)
        for influence_tag in influence_tags:
            influence = INFLUENCES.get(influence_tag.rsplit('_', 1)[-1])
            if not influence:
                continue
            extra = frozenset(i for i, m in class_mods.items() if can_spawn(m, tags | {influence_tag})) - plain
            groups.setdefault((sub, influence), set()).update(extra)
    for (sub, influence), mod_ids in groups.items():
        variants.setdefault((label, sub, influence), set()).update(mod_ids)

# ---- families and tiers -----------------------------------------------------
# stat text -> list of {g, h, w: [variant indexes], t: tiers}
variant_keys = list(variants.keys())
stats = defaultdict(list)
for variant_index, key in enumerate(variant_keys):
    families = defaultdict(list)
    for mod_id in variants[key]:
        mod, lines = candidates[mod_id]
        family = (mod['generation_type'], mod['type'], tuple(mod['groups']), tuple(s['id'] for s in mod['stats']))
        families[family].append((mod, lines))
    for family, members in families.items():
        members.sort(key=lambda item: (-item[0]['required_level'], item[0]['name']))
        for line_index, (text, _lo, _hi, _d) in enumerate(members[0][1]):
            tiers = []
            for mod, lines in members:
                if line_index >= len(lines) or lines[line_index][0] != text:
                    continue
                _t, lo, hi, display = lines[line_index]
                tier = [mod['name'], mod['required_level'], lo, hi]
                if display:
                    tier.append(display)
                tiers.append(tier)
            entry = {'g': family[0][0], 'h': 1 if len(members[0][1]) > 1 else 0, 't': tiers}
            existing = next((e for e in stats[text] if e['g'] == entry['g'] and e['h'] == entry['h'] and e['t'] == tiers), None)
            if existing:
                existing['w'].append(variant_index)
            else:
                entry['w'] = [variant_index]
                stats[text].append(entry)

# Base type -> [class label, armour type], so the tier picker can tell the item type from the
# main search box ("Hubris Circlet" -> Helmet, Energy Shield) when no Item Category is chosen.
base_classes = {}
for base in bases.values():
    label = CLASSES.get(base.get('item_class'))
    if not label or base.get('release_state') != 'released' or not base.get('name'):
        continue
    sub = next((name for tag, name in ARMOUR_TAGS.items() if tag in set(base['tags'])), '')
    base_classes[base['name'].lower()] = [label, sub]

data = {'variants': [list(key) for key in variant_keys], 'stats': dict(sorted(stats.items())), 'bases': dict(sorted(base_classes.items()))}
body = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
with open(out, 'w') as handle:
    handle.write(body)
print('mods', len(candidates), 'variants', len(variant_keys), 'stats', len(stats), 'bases', len(base_classes), 'bytes', len(body))
