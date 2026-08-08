#!/bin/sh
set -eu

cd /app

sentinel='/__AWX_JOB_VISUALIZER_RUNTIME_BASE_PATH__'
marker='.next/.runtime-base-path'
base_path=${BASE_PATH:-}

if [ "$base_path" = '/' ]; then
  base_path=''
fi

case "$base_path" in
  '' | /*) ;;
  *)
    echo 'BASE_PATH must start with "/"' >&2
    exit 1
    ;;
esac

case "$base_path" in
  */)
    echo 'BASE_PATH must not end with "/"' >&2
    exit 1
    ;;
  *\?* | *\#*)
    echo 'BASE_PATH must not contain a query string or fragment' >&2
    exit 1
    ;;
  *\\*)
    echo 'BASE_PATH must not contain backslashes' >&2
    exit 1
    ;;
esac

if printf '%s' "$base_path" | grep -q '[[:space:]]'; then
  echo 'BASE_PATH must not contain whitespace or control characters' >&2
  exit 1
fi

if [ "$base_path" = "$sentinel" ]; then
  echo 'BASE_PATH is reserved for the runtime placeholder' >&2
  exit 1
fi

if [ -f "$marker" ]; then
  configured_base_path=$(cat "$marker")
  if [ "$configured_base_path" != "$base_path" ]; then
    echo "This container was already configured with a different BASE_PATH; recreate it to change the value" >&2
    exit 1
  fi
elif grep -r -l -- "$sentinel" server.js .next >/dev/null; then
  escaped_base_path=$(printf '%s' "$base_path" | sed 's/[&|]/\\&/g')
  temporary_file=$(mktemp)
  trap 'rm -f "$temporary_file"' EXIT
  find server.js .next -type f -exec grep -l -- "$sentinel" {} + |
    while IFS= read -r file; do
      sed "s|$sentinel|$escaped_base_path|g" "$file" >"$temporary_file"
      cat "$temporary_file" >"$file"
    done
  rm -f "$temporary_file"
  trap - EXIT

  if grep -r -q -- "$sentinel" server.js .next; then
    echo 'Failed to replace every runtime base-path placeholder' >&2
    exit 1
  fi

  printf '%s' "$base_path" >"$marker"
else
  echo 'No runtime base-path placeholders were found; this may not be a compatible production build' >&2
  exit 1
fi

exec "$@"
