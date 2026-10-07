// The space behind the whole page, drawn on the fixed full-window canvas of
// components/SpaceBackground.tsx (which loads this file, and Three.js with
// it, only after the page is up).
//
// Dark appearance, deep space like a strategy game's galaxy map:
//   - faint nebula clouds over a near-black sky      (background/sky.ts)
//   - a big spiral galaxy rising behind the hero     (background/galaxyLayers.ts)
//   - a starfield of three depth layers, page-long   (background/starfield.ts)
// Light appearance, a soft daytime sky: a light-blue gradient with drifting
// white clouds and the galaxy as a pale ghost, like the Moon by day.
//
// Two passes per frame:
//   1. The soft layers (sky, nebula or clouds, the galaxy's glow) are drawn
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
// Motion: the galaxy turns slowly, stars twinkle, clouds drift. Scrolling
// eases the camera along: the galaxy rises, recedes and fades out of the hero,
// so the sections below sit over a calm starfield, and the star layers slide
// at different speeds (parallax). With a mouse, the view follows the pointer
// a little, near stars more than far ones. Reduce Motion shows one still
// frame (the hero's, whatever the scroll position); Pause freezes the
// current one. Both then stop following the scroll, and because page text
// will slide over the frozen picture, the galaxy's glow is capped to a
// text-safe brightness everywhere.
import { AdditiveBlending, MathUtils, NormalBlending, PerspectiveCamera, Scene, Vector2, WebGLRenderTarget } from "three";
import { createGalaxyLayers } from "./background/galaxyLayers";
import { createComposite, createSky, srgb } from "./background/sky";
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

// The composition, tuned by eye. NDC ("normalized device coordinates") run
// from -1 to 1 across the window, y up: (0, -0.6) is centered, 80% of the
// way down.
const FOV = 40; // the camera's vertical field of view, in degrees
const DEPTH = 30; // the galaxy's distance from the camera before scrolling
// tilt: how far the disc is tipped toward us, in radians (0 = edge-on,
// PI/2 = face-on; 0.5 shows it about half as tall as wide). roll: a slight
// sideways lean, so it isn't perfectly level.
const LANDSCAPE = { y: -0.68, radius: 1.02, tilt: 0.5, roll: 0.1 };
const PORTRAIT = { y: -0.66, radius: 1.5, tilt: 0.6, roll: 0.14 };
const SPIN_SPEED = 0.012; // radians per second: one turn in about 9 minutes
/** The animation time shown with Reduce Motion: a fixed, nice-looking moment. */
const STILL_TIME = 40;
/** With only slow ambient motion, 30 frames per second look the same as 60... */
const AMBIENT_FPS = 30;
/** ...and below the hero, where only the twinkle and the nebula move, 20 do. */
const CALM_FPS = 20;
/**
 * Galaxy stars per square CSS pixel on a 1280x900 desktop (45,000 stars,
 * a radius of about 650px). A small phone screen squeezes its stars into a
 * much smaller galaxy; they're dimmed to match, so the galaxy sends the
 * same light per pixel (and text over it stays as readable) everywhere.
 */
