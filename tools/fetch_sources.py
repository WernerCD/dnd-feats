"""Refresh the raw inputs in source/ and data-src/.

Run by hand (not in CI):  python tools/fetch_sources.py

1. Open5e v2 API -> source/open5e-<feats|species|backgrounds>.json
   SRD 5.1 (srd-2014) and SRD 5.2 (srd-2024) only. CC-BY-4.0 text.
2. 5etools-src (fan dataset on GitHub) -> data-src/other-<feats|species|backgrounds>.json
   FACTS ONLY: name, book, page, edition, category, prerequisite, ability increase, size, speed,
   skills, tools and the feat a background grants. No description text is kept, ever.
   Partnered / third-party products ("-alt" groups) and the free web supplements (Plane Shift and
   similar, not in the books list) are left out.
3. The Spell Planner's search.json -> data-src/spell-names.json (names only), used by build_data.py to
   link spell names in SRD text to the Spell Planner (STYLE 6k).
"""
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "dnd-feats-site-build/1.0 (+https://github.com/WernerCD/dnd-feats)"}
DOCS = "srd-2014,srd-2024"
FIVE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/"
AB = ["str", "dex", "con", "int", "wis", "cha"]
ABN = {"str": "Strength", "dex": "Dexterity", "con": "Constitution", "int": "Intelligence", "wis": "Wisdom", "cha": "Charisma"}
TAG = re.compile(r"\{@\w+ ([^|}]*)[^}]*\}")


def get(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            print("  retry", url, e)
            time.sleep(3)


def fetch_open5e():
    for ep in ("feats", "species", "backgrounds"):
        url = f"https://api.open5e.com/v2/{ep}/?document__key__in={DOCS}&limit=200"
        rows = []
        while url:
            print("GET", url)
            d = get(url)
            rows.extend(d["results"])
            url = d.get("next")
        rows.sort(key=lambda r: r["key"])
        out = ROOT / "source" / f"open5e-{ep}.json"
        out.write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"  {ep}: {len(rows)} rows -> {out.name}")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "")).strip("-")


def untag(s):
    return TAG.sub(lambda m: m.group(1), str(s))


SMALL = {"of", "the", "and", "a", "an", "or", "in", "on", "to", "for", "from", "with"}


def title(s):
    ws = str(s).split(" ")
    return " ".join(w if w.isupper() else (w.lower() if i and w.lower() in SMALL else w[:1].upper() + w[1:]) for i, w in enumerate(ws))


def ref_name(r):
    """'great weapon master|xphb' or 'initiate of high sorcery|dsotdq|initiate of high sorcery (nuitari)' -> display name"""
    p = str(r).split("|")
    return title(p[2] if len(p) > 2 and p[2] else p[0])


# ---------- ability increases ----------
def ability_facts(ab):
    """5etools ability list -> (text, [abilities it can raise])"""
    if not ab:
        return None, []
    parts, keys = [], []
    for alt in ab:
        bits = []
        for k in AB:
            if k in alt:
                v = alt[k]
                bits.append(f"{k.capitalize()} {'+' if v > 0 else ''}{v}")
                if v > 0:
                    keys.append(k)
        ch = alt.get("choose")
        if ch:
            if "weighted" in ch:
                w = ch["weighted"]
                frm = w.get("from", AB)
                keys += frm
                lbl = "any" if sorted(frm) == sorted(AB) else ", ".join(f.capitalize() for f in frm)
                bits.append(lbl)
            else:
                frm = ch.get("from", AB)
                keys += frm
                n, amt = ch.get("count", 1), ch.get("amount", 1)
                lbl = "any" if sorted(frm) == sorted(AB) else " or ".join(f.capitalize() for f in frm)
                bits.append(f"+{amt} to {n} of {lbl}" if n > 1 else f"{lbl} +{amt}")
        if bits:
            parts.append(", ".join(bits))
    keys = [k for k in AB if k in keys]
    return (" or ".join(parts) or None), keys


