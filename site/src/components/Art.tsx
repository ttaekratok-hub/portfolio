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
