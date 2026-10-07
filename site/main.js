(function () {
  "use strict";

  // ---------- Project grid + filters ----------
  const grid = document.getElementById("project-grid");
  const filters = document.querySelectorAll(".filter");

  function renderProjects(filter) {
    const projects = (window.PROJECTS || []).filter(
      (p) => filter === "all" || p.categories.includes(filter)
    );
    grid.replaceChildren(
      ...projects.map((p) => {
        const li = document.createElement("li");
        li.className = "card";

        const h3 = document.createElement("h3");
        h3.textContent = p.title;

        const summary = document.createElement("p");
        summary.textContent = p.summary;

        const tags = document.createElement("ul");
        tags.className = "tags";
        p.tech.forEach((t) => {
          const tag = document.createElement("li");
          tag.textContent = t;
          tags.appendChild(tag);
        });

        li.append(h3, summary, tags);

        const linkEntries = Object.entries(p.links || {});
        if (linkEntries.length) {
          const links = document.createElement("p");
          links.className = "card-links";
          linkEntries.forEach(([label, href]) => {
            const a = document.createElement("a");
            a.href = href;
            a.textContent = label;
            links.appendChild(a);
          });
          li.appendChild(links);
        }
        return li;
      })
    );
  }

  filters.forEach((btn) => {
    btn.addEventListener("click", () => {
      filters.forEach((b) => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-pressed", String(b === btn));
      });
      renderProjects(btn.dataset.filter);
    });
  });

  renderProjects("all");

  // ---------- Build info (written into version.json by CI) ----------
  fetch("version.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => {
      if (v && v.commit) {
        document.getElementById("build-info").textContent =
          "Build " + v.commit.slice(0, 7) + ".";
      }
    })
    .catch(() => {});

  // ---------- Flow-field hero ----------
  const canvas = document.getElementById("hero-canvas");
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width, height, particles;

  // Cheap smooth pseudo-noise: a sum of sines. Good enough for a flow field
  // and easy to read; swap in simplex noise if you want more organic motion.
  function field(x, y, t) {
    const s = 0.0025;
    return (
      Math.sin(x * s + t) * Math.cos(y * s * 1.3 - t * 0.7) +
      Math.sin((x + y) * s * 0.6 + t * 0.5)
    ) * Math.PI;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.floor((width * height) / 4000);
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      life: Math.random() * 200
    }));
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0, 0, width, height);
  }

  function step(time) {
    const t = time * 0.0001;
    ctx.fillStyle = "rgba(11, 13, 18, 0.06)";
    ctx.fillRect(0, 0, width, height);

    for (const p of particles) {
      const angle = field(p.x, p.y, t);
      const nx = p.x + Math.cos(angle) * 1.2;
      const ny = p.y + Math.sin(angle) * 1.2;
      const hue = 190 + 80 * Math.sin(angle);
      ctx.strokeStyle = "hsla(" + hue + ", 80%, 65%, 0.5)";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      p.x = nx;
      p.y = ny;
      p.life -= 1;
      if (p.life < 0 || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
        p.x = Math.random() * width;
        p.y = Math.random() * height;
        p.life = 100 + Math.random() * 200;
      }
    }
    if (!reduceMotion) requestAnimationFrame(step);
  }

  window.addEventListener("resize", resize);
  resize();
  if (reduceMotion) {
    for (let i = 0; i < 120; i++) step(i * 16);
  } else {
    requestAnimationFrame(step);
  }
})();
