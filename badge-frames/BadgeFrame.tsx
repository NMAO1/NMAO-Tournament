/* NMAO Badge Frame — React wrapper for the Next.js app.
   Import the stylesheet once (e.g. in the arena layout):  import "./badge-frames.css";
   Then wrap a competitor's video/avatar:

     <BadgeFrame spec={frames["undefeated"]}>
       <video src={duel.videoUrl} muted playsInline />
     </BadgeFrame>

   `frames` = the parsed docs/badge-frames.json keyed by badge code, or fetch from the API. */
"use client";
import { useEffect, useRef } from "react";
import { applyFrame } from "./badge-frames.js";
import type { FrameSpec } from "./frame-spec";

export function BadgeFrame({
  spec,
  radius = 16,
  className = "",
  style,
  children,
}: {
  spec: FrameSpec;
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) applyFrame(ref.current, spec);
  }, [spec]);

  return (
    <div ref={ref} className={`bf ${className}`} style={{ borderRadius: radius, ...style }}>
      <div className="bf__inner" style={{ borderRadius: Math.max(radius - 7, 0) }}>
        {children}
      </div>
    </div>
  );
}

export default BadgeFrame;
