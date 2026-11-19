"""Build site/data/feats.json from the raw sources.

Inputs (all in the repo, refreshed by tools/fetch_sources.py):
  source/open5e-feats.json         SRD 5.1 + 5.2 feats        (Open5e v2 API, CC-BY-4.0)
  source/open5e-species.json       SRD 5.1 races + 5.2 species
  source/open5e-backgrounds.json   SRD 5.1 + 5.2 backgrounds
  data-src/other-<kind>.json       facts-only index of the official books (no text)
  data-src/summaries.json          original one-line summaries, keyed by index id

Run:  python tools/build_data.py
"""
import colorsys
import hashlib
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "feats.json"
DOC = {"srd-2014": ("2014", "SRD 5.1"), "srd-2024": ("2024", "SRD 5.2")}
AB = ["str", "dex", "con", "int", "wis", "cha"]
ABFULL = {"strength": "str", "dexterity": "dex", "constitution": "con", "intelligence": "int", "wisdom": "wis", "charisma": "cha"}
CATS = {"ORIGIN": "Origin", "GENERAL": "General", "FIGHTING STYLE": "Fighting Style", "EPIC BOON": "Epic Boon"}
# Open5e SRD 5.1 subrace key -> the index's "Race (Sub)" name
SUB14 = {"high-elf": "Elf (High)", "hill-dwarf": "Dwarf (Hill)", "lightfoot": "Halfling (Lightfoot)", "rock-gnome": "Gnome (Rock)"}


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower().replace("'", "").replace("’", "")).strip()


# ---------- tiny markdown -> HTML (SRD text from Open5e) ----------
def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*\*(.+?)\*\*\*", r"<b><i>\1</i></b>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<![\w*])[*_](?!\s)(.+?)(?<!\s)[*_](?![\w*])", r"<i>\1</i>", s)
    return s


SPELLS_FILE = ROOT / "data-src" / "spell-names.json"   # spell names from the Spell Planner's search.json (fetch_sources.py)
_spell_rx = None


def mark_spells(h):
    """Wrap spell names in SRD text in <span data-link="spell"> so links.js points them at the Spell Planner
    (STYLE 6k). The SRD prints them in plain type. Names of two or more words match anywhere; one-word names
    only before "cantrip" or "spell", or as a whole table cell or list item, so "light" or "shield" in
    ordinary prose stays plain. Bold run-in headings and existing tags are left alone."""
    global _spell_rx
    if _spell_rx is None:
        names = json.loads(SPELLS_FILE.read_text(encoding="utf-8")) if SPELLS_FILE.exists() else []
        multi = sorted((n for n in names if " " in n or "/" in n), key=len, reverse=True)
        single = sorted((n for n in names if " " not in n and "/" not in n), key=len, reverse=True)
        alt = lambda ns: "|".join(re.escape(html.escape(n, quote=False)) for n in ns) or "(?!)"
        _spell_rx = (re.compile(r"(?<![\w'])(" + alt(multi) + r"|(?:" + alt(single) + r")(?=\s+(?:cantrip|spell)s?\b))(?![\w'])", re.I),
                     re.compile(r"^\s*(" + alt(single) + r")\s*$", re.I))
    rx_any, rx_whole = _spell_rx
    wrap = lambda m: '<span data-link="spell">' + m.group(1) + "</span>"
    out, depth_b, cell = [], 0, None
    parts = re.split(r"(<[^>]+>)", h)
    for i, p in enumerate(parts):
        if p.startswith("<"):
            tag = p.lower()
            if tag == "<b>": depth_b += 1
            elif tag == "</b>": depth_b = max(0, depth_b - 1)
            out.append(p)
            continue
        if not p or depth_b:
            out.append(p)
            continue
        prev = parts[i - 1].lower() if i else ""
        nxt = parts[i + 1].lower() if i + 1 < len(parts) else ""
        if prev in ("<td>", "<li>") and nxt in ("</td>", "</li>") and rx_whole.match(p):
            out.append(rx_whole.sub(wrap, p))
            continue
        out.append(rx_any.sub(wrap, p))
    # bold run-in headings ("Darkvision.", "Breath Weapon.") are trait names, not spells or items
    return "".join(out).replace("<b><i>", "<b data-nolink><i>")


def md(text):
    text = (text or "").replace("\xad", "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return ""
    out = []
    for block in re.split(r"\n\s*\n", text):
        lines = [l for l in block.split("\n") if l.strip()]
        if not lines:
            continue
        if all(l.strip().startswith("|") for l in lines):
            rows = [[c.strip() for c in l.strip().strip("|").split("|")] for l in lines if not re.match(r"^\s*\|?\s*:?-{2,}", l)]
            if rows:
                head = "".join(f"<th>{inline(c)}</th>" for c in rows[0])
                body = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows[1:])
                out.append(f'<div class="tbl"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>')
            continue
        if lines[0].startswith("Table:") and len(lines) == 1:
            out.append(f'<p class="tcap">{inline(lines[0][6:].strip())}</p>')
            continue
        if all(re.match(r"^\s*[-*•] ", l) for l in lines):
            out.append("<ul>" + "".join(f"<li>{inline(re.sub(r'^\s*[-*•] ', '', l))}</li>" for l in lines) + "</ul>")
            continue
        out.append("<p>" + "<br>".join(inline(l.strip()) for l in lines) + "</p>")
    return "".join(out)


