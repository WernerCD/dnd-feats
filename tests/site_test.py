"""Feats & Origins site checks, run by tools/smoke_test.py (STYLE.md 7) with  run(page, base, check)."""


def run(page, base, check):
    def go(q=""):
        page.goto(base + q, wait_until="load")
        page.wait_for_function("document.querySelectorAll('#list .card').length > 0 || !document.querySelector('#empty').hidden", timeout=10000)

    def cards():
        return page.locator("#list .card").count()

    # every tab, both editions, lists entries
    for ed in ("2014", "2024"):
        for tab in ("feats", "species", "backgrounds"):
            go(f"?ed={ed}&tab={tab}")
            check(cards() > 0, f"[feats] {ed} {tab} tab lists entries")
            check(page.locator(f'.tabs [data-tab="{tab}"][aria-selected="true"]').count() == 1, f"[feats] {ed} {tab} tab is marked selected")

    # Sources: core books by default, everything else one click away, default left out of the link
    go("?ed=2024")
    core = cards()
    check("books=" not in page.url, "[feats] default sources are not written into the link")
    check(page.locator("#srcSum").inner_text() == "Sources: core books", "[feats] Sources starts on the core books")
    page.locator("#srcPick summary").click()
    check(page.locator("#srcList .src-group").first.inner_text().lower() == "core rules", "[feats] Sources lists the core rules first")
    check(page.locator('#srcList [data-src="WoW"]').count() == 1 and not page.locator('#srcList [data-src="WoW"]').is_checked(),
          "[feats] partner books are listed but unticked")
    page.locator("#srcAll").click()
    check(cards() > core and "books=all" in page.url, "[feats] Select all adds the other books and goes in the link")
    page.locator("#srcCore").click()
    check(cards() == core and "books=" not in page.url, "[feats] Core books returns to the default")
    page.keyboard.press("Escape")

    # search and filters are kept in the link
    go("?ed=2024&books=all&q=alert&cat=Origin")
    names = page.locator("#list .card h3").all_inner_texts()
    check("Alert" in names, "[feats] search + category from the link finds Alert")
    check(page.locator("#search").input_value() == "alert", "[feats] search box restored from the link")

    # ?id= deep link opens that entry
    go("?id=srd-2024_alert")
    check(page.locator("#detail[open]").count() == 1, "[feats] ?id= opens the detail dialog")
    check(page.locator("#dTitle").inner_text() == "Alert", "[feats] ?id= shows the right entry")
    check(page.locator("#dBody .itext").count() == 1, "[feats] SRD entry shows its rules text")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    check(page.locator("#detail[open]").count() == 0 and "id=" not in page.url, "[feats] Escape closes the dialog and drops id= from the link")
    go("?id=xphb_great-weapon-master")
    check(page.locator("#dBody .note-idx").count() == 1, "[feats] index entry shows the facts-only note, no rules text")

    # character: eligibility, Taken persists, species, sheet summary
    page.evaluate("localStorage.removeItem('dnd.characters')")
    cid = page.evaluate("DndChar.save({name: 'Feat Test', ed: '2024', classes: [{cls: 'fighter', lvl: 4}], ab: [16,13,14,10,12,8]}, 'smoke').id")
    page.evaluate(f"DndChar.setActive('{cid}')")
    go("?ed=2024&books=all&q=actor")
    actor = page.locator("#list .card", has_text="Actor").first
    check(actor.locator(".elig.no").count() == 1, "[feats] Cha 8 character does not qualify for Actor")
    go("?ed=2024&q=alert")
    page.locator('#list [data-mark="taken"][data-id="srd-2024_alert"]').click()
    page.reload(wait_until="load")
    page.wait_for_function("document.querySelectorAll('#list .card').length > 0")
    check(page.locator('#list [data-mark="taken"][data-id="srd-2024_alert"][aria-pressed="true"]').count() == 1, "[feats] Taken mark survives a reload")
    link = page.evaluate(f"DndChar.get('{cid}').links['dnd-feats']")
    check(link and link.get("taken") == ["srd-2024_alert"], "[feats] Taken is stored in links['dnd-feats']")
    sheet = page.evaluate(f"(DndChar.get('{cid}').sheet || {{}})['dnd-feats']")
    check(bool(sheet) and sheet.get("feats") == [{"n": "Alert", "cat": "Origin", "status": "taken"}], "[feats] sheet summary lists the taken feat")
    go("?ed=2024&tab=species&q=dwarf")
    page.locator('#list [data-set="species"][data-id="srd-2024_dwarf"]').click()
    check(page.evaluate(f"DndChar.get('{cid}').links['dnd-feats'].species") == "srd-2024_dwarf", "[feats] species can be set for the character")

    # imported character: offer, matching, nothing changes until chosen
    page.evaluate(f"""DndChar.save({{id: '{cid}', imp: {{v: 1, src: 'ddb', at: '2026-11-19T06:09:16Z', ed: '2024', name: 'Feat Test',
        species: 'Aasimar', background: 'Soldier', feats: ['Alert', 'Great Weapon Master', 'Made Up Feat']}}}}, 'smoke')""")
    go("?ed=2024")
    check(page.locator("#impCard:not([hidden]) #impUse").count() == 1, "[feats] newer import is offered")
    check("Made Up Feat" in page.locator("#impCard").inner_text(), "[feats] import lists names it couldn't match")
    check(page.evaluate(f"DndChar.get('{cid}').links['dnd-feats'].species") == "srd-2024_dwarf", "[feats] import changes nothing before the choice")
    page.locator("#impUse").click()
    after = page.evaluate(f"DndChar.get('{cid}').links['dnd-feats']")
    check(after.get("species") == "xphb_aasimar" and after.get("background") == "srd-2024_soldier"
          and "xphb_great-weapon-master" in after.get("taken", []) and after.get("impAt"), "[feats] using the import sets species, background, feats and impAt")
    go("?ed=2024")
    check(page.locator("#impCard").is_hidden(), "[feats] the same import isn't offered twice")
    page.evaluate("localStorage.removeItem('dnd.characters')")
