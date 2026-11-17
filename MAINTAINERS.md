# First publication and recovery

Before pushing the first version tag, create the public repository, push main,
initialize an orphan gh-pages branch with .nojekyll/index.html, enable GitHub
Pages with build_type=workflow and allow version tags in the github-pages
environment. The first publication operator performs this bootstrap.

Check `gh api repos/OWNER/REPO/pages --jq .build_type` after creating gh-pages.
Creating that branch can enable a legacy Pages site automatically; update an
existing site to `build_type=workflow` through the Pages settings or REST PUT.
For the github-pages environment, select custom branch/tag policies and add
`v*` with type **tag**. A null policy can still leave deployments restricted to
the old Pages source branch. Verify both settings before the first tag release.
See the official [Pages API](https://docs.github.com/en/rest/pages/pages) and
[deployment policy API](https://docs.github.com/en/rest/deployments/branch-policies).

Bump pkg/clo-ui/package.json and both chart versions together; push the exact
vVERSION tag. The check job tests/builds once and the publication job consumes
that artifact. Site history is retained on gh-pages without force-push.

Retrying a partial publication keeps every published version byte-for-byte.
Pages upload and deployment use the same name suffixed with github.run_attempt,
so older attempt artifacts cannot make the next deployment ambiguous.
Chart gzip/tar timestamps are ignored only when comparing unchanged content;
the original published chart bytes are retained. Existing Release assets are
downloaded and checked; only missing files are uploaded. Changed assets require
a new version. An initial draft is published after all assets are verified.

After success, verify every file listed in the public files.txt and all release
checksums. Installing the UI into a management cluster is a separate operation.
