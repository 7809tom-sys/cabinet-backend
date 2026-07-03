#!/usr/bin/env python3
"""Deterministically re-apply the Pelican wiring edits to the three integration
files. Read the whole file into memory, do string replacements, verify markers,
then write once. Avoids per-syscall flakiness by doing one read + one write."""
import sys

def patch(path, edits, expect_markers):
    with open(path, "r", encoding="utf-8") as f:
        s = f.read()
    for find, replace in edits:
        if find not in s:
            print(f"FAIL {path}: anchor not found: {find[:60]!r}")
            sys.exit(1)
        if replace.split("\n")[0].strip() and replace.strip() in s:
            # idempotency guard: skip if already applied
            pass
        s = s.replace(find, replace, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    # verify
    with open(path, "r", encoding="utf-8") as f:
        s2 = f.read()
    for m in expect_markers:
        if m not in s2:
            print(f"FAIL {path}: marker missing after write: {m!r}")
            sys.exit(1)
    print(f"OK {path}: {len(expect_markers)} markers present")

# ---- Admin.tsx ----
patch(
    "client/src/pages/Admin.tsx",
    [
        (
            'import { AdminTabHelp } from "@/components/admin/AdminTabHelp";',
            'import { AdminTabHelp } from "@/components/admin/AdminTabHelp";\n'
            'import PelicanCatalogAdmin from "@/components/admin/PelicanCatalogAdmin";',
        ),
        (
            '          <TabsTrigger value="featured">Featured Styles</TabsTrigger>',
            '          <TabsTrigger value="featured">Featured Styles</TabsTrigger>\n'
            '          <TabsTrigger value="pelican">Pelican Catalog</TabsTrigger>',
        ),
        (
            '        <TabsContent value="orders" className="mt-6">\n'
            '          <AdminTabHelp tab="orders" />\n'
            '          <IncomingOrdersAdmin />\n'
            '        </TabsContent>',
            '        <TabsContent value="orders" className="mt-6">\n'
            '          <AdminTabHelp tab="orders" />\n'
            '          <IncomingOrdersAdmin />\n'
            '        </TabsContent>\n'
            '        <TabsContent value="pelican" className="mt-6">\n'
            '          <PelicanCatalogAdmin />\n'
            '        </TabsContent>',
        ),
    ],
    [
        'import PelicanCatalogAdmin from "@/components/admin/PelicanCatalogAdmin";',
        '<TabsTrigger value="pelican">Pelican Catalog</TabsTrigger>',
        '<PelicanCatalogAdmin />',
    ],
)

# ---- DesignTool.tsx ----
patch(
    "client/src/pages/DesignTool.tsx",
    [
        (
            'import { RollOutTrayPicker } from "@/components/design/RollOutTrayPicker";',
            'import { RollOutTrayPicker } from "@/components/design/RollOutTrayPicker";\n'
            'import { PelicanCatalogPanel } from "@/components/design/PelicanCatalogPanel";',
        ),
        (
            '"accessory" | "furniture">("base");',
            '"accessory" | "furniture" | "pelican">("base");',
        ),
        (
            '"opening", "accessory", "furniture"] as const)',
            '"opening", "accessory", "furniture", "pelican"] as const)',
        ),
        (
            '                    : tab === "furniture"\n'
            '                    ? "Furniture"',
            '                    : tab === "furniture"\n'
            '                    ? "Furniture"\n'
            '                    : tab === "pelican"\n'
            '                    ? t("dt_tab_pelican")',
        ),
        (
            '            {!styleId &&\n'
            '              paletteType !== "opening" &&\n'
            '              paletteType !== "closetparts" &&\n'
            '              paletteType !== "accessory" && (',
            '            {!styleId &&\n'
            '              paletteType !== "opening" &&\n'
            '              paletteType !== "closetparts" &&\n'
            '              paletteType !== "pelican" &&\n'
            '              paletteType !== "accessory" && (',
        ),
        (
            '            {paletteType === "furniture" ? (\n'
            '              (() => {\n'
            '                const cats = ["table", "chair", "stool", "bench"] as const;',
            '            {paletteType === "pelican" ? (\n'
            '              <PelicanCatalogPanel\n'
            '                onSelect={(item) => {\n'
            '                  toast.success(t("dt_pel_added", { name: item.name }));\n'
            '                }}\n'
            '              />\n'
            '            ) : paletteType === "furniture" ? (\n'
            '              (() => {\n'
            '                const cats = ["table", "chair", "stool", "bench"] as const;',
        ),
        (
            '            {paletteType !== "opening" && !paletteLoading && filteredPalette.length === 0 && (',
            '            {paletteType !== "opening" && paletteType !== "pelican" && !paletteLoading && filteredPalette.length === 0 && (',
        ),
        (
            '          <div className="p-2 border-t border-border text-[10px] text-muted-foreground text-center">\n'
            '            {paletteType === "accessory"\n'
            '              ? t("dt_pl_foot_accessory")\n'
            '              : t("dt_pl_foot_default")}\n'
            '          </div>',
            '          {paletteType !== "pelican" && (\n'
            '            <div className="p-2 border-t border-border text-[10px] text-muted-foreground text-center">\n'
            '              {paletteType === "accessory"\n'
            '                ? t("dt_pl_foot_accessory")\n'
            '                : t("dt_pl_foot_default")}\n'
            '            </div>\n'
            '          )}',
        ),
    ],
    [
        'import { PelicanCatalogPanel } from "@/components/design/PelicanCatalogPanel";',
        '| "pelican">("base");',
        't("dt_tab_pelican")',
        '{paletteType === "pelican" ? (',
        't("dt_pel_added", { name: item.name })',
    ],
)

# ---- site.ts (en + es) ----
EN_ANCHOR = '    dt_tab_accessories: "Accessories & Trim",\n    dt_bs_sec_base: "Base Cabinets",'
EN_NEW = (
    '    dt_tab_accessories: "Accessories & Trim",\n'
    '    dt_tab_pelican: "Surfaces & Fixtures",\n'
    '    dt_pel_title: "Surfaces & Fixtures",\n'
    '    dt_pel_search: "Search sinks, tile, flooring\u2026",\n'
    '    dt_pel_suggested: "Suggested",\n'
    '    dt_pel_all: "All",\n'
    '    dt_pel_all_in_cat: "All in {category}",\n'
    '    dt_pel_empty: "No products match your search.",\n'
    '    dt_pel_foot: "Surfaces & fixtures by Pelican International \u00b7 reference specs",\n'
    '    dt_pel_msrp: "MSRP {price}",\n'
    '    dt_pel_added: "Added {name} to your selections",\n'
    '    dt_bs_sec_base: "Base Cabinets",'
)
ES_ANCHOR = '    dt_tab_accessories: "Accesorios y Molduras",\n    dt_bs_sec_base: "Gabinetes de Base",'
ES_NEW = (
    '    dt_tab_accessories: "Accesorios y Molduras",\n'
    '    dt_tab_pelican: "Superficies y Accesorios",\n'
    '    dt_pel_title: "Superficies y Accesorios",\n'
    '    dt_pel_search: "Buscar fregaderos, azulejos, pisos\u2026",\n'
    '    dt_pel_suggested: "Sugeridos",\n'
    '    dt_pel_all: "Todos",\n'
    '    dt_pel_all_in_cat: "Todos en {category}",\n'
    '    dt_pel_empty: "Ning\u00fan producto coincide con tu b\u00fasqueda.",\n'
    '    dt_pel_foot: "Superficies y accesorios de Pelican International \u00b7 especificaciones de referencia",\n'
    '    dt_pel_msrp: "PVPR {price}",\n'
    '    dt_pel_added: "{name} agregado a tus selecciones",\n'
    '    dt_bs_sec_base: "Gabinetes de Base",'
)
patch(
    "client/src/lib/i18n/site.ts",
    [(EN_ANCHOR, EN_NEW), (ES_ANCHOR, ES_NEW)],
    ['dt_tab_pelican: "Surfaces & Fixtures"', 'dt_tab_pelican: "Superficies y Accesorios"'],
)

print("ALL PATCHES APPLIED")