# ---------- prerequisites ----------
def prereq_facts(pre):
    """5etools prerequisite list (alternatives) -> (text, structured alternatives for the eligibility check)"""
    if not pre:
        return None, []
    texts, alts = [], []
    for p in pre:
        t, a = [], {}
        lv = p.get("level")
        if lv is not None:
            if isinstance(lv, dict):
                cls = (lv.get("class") or {}).get("name")
                sub = (lv.get("subclass") or {}).get("name")
                a["level"] = lv.get("level", 1)
                if cls:
                    a["cls"] = cls.lower()
                    t.append(f"{cls}{' (' + sub + ')' if sub else ''} level {a['level']}+")
                else:
                    t.append(f"Level {a['level']}+")
            else:
                a["level"] = lv
                t.append(f"Level {lv}+")
        if p.get("ability"):
            ors = []
            a["ab"] = []
            for o in p["ability"]:
                a["ab"].append({k: v for k, v in o.items() if k in AB})
                ors.append(" and ".join(f"{ABN[k]} {v}+" for k, v in o.items() if k in AB))
            t.append(" or ".join(ors))
        if p.get("race"):
            names = []
            a["race"] = []
            for r in p["race"]:
                nm = r.get("displayEntry") or (title(r["name"]) + (f" ({title(r['subrace'])})" if r.get("subrace") else ""))
                names.append(untag(nm))
                a["race"].append((r["name"] + ("|" + r["subrace"] if r.get("subrace") else "")).lower())
            t.append(" or ".join(names))
        if p.get("spellcasting") or p.get("spellcasting2020"):
            a["cast"] = 1
            t.append("Can cast at least one spell" if p.get("spellcasting2020") else "Can cast at least one spell")
        if p.get("spellcastingFeature"):
            a["cast"] = 2
            t.append("Spellcasting or Pact Magic feature")
        if p.get("spellcastingPrepared"):
            a["cast"] = 1
            t.append("Prepares spells")
        if p.get("feat"):
            a["feat"] = [slug(ref_name(f)) for f in p["feat"]]
            t.append(" or ".join(ref_name(f) + " feat" for f in p["feat"]))
        if p.get("feature"):
            a["feature"] = [f.lower() for f in p["feature"]]
            t.append(" or ".join(f + " feature" for f in p["feature"]))
        if p.get("proficiency"):
            ors = []
            for o in p["proficiency"]:
                for k, v in o.items():
                    if k == "armor":
                        a["armor"] = v
                        ors.append(f"{title(v)} armor training" if v != "shield" else "Shield training")
                    elif k in ("weapon", "weaponGroup"):
                        a["weapon"] = v
                        ors.append(f"{title(v)} weapon proficiency")
                    elif k == "tool":
                        a["other"] = 1
                        ors.append(" or ".join(title(x) for x in v) + " proficiency")
                    else:
                        a["other"] = 1
                        ors.append(f"{title(k)} proficiency")
            t.append(" or ".join(ors))
        if p.get("background"):
            a["background"] = [b["name"].lower() for b in p["background"]]
            t.append(" or ".join(b["name"] for b in p["background"]) + " background")
        if p.get("campaign"):
            a["campaign"] = p["campaign"]
            t.append(" or ".join(p["campaign"]) + " campaign")
        if p.get("exclusiveFeatCategory"):
            a["other"] = 1
            t.append("No other Dragonmark feat" if p["exclusiveFeatCategory"] == ["D"] else "Only one feat of this kind")
        if p.get("featCategory"):
            a["other"] = 1
            t.append("A Dragonmark feat" if p["featCategory"] == ["D"] else "A feat of a set category")
        if p.get("otherSummary"):
            a["other"] = 1
            t.append(untag(p["otherSummary"].get("entrySummary") or p["otherSummary"].get("entry")))
        elif p.get("other"):
            a["other"] = 1
            t.append(untag(p["other"]))
        if p.get("psionics"):
            a["other"] = 1
            t.append("Psionics")
        texts.append(", ".join(t))
        alts.append(a)
    texts = [x for x in texts if x]
    parts = [x.split(", ") for x in texts]
    if len(parts) > 1 and all(len(p) > 1 and p[0] == parts[0][0] for p in parts):
        return parts[0][0] + ", " + " or ".join(", ".join(p[1:]) for p in parts), alts   # "Level 4+, Strength 13+ or Dexterity 13+"
    return " or ".join(texts) or None, alts


