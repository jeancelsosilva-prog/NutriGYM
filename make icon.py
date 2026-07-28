"""
Ícone do NutriGYM — seta ascendente sobre verde da marca.
Geometria e cores extraídas da referência (IMG_6468).
Saída em quadrado cheio: o iOS aplica a máscara arredondada sozinho.
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

BG    = (16, 111, 81)     # verde de fundo
DARK  = (15,  87, 67)     # cauda
MID   = (164, 199, 34)    # meio (≈ --citrine)
LIGHT = (206, 215, 24)    # ponta

# centro do traço, em fração do lado (extraído da referência)
TAIL   = (0.2550, 0.5900)
PEAK   = (0.3875, 0.4150)
VALLEY = (0.5020, 0.6450)
HBASE  = (0.7000, 0.3250)
# cabeça: ponta, farpa esquerda, farpa inferior
TIP    = (0.8480, 0.1350)
BARB_L = (0.5700, 0.1900)
BARB_D = (0.8250, 0.4250)

STROKE = 0.135            # espessura do traço


def arrow_mask(SS):
    m = Image.new("L", (SS, SS), 0)
    d = ImageDraw.Draw(m)
    P = lambda p: (p[0] * SS, p[1] * SS)
    w = int(STROKE * SS)
    d.line([P(TAIL), P(PEAK), P(VALLEY), P(HBASE)], fill=255, width=w, joint="curve")
    for pt in (TAIL, PEAK, VALLEY, HBASE):            # juntas e pontas redondas
        x, y = P(pt)
        d.ellipse([x - w/2, y - w/2, x + w/2, y + w/2], fill=255)
    d.polygon([P(TIP), P(BARB_L), P(BARB_D)], fill=255)
    return m


def gradient(SS):
    """Degradê diagonal calibrado por amostragem da referência.
    As paradas usam t = (x + (1-y))/2 direto, sem renormalizar."""
    fx = np.linspace(0, 1, SS)[None, :]
    fy = np.linspace(0, 1, SS)[:, None]
    t = (fx + (1 - fy)) / 2
    stops = [(0.30, (40, 118, 76)),
             (0.50, (135, 180, 52)),
             (0.70, (176, 204, 29)),
             (0.88, (208, 218, 22))]
    out = np.zeros((SS, SS, 3), np.float32)
    for ch in range(3):
        xs = [p[0] for p in stops]
        ys = [p[1][ch] for p in stops]
        out[:, :, ch] = np.interp(t, xs, ys)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def make(S):
    SS = S * 4
    img = Image.new("RGB", (SS, SS), BG)
    mask = arrow_mask(SS)
    img = Image.composite(gradient(SS), img, mask)

    # brilho translúcido sobre a metade superior do traço, como na referência
    hi = Image.new("L", (SS, SS), 0)
    ImageDraw.Draw(hi).polygon(
        [(0, SS * 0.52), (SS, SS * 0.10), (SS, 0), (0, 0)], fill=26)
    hi = Image.composite(hi, Image.new("L", (SS, SS), 0), mask)
    img = Image.composite(Image.new("RGB", (SS, SS), (255, 255, 255)),
                          img, hi.filter(ImageFilter.GaussianBlur(SS * 0.004)))
    return img.resize((S, S), Image.LANCZOS)


for s, n in [(180, "app-icon-180.png"), (512, "app-icon-512.png"), (1024, "app-icon-1024.png")]:
    make(s).save(n, "PNG", optimize=True)
print("ícones gerados")

# conferência: silhueta contra a referência
im = Image.open("app-icon-512.png").convert("RGB").resize((40, 40), Image.LANCZOS)
px = im.load()
for y in range(40):
    print(''.join('#' if sum(abs(px[x, y][i] - BG[i]) for i in range(3)) > 60 else '.'
                  for x in range(40)))
