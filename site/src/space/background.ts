// The space behind the whole page, drawn on the fixed full-window canvas of
// components/SpaceBackground.tsx (which loads this file, and Three.js with
// it, only after the page is up).
//
// Deep space, like a strategy game's galaxy map:
//   - faint nebula clouds over a near-black sky      (background/sky.ts)
//   - a big spiral galaxy rising below the hero text (background/galaxyLayers.ts)
//   - a starfield of three depth layers, page-long   (background/starfield.ts)
//
// Two passes per frame:
//   1. The soft layers (sky and nebula, the galaxy's glow) are drawn
//      into a small offscreen picture, a "render target", a third of the
//      window's width and height. They're all blurry by nature, so nobody
//      can tell, and it's 9x fewer pixels to compute (more on high-density
//      screens): the noise in those shaders is the scene's most expensive
//      work. (A quarter would be cheaper still, but the stretched picture
//      starts to show its pixel grid in dark gradients.)
//   2. On the real canvas: that picture stretched to full size (with the
//      legibility limits, see background/glsl.ts), then the sharp layers on
//      top: the galaxy's stars and the starfield, at full resolution.
// Three.js "layers" decide which objects each pass draws: every object is on
// layer SOFT or SHARP, and the camera is switched between the two.
//
// The composition comes from the page itself: the scene measures where the
// hero's text block ends and puts the galaxy's core in the space below it
// (partly below the window's edge on short windows, rising into view as you
// scroll), so the bright core never sits behind the words, whatever the
// window's size.
//
// Motion: the galaxy turns slowly, stars twinkle, clouds drift. Scrolling
// eases the camera along: the galaxy rises, recedes and fades out of the hero,
// so the sections below sit over a calm starfield, and the star layers slide
// at different speeds (parallax). With a mouse, the view follows the pointer
// a little, near stars more than far ones. After a while without any input,
// the ambient motion drops to a lower frame rate to save battery.
//
// Still frames (Reduce Motion, Pause): nothing moves on its own, but the page
// text still scrolls over the picture, so the picture must stay legible under
// it. Pause keeps the frame it was showing. When scrolling would carry text
// onto a bright part of it, the scene draws one new frame, with no transition:
// near the top, the hero's frame (galaxy below the text, as on arrival);
// further down, a calm frame without the galaxy. Reduce Motion only ever uses
// those two. See chooseStillFrame().
import { MathUtils, PerspectiveCamera, Scene, Vector2, WebGLRenderTarget } from "three";
import { createGalaxyLayers } from "./background/galaxyLayers";
import { createComposite, createEdgeFade, createSky, srgb } from "./background/sky";
import { createStarfield, starCount } from "./background/starfield";
import { createSharedUniforms } from "./background/uniforms";
import { createEngine, lowPowerDevice } from "./engine";
import { DEFAULT_GALAXY, generateGalaxy } from "./galaxy";
import { readPalette } from "./palette";
import type { SceneOptions, SpaceScene } from "./types";

// Three.js layers are numbered 0-31; 0 is everything's default.
const SOFT = 1;
const SHARP = 2;
/** The soft layers' picture is this many times smaller than the window. */
const SOFT_DIVISOR = 3;

const FOV = 40; // the camera's vertical field of view, in degrees
const DEPTH = 30; // the galaxy's distance from the camera before scrolling
/** How fast the galaxy rises as the page scrolls, as a share of the page's speed. */
const RISE = 0.75;
const SPIN_SPEED = 0.012; // radians per second: one turn in about 9 minutes
/** The animation time shown with Reduce Motion: a fixed, nice-looking moment. */
const STILL_TIME = 40;
/** With only slow ambient motion, 30 frames per second look the same as 60... */
const AMBIENT_FPS = 30;
/** ...below the hero, where only the twinkle and the nebula move, 20 do... */
const CALM_FPS = 20;
/** ...and after this many seconds without scrolling or pointing, 10 will do. */
const IDLE_AFTER = 45;
const IDLE_FPS = 10;
/**
 * Galaxy stars per square CSS pixel on a 1280x800 desktop (45,000 stars,
 * a radius of about 650px). A small phone screen squeezes its stars into a
 * much smaller galaxy; they're dimmed to match, so the galaxy sends the
 * same light per pixel (and text over it stays as readable) everywhere.
 */