CAT5 = {"O": "Origin", "G": "General", "FS": "Fighting Style", "FS:P": "Fighting Style", "FS:R": "Fighting Style",
        "EB": "Epic Boon", "D": "Dragonmark", "DG": "Dark Gift"}


def books():
    bk = {b["id"]: b for b in get(FIVE + "books.json")["book"]}
    adv = {b["id"]: b for b in get(FIVE + "adventures.json")["adventure"]}
    names = {}
    for k, b in list(bk.items()) + list(adv.items()):
        if str(b.get("group", "")).endswith("-alt"):
            continue  # partnered / third-party products
        names[k] = {"name": b["name"], "published": b.get("published", "")}
    return names


def edition(it, info):
    if it.get("edition") == "one":
        return "2024"
    if it.get("edition") == "classic":
        return "2014"
    return "2024" if info["published"] >= "2024-09-17" else "2014"


def base(it, info, kind):
    return {
        "id": f"{it['source'].lower()}_{slug(it['name'])}",
        "name": it["name"],
        "source": it["source"],
        "sourceName": info["name"],
        "page": it.get("page"),
        "edition": edition(it, info),
        "inSrd": bool(it.get("srd") or it.get("srd52")),
        "srdName": it.get("srd52") if isinstance(it.get("srd52"), str) else (it.get("srd") if isinstance(it.get("srd"), str) else None),
    }


def resolve_copy(it, index):
    """fill the facts a _copy entry leaves out from the entry it copies (the _mod text edits are ignored)"""
    c = it.get("_copy")
    if not c:
        return it
    src = index.get((c["name"].lower(), c["source"].lower()))
    if not src:
        return it
    src = resolve_copy(src, index)
    out = {k: v for k, v in src.items() if k not in ("name", "source", "page", "srd", "srd52", "edition", "reprintedAs")}
    out.update({k: v for k, v in it.items() if k != "_copy"})
    return out


def feats(names):
    rows = []
    for it in get(FIVE + "feats.json")["feat"]:
        info = names.get(it["source"])
        if not info:
            continue
        r = base(it, info, "feat")
        ptxt, palts = prereq_facts(it.get("prerequisite"))
        atxt, akeys = ability_facts(it.get("ability"))
        cat = CAT5.get(it.get("category"))
        if not cat:  # the 2014 books had no feat categories; mark the ones tied to a race
            cat = "Racial" if any("race" in a for a in palts) else "General"
        r.update({
            "category": cat,
            "prereq": ptxt,
            "pre": palts,
            "ability": atxt,
            "abilities": akeys,
            "repeatable": bool(it.get("repeatable")) or (r["edition"] == "2014" and it["name"] == "Elemental Adept"),
        })
        rows.append(r)
    return rows


def size_txt(s):
    m = {"T": "Tiny", "S": "Small", "M": "Medium", "L": "Large", "V": "Varies"}
    return " or ".join(m.get(x, x) for x in s) if s else None


def speed_txt(sp):
    if sp is None:
        return None
    if isinstance(sp, (int, float)):
        return f"{sp} ft."
    out = []
    for k in ("walk", "fly", "swim", "climb", "burrow"):
        if k in sp:
            v = sp[k]
            v = "= walk" if v is True else f"{v} ft."
            out.append(v if k == "walk" else f"{k} {v}")
    return ", ".join(out) or None


