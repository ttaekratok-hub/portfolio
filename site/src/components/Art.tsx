// The Art section. For now it shows two "Under construction" placeholders.
//
// When a piece is ready: put the image in site/public/ (copied into the site
// as-is), then in place of its placeholder render an <img> with src, alt, width
// and height. Write alt text that describes the piece for people who can't see
// it, and set width and height so the layout doesn't jump while it loads.
// Images from this site are allowed by the Content-Security-Policy
// (img-src 'self' in nginx.conf). tests/prerender.test.ts expects the text
// "Under construction", so update that test when the placeholders go.

// Defined outside the component, so it's created once, not on every render.
const PIECES = ["Showcase piece #1", "Showcase piece #2"];

export function Art() {
  return (
    <section className="section" id="art" aria-labelledby="art-title">
      <h2 className="section-title" id="art-title">
        Art
      </h2>
      <p className="section-intro">Two showcase pieces are on the way. Check back soon.</p>
      <ul className="card-grid">
        {PIECES.map((title) => (
          <li className="card art-card" key={title}>
            <div className="art-placeholder">
              <span className="badge">Under construction</span>
            </div>
            <h3 className="card-title">{title}</h3>
            <p className="card-body">Coming soon.</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