const STAR_DENSITY = 45_000 / (Math.PI * 650 * 650);
/** Space kept clear around the hero's text, in CSS pixels. */
const TEXT_PADDING = 24;
/** The floating nav's height: the galaxy stays dim behind it, like behind text. */
const NAV_CLEARANCE = 80;
/**
 * On touch screens, height changes smaller than this (the browser's toolbar
 * sliding in or out) don't move anything: see updateLayout().
 */
const TOOLBAR_SLACK = 150;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where the page's text is, in page coordinates (CSS pixels from the page's top). */
interface Zones {
  /** The hero section. */
  hero: Rect;
  /** The hero's text block, padded by TEXT_PADDING. */
  text: Rect;
  /** Where the galaxy's open area ends: just above the next section's first line. */
  openBottom: number;
  /** The top of the first line of text after the hero. */
  nextTextTop: number;
}

/**
 * The picture on screen, described by what it was drawn for:
 *   - "live": the animated scene's frame, at scroll position `pose` (eased),
 *     with the text zones measured at `zonesAt` (the real scroll position).
 *   - "hero": the still frame of the hero, as on arrival (pose 0).
 *   - "calm": the still frame for the rest of the page, without the galaxy.
 */
interface Frame {
  kind: "live" | "hero" | "calm";
  pose: number;
  zonesAt: number;
}

