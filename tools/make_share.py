#!/usr/bin/env python3
"""기사 1건으로 SNS 공유용 파일을 만듭니다.

사용: python3 tools/make_share.py <기사 id>
결과: assets/share/<id>-card.jpg  (페이스북용 1200x630)
      assets/share/<id>-short.mp4 (유튜브 숏츠용 1080x1920, 약 25초, 무음)
"""
import json, os, re, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
BURG, BLUE, WHITE = (74, 8, 32), (20, 40, 110), (255, 255, 255)


def font(size):
    return ImageFont.truetype(FONT, size)


def wrap(draw, text, f, width):
    lines, cur = [], ""
    for word in text.split(" "):
        test = (cur + " " + word).strip()
        if draw.textlength(test, font=f) <= width:
            cur = test
            continue
        if cur:
            lines.append(cur)
        cur = word
        while draw.textlength(cur, font=f) > width:  # 아주 긴 단어는 글자 단위로 자릅니다
            i = len(cur)
            while i > 1 and draw.textlength(cur[:i], font=f) > width:
                i -= 1
            lines.append(cur[:i]); cur = cur[i:]
    if cur:
        lines.append(cur)
    return lines


def cover(img, w, h):
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x, y = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


def background(art, w, h):
    if art.get("image_url") and os.path.exists(os.path.join(ROOT, art["image_url"])):
        bg = cover(Image.open(os.path.join(ROOT, art["image_url"])).convert("RGB"), w, h)
    else:  # 삽화가 없으면 버건디-청색 그라데이션
        bg = Image.new("RGB", (w, h))
        d = ImageDraw.Draw(bg)
        for y in range(h):
            t = y / h
            d.line([(0, y), (w, y)], fill=tuple(round(BURG[i] * (1 - t) + BLUE[i] * t) for i in range(3)))
    return bg


def shade(img, top=0.15, bottom=0.88):
    """아래쪽을 어둡게 해 글자가 잘 보이게 합니다."""
    w, h = img.size
    ov = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(ov)
    for y in range(h):
        t = y / h
        a = 70 if t < top else round(70 + 175 * min(1, (t - top) / (bottom - top)))
        d.line([(0, y), (w, y)], fill=(18, 4, 14, a))
    return Image.alpha_composite(img.convert("RGBA"), ov)


def logo(width):
    sprite = Image.open(os.path.join(ROOT, "assets/logo3d-spin.webp")).convert("RGBA")
    fw = sprite.width // 36
    f0 = sprite.crop((0, 0, fw, sprite.height))
    f0 = f0.crop(f0.getbbox())
    return f0.resize((width, round(f0.height * width / f0.width)), Image.LANCZOS)


def pill(d, xy, text, f, fill):
    x, y = xy
    w = d.textlength(text, font=f)
    d.rounded_rectangle([x, y, x + w + 36, y + f.size + 22], radius=(f.size + 22) // 2, fill=fill)
    d.text((x + 18, y + 9), text, font=f, fill=WHITE)


def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?다])\s+", text.replace("\n", " ")) if len(s.strip()) > 8]


def slides(art):
    W, H = 1080, 1920
    base = shade(background(art, W, H).filter(ImageFilter.GaussianBlur(0)))
    lg = logo(420)
    paras = [p for p in art["body"].split("\n\n") if p.strip()]
    points = [sentences(p)[0] for p in paras[1:4] if sentences(p)]
    pages = [("title", art["title"])] + [("text", art["summary"])] + [("text", p) for p in points] + [("end", "")]
    out = []
    for kind, text in pages:
        im = base.copy()
        d = ImageDraw.Draw(im)
        im.alpha_composite(lg, ((W - lg.width) // 2, 120))
        pill(d, (70, 1040 if kind == "title" else 980), f"VoB AI 뉴스 · {art['section']}", font(40), (150, 20, 70))
        if kind == "title":
            f = font(84)
            y = 1140
            for line in wrap(d, text, f, W - 140)[:5]:
                d.text((70, y), line, font=f, fill=WHITE, stroke_width=2, stroke_fill=WHITE)
                y += 112
        elif kind == "text":
            f = font(58)
            y = 1080
            for line in wrap(d, text, f, W - 140)[:8]:
                d.text((70, y), line, font=f, fill=WHITE)
                y += 84
        else:
            f = font(64)
            d.text((70, 1080), "전체 기사는", font=f, fill=WHITE)
            d.text((70, 1170), "vobtv.kr", font=font(78), fill=(255, 170, 210), stroke_width=1, stroke_fill=(255, 170, 210))
            refs = ", ".join(s["name"] for s in art.get("sources", []))
            y = 1330
            for line in wrap(d, f"참고: {refs}", font(40), W - 140)[:3]:
                d.text((70, y), line, font=font(40), fill=(230, 220, 228))
                y += 58
        d.text((70, H - 110), "AI가 여러 언론 보도를 참고해 정리한 기사입니다", font=font(34), fill=(220, 210, 220))
        out.append(im.convert("RGB"))
    return out


def card(art, path):
    W, H = 1200, 630
    im = shade(background(art, W, H), top=0.0, bottom=0.75)
    d = ImageDraw.Draw(im)
    lg = logo(300)
    im.alpha_composite(lg, (50, 40))
    pill(d, (56, 300), f"VoB AI 뉴스 · {art['section']}", font(30), (150, 20, 70))
    y = 370
    for line in wrap(d, art["title"], font(54), W - 112)[:3]:
        d.text((56, y), line, font=font(54), fill=WHITE, stroke_width=1, stroke_fill=WHITE)
        y += 72
    im.convert("RGB").save(path, quality=88)


def video(pages, path):
    fps, xf = 30, 0.6
    durs = [5.0] + [4.5] * (len(pages) - 2) + [4.0]
    with tempfile.TemporaryDirectory() as tmp:
        clips = []
        for i, (im, du) in enumerate(zip(pages, durs)):
            p = os.path.join(tmp, f"s{i}.png"); im.save(p)
            c = os.path.join(tmp, f"c{i}.mp4")
            n = round(du * fps)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-i", p, "-vf",
                            f"scale=2160:-1,zoompan=z='1+0.04*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s=1080x1920:fps={fps},format=yuv420p",
                            "-frames:v", str(n), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", c], check=True)
            clips.append(c)
        args, filt, prev, off = [], [], "0:v", 0.0
        for c in clips:
            args += ["-i", c]
        for i in range(1, len(clips)):
            off += durs[i - 1] - xf
            filt.append(f"[{prev}][{i}:v]xfade=transition=fade:duration={xf}:offset={off:.2f}[v{i}]")
            prev = f"v{i}"
        total = sum(durs) - xf * (len(clips) - 1)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args, "-f", "lavfi", "-t", f"{total:.2f}", "-i", "anullsrc=r=44100:cl=stereo",
                        "-filter_complex", ";".join(filt), "-map", f"[{prev}]", "-map", f"{len(clips)}:a",
                        "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                        "-movflags", "+faststart", path], check=True)


def main():
    aid = sys.argv[1]
    art = next(a for a in json.load(open(os.path.join(ROOT, "data/news.json"), encoding="utf-8")) if a["id"] == aid)
    out = os.path.join(ROOT, "assets/share"); os.makedirs(out, exist_ok=True)
    card(art, os.path.join(out, f"{aid}-card.jpg"))
    video(slides(art), os.path.join(out, f"{aid}-short.mp4"))
    print(os.path.join(out, f"{aid}-card.jpg")); print(os.path.join(out, f"{aid}-short.mp4"))


if __name__ == "__main__":
    main()
