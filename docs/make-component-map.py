import html

W, H = 2000, 1400
X0, AW, CW = 24, 234, 286
cols = ['Trigger', 'Input', 'Context', 'Processing', 'AI', 'Output']
cx = lambda i: X0 + AW + CW * i
rows = [  # name, sub, top, height, band, box fill, box stroke
    ('Growth Lead', '(you · runs the pipeline)', 165, 150, '#eef0fd', '#e1e4fb', '#5a5fd6'),
    ('Prospect websites', '(public pages only)', 315, 150, '#fdf1ec', '#fde1d6', '#e8743b'),
    ('Pipeline', '(Next.js app on Vercel)', 465, 170, '#fef8e4', '#fdefc0', '#d9a400'),
    ('AI Model', '(Gemini)', 635, 280, '#e7f7ee', '#d4f2df', '#2f9e5b'),
    ('Services', '(Hunter, Gmail, Neon)', 915, 160, '#fcecf2', '#f9d7e5', '#d63f86'),
    ('Growth Lead', '(reviewer · human gates)', 1075, 160, '#ebf1fd', '#fde1dc', '#e04a3a'),
]
BOTTOM = 1235
BW, BH = 244, 110
o = []
o.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Segoe UI, Inter, Arial, sans-serif">')
o.append('<defs>'
         '<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="#1f2a44"/></marker>'
         '<marker id="t" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="#0d7a6c"/></marker>'
         '</defs>')
