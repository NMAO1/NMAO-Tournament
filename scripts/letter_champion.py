#!/usr/bin/env python3
"""
Bake a crisp "SEASON CHAMPION" banner + S# seal onto a cropped, transparent
Season Champion medallion (generated text-free). Consistent type across all seasons.

Usage: python3 scripts/letter_champion.py <in.png> <season_num> <out.png>
"""
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

def grad(w,h,top,mid,bot):
    a=np.zeros((h,w,4),np.uint8)
    for y in range(h):
        t=y/max(h-1,1)
        c=[np.interp(t,[0,.5,1],[top[i],mid[i],bot[i]]) for i in range(3)]
        a[y,:,:3]=c; a[y,:,3]=255
    return Image.fromarray(a,'RGBA')

def spaced(s,n=1): return (" "*n).join(list(s))

def letter(inp, season, out):
    im=Image.open(inp).convert('RGBA'); W,H=im.size
    layer=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(layer)

    # ---- banner ----
    cx,cy=W/2,int(H*0.815); bw,bh=int(W*0.72),int(W*0.150)
    L,R,T,B=int(cx-bw/2),int(cx+bw/2),int(cy-bh/2),int(cy+bh/2)
    tl=int(W*0.075); notch=int(W*0.030)
    # shadow
    sh=Image.new('RGBA',(W,H),(0,0,0,0)); ds=ImageDraw.Draw(sh)
    ds.rounded_rectangle((L,T+6,R,B+6),radius=int(bh*0.22),fill=(0,0,0,120))
    sh=sh.filter(ImageFilter.GaussianBlur(6)); layer.alpha_composite(sh)
    # tails (dark metal)
    dk=(74,54,16,255)
    d.polygon([(L+10,T),(L-tl,T+int(bh*0.16)),(L-tl+notch,cy),(L-tl,B-int(bh*0.16)),(L+10,B)],fill=dk)
    d.polygon([(R-10,T),(R+tl,T+int(bh*0.16)),(R+tl-notch,cy),(R+tl,B-int(bh*0.16)),(R-10,B)],fill=dk)
    # body gold
    body=grad(bw,bh,(255,236,170),(230,185,63),(176,126,28))
    mask=Image.new('L',(bw,bh),0); ImageDraw.Draw(mask).rounded_rectangle((0,0,bw-1,bh-1),radius=int(bh*0.22),fill=255)
    layer.paste(body,(L,T),mask)
    d.rounded_rectangle((L,T,R-1,B-1),radius=int(bh*0.22),outline=(110,78,16),width=3)
    d.rounded_rectangle((L+6,T+6,R-7,B-7),radius=int(bh*0.18),outline=(255,245,205,140),width=2)

    # ---- S# seal: left end-cap of the banner ----
    r=int(W*0.082); sx,sy=L+int(r*0.15),cy

    # text centered in the space to the RIGHT of the seal
    tL=sx+r+int(W*0.02); tR=R-int(W*0.03); avail=tR-tL
    txt=spaced("SEASON CHAMPION",1); fs=int(bh*0.44)
    f=ImageFont.truetype(SERIF,fs)
    while d.textlength(txt,font=f)>avail and fs>10:
        fs-=1; f=ImageFont.truetype(SERIF,fs)
    tw=d.textlength(txt,font=f); tx=tL+(avail-tw)/2; ty=cy-fs*0.72
    d.text((tx,ty+2),txt,font=f,fill=(255,245,210,160))   # highlight
    d.text((tx,ty),txt,font=f,fill=(58,38,6,255))          # main
    seal=grad(r*2,r*2,(255,240,180),(230,185,63),(150,105,20))
    cm=Image.new('L',(r*2,r*2),0); ImageDraw.Draw(cm).ellipse((0,0,r*2-1,r*2-1),fill=255)
    ss=Image.new('RGBA',(W,H),(0,0,0,0)); dss=ImageDraw.Draw(ss)
    dss.ellipse((sx-r-5,sy-r-5,sx+r+5,sy+r+5),fill=(0,0,0,110))
    ss=ss.filter(ImageFilter.GaussianBlur(5)); layer.alpha_composite(ss)
    layer.paste(seal,(sx-r,sy-r),cm)
    d.ellipse((sx-r,sy-r,sx+r,sy+r),outline=(214,219,226),width=4)      # platinum ring
    d.ellipse((sx-r+6,sy-r+6,sx+r-6,sy+r-6),outline=(110,78,16),width=2)
    st=f"S{season}"; fs2=int(r*1.05); f2=ImageFont.truetype(SERIF,fs2)
    stw=d.textlength(st,font=f2)
    d.text((sx-stw/2,sy-fs2*0.62+2),st,font=f2,fill=(255,245,210,150))
    d.text((sx-stw/2,sy-fs2*0.62),st,font=f2,fill=(48,30,4,255))

    Image.alpha_composite(im,layer).save(out)

if __name__=='__main__':
    letter(sys.argv[1],sys.argv[2],sys.argv[3])