const STAR_DENSITY = 45_000 / (Math.PI * 650 * 650);
/** Space kept clear around the hero's text, in CSS pixels. */
const TEXT_PADDING = 24;
/** The floating nav's height: the galaxy stays dim behind it, like behind text. */
const NAV_CLEARANCE = 80;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function createBackground(canvas: HTMLCanvasElement, initial: SceneOptions): SpaceScene {
  const lowPower = lowPowerDevice();
  const shared = createSharedUniforms();
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 500);

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
  scene.add(sky.mesh, composite.mesh, galaxy.tilt, starfield.points);

  let options = initial;
  let time = STILL_TIME;
  let scroll = window.scrollY; // eased toward window.scrollY
  const mouse = new Vector2(); // eased toward mouseTarget
  const mouseTarget = new Vector2();
  let dirty = true; // something changed: draw the next frame for sure
  let sizeDirty = true;
  let sinceDraw = 0;
  let zones: { hero: Rect; text: Rect } | null = null; // in page coordinates

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
          const fps = galaxy.tilt.visible ? AMBIENT_FPS : CALM_FPS;
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
    const softWidth = Math.max(1, Math.round(width / SOFT_DIVISOR));
    const softHeight = Math.max(1, Math.round(height / SOFT_DIVISOR));
    softTarget.setSize(softWidth, softHeight);
    shared.uSoftSize.value.set(softWidth, softHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    measureZones();
  }

  // The hero's text block and the hero itself, in page coordinates (so they
  // only need measuring again when the layout changes, not on every scroll).
  function measureZones() {
    const hero = document.getElementById("top");
    const text = hero?.querySelector(".hero-content");
    if (!hero || !text) {
      zones = null; // unknown page: the text-safe limit applies everywhere
      return;
    }
    const y = window.scrollY;
    const h = hero.getBoundingClientRect();
    const t = text.getBoundingClientRect();
    zones = {
      hero: { left: h.left, top: h.top + y, right: h.right, bottom: h.bottom + y },
      text: {
        left: t.left - TEXT_PADDING,
        top: t.top + y - TEXT_PADDING,
        right: t.right + TEXT_PADDING,
        bottom: t.bottom + y + TEXT_PADDING,
      },
    };
  }
  // Web fonts arriving or the window resizing can move the text: re-measure.
  const layoutObserver = new ResizeObserver(() => {
    measureZones();
    dirty = true;
    engine.requestRender();
  });
  const heroElement = document.getElementById("top");
  if (heroElement) layoutObserver.observe(heroElement);

  function updateZones() {
    const y = window.scrollY;
    if (!zones || !animated()) {
      shared.uZones.value = 0;
      return;
    }
    const { hero, text } = zones;
    shared.uZones.value = 1;
    shared.uTextRect.value.set(text.left, text.top - y, text.right, text.bottom - y);
    shared.uHeroRect.value.set(hero.left, Math.max(hero.top - y, NAV_CLEARANCE), hero.right, hero.bottom - y);
  }

  /** Places, tilts, turns and fades the galaxy for a scroll position and time. */
  function placeGalaxy(scrollY: number, pointer: Vector2, seconds: number) {
    const { x: width, y: height } = shared.uViewport.value;
    const aspect = width / height;
    // 0 on landscape windows, 1 on tall phone screens, blended in between.
    const portrait = 1 - MathUtils.smoothstep(aspect, 0.6, 1.1);
    const pose = {
      y: MathUtils.lerp(LANDSCAPE.y, PORTRAIT.y, portrait),
      radius: MathUtils.lerp(LANDSCAPE.radius, PORTRAIT.radius, portrait),
      tilt: MathUtils.lerp(LANDSCAPE.tilt, PORTRAIT.tilt, portrait),
      roll: MathUtils.lerp(LANDSCAPE.roll, PORTRAIT.roll, portrait),
    };
    // How many window heights the page has scrolled.
    const progress = Math.max(0, scrollY / height);
    // How much of the window is visible at a distance: the camera's view is a
    // pyramid, so at distance d it's 2 * d * tan(fov / 2) scene units tall.
    const halfHeightAt = (d: number) => d * Math.tan(MathUtils.degToRad(FOV / 2));
    // The galaxy's size is fixed in scene units, measured at the starting
    // distance; moving it further away (receding) makes it look smaller. It
    // follows the window's width, up to a 1.9:1 shape, so an ultra-wide
    // monitor doesn't get a galaxy taller than the screen.
    const radius = pose.radius * halfHeightAt(DEPTH) * Math.min(aspect, 1.9);
    const depth = DEPTH * (1 + 0.9 * progress);
    // Rise at 75% of the page's speed (the content covers 2 NDC per window
    // height). The mouse moves the "camera" toward the pointer, so the galaxy
    // shifts a little the other way, as the star layers do.
    const ndcX = -pointer.x * 0.012;
    const ndcY = pose.y + 1.5 * progress + pointer.y * 0.012;
    galaxy.tilt.position.set(ndcX * halfHeightAt(depth) * aspect, ndcY * halfHeightAt(depth), -depth);
    galaxy.tilt.scale.setScalar(radius / galaxyOptions.radius);
    // As it recedes it also tips toward edge-on, as if we were sinking below
    // its plane; the mouse rocks it gently.
    galaxy.tilt.rotation.set(pose.tilt - 0.15 * progress + pointer.y * 0.04, 0, pose.roll + pointer.x * 0.03);
    galaxy.spin.rotation.y = 0.6 + seconds * SPIN_SPEED;
    galaxy.uniforms.bulgeSize.value = radius * 0.34;

    // Fade out over the first 3/4 of a window of scrolling.
    const fade = 1 - MathUtils.smoothstep(progress, 0.1, 0.75);
    const day = options.scheme === "light";
    // The galaxy's radius on screen before scrolling, in CSS pixels, and how
    // crowded its stars are there compared with the desktop reference.
    const radiusPixels = (radius / halfHeightAt(DEPTH)) * (height / 2);
    const density = galaxyOptions.count / (Math.PI * radiusPixels * radiusPixels);
    const crowding = MathUtils.clamp(STAR_DENSITY / density, 0.35, 1);
    galaxy.uniforms.starIntensity.value = fade * crowding * (day ? 0.4 : 1);
    galaxy.uniforms.discIntensity.value = fade * (day ? 0.5 : 1);
    galaxy.uniforms.bulgeIntensity.value = fade * (day ? 0.3 : 1);
    // Faded out completely: skip drawing it at all.
    galaxy.tilt.visible = fade > 0.002;
  }

  function draw() {
    // Reduce Motion: always the same still frame, whatever the scroll.
    const still = options.reduceMotion;
    const seconds = still ? STILL_TIME : time;
    const scrollY = still ? 0 : scroll;
    const pointer = still ? new Vector2() : mouse;
    shared.uTime.value = seconds;
    shared.uScroll.value = scrollY;
    shared.uMouse.value.copy(pointer);
    updateZones();
    placeGalaxy(scrollY, pointer, seconds);

    const { renderer } = engine;
    renderer.setRenderTarget(softTarget);
    camera.layers.set(SOFT);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null); // back to the canvas
    camera.layers.set(SHARP);
    renderer.render(scene, camera);
  }

  // A gentle lean toward the mouse, for real mice and trackpads only:
  // "(pointer: fine)" is false on touch screens, where there's no hover.
  const finePointer = window.matchMedia("(pointer: fine)");
  const onPointerMove = (event: PointerEvent) => {
    if (!finePointer.matches || event.pointerType !== "mouse") return;
    mouseTarget.set((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
  };
  const onPointerLeave = () => mouseTarget.set(0, 0);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);

  function apply(next: SceneOptions) {
    const wasStill = options.reduceMotion;
    options = next;
    // The CSS tokens already switched with the appearance; read them again.
    const palette = readPalette();
    const day = next.scheme === "light";
    shared.uDay.value = day ? 1 : 0;
    const u = sky.material.uniforms;
    srgb(palette.skyTop, u.uSkyTop!.value);
    srgb(palette.skyBottom, u.uSkyBottom!.value);
    srgb(palette.nebula[0], u.uNebula1!.value);
    srgb(palette.nebula[1], u.uNebula2!.value);
    srgb(palette.nebula[2], u.uNebula3!.value);
    srgb(palette.star, u.uCloud!.value);
    srgb(palette.core, u.uSun!.value);
    srgb(palette.core, galaxy.colors.uCore.value);
    srgb(palette.arm, galaxy.colors.uArm.value);
    srgb(palette.nebula[2], galaxy.colors.uPink.value);
    galaxy.setBlending(day ? NormalBlending : AdditiveBlending);
    // By day the stars are outshone by the sky.
    starfield.points.visible = !day;
    if (animated() && wasStill) {
      // Leaving Reduce Motion: start from where the page is, no swoop.
      scroll = window.scrollY;
    }
    engine.setAnimating(animated());
    dirty = true;
    engine.requestRender();
  }
  apply(initial);

  return {
    update: apply,
    dispose() {
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      layoutObserver.disconnect();
      engine.dispose();
      softTarget.dispose();
      sky.dispose();
      composite.dispose();
      starfield.dispose();
      galaxy.dispose();
    },
  };
}