o.append(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
o.append(f'<text x="{W/2}" y="62" text-anchor="middle" font-size="36" font-weight="700" fill="#1a2440">Sprinto Outreach · Cold-Email Pipeline — Components Map</text>')

# header row
o.append(f'<rect x="{X0}" y="95" width="{AW+CW*6}" height="70" rx="10" fill="#1f2a44"/>')
o.append(f'<text x="{X0+AW/2}" y="138" text-anchor="middle" font-size="22" fill="#fff">Actor</text>')
for i, c in enumerate(cols):
    o.append(f'<text x="{cx(i)+CW/2}" y="138" text-anchor="middle" font-size="22" fill="#fff">{c}</text>')
    o.append(f'<line x1="{cx(i)}" y1="95" x2="{cx(i)}" y2="165" stroke="#33405f"/>')

# swimlanes
for n, s, t, h, band, f, st in rows:
    o.append(f'<rect x="{X0+AW}" y="{t}" width="{CW*6}" height="{h}" fill="{band}"/>')
    o.append(f'<rect x="{X0}" y="{t}" width="{AW}" height="{h}" fill="#1f2a44"/>')
    o.append(f'<line x1="{X0}" y1="{t}" x2="{X0+AW}" y2="{t}" stroke="#33405f"/>')
    o.append(f'<text x="{X0+AW/2}" y="{t+h/2-4}" text-anchor="middle" font-size="23" font-weight="700" fill="#fff">{n}</text>')
    o.append(f'<text x="{X0+AW/2}" y="{t+h/2+22}" text-anchor="middle" font-size="16" fill="#c9d1e3">{html.escape(s)}</text>')
for i in range(1, 6):
    o.append(f'<line x1="{cx(i)}" y1="165" x2="{cx(i)}" y2="{BOTTOM}" stroke="#d5d9e3"/>')


def box(col, y, lines, ri, step=None, h=BH):
    f, st = rows[ri][5], rows[ri][6]
    x = cx(col) + (CW - BW) / 2
    o.append(f'<rect x="{x}" y="{y}" width="{BW}" height="{h}" rx="12" fill="{f}" stroke="{st}" stroke-width="2.5"/>')
    y0 = y + h / 2 - (len(lines) - 1) * 13 + 6
    for k, l in enumerate(lines):
        o.append(f'<text x="{x+BW/2}" y="{y0+k*26}" text-anchor="middle" font-size="18" fill="#1a2440">{html.escape(l)}</text>')
    if step:
        r = 17 if len(step) == 1 else 22
        o.append(f'<circle cx="{x+6}" cy="{y+6}" r="{r}" fill="#1f2a44"/>'
                 f'<text x="{x+6}" y="{y+12}" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">{step}</text>')


def path(pts, c='#1f2a44', m='a', dash='7 6'):
    d = 'M' + ' L'.join(f'{a},{b}' for a, b in pts)
    o.append(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="2.4" stroke-dasharray="{dash}" marker-end="url(#{m})"/>')


def label(x, y, t, c='#4b5570', anchor='middle'):
    o.append(f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="15" font-style="italic" fill="{c}">{html.escape(t)}</text>')


mid = lambda col: cx(col) + CW / 2
L = lambda col: cx(col) + (CW - BW) / 2
R = lambda col: cx(col) + (CW + BW) / 2

# boxes
box(0, 185, ['Pastes a list of domains', '(stage optional), clicks', '“Run pipeline”'], 0)
box(1, 335, ['Homepage, trust centre,', 'careers page, job board', '(robots.txt respected)'], 1)
box(1, 495, ['Scraper reads + cleans', 'pages; job boards via', 'their public APIs'], 2, '1')
box(2, 495, ['ICP rules + Sprinto facts', '+ lessons learned from', 'your past edits'], 2)
box(3, 495, ['Code checks every quote,', 'runs the ICP gates; agent', 'loop reads more pages'], 2, '3')
box(4, 655, ['Extracts facts, each', 'with a verbatim quote', 'from the page'], 3, '2', h=100)
box(4, 795, ['Writes 2 pain points +', 'the email, using only', 'verified quotes'], 3, '5·6', h=100)
box(5, 495, ['Validator: 11 checks', '(name, hook, no invented', 'numbers); 1 auto-rewrite'], 2)
box(3, 940, ['Hunter finds people;', 'title rules pick the', 'decision-maker (CTO…)'], 4, '4')
box(5, 940, ['Gmail sends to YOUR', 'inbox only; Neon saves', 'every decision + quote'], 4, '7')
box(5, 1100, ['Dashboard: inbox email,', 'review queue, drafts,', 'decision trail'], 5)

# arrows (main flow)
path([(mid(0), 295), (mid(0), 550), (L(1) - 4, 550)])
path([(mid(1), 445), (mid(1), 491)]); label(mid(1) + 14, 474, 'pages', anchor='start')
path([(R(1), 550), (L(2) - 4, 550)])
path([(R(2), 550), (L(3) - 4, 550)])
path([(R(3), 530), (mid(4) + 40, 530), (mid(4) + 40, 651)]); label(mid(4) + 50, 600, 'page text', anchor='start')
path([(L(4), 705), (mid(3) + 40, 705), (mid(3) + 40, 609)]); label(mid(3) + 50, 690, 'facts + quotes', anchor='start')
label(mid(3) - 52, 790, '✕ dropped or unclear', c='#b4372f', anchor='end')
label(mid(3) - 52, 810, '→ review queue (gate 1)', c='#b4372f', anchor='end')
o.append(f'<text x="{mid(5) - 44}" y="680" font-size="14" font-style="italic" fill="#b4372f">✕ fails a check</text>')
o.append(f'<text x="{mid(5) - 44}" y="698" font-size="14" font-style="italic" fill="#b4372f">→ drafts, gate 2</text>')
path([(mid(3) - 40, 605), (mid(3) - 40, 936)]); label(mid(3) - 34, 880, 'qualified', anchor='start')
path([(R(3), 995), (mid(4), 995), (mid(4), 899)]); label(mid(4) + 8, 970, 'contact', anchor='start')
path([(R(4), 845), (mid(5) - 50, 845), (mid(5) - 50, 609)]); label(mid(5) - 44, 760, 'draft', anchor='start')
path([(mid(5) + 60, 605), (mid(5) + 60, 936)]); label(mid(5) + 66, 770, 'passes', anchor='start')
path([(mid(5), 1050), (mid(5), 1096)])

# feedback loop
path([(L(5), 1170), (mid(2), 1170), (mid(2), 609)], c='#0d7a6c', m='t', dash='3 6')
label(mid(2) + 12, 1150, 'feedback loop: your edits', c='#0d7a6c', anchor='start')
label(mid(2) + 12, 1192, 'become lessons for the writer', c='#0d7a6c', anchor='start')

# legend
ly = 1285
o.append(f'<rect x="{X0}" y="{ly-35}" width="{AW+CW*6}" height="130" rx="10" fill="#f6f7fb" stroke="#e1e4ec"/>')
o.append(f'<text x="{X0+24}" y="{ly}" font-size="18" font-weight="700" fill="#1a2440">The case’s 7 steps:</text>')
x = X0 + 230
for s in ['1 Scrape', '2 Extract', '3 Qualify', '4 Find contact', '5 Pain points', '6 Draft', '7 Send']:
    num, txt = s.split(' ', 1)
    o.append(f'<circle cx="{x}" cy="{ly-6}" r="14" fill="#1f2a44"/>'
             f'<text x="{x}" y="{ly}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">{num}</text>'
             f'<text x="{x+22}" y="{ly}" font-size="18" fill="#1a2440">{txt}</text>')
    x += 228
o.append(f'<text x="{X0+24}" y="{ly+40}" font-size="17" fill="#4b5570">Dashed arrow = data moving between parts · Green dotted = feedback loop · Code decides every gate; Gemini only reads and writes · Emails go only to your own inbox, never the prospect.</text>')
o.append(f'<text x="{X0+24}" y="{ly+70}" font-size="17" fill="#4b5570">Anything the rules cannot settle (no contact, unclear stage, failed validator check) waits for you in the review queue or drafts — nothing is guessed.</text>')
o.append('</svg>')

out = r'C:\Users\Admin\Desktop\coding\sprinto-outreach\docs\component-map.svg'
open(out, 'w', encoding='utf8').write('\n'.join(o))
print('wrote', out)
