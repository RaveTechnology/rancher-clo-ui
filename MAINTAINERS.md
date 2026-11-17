# First publication and recovery

Before pushing the first version tag, create the public repository, push main,
initialize an orphan gh-pages branch with .nojekyll/index.html, enable GitHub
Pages with build_type=workflow and allow version tags in the github-pages
environment. The first publication operator performs this bootstrap.

Bump pkg/clo-ui/package.json and both chart versions together; push the exact
vVERSION tag. The check job tests/builds once and the publication job consumes
that artifact. Site history is retained on gh-pages without force-push.

Retrying a partial publication keeps every published version byte-for-byte.
Chart gzip/tar timestamps are ignored only when comparing unchanged content;
the original published chart bytes are retained. Existing Release assets are
downloaded and checked; only missing files are uploaded. Changed assets require
a new version. An initial draft is published after all assets are verified.

After success, verify every file listed in the public files.txt and all release
checksums. Installing the UI into a management cluster is a separate operation.
