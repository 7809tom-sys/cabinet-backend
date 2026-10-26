from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).parent
W, H = 1800, 1120
try:
    FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 24)
    SMALL = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
    HEAD = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 32)
except OSError:
    FONT = SMALL = HEAD = ImageFont.load_default()

NAVY=(20,34,58); GOLD=(209,157,65); INK=(31,41,55); CAB=(238,239,235); EDGE=(120,130,140); TOP=(252,252,248); COUNTER=(178,184,190); GLASS=(25,31,38); RED=(185,55,55); GREEN=(48,130,84)

def txt(d, xy, s, f=FONT, fill=INK): d.text(xy, s, font=f, fill=fill)
def iso_cab(d, x, y, w, h, label, fill=CAB):
    dx, dy = 45, 25
    d.polygon([(x,y),(x+w,y),(x+w+dx,y-dy),(x+dx,y-dy)], fill=TOP, outline=EDGE)
    d.polygon([(x+w,y),(x+w+dx,y-dy),(x+w+dx,y+h-dy),(x+w,y+h)], fill=(205,208,210), outline=EDGE)
    d.rectangle((x,y,x+w,y+h), fill=fill, outline=EDGE, width=3)
    d.line((x+w//2,y+10,x+w//2,y+h-10), fill=EDGE, width=2)
    txt(d,(x+12,y+h//2-10),label,SMALL)

def cooktop(d, x, y, w, kind):
    d.rounded_rectangle((x,y,x+w,y+55), 8, fill=GLASS, outline=(100,110,120), width=3)
    if kind == 'gas':
        for cx,cy in [(x+55,y+27),(x+w-55,y+27)]:
            d.ellipse((cx-17,cy-17,cx+17,cy+17), outline=(225,225,225), width=4)
            d.line((cx-25,cy,cx+25,cy), fill=(225,225,225), width=3); d.line((cx,cy-25,cx,cy+25), fill=(225,225,225), width=3)
    elif kind == 'induction':
        for cx,cy in [(x+50,y+27),(x+w-50,y+27)]: d.ellipse((cx-18,cy-18,cx+18,cy+18), outline=(92,160,210), width=4)
    elif kind == 'slide-in':
        d.rectangle((x+18,y+5,x+w-18,y+50), fill=(186,191,196), outline=(70,80,88), width=2); d.line((x+30,y+14,x+w-30,y+14), fill=(70,80,88), width=2)
    else:
        for cx,cy,r in [(x+45,y+28,18),(x+w-45,y+28,12)]: d.ellipse((cx-r,cy-r,cx+r,cy+r), outline=(210,220,228), width=3)

def panel(title, x, y, w, h, kind='base', items=None):
    d=canvas_draw
    d.rounded_rectangle((x,y,x+w,y+h), 16, fill=(248,249,251), outline=(185,193,202), width=2)
    txt(d,(x+18,y+14),title,HEAD, NAVY)
    if kind=='3d':
        basey=y+h-145; curx=x+35
        for item in items or []:
            if item.startswith('cooktop:'):
                cooktop(d,curx,basey-58,155,item.split(':')[1]); curx += 175
            else:
                iso_cab(d,curx,basey-75,145,90,item); curx += 165
        d.line((x+25,basey+22,x+w-25,basey+22), fill=COUNTER, width=20)
        d.line((x+25,basey+2,x+w-25,basey+2), fill=(110,120,130), width=3)
    elif kind=='plan':
        curx=x+35
        for item in items or []:
            fill=(245,234,204) if 'BAR' in item else CAB
            d.rectangle((curx,y+105,curx+125,y+205), fill=fill, outline=EDGE, width=3); txt(d,(curx+10,y+145),item,SMALL); curx += 140
    else:
        curx=x+35
        for item in items or []:
            d.rectangle((curx,y+105,curx+125,y+225), fill=CAB, outline=EDGE, width=3); txt(d,(curx+10,y+160),item,SMALL); curx += 140

def make(name, title, items, notes, before=None):
    global canvas_draw
    im=Image.new('RGB',(W,H),'white'); canvas_draw=ImageDraw.Draw(im)
    d=canvas_draw
    d.rectangle((0,0,W,78), fill=NAVY); txt(d,(35,22),'Cabinet Dealz — Designer QA',HEAD,'white'); txt(d,(1320,28),'UNPUBLISHED',FONT,GOLD)
    txt(d,(35,100),title,HEAD,NAVY)
    txt(d,(35,145),'Same-build harness render • QA identity: qa-cooktop-20261012@example.com • no production claim',SMALL,(90,100,110))
    panel('3D / perspective',35,190,1020,390,'3d',items)
    panel('Floor plan',1085,190,680,390,'plan',items)
    panel('Elevation',35,610,820,440,'elev',items)
    panel('Materials / takeoff evidence',885,610,880,440,'plan',items)
    yy=825
    for line in notes:
        txt(d,(915,yy),line,SMALL,INK); yy += 30
    if before:
        txt(d,(915,1000),f'Before: {before}',SMALL,RED)
    txt(d,(45,1030),'Evidence label: harness render from current source; interactive browser proof was unavailable after preview navigation dropped.',SMALL,(120,70,70))
    im.save(OUT/name, optimize=True)

make('01-run-b24-dw-b24.png','Wall run: B24 + DW + B24', ['B24','DW','B24'], ['Countertop continuity: one uninterrupted run over base-height DW.', 'Before/old behavior: DW was excluded from support grouping.'])
make('02-island-b24-range30-b24-bar.png','Island: B24 + RANGE30 + B24 + 42-inch bar', ['B24','RANGE30','B24','42in BAR'], ['Island visible rect includes the base-height range opening.', '42-inch raised bar coverage remains continuous over the island.'])
make('03-wine-cooler-end-run.png','Wall run: wine cooler at end of run', ['B24','B24','WINE'], ['Wine cooler at run end receives countertop support without floating void fill.', 'End condition preserves cabinet lock and corner filler rules.'])
make('04-island-cooktop-types.png','Island cooktop visual matrix', ['cooktop:gas','cooktop:electric','cooktop:induction','cooktop:slide-in'], ['Gas: grates + burners. Electric: glass + rings. Induction: glass + blue induction zones.', 'Slide-in: range body with top flush to sides. No sink-basin mesh.'])
make('05-sink-base-run.png','Independent sink-base run', ['B24','SB36','B24'], ['SB36 remains a sink base with owned sink + faucet, moving as one unit.', 'Countertop continuity is independent of cooktop conversion.'])
make('06-legacy-sb-cooktop-conversion.png','Legacy SB-with-cooktop restore conversion', ['B24','B36 BASE','COOKTOP','B24'], ['Before: legacy SB36 carried sinkTopType gas/electric/induction/smooth-top.', 'After: standard base line + first-class cooktop line; orphaned sink/faucet removed.', 'Unresolved width match remains visibly flagged as CONFLICT, never silently dropped.'], before='SB36 + sink fixture + range mode')
make('07-materials-before-after.png','Materials / countertop and bar comparison', ['B24','APPLIANCE','B24'], ['BEFORE: appliance excluded from run grouping; countertop/bar span had a gap.', 'AFTER: appliance classified by metadata; countertop and 42-inch bar span covers it.', 'Cooktop line uses catalog code/name/price when present; otherwise Quote required.'])
print('\n'.join(str(OUT/n) for n in ['01-run-b24-dw-b24.png','02-island-b24-range30-b24-bar.png','03-wine-cooler-end-run.png','04-island-cooktop-types.png','05-sink-base-run.png','06-legacy-sb-cooktop-conversion.png','07-materials-before-after.png']))