def lead(name, desc):
    """'<p><b><i>Name.</i></b> first paragraph</p>...' -- a named trait or benefit run into its text"""
    h = md(desc)
    nm = f"<b><i>{html.escape(name)}.</i></b>"
    return "<p>" + nm + " " + h[3:] if h.startswith("<p>") else f"<p>{nm}</p>{h}"


def bullet(desc):
    h = md(desc)
    return h[3:-4] if h.startswith("<p>") and h.count("<p>") == 1 else h


def hue(name):
    if name.startswith("SRD"):
        return 150
    if "Player's Handbook" in name:
        return 30 if "2014" in name else 210
    return int(hashlib.md5(name.encode()).hexdigest()[:4], 16) % 360


# ---------- prerequisites written in the SRD as plain text ----------
def parse_prereq(t):
    """'Strength 13 or higher' / 'Level 4+; Strength or Dexterity 13+' / 'Fighting Style Feature' -> alternatives"""
    if not t:
        return []
    a = {}
    m = re.search(r"level (\d+)", t, re.I)
    if m:
        a["level"] = int(m.group(1))
    abil = re.findall(r"(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)", t)
    sc = re.search(r"(\d+)\+|(\d+) or higher", t)
    if abil and sc:
        n = int(sc.group(1) or sc.group(2))
        a["ab"] = [{ABFULL[x.lower()]: n} for x in abil]   # "Strength or Dexterity 13+" -> either one
    if re.search(r"fighting style", t, re.I):
        a["feature"] = ["fighting style"]
    if re.search(r"spellcasting|cast at least one spell", t, re.I):
        a["cast"] = 1
    return [a] if a else []


