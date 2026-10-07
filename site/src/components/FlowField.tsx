import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  life: number;
}

// Cheap smooth pseudo-noise: a sum of sines. Good enough for a flow field
// and easy to read; swap in simplex noise if you want more organic motion.
function field(x: number, y: number, t: number): number {
  const s = 0.0025;
  return (Math.sin(x * s + t) * Math.cos(y * s * 1.3 - t * 0.7) + Math.sin((x + y) * s * 0.6 + t * 0.5)) * Math.PI;
}

/**
 * The animated hero background: particles drifting through a noise field.
 * Colors come from CSS variables, so it follows light/dark mode. It pauses
 * while off-screen and draws a single still frame for Reduce Motion.
 */
export function FlowField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return; // no canvas support (e.g. the test DOM)

    const media = (query: string) => window.matchMedia?.(query);
    const reduceMotion = media("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const darkScheme = media("(prefers-color-scheme: dark)");

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let frame = 0;
    let onScreen = true;
    let colors = readColors();

    function readColors() {
      const style = getComputedStyle(canvas!);
      return {
        bg: style.getPropertyValue("--flow-bg").trim() || "#000",
        fade: style.getPropertyValue("--flow-fade").trim() || "rgb(0 0 0 / 0.06)",
        lightness: style.getPropertyValue("--flow-lightness").trim() || "64%",
      };
    }

    function resize() {
      const newWidth = canvas!.clientWidth;
      const newHeight = canvas!.clientHeight;
      if (newWidth === width && Math.abs(newHeight - height) < 120) return; // mobile URL bar
      width = newWidth;
      height = newHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: Math.floor((width * height) / 4000) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        life: Math.random() * 200,
      }));
      ctx!.fillStyle = colors.bg;
      ctx!.fillRect(0, 0, width, height);
    }

    function draw(time: number) {
      const t = time * 0.0001;
      ctx!.fillStyle = colors.fade;
      ctx!.fillRect(0, 0, width, height);
      for (const p of particles) {
        const angle = field(p.x, p.y, t);
        const nx = p.x + Math.cos(angle) * 1.2;
        const ny = p.y + Math.sin(angle) * 1.2;
        // Apple-like blue → indigo → purple hues.
        const hue = 215 + 60 * Math.sin(angle);
        ctx!.strokeStyle = `hsl(${hue} 85% ${colors.lightness} / 0.5)`;
        ctx!.beginPath();
        ctx!.moveTo(p.x, p.y);
        ctx!.lineTo(nx, ny);
        ctx!.stroke();
        p.x = nx;
        p.y = ny;
        p.life -= 1;
        if (p.life < 0 || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
          p.x = Math.random() * width;
          p.y = Math.random() * height;
          p.life = 100 + Math.random() * 200;
        }
      }
    }

    function loop(time: number) {
      draw(time);
      if (onScreen) frame = requestAnimationFrame(loop);
    }

    function start() {
      cancelAnimationFrame(frame);
      if (reduceMotion) {
        for (let i = 0; i < 360; i++) draw(i * 16); // one still frame, with trails
      } else if (onScreen) {
        frame = requestAnimationFrame(loop);
      }
    }

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            onScreen = entry?.isIntersecting ?? true;
            if (onScreen && !reduceMotion) start();
          });
    observer?.observe(canvas);

    const onSchemeChange = () => {
      colors = readColors();
      width = 0; // force a full repaint in the new colors
      resize();
      start();
    };
    darkScheme?.addEventListener("change", onSchemeChange);
    window.addEventListener("resize", resize);

    resize();
    start();

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      darkScheme?.removeEventListener("change", onSchemeChange);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="flow-field" aria-hidden="true" />;
}
