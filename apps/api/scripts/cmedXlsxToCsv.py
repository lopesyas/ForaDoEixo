import sys, zipfile, csv, re
import xml.etree.ElementTree as ET
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
src, sheet, out = sys.argv[1], sys.argv[2], sys.argv[3]
z = zipfile.ZipFile(src)
shared = []
with z.open('xl/sharedStrings.xml') as f:
    for _, el in ET.iterparse(f):
        if el.tag == NS + 'si':
            shared.append(''.join(t.text or '' for t in el.iter(NS + 't')))
            el.clear()
def col(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group(0): n = n * 26 + ord(ch) - 64
    return n - 1
rows = 0
with z.open(sheet) as f, open(out, 'w', newline='', encoding='utf-8') as o:
    w = csv.writer(o)
    for _, el in ET.iterparse(f):
        if el.tag == NS + 'row':
            cells = {}
            for c in el.findall(NS + 'c'):
                v = c.find(NS + 'v')
                if v is None:
                    is_ = c.find(NS + 'is')
                    val = ''.join(t.text or '' for t in is_.iter(NS + 't')) if is_ is not None else ''
                else:
                    val = shared[int(v.text)] if c.get('t') == 's' else (v.text or '')
                cells[col(c.get('r'))] = val
            if cells:
                w.writerow([cells.get(i, '') for i in range(max(cells) + 1)])
                rows += 1
            el.clear()
print('linhas', rows)
