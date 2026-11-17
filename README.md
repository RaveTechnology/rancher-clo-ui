# CLO UI Extension for Rancher

Native forms for the existing [CLO Node Driver](https://github.com/RaveTechnology/docker-machine-driver-clo), targeting
Rancher **2.15.3**, API v3 / Shell **3.0.12-rc.7** / Vue **3.5.29**. The extension
has been checked in the isolated lab; see the acceptance report below. It does
not perform the production migration or implement CCM/LB.

## Local build

Use Node24 and Yarn1.22.22. The workspace and extension have different package
names. Keep the exact Shell pin: the creator's current npm dist-tags can select
a different Shell even when the creator itself is pinned.

```sh
corepack yarn install --frozen-lockfile
yarn test
yarn lint
yarn build-pkg clo-ui
yarn serve-pkgs
```

The generated bundle is
`dist-pkg/clo-ui-0.1.6/clo-ui-0.1.6.umd.min.js`. Keep the complete output together:
the main bundle loads its chunks and styles. Developer Load can use a reachable
HTTPS endpoint. The included Helm chart installs through Rancher's native cache;
no separate extension operator is required. Nothing is published automatically.

For the chart, prepare an immutable HTTPS directory containing `files.txt` next
to `plugin/`. Copy the build output into `plugin/`, excluding `report.html` and
source maps. `files.txt` lists one relative `plugin/<filename>` per line, including
`plugin/package.json`. Keep a SHA-256 manifest outside the published directory.
Verify HTTP 200 and the bytes of **every** file before registration: Rancher's
cache downloader can store HTTP error bodies. Serve the entire directory, not
only the main JS file. Do not overwrite a published version; bump package and
chart appVersion together for changes.

```sh
helm upgrade --install clo-ui ./deploy/chart \
  --kubeconfig=/PRIVATE/LAB/management.yaml --kube-context=YOUR_MANAGEMENT_CONTEXT \
  --namespace=cattle-ui-plugin-system --create-namespace \
  --set-string endpoint=https://YOUR_ARTIFACT_HOST/clo-ui/0.1.6-CHECKSUM
kubectl --kubeconfig=/PRIVATE/LAB/management.yaml --context=YOUR_MANAGEMENT_CONTEXT \
  -n cattle-ui-plugin-system get uiplugin clo-ui -o yaml
```

Wait for `status.observedGeneration == metadata.generation`, `ready: true` and
`cacheState: cached`, then reload Rancher. The chart creates the exact CLO
ProxyEndpoint unless `proxyEndpoint.create=false` is set for an already managed
allow-list. Inspect ownership before installing over an existing release or
ProxyEndpoint. Uninstall with the same explicit management context. Keep the
artifact directory while installed. Shared catalog publication and production
installation are separate operator actions.

## Management setup

Register and activate Node Driver `clo` separately. Its cloud credential
annotations must include `privateCredentialFields: apiToken` and
`passwordFields: apiToken`; `clocredentialConfig` is derived by Rancher, not
serialized into a machine config by this extension.

The catalogue uses native server-side credential signing. Apply the exact
domain allow-list on the intended **management** cluster with explicit scope:

```sh
kubectl --kubeconfig=/PRIVATE/LAB/management.yaml --context=YOUR_MANAGEMENT_CONTEXT \
apply -f deploy/proxy-endpoint.yaml
```

The standalone manifest is an alternative to the chart-managed allow-list;
do not apply both ownership methods to the same object. No wildcard domains,
Secret reads or automatic writes by the form. Existing cloud
credentials are referenced by ID. A replacement token remains a masked local
draft until the fresh authentication check succeeds; blank edit input preserves
the saved secret. View performs no cloud request. API errors never echo bodies
or headers. API origin is fixed to `https://api.clo.ru` and requests are GET-only.

## Node configuration

Select a project, Ubuntu24 image, shared vCPU1..8, RAM1..32GB and boot disk
>=10GB. These are the existing driver's limits. Prepare private NAT/DNS/SSH
connectivity before provisioning. Arbitrary regions/networks, cloud-init file
editing and SSH-key provisioning are not added by the UI.

A public pool uses one reserved IPv4 and quantity0/1, with autoscaling disabled.
Zero allows delete-before-create replacement. The old VM must release the IP
before its replacement is created. Existing selected IP/image IDs survive partial
or failed catalogue responses. Manual ID entry is an explicit fallback and still
validates resource UUIDs and driver limits; the backend checks actual ownership.

Labels, taints, roles, pool name, Save and cluster lifecycle remain native Rancher
behavior. This UI does not create VM/IP/NAT resources through a second path.
RU/EN text and native light/dark components follow [DESIGN.md](DESIGN.md).
The extension registers Russian in native Preferences; host strings without a
Russian translation use Rancher's English fallback. CLO reports its tested
Ubuntu24.04.5 image as major version `24`; both that exact major alias and
`24.04[.patch]` are accepted, while 22/26/24.10 are excluded from new choices.

The scaffold follows `@rancher/create-extension`3.0.12 templates (SUSE,
Apache-2.0); runtime dependencies retain their own licenses. Project extension code is licensed under Apache-2.0.

## Acceptance

Node behavior tests cover proxy boundaries, pagination, stale responses, secret
preservation, actual Vue lifecycle adapters and pool validation. Browser evidence
and compatibility/distribution results are recorded in
[the acceptance report](docs/acceptance.md).

## Public distribution

Helm repository: https://ravetechnology.github.io/rancher-clo-ui/charts

The release chart embeds its matching versioned HTTPS endpoint. Install in the
explicit Rancher management context and cattle-ui-plugin-system namespace.
[Releases](https://github.com/RaveTechnology/rancher-clo-ui/releases) include the
complete UI archive, chart, file checksums and archive SHA256SUMS.

Version0.1.6 changes public packaging/license metadata only, preserving the
accepted0.1.3 form behavior. GitHub Actions tests the forms, lint, build and
immutable distribution. Old Pages versions are retained.
