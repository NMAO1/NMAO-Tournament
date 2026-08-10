#!/usr/bin/env python3
"""
Crop NMAO badge art to the medallion only (transparent background).

Usage:
    python3 scripts/crop_medallion.py <in_dir_or_file> [out_dir]

- Detects the circular medallion (HoughCircles, falls back to a centered circle).
- Masks everything outside the rim to transparent, trims to the circle, pads to square.
- Output: 1024x1024 RGBA PNG, same filename. Background removed; medallion only.

Run this on every generated badge before it ships. Claude Code consumes the output
PNGs directly — no cropping happens in app code.
"""
import cv2, numpy as np, sys, os
from PIL import Image, ImageDraw

def detect_circle(path):
    img = cv2.imread(path); H,W = img.shape[:2]
    gray = cv2.medianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY),5)
    circles = cv2.HoughCircles(gray, cv2.HOUGH_GRADIENT, dp=1, minDist=W,
        param1=100, param2=40, minRadius=int(W*0.35), maxRadius=int(W*0.52))
    cx,cy,r = W/2,H/2,W*0.48
    if circles is not None:
        best=None; bestscore=1e9
        for (x,y,rr) in np.round(circles[0]).astype(int):
            d=((x-W/2)**2+(y-H/2)**2)**0.5; score=d-rr*0.15
            if score<bestscore: bestscore=score; best=(x,y,rr)
        cx,cy,r=best
    return int(cx),int(cy),int(r)

def crop(path,out,size=1024,inset=0.985):
    cx,cy,r=detect_circle(path); r=int(r*inset)
    im=Image.open(path).convert('RGBA'); W,H=im.size
    mask=Image.new('L',(W,H),0); ImageDraw.Draw(mask).ellipse((cx-r,cy-r,cx+r,cy+r),fill=255)
    im.putalpha(mask)
    im=im.crop((max(cx-r,0),max(cy-r,0),min(cx+r,W),min(cy+r,H)))
    s=max(im.size); sq=Image.new('RGBA',(s,s),(0,0,0,0))
    sq.paste(im,((s-im.size[0])//2,(s-im.size[1])//2),im)
    sq.resize((size,size)).save(out)

if __name__=='__main__':
    src=sys.argv[1]; out=sys.argv[2] if len(sys.argv)>2 else 'out'
    os.makedirs(out,exist_ok=True)
    files=[src] if os.path.isfile(src) else [os.path.join(src,f) for f in sorted(os.listdir(src)) if f.lower().endswith(('.png','.jpg','.jpeg','.webp'))]
    for f in files:
        name=os.path.splitext(os.path.basename(f))[0]+'.png'
        crop(f, os.path.join(out,name)); print('cropped', name)