def species(names):
    d = get(FIVE + "races.json")
    index = {(r["name"].lower(), r["source"].lower()): r for r in d["race"]}
    rows, parents = [], {}
    for it in d["race"]:
        it2 = resolve_copy(it, index)
        parents[(it["name"].lower(), it["source"].lower())] = it2
        info = names.get(it["source"])
        if not info:
            continue
        r = base(it, info, "species")
        atxt, akeys = ability_facts(it2.get("ability"))
        r.update({"parent": None, "size": size_txt(it2.get("size")), "speed": speed_txt(it2.get("speed")),
                  "darkvision": it2.get("darkvision"), "ability": atxt, "abilities": akeys,
                  "type": title((it2.get("creatureTypes") or ["humanoid"])[0])})
        rows.append(r)
    for it in d["subrace"]:
        if not it.get("name") or not it.get("raceName"):
            continue
        info = names.get(it["source"])
        par = parents.get((it["raceName"].lower(), it.get("raceSource", "").lower()))
        if not info or not par:
            continue
        nm = f"{it['raceName']} ({it['name']})"
        r = base(dict(it, name=nm), info, "species")
        ab = (par.get("ability") or []) if not (it.get("overwrite") or {}).get("ability") else []
        merged = []
        sab = it.get("ability") or [{}]
        for x in (ab or [{}]):
            for y in sab:
                z = dict(x)
                z.update(y)
                merged.append(z)
        atxt, akeys = ability_facts([m for m in merged if m])
        r.update({"parent": f"{it['raceSource'].lower()}_{slug(it['raceName'])}", "size": size_txt(it.get("size") or par.get("size")),
                  "speed": speed_txt(it.get("speed") or par.get("speed")), "darkvision": it.get("darkvision") or par.get("darkvision"),
                  "ability": atxt, "abilities": akeys, "type": title((par.get("creatureTypes") or ["humanoid"])[0])})
        rows.append(r)
    return rows


def prof_list(lst):
    """[{'insight': True, 'religion': True}] or [{'choose': {...}}] -> 'Insight, Religion'"""
    if not lst:
        return None
    alts = []
    for o in lst:
        bits = []
        for k, v in o.items():
            if k == "choose":
                frm = v.get("from", [])
                bits.append(f"choose {v.get('count', 1)}: " + ", ".join(title(f) for f in frm))
            elif k.startswith("any"):
                what = re.sub(r"(?<!^)([A-Z])", r" \1", k[3:]).lower() or "skill"
                bits.append(f"any {v} {what}".replace("standard", "standard language").replace("s tool", "'s tool"))
            elif v is True:
                bits.append(title(k))
        alts.append(", ".join(bits))
    return " or ".join(a for a in alts if a) or None


def backgrounds(names):
    d = get(FIVE + "backgrounds.json")["background"]
    index = {(r["name"].lower(), r["source"].lower()): r for r in d}
    rows = []
    for it in d:
        info = names.get(it["source"])
        if not info:
            continue
        it2 = resolve_copy(it, index)
        r = base(it, info, "background")
        atxt, akeys = ability_facts(it2.get("ability")[:1] if it2.get("ability") else None)
        fts = []
        for o in it2.get("feats") or []:
            for k in o:
                if k == "anyFromCategory":
                    fts.append("any " + "/".join(CAT5.get(c, c) for c in o[k]["category"]) + " feat")
                else:
                    nm, *rest = k.split("|")
                    nm = nm.replace("; ", " (") + (")" if "; " in nm else "")
                    fts.append(title(nm))
        r.update({"ability": atxt, "abilities": akeys, "skills": prof_list(it2.get("skillProficiencies")),
                  "tools": prof_list(it2.get("toolProficiencies")), "feat": " or ".join(fts) or None})
        rows.append(r)
    return rows


def fetch_5etools():
    names = books()
    for kind, fn in (("feats", feats), ("species", species), ("backgrounds", backgrounds)):
        rows = fn(names)
        rows.sort(key=lambda r: (r["sourceName"], r["name"]))
        ids = [r["id"] for r in rows]
        dup = {i for i in ids if ids.count(i) > 1}
        if dup:
            print("  duplicate ids:", sorted(dup))
        out = ROOT / "data-src" / f"other-{kind}.json"
        out.write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"  5etools facts: {len(rows)} {kind} -> {out.name}")


def fetch_spell_names():
    d = get("https://wernercd.github.io/dnd-magic/search.json")
    names = sorted({i["n"] for i in d.get("items", []) if i.get("k") == "Spell"})
    out = ROOT / "data-src" / "spell-names.json"
    out.write_text(json.dumps(names, indent=0, ensure_ascii=False), encoding="utf-8")
    print(f"  spell names: {len(names)} -> {out.name}")


if __name__ == "__main__":
    fetch_open5e()
    fetch_5etools()
    fetch_spell_names()