export function createBackground(canvas: HTMLCanvasElement, initial: SceneOptions): SpaceScene {
  const lowPower = lowPowerDevice();
  const shared = createSharedUniforms();
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 500);
  const tanHalfFov = Math.tan(MathUtils.degToRad(FOV / 2));

  // The offscreen picture for the soft layers, in CSS pixels / SOFT_DIVISOR
  // (whatever the screen's pixel density). No depth buffer: nothing in it
  // needs depth testing. Its size is set in applySize().
  const softTarget = new WebGLRenderTarget(1, 1, { depthBuffer: false });

  const sky = createSky(shared);
  sky.mesh.layers.set(SOFT);
  const composite = createComposite(shared, softTarget.texture);
  composite.mesh.layers.set(SHARP);
  const starfield = createStarfield(shared, starCount(lowPower));
  starfield.points.layers.set(SHARP);
  const galaxyOptions = { ...DEFAULT_GALAXY, count: lowPower ? 16_000 : 45_000 };
  const galaxy = createGalaxyLayers(shared, generateGalaxy(galaxyOptions), galaxyOptions);
  galaxy.disc.layers.set(SOFT);
  galaxy.bulge.layers.set(SOFT);
  galaxy.stars.layers.set(SHARP);
  galaxy.uniforms.starRefDepth.value = DEPTH; // stars have their set size at this distance
  const edgeFade = createEdgeFade(shared);
  edgeFade.mesh.layers.set(SHARP);
  scene.add(sky.mesh, composite.mesh, galaxy.tilt, starfield.points, edgeFade.mesh);

  let options = initial;
  let time = STILL_TIME;
  let scroll = window.scrollY; // eased toward window.scrollY
  const mouse = new Vector2(); // eased toward mouseTarget
  const mouseTarget = new Vector2();
  const noMouse = new Vector2(); // what Reduce Motion uses instead (never changed)
  let dirty = true; // something changed: draw the next frame for sure
  let sizeDirty = true;
  let sinceDraw = 0;
  let sinceInput = 0; // seconds since the visitor last scrolled or pointed
  let zones: Zones | null = null;
  const frame: Frame = { kind: "live", pose: scroll, zonesAt: scroll };
  // The galaxy's place before any scrolling, in CSS pixels (see compose()).
  const look = { y: 0, radius: 1, tilt: 0.5, roll: 0.1 };
  let layoutWidth = 0;

  const animated = () => !options.paused && !options.reduceMotion;

  const engine = createEngine(
    canvas,
    {
      onResize(width, height) {
        // Called once from inside createEngine, before `engine` exists, so
        // only note the size here; applySize() runs on the next frame.
        shared.uViewport.value.set(width, height);
        sizeDirty = true;
        dirty = true;
      },
      onFrame(delta) {
        if (sizeDirty) applySize();
        if (animated()) {
          time += delta;
          // Easing: move a fraction of the remaining way each frame, so the
          // camera glides after the scroll instead of jumping with it.
          // MathUtils.damp computes that fraction from the frame's duration,
          // so it feels the same at 30, 60 or 120 frames per second.
          const target = window.scrollY;
          scroll = MathUtils.damp(scroll, target, 4, delta);
          if (Math.abs(scroll - target) < 0.5) scroll = target;
          mouse.x = MathUtils.damp(mouse.x, mouseTarget.x, 3, delta);
          mouse.y = MathUtils.damp(mouse.y, mouseTarget.y, 3, delta);
          const settling = scroll !== target || mouse.distanceTo(mouseTarget) > 0.002;
          // Only slow ambient motion left? Skip frames: half the GPU work
          // (and battery) or less, for a difference nobody can see.
          sinceDraw += delta;
          sinceInput += delta;
          const fps = sinceInput > IDLE_AFTER ? IDLE_FPS : galaxy.tilt.visible ? AMBIENT_FPS : CALM_FPS;
          if (!dirty && !settling && sinceDraw < 1 / fps - 0.004) return;
        }
        sinceDraw = 0;
        dirty = false;
        draw();
      },
    },
    { maxPixelRatio: lowPower ? 1.5 : 2 },
  );

  function applySize() {
    sizeDirty = false;
    const { x: width, y: height } = shared.uViewport.value;
    shared.uPixelRatio.value = engine.renderer.getPixelRatio();
    const toolbarOnly = updateLayout(width, height);
    if (!toolbarOnly) {
      const softWidth = Math.max(1, Math.round(width / SOFT_DIVISOR));
      const softHeight = Math.max(1, Math.round(height / SOFT_DIVISOR));
      softTarget.setSize(softWidth, softHeight);
      shared.uSoftSize.value.set(softWidth, softHeight);
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    measureEdges();
    measureZones();
    if (!animated()) chooseStillFrame();
  }

  // A phone browser's toolbar slides away as you scroll down and back as you
  // scroll up, and the fixed canvas grows and shrinks with it. If everything
  // were laid out on the canvas's height, the stars and the galaxy would jump
  // each time. On touch screens, height-only changes smaller than
  // TOOLBAR_SLACK keep the tallest height seen as the layout size (uLayout):
  // the picture stays put and the toolbar just covers or uncovers its bottom
  // edge. (The low-resolution picture isn't resized either: it's stretched
  // over the canvas, and a few percent of stretch in a blur doesn't show.)
  // Returns whether this was such a toolbar-only change.
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  function updateLayout(width: number, height: number): boolean {
    const layout = shared.uLayout.value;
    const toolbarOnly =
      coarsePointer.matches && width === layoutWidth && Math.abs(height - layout.y) < TOOLBAR_SLACK;
    layoutWidth = width;
    layout.set(width, toolbarOnly ? Math.max(layout.y, height) : height);
    return toolbarOnly;
  }

  // How much of the window's top and bottom edges the browser covers with its
  // own strips (sky.ts, createEdgeFade, explains why that matters). CSS knows
  // the device's safe areas as env(safe-area-inset-*) (they need
  // viewport-fit=cover, set in index.html); JavaScript can't read env()
  // directly, so a hidden probe element takes them as padding and reports the
  // computed size. Elsewhere they're 0. On touch screens the bottom gets 24px
  // more: on an iPhone, Safari's bottom strip measured about 50pt against a
  // 34pt safe area.
  function measureEdges() {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;" +
      "padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)";
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const top = parseFloat(style.paddingTop) || 0;
    const bottom = parseFloat(style.paddingBottom) || 0;
    probe.remove();
    edgeFade.material.uniforms.uEdgeTop!.value = top;
    edgeFade.material.uniforms.uEdgeBottom!.value = bottom + (coarsePointer.matches ? 24 : 0);
  }

  // The hero's text block, the hero itself and the first line after it, in
  // page coordinates (so they only need measuring again when the layout
  // changes, not on every scroll).
  function measureZones() {
    const hero = document.getElementById("top");
    const text = hero?.querySelector(".hero-content");
    if (!hero || !text) {
      zones = null; // unknown page: the text-safe limit applies everywhere
    } else {
      const y = window.scrollY;
      const h = hero.getBoundingClientRect();
      const t = text.getBoundingClientRect();
      const heroBottom = h.bottom + y;
      const nextTextTop = firstTextTop(hero) ?? heroBottom;
      zones = {
        hero: { left: h.left, top: h.top + y, right: h.right, bottom: heroBottom },
        text: {
          left: t.left - TEXT_PADDING,
          top: t.top + y - TEXT_PADDING,
          right: t.right + TEXT_PADDING,
          bottom: t.bottom + y + TEXT_PADDING,
        },
        // The galaxy may glow past the hero's own bottom edge, through the
        // next section's empty top padding, up to just above its first line.
        openBottom: Math.max(heroBottom, nextTextTop - TEXT_PADDING),
        nextTextTop,
      };
    }
    compose();
  }

  /** The top of the first visible line of text after `element`, in page coordinates. */
  function firstTextTop(element: Element): number | null {
    for (let section = element.nextElementSibling; section; section = section.nextElementSibling) {
      // A TreeWalker visits the text nodes inside an element in reading order.
      const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        // A Range around the text measures the text itself, not its box.
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        if (rect.width > 1 && rect.height > 1) return rect.top + window.scrollY;
      }
    }
    return null;
  }

  // Web fonts arriving, the text rewrapping or the window resizing can move
  // the text: measure again. The hero keeps its size when only its text moves
  // (it's at least a screen tall, with the text centered), so the text block
  // is watched too, and the fonts' arrival as a last resort.
  const layoutObserver = new ResizeObserver(() => relayout());
  const heroElement = document.getElementById("top");
  if (heroElement) layoutObserver.observe(heroElement);
  const textElement = heroElement?.querySelector(".hero-content");
  if (textElement) layoutObserver.observe(textElement);
  let disposed = false;
  document.fonts?.ready.then(() => {
    if (!disposed) relayout();
  });
  function relayout() {
    // (Before the first frame, applySize() will measure anyway.)
    if (!sizeDirty) {
      measureZones();
      if (!animated()) chooseStillFrame();
    }
    dirty = true;
    engine.requestRender();
  }

  /**
   * Places the galaxy for this window, before any scrolling. Its size
   * follows the window's width (up to a 1.9:1 shape, so an ultra-wide
   * monitor doesn't get a galaxy taller than the screen; larger on phones,
   * where it's seen more edge-on). Its core goes below the hero's text block:
   * about halfway down the space left under it, at least 64px clear of it,
   * which on short windows puts part of the galaxy below the window's edge,
   * to rise into view as the page scrolls.
   */
  function compose() {
    const { x: width, y: height } = shared.uLayout.value;
    const aspect = width / height;
    // 0 on landscape windows, 1 on tall phone screens, blended in between.
    const portrait = 1 - MathUtils.smoothstep(aspect, 0.6, 1.1);
    // tilt: how far the disc is tipped toward us, in radians (0 = edge-on,
    // PI/2 = face-on; 0.5 shows it about half as tall as wide). roll: a slight
    // sideways lean, so it isn't perfectly level.
    look.tilt = MathUtils.lerp(0.5, 0.6, portrait);
    look.roll = MathUtils.lerp(0.1, 0.14, portrait);
    look.radius = MathUtils.lerp(0.51, 0.75, portrait) * Math.min(width, 1.9 * height);
    const textBottom = zones ? zones.text.bottom : height * 0.6;
    const below = height - textBottom; // free space under the text block
    look.y = textBottom + MathUtils.clamp(0.5 * below, 64, 0.22 * height);
    // The soft edge around the text: 110px where there's room, down to 48px
    // on short windows, so the core isn't dimmed for being near the text.
    shared.uTextRamp.value = MathUtils.clamp(0.5 * below, 48, 110);
  }

  /** Places, tilts, turns and fades the galaxy for a scroll position and time. */
  function placeGalaxy(scrollY: number, pointer: Vector2, seconds: number) {
    const { x: width, y: height } = shared.uViewport.value;
    const aspect = width / height;
    // How many window heights the page has scrolled.
    const progress = Math.max(0, scrollY / shared.uLayout.value.y);
    // The galaxy recedes as the page scrolls: further away looks smaller.
    const depth = DEPTH * (1 + 0.9 * progress);
    // How much of the window is visible at a distance: the camera's view is a
    // pyramid, so at distance d it's 2 * d * tan(fov / 2) scene units tall,
    // and the window's height (in CSS pixels) maps onto that.
    const halfHeight = depth * tanHalfFov;
    // Where the core is on screen, in CSS pixels, then in NDC ("normalized
    // device coordinates", -1 to 1 across the window, y up). It rises slower
    // than the page scrolls. The mouse moves the "camera" toward the pointer,
    // so the galaxy shifts a little the other way, as the star layers do.
    const coreY = look.y - RISE * scrollY;
    const ndcX = -pointer.x * 0.012;
    const ndcY = 1 - (2 * coreY) / height + pointer.y * 0.012;
    galaxy.tilt.position.set(ndcX * halfHeight * aspect, ndcY * halfHeight, -depth);
    // Its size in scene units, from the size in pixels at the starting distance.
    const radius = (look.radius / (height / 2)) * DEPTH * tanHalfFov;
    galaxy.tilt.scale.setScalar(radius / galaxyOptions.radius);
    // As it recedes it also tips toward edge-on, as if we were sinking below
    // its plane; the mouse rocks it gently.
    galaxy.tilt.rotation.set(look.tilt - 0.15 * progress + pointer.y * 0.04, 0, look.roll + pointer.x * 0.03);
    galaxy.spin.rotation.y = 0.6 + seconds * SPIN_SPEED;
    galaxy.uniforms.bulgeSize.value = radius * 0.34;

    // Fade out over the first 3/4 of a window of scrolling.
    const fade = 1 - MathUtils.smoothstep(progress, 0.1, 0.75);
    // How crowded the stars are compared with the desktop reference.
    const density = galaxyOptions.count / (Math.PI * look.radius * look.radius);
    const crowding = MathUtils.clamp(STAR_DENSITY / density, 0.35, 1);
    galaxy.uniforms.starIntensity.value = fade * crowding;
    galaxy.uniforms.discIntensity.value = fade;
    galaxy.uniforms.bulgeIntensity.value = fade;
    // Faded out completely: skip drawing it at all.
    galaxy.tilt.visible = fade > 0.002;
  }

  /** Hands the text zones the frame was drawn for to the shaders. */
  function setZones() {
    if (!zones || frame.kind === "calm") {
      shared.uZones.value = 0; // text-safe everywhere
      return;
    }
    const { hero, text } = zones;
    const y = frame.zonesAt;
    // In the hero's still frame, the hero's text will slide up over the
    // picture as the page scrolls, so the zone kept dark for it runs from its
    // bottom edge all the way up.
    const textTop = frame.kind === "hero" ? -1e5 : text.top - y;
    shared.uTextRect.value.set(text.left, textTop, text.right, text.bottom - y);
    // The galaxy also stays dim behind the floating nav.
    const heroTop = Math.max(hero.top - y, NAV_CLEARANCE);
    // (The hero is as wide as the window: its sides are the window's edges,
    // which shouldn't dim anything, so they're pushed far out.)
    shared.uHeroRect.value.set(-1e5, heroTop, 1e5, zones.openBottom - y);
    shared.uZones.value = 1;
  }

  function draw() {
    const still = options.reduceMotion;
    const seconds = still ? STILL_TIME : time;
    const pointer = still ? noMouse : mouse;
    if (animated()) {
      frame.kind = "live";
      frame.pose = scroll;
      frame.zonesAt = window.scrollY;
    }
    shared.uTime.value = seconds;
    shared.uScroll.value = frame.pose;
    shared.uMouse.value.copy(pointer);
    setZones();
    if (frame.kind === "calm") galaxy.tilt.visible = false;
    else placeGalaxy(frame.pose, pointer, seconds);

    const { renderer } = engine;
    renderer.setRenderTarget(softTarget);
    camera.layers.set(SOFT);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null); // back to the canvas
    camera.layers.set(SHARP);
    renderer.render(scene, camera);
  }

  // ----- Still frames -----

  /**
   * The last scroll position at which the hero's still frame is legible:
   * until the next section's first line would reach the galaxy's open area
   * (or the window's bottom edge, if that area runs past it).
   */
  function heroLimit(): number {
    if (!zones) return -1;
    return zones.nextTextTop - Math.min(zones.openBottom, shared.uViewport.value.y);
  }

  /** Whether the frame that was on screen when Pause was pressed still works at scroll position y. */
  function liveFrameHolds(y: number): boolean {
    if (!zones) return true; // drawn text-safe everywhere
    const drawnAt = frame.zonesAt;
    // The bottom of that frame's open area on screen; none left: always fine.
    const openBottom = Math.min(zones.openBottom - drawnAt, shared.uViewport.value.y);
    if (openBottom <= NAV_CLEARANCE) return true;
    // The hero's text may move by its padding, and the next section's first
    // line may come up to the open area, not into it.
    return Math.abs(y - drawnAt) <= TEXT_PADDING && y <= zones.nextTextTop - openBottom;
  }

  /**
   * In the still modes: picks the frame for the current scroll position.
   * Returns whether it changed (and needs drawing).
   */
  function chooseStillFrame(): boolean {
    const y = window.scrollY;
    if (frame.kind === "live" && liveFrameHolds(y)) return false;
    const kind = y <= heroLimit() ? "hero" : "calm";
    if (frame.kind === kind) return false;
    frame.kind = kind;
    frame.pose = 0;
    frame.zonesAt = 0;
    return true;
  }

  // A passive listener promises not to call preventDefault(), so the browser
  // can scroll right away without waiting for it. While animating, the frame
  // loop reads the scroll position itself; this only wakes the still modes.
  const onScroll = () => {
    sinceInput = 0;
    if (!animated() && chooseStillFrame()) {
      dirty = true;
      engine.requestRender();
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  // A gentle lean toward the mouse, for real mice and trackpads only:
  // "(pointer: fine)" is false on touch screens, where there's no hover.
  const finePointer = window.matchMedia("(pointer: fine)");
  const onPointerMove = (event: PointerEvent) => {
    sinceInput = 0;
    if (!finePointer.matches || event.pointerType !== "mouse") return;
    mouseTarget.set((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
  };
  const onPointerLeave = () => mouseTarget.set(0, 0);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);

  // "Increase contrast" (macOS, iOS) or a high-contrast setting: the stars
  // and the glow get quieter where text can be (sky.ts, starfield.ts).
  const moreContrast = window.matchMedia("(prefers-contrast: more)");
  const onContrast = () => {
    shared.uMoreContrast.value = moreContrast.matches ? 1 : 0;
    dirty = true;
    engine.requestRender();
  };
  moreContrast.addEventListener("change", onContrast);
  shared.uMoreContrast.value = moreContrast.matches ? 1 : 0;

  // The colors come from the CSS tokens (tokens.css). The site has one
  // appearance, so they're read once.
  const palette = readPalette();
  const u = sky.material.uniforms;
  srgb(palette.skyTop, u.uSkyTop!.value);
  srgb(palette.skyBottom, u.uSkyBottom!.value);
  srgb(palette.nebula[0], u.uNebula1!.value);
  srgb(palette.nebula[1], u.uNebula2!.value);
  srgb(palette.nebula[2], u.uNebula3!.value);
  srgb(palette.core, galaxy.colors.uCore.value);
  srgb(palette.arm, galaxy.colors.uArm.value);
  srgb(palette.nebula[2], galaxy.colors.uPink.value);
  srgb(palette.background, edgeFade.material.uniforms.uColor!.value);

  function apply(next: SceneOptions) {
    const wasAnimated = animated();
    options = next;
    if (animated()) {
      // Back to animating: start from where the page is, no swoop.
      if (!wasAnimated) scroll = window.scrollY;
    } else if (next.reduceMotion) {
      // Reduce Motion only uses its two fixed frames, never a live one.
      frame.kind = window.scrollY <= heroLimit() ? "hero" : "calm";
      frame.pose = 0;
      frame.zonesAt = 0;
    } else {
      // Paused: keep the frame on screen, if it still works here.
      chooseStillFrame();
    }
    engine.setAnimating(animated());
    dirty = true;
    engine.requestRender();
  }
  apply(initial);

  return {
    update: apply,
    dispose() {
      disposed = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      moreContrast.removeEventListener("change", onContrast);
      layoutObserver.disconnect();
      engine.dispose();
      softTarget.dispose();
      sky.dispose();
      composite.dispose();
      edgeFade.dispose();
      starfield.dispose();
      galaxy.dispose();
    },
  };
}