def main():
    summaries = load(ROOT / "data-src" / "summaries.json") if (ROOT / "data-src" / "summaries.json").exists() else {}
    books = {}
    out = {"feats": [], "species": [], "backgrounds": []}

    def book(name, ed, srd=False, code=None):
        b = books.setdefault(name, {"code": code, "name": name, "hue": hue(name), "srd": srd, "n": {"2014": 0, "2024": 0}})
        b["n"][ed] += 1

    for kind, okey in (("feats", "feats"), ("species", "species"), ("backgrounds", "backgrounds")):
        other = load(ROOT / "data-src" / f"other-{kind}.json")
        by_name = {}
        for r in other:
            by_name.setdefault((r["edition"], norm(r["name"])), []).append(r)
        used = set()
        for s in load(ROOT / "source" / f"open5e-{okey}.json"):
            ed, src = DOC[s["document"]["key"]]
            slug = s["key"].split("_", 1)[1]
            look = SUB14.get(slug, s["name"]) if ed == "2014" else s["name"]
            cand = by_name.get((ed, norm(look)), [])
            cand = [c for c in cand if c["source"] in ("PHB", "XPHB")] or cand
            twin = cand[0] if cand else None
            if twin:
                used.add(twin["id"])
            row = {"id": s["key"], "name": s["name"], "ed": ed, "book": src.replace(" ", "").replace(".", ""), "page": None, "srd": True,
                   "alsoIn": f"{twin['sourceName']}, p. {twin['page']}" if twin and twin.get("page") else None,
                   "sum": summaries.get(twin["id"]) if twin else summaries.get(s["key"])}
            if kind == "feats":
                ben = s.get("benefits") or []
                txt = md(s.get("desc", "")) + ("<ul>" + "".join(f"<li>{bullet(b['desc'])}</li>" for b in ben) + "</ul>" if ben else "")
                pre_t = (s.get("prerequisite") or "").strip() or None
                row.update({
                    "cat": CATS.get(str(s.get("type", "")).upper(), "General"),
                    "prereq": pre_t.replace(" Feature", " feature") if pre_t else None,
                    "pre": twin["pre"] if twin and twin.get("pre") else parse_prereq(pre_t),
                    "ability": twin.get("ability") if twin else None,
                    "abilities": twin.get("abilities", []) if twin else [],
                    "rep": bool(twin and twin.get("repeatable")) or any("more than once" in b["desc"] for b in ben),
                    "text": mark_spells(txt),
                })
                if slug == "ability-score-improvement":
                    row["ability"] = "+2 to one, or +1 to two (max 20)"
                if ed == "2024" and row["cat"] == "Epic Boon" and not row["abilities"]:
                    row["abilities"] = AB[:]
                    row["ability"] = "any +1 (max 30)"
            elif kind == "species":
                traits = sorted(s.get("traits") or [], key=lambda t: (t.get("order") is None, t.get("order") or 0))
                txt = md(s.get("desc", "")) + "".join(lead(t["name"], t["desc"]) for t in traits)
                par = s.get("subspecies_of")
                row.update({
                    "parent": (par.get("key") if isinstance(par, dict) else par) or None,
                    "size": twin.get("size") if twin else None, "speed": twin.get("speed") if twin else None,
                    "dv": twin.get("darkvision") if twin else None, "type": twin.get("type", "Humanoid") if twin else "Humanoid",
                    "ability": twin.get("ability") if twin else None, "abilities": twin.get("abilities", []) if twin else [],
                    "text": mark_spells(txt),
                })
            else:
                bens = s.get("benefits") or []
                txt = md(s.get("desc", "")) + "".join(lead(b["name"], b["desc"]) for b in bens)
                g = {b.get("type"): b["desc"] for b in bens}
                row.update({
                    "skills": (g.get("skill_proficiency") or "").replace(" and ", ", ") or (twin or {}).get("skills"),
                    "tools": g.get("tool_proficiency") or (twin or {}).get("tools"),
                    "feat": g.get("feat") or (twin or {}).get("feat"),
                    "ability": (twin or {}).get("ability") or (g.get("ability_score") or None),
                    "abilities": (twin or {}).get("abilities") or [ABFULL[x.strip().lower()] for x in (g.get("ability_score") or "").split(",") if x.strip().lower() in ABFULL],
                    "text": mark_spells(txt),
                })
            book(src, ed, True, row["book"])
            out[kind].append(row)
        for r in other:
            if r["id"] in used or r["inSrd"] and any(norm(r["name"]) == norm(x["name"]) and r["edition"] == x["ed"] for x in out[kind] if x["srd"]):
                continue
            row = {"id": r["id"], "name": r["name"], "ed": r["edition"], "book": r["source"], "page": r.get("page"),
                   "srd": False, "sum": summaries.get(r["id"]), "ability": r.get("ability"), "abilities": r.get("abilities", [])}
            if kind == "feats":
                row.update({"cat": r["category"], "prereq": r.get("prereq"), "pre": r.get("pre", []), "rep": r.get("repeatable", False)})
            elif kind == "species":
                row.update({"parent": r.get("parent"), "size": r.get("size"), "speed": r.get("speed"), "dv": r.get("darkvision"), "type": r.get("type")})
            else:
                row.update({"skills": r.get("skills"), "tools": r.get("tools"), "feat": r.get("feat")})
            book(r["sourceName"], r["edition"], False, r["source"])
            out[kind].append(row)
        out[kind].sort(key=lambda x: (norm(x["name"]), x["ed"], not x["srd"], x["book"]))

    # an index species' parent id may point at the SRD copy of that race
    ids = {r["id"] for r in out["species"]}
    other_ids = {r["id"]: r for r in load(ROOT / "data-src" / "other-species.json")}
    srd_by = {(r["ed"], norm(r["name"])): r["id"] for r in out["species"] if r["srd"]}
    for r in out["species"]:
        p = r.get("parent")
        if p and p not in ids and p in other_ids:
            o = other_ids[p]
            r["parent"] = srd_by.get((o["edition"], norm(o["name"])))
    missing = sum(1 for k in out for r in out[k] if not r["srd"] and not r.get("sum"))
    out["books"] = sorted(books.values(), key=lambda b: (not b["srd"], b["name"]))
    out["generated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"feats.json: {len(out['feats'])} feats, {len(out['species'])} species, {len(out['backgrounds'])} backgrounds, "
          f"{len(out['books'])} books; {missing} index rows without a summary; {OUT.stat().st_size // 1024} KB")
    write_search(out)


def write_search(out):
    """site/search.json for the hub's "Search every tool" box (STYLE 6j): names and short facts only,
    one entry per name and kind, linking to the 2024 version when there is one (SRD first)."""
    items = []
    for kind, label in (("feats", "Feat"), ("species", "Species"), ("backgrounds", "Background")):
        groups = {}
        for r in out[kind]:
            groups.setdefault(norm(r["name"]), []).append(r)
        for rows in groups.values():
            best = sorted(rows, key=lambda r: (r["ed"] != "2024", not r["srd"], r["book"]))[0]
            eds = " and ".join(sorted({r["ed"] for r in rows}))
            src = "SRD" if best["srd"] else best["book"]
            if kind == "feats":
                t = f"{best.get('cat') or 'General'} feat, {eds}"
            else:
                t = f"{label}, {eds}"
            items.append({"n": best["name"], "t": f"{t} ({src})", "k": label, "u": "?id=" + best["id"]})
    items.sort(key=lambda x: (norm(x["n"]), x["k"]))
    p = ROOT / "site" / "search.json"
    p.write_text(json.dumps({"v": 1, "items": items}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"search.json: {len(items)} entries, {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
