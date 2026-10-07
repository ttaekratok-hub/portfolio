const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const yamlFiles = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { recursive: true })
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => path.join(dir, f));

test("app manifests only contain what Flux's limited account may apply", () => {
  // k8s/tenant/rbac.yaml allows Deployments and Services in portfolio, nothing else.
  const allowed = new Set(["Deployment", "Service", "Kustomization"]);
  for (const f of [...yamlFiles("k8s/base"), ...yamlFiles("k8s/overlays")]) {
    const text = read(f);
    for (const m of text.matchAll(/^kind:\s*(\S+)/gm)) {
      assert.ok(allowed.has(m[1]), `${f}: kind ${m[1]} is not allowed`);
    }
    for (const m of text.matchAll(/^\s*namespace:\s*(\S+)/gm)) {
      assert.equal(m[1], "portfolio", `${f}: namespace ${m[1]}`);
    }
    // Also blocked on the cluster by k8s/tenant/guardrails.yaml; fail early here.
    assert.doesNotMatch(text, /externalIPs|tailscale\.com\/|LoadBalancer|ExternalName/, f);
  }
});

test("Flux's account gets a narrow Role, never a built-in or Flux permission", () => {
  const rbac = read("k8s/tenant/rbac.yaml");
  assert.doesNotMatch(rbac, /kind:\s*ClusterRole/, "built-in ClusterRoles (edit/admin) are too broad");
  assert.doesNotMatch(rbac, /"\*"|toolkit\.fluxcd\.io|secrets/);
  assert.match(rbac, /roleRef:\s*\n\s*apiGroup:.*\n\s*kind:\s*Role\s*\n\s*name:\s*portfolio-reconciler/);
});

test("the site's pods can't open outbound connections", () => {
  const guard = read("k8s/tenant/guardrails.yaml");
  assert.match(guard, /policyTypes:\s*\["Ingress",\s*"Egress"\]/);
  assert.match(guard, /^\s*egress:\s*\[\]\s*$/m);
});

test("Pi overlay leaves the image tag to CI", () => {
  // The deploy job appends the one and only `images:` block on the deploy branch.
  assert.doesNotMatch(read("k8s/overlays/pi/kustomization.yaml"), /^images:/m);
  assert.match(read("k8s/base/deployment.yaml"), /image:\s*ghcr\.io\/ttaekratok-hub\/portfolio:/);
});

test("Pi Service is the NodePort the Cloudflare Tunnel points at", () => {
  const patch = read("k8s/overlays/pi/service-patch.yaml");
  assert.match(patch, /value:\s*NodePort\b/);
  assert.match(patch, /path:\s*\/spec\/ports\/0\/nodePort\s*\n\s*value:\s*30738\b/);
});

test("Flux deploys the CI-only branch with least privilege", () => {
  const flux = read("k8s/flux/portfolio.yaml");
  assert.match(flux, /^\s*branch:\s*deploy\s*$/m);
  assert.match(flux, /^\s*serviceAccountName:\s*portfolio-reconciler\s*$/m);
  assert.match(flux, /^\s*targetNamespace:\s*portfolio\s*$/m);
  assert.match(flux, /^\s*suspend:\s*false\s*$/m, "keep explicit so apply -k resumes a paused deploy");
  const p = flux.match(/^\s*path:\s*(\S+)\s*$/m)[1];
  assert.ok(fs.existsSync(path.join(ROOT, p, "kustomization.yaml")), `missing ${p}`);
});
