// Architecture diagrams for the featured project cards (Projects.tsx picks one
// by the project's `diagram` field). Hand-drawn as inline SVG: crisp at any
// size, styled from CSS (global.css, .diagram rules), so they follow light and
// dark mode, and no inline styles, which the Content-Security-Policy would block.
//
// They show the shape of each system only: no IP addresses, hostnames or
// ports, because the page is public.
//
// Accessibility: role="img" makes each SVG one image for screen readers, and
// aria-labelledby points at its <title> and <desc>, which describe the whole
// diagram in words.
// Learn more: https://developer.mozilla.org/en-US/docs/Web/SVG/Element/desc

// One labelled box. `accent` draws it with the tint color, to mark the parts
// that are the point of the diagram.
function Box(props: { x: number; y: number; w: number; label: string; sub?: string; accent?: boolean }) {
  const { x, y, w, label, sub, accent } = props;
  return (
    <g>
      <rect className={accent ? "d-box d-box-accent" : "d-box"} x={x} y={y} width={w} height={56} rx={12} />
      <text className="d-label" x={x + w / 2} y={sub ? y + 24 : y + 33} textAnchor="middle">
        {label}
      </text>
      {sub && (
        <text className="d-sub" x={x + w / 2} y={y + 42} textAnchor="middle">
          {sub}
        </text>
      )}
    </g>
  );
}

// A straight arrow from (x1, y1) to (x2, y2), with an optional label above it.
// The arrowhead is an SVG <marker> defined once per diagram (`id`).
function Arrow(props: { x1: number; y1: number; x2: number; y2: number; marker: string; label?: string }) {
  const { x1, y1, x2, y2, marker, label } = props;
  return (
    <g>
      <line className="d-line" x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={`url(#${marker})`} />
      {label && (
        <text className="d-sub" x={(x1 + x2) / 2} y={Math.min(y1, y2) - 8} textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

function ArrowHead({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path className="d-arrowhead" d="M0 0L10 5L0 10z" />
      </marker>
    </defs>
  );
}

export function K3sDiagram() {
  return (
    <svg className="diagram" viewBox="0 0 900 250" role="img" aria-labelledby="k3s-title k3s-desc">
      <title id="k3s-title">Architecture of the Kubernetes platform</title>
      <desc id="k3s-desc">
        Deploy path: a git push runs GitHub Actions, which lints, tests and builds a container image and publishes it
        with a deploy branch; Flux, inside the self-hosted k3s cluster, pulls that and applies it. Request path: a
        visitor reaches Cloudflare over HTTPS, which forwards through an outbound-only Cloudflare Tunnel to the website
        pods in the cluster. The cluster's encrypted backups go to Amazon S3.
      </desc>
      <ArrowHead id="k3s-arrow" />

      <text className="d-lane" x={20} y={30}>
        Deploy
      </text>
      <Box x={20} y={44} w={100} label="git push" />
      <Box x={150} y={44} w={150} label="GitHub Actions" sub="lint · test · build" />
      <Box x={330} y={44} w={160} label="Container image" sub="+ deploy branch" />
      <Arrow x1={120} y1={72} x2={148} y2={72} marker="k3s-arrow" />
      <Arrow x1={300} y1={72} x2={328} y2={72} marker="k3s-arrow" />
      <Arrow x1={490} y1={72} x2={538} y2={72} marker="k3s-arrow" label="pull" />

      <text className="d-lane" x={20} y={140}>
        Request
      </text>
      <Box x={20} y={154} w={100} label="Visitor" />
      <Box x={150} y={154} w={150} label="Cloudflare" sub="HTTPS · WAF" />
      <Box x={330} y={154} w={160} label="Cloudflare Tunnel" sub="outbound only" />
      <Arrow x1={120} y1={182} x2={148} y2={182} marker="k3s-arrow" />
      <Arrow x1={300} y1={182} x2={328} y2={182} marker="k3s-arrow" />
      <Arrow x1={490} y1={182} x2={538} y2={182} marker="k3s-arrow" />

      <rect className="d-group" x={520} y={16} width={240} height={222} rx={18} />
      <text className="d-lane" x={540} y={238 - 10}>
        k3s cluster (self-hosted)
      </text>
      <Box x={540} y={44} w={200} label="Flux (GitOps)" sub="applies what's in git" accent />
      <Box x={540} y={154} w={200} label="Websites" sub="nginx pods" accent />
      <Arrow x1={640} y1={100} x2={640} y2={152} marker="k3s-arrow" />

      <Box x={772} y={154} w={120} label="Amazon S3" sub="encrypted backups" />
      <Arrow x1={740} y1={182} x2={770} y2={182} marker="k3s-arrow" />
    </svg>
  );
}

export function NetworkLabDiagram() {
  return (
    <svg className="diagram" viewBox="0 0 900 220" role="img" aria-labelledby="lab-title lab-desc">
      <title id="lab-title">Topology of the MikroTik OSPF network lab (in progress)</title>
      <desc id="lab-desc">
        On one Proxmox VE host, a Kali Linux test client connects over an isolated bridge to MikroTik router A. Router
        A connects over a second isolated bridge to MikroTik router B, and the two routers exchange routes with OSPF.
        The routers also run DNS, SNMP and firewall rules.
      </desc>

      <rect className="d-group" x={16} y={16} width={868} height={188} rx={18} />
      <text className="d-lane" x={36} y={44}>
        Proxmox VE host
      </text>

      <Box x={40} y={86} w={170} label="Kali Linux" sub="test client" />
      <Box x={330} y={86} w={180} label="MikroTik CHR" sub="router A · RouterOS v7" accent />
      <Box x={650} y={86} w={180} label="MikroTik CHR" sub="router B · RouterOS v7" accent />

      <line className="d-line d-link" x1={210} y1={114} x2={330} y2={114} />
      <text className="d-sub" x={270} y={104} textAnchor="middle">
        isolated bridge
      </text>
      <line className="d-line d-link" x1={510} y1={114} x2={650} y2={114} />
      <text className="d-sub" x={580} y={104} textAnchor="middle">
        isolated bridge · OSPF
      </text>

      <text className="d-sub" x={580} y={176} textAnchor="middle">
        DNS · SNMP · firewall rules on both routers
      </text>
    </svg>
  );
}
