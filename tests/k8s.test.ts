// Static checks of the Kubernetes manifests (the YAML files in k8s/ that
// describe what should run on the cluster). Nothing is deployed here: the test
// reads the files and checks them against the rules of the shared cluster on
// the Pi. Writing such rules as tests is often called "policy as code".
//
// Why, when CI also deploys to a throwaway kind cluster (k8s-smoke-test)? This
// test needs no cluster, runs in seconds on any laptop and says in plain words
// what's wrong. It also covers k8s/flux/, which CI never applies.
//
// How the files fit together (GitOps: git holds the desired state, and Flux on
// the Pi reconciles: it keeps comparing the cluster with git and changes the
// cluster to match):
//   k8s/base/          the Deployment and Service, shared by every environment
//   k8s/overlays/pi/   a kustomize overlay: base plus Pi-only changes (patches)
//   k8s/tenant/        the sandbox, applied by hand with admin rights, not by
//                      Flux: namespace, RBAC, network rules, quota
//   k8s/flux/          tells Flux what to deploy, from where, and as whom
//
// The test reads the YAML as text with regular expressions instead of parsing
// it, which keeps it free of dependencies. The trade-off is that it relies on
// the files' usual layout, e.g. top-level keys starting at column 0.
//
// Try it: kubectl kustomize k8s/overlays/pi
//   prints the overlay's final manifests, base plus patches. On the Pi, Flux
//   applies the same output, except that the image tag (`:latest` here) is
//   the commit SHA CI pins on the deploy branch. (targetNamespace in
//   k8s/flux/portfolio.yaml forces namespace portfolio, which the base already
//   sets, and Flux adds labels marking the objects as its own.)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";

// Node's built-in assert works in Vitest too: a failed assertion throws, and a
// test that throws fails. process.cwd() is the repo root when `npm test` runs.
const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
// Every .yaml file under dir, in subfolders too, as repo-relative paths.
const yamlFiles = (dir: string) =>
  fs
    .readdirSync(path.join(ROOT, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => path.join(dir, f));

// RBAC (role-based access control) is how Kubernetes decides who may do what:
// a Role lists allowed actions on kinds of objects in one namespace, and a
// RoleBinding grants that Role to an account. Flux applies the site as the
// account portfolio-reconciler, so anything the Role doesn't allow fails on
// the Pi (and in CI's kind cluster, which uses the same account). This test
// catches it sooner, with a clearer message.
// Learn more: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
test("app manifests only contain what Flux's limited account may apply", () => {
  // k8s/tenant/rbac.yaml allows Deployments and Services in portfolio, nothing else.
  // "Kustomization" is kustomize's own build file (kustomization.yaml), which
  // never reaches the cluster.
  const allowed = new Set(["Deployment", "Service", "Kustomization"]);
  for (const f of [...yamlFiles("k8s/base"), ...yamlFiles("k8s/overlays")]) {
    const text = read(f);
    // `^kind:` with the `m` flag matches only at the start of a line, so a
    // nested, indented `kind:` (like a patch target's) doesn't count.
    for (const m of text.matchAll(/^kind:\s*(\S+)/gm)) {
      assert.ok(allowed.has(m[1]!), `${f}: kind ${m[1]} is not allowed`);
    }
    for (const m of text.matchAll(/^\s*namespace:\s*(\S+)/gm)) {
      assert.equal(m[1], "portfolio", `${f}: namespace ${m[1]}`);
    }
    // Also blocked on the cluster by k8s/tenant/guardrails.yaml; fail early here.
    // These Service settings could capture traffic meant for other apps on the
    // Pi or expose the site some other way than through the tunnel.
    assert.doesNotMatch(text, /externalIPs|tailscale\.com\/|LoadBalancer|ExternalName/, f);
  }
});

// A ClusterRole is defined for the whole cluster, not one namespace, and the
// built-in ones (edit, admin) are far broader than a static site needs, even
// when a RoleBinding limits them to one namespace. Write access to Flux's own
// objects (toolkit.fluxcd.io) would be the worst: Flux runs those with its
// cluster-admin rights.
test("Flux's account gets a narrow Role, never a built-in or Flux permission", () => {
  const rbac = read("k8s/tenant/rbac.yaml");
  assert.doesNotMatch(rbac, /kind:\s*ClusterRole/, "built-in ClusterRoles (edit/admin) are too broad");
  // No "*" wildcards, no Flux API group, no access to Secrets.
  assert.doesNotMatch(rbac, /"\*"|toolkit\.fluxcd\.io|secrets/);
  // The RoleBinding grants exactly the narrow Role defined in the same file.
  assert.match(rbac, /roleRef:\s*\n\s*apiGroup:.*\n\s*kind:\s*Role\s*\n\s*name:\s*portfolio-reconciler/);
});

// A NetworkPolicy is a firewall rule for pods. Listing "Egress" in policyTypes
// with an empty egress list means no outbound connections are allowed at all.
// A static site never needs one, so a compromised image can't connect out to
// anything.
// Learn more: https://kubernetes.io/docs/concepts/services-networking/network-policies/
test("the site's pods can't open outbound connections", () => {
  const guard = read("k8s/tenant/guardrails.yaml");
  assert.match(guard, /policyTypes:\s*\["Ingress",\s*"Egress"\]/);
  assert.match(guard, /^\s*egress:\s*\[\]\s*$/m);
});

// The image tag says which build runs. CI pins it to the commit it just tested,
// so the repo itself must leave it open.
test("Pi overlay leaves the image tag to CI", () => {
  // The deploy job appends the one and only `images:` block on the deploy branch.
  assert.doesNotMatch(read("k8s/overlays/pi/kustomization.yaml"), /^images:/m);
  // kustomize's `images:` block finds the image by this name and sets its tag.
  assert.match(read("k8s/base/deployment.yaml"), /image:\s*ghcr\.io\/ttaekratok-hub\/portfolio:/);
});

// A NodePort Service makes the site reachable on a fixed port (from the range
// 30000-32767) on every node's IP address, here the Pi's LAN IP. The Cloudflare
// Tunnel's route points at port 30738, and it's set in the Cloudflare
// dashboard, not in this repo. Changing the port here would take the site
// offline until the dashboard changes too, so the test makes that a deliberate
// edit.
test("Pi Service is the NodePort the Cloudflare Tunnel points at", () => {
  const patch = read("k8s/overlays/pi/service-patch.yaml");
  assert.match(patch, /value:\s*NodePort\b/);
  assert.match(patch, /path:\s*\/spec\/ports\/0\/nodePort\s*\n\s*value:\s*30738\b/);
});

// The Flux config that ties it together: watch the `deploy` branch (which only
// CI writes, after every check passed), apply it as the limited account, into
// the portfolio namespace.
test("Flux deploys the CI-only branch with least privilege", () => {
  const flux = read("k8s/flux/portfolio.yaml");
  assert.match(flux, /^\s*branch:\s*deploy\s*$/m);
  assert.match(flux, /^\s*serviceAccountName:\s*portfolio-reconciler\s*$/m);
  assert.match(flux, /^\s*targetNamespace:\s*portfolio\s*$/m);
  assert.match(flux, /^\s*suspend:\s*false\s*$/m, "keep explicit so apply -k resumes a paused deploy");
  // Catches a typo in `path:`: it must name a folder with a kustomization.yaml,
  // like k8s/overlays/pi.
  const p = flux.match(/^\s*path:\s*(\S+)\s*$/m)![1]!;
  assert.ok(fs.existsSync(path.join(ROOT, p, "kustomization.yaml")), `missing ${p}`);
});
