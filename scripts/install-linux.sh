#!/usr/bin/env bash

set -Eeuo pipefail

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  local temporary_file
  for temporary_file in "${temporary_files[@]}"; do
    [[ -e "$temporary_file" ]] && rm -f -- "$temporary_file"
  done
}

verify_legacy_installation() {
  [[ -f "$installed_appimage" && ! -L "$installed_appimage" ]] || return 1
  [[ -f "$installed_icon" && ! -L "$installed_icon" ]] || return 1
  [[ -f "$desktop_file" && ! -L "$desktop_file" ]] || return 1

  grep -Fqx -- 'Name=Wellness Tracker' "$desktop_file" &&
    grep -Fqx -- "Exec=\"$installed_appimage\"" "$desktop_file" &&
    grep -Fqx -- "Icon=$installed_icon" "$desktop_file" &&
    grep -Fqx -- 'Type=Application' "$desktop_file" &&
    grep -Fqx -- 'StartupWMClass=wellness-tracker' "$desktop_file"
}

atomic_install() {
  local source_file="$1"
  local destination="$2"
  local mode="$3"
  local destination_dir
  local destination_name
  local temporary_file

  destination_dir="$(dirname -- "$destination")"
  destination_name="$(basename -- "$destination")"
  temporary_file="$(mktemp --tmpdir="$destination_dir" ".${destination_name}.wellness-tracker.XXXXXX")"
  temporary_files+=("$temporary_file")
  install -m "$mode" -- "$source_file" "$temporary_file"
  mv -f -- "$temporary_file" "$destination"
}

write_ownership_marker() {
  local temporary_file

  temporary_file="$(mktemp --tmpdir="$state_dir" .launcher-installation.XXXXXX)"
  temporary_files+=("$temporary_file")
  printf '%s\n' "$marker_contents" > "$temporary_file"
  chmod 0644 -- "$temporary_file"
  mv -f -- "$temporary_file" "$ownership_marker"
}

adopt_legacy_installation() {
  verify_legacy_installation || return 1
  install -d -- "$state_dir"
  write_ownership_marker
}

main() {
  local adopt_legacy=false
  local is_managed_installation=false
  local existing_destination_count=0
  local destination

  if (( EUID == 0 )); then
    fail "Run this script as your normal desktop user, without sudo."
  fi

  case "${1:-}" in
    '') ;;
    --adopt-legacy) adopt_legacy=true ;;
    *) fail "Usage: $0 [--adopt-legacy]" ;;
  esac
  [[ $# -le 1 ]] || fail "Usage: $0 [--adopt-legacy]"

  [[ -n "${HOME:-}" ]] || fail "HOME is not set."
  command -v node >/dev/null 2>&1 || fail "Node.js is required to read the package version."
  command -v install >/dev/null 2>&1 || fail "The install command is required."

  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
  project_dir="$(cd -- "$script_dir/.." && pwd -P)"

  if ! app_version="$(cd -- "$project_dir" && node -p "require('./package.json').version")"; then
    fail "Could not read the application version from package.json."
  fi

  source_appimage="$project_dir/dist/Wellness Tracker-$app_version.AppImage"
  source_icon="$project_dir/assets/wellness-tracker-512.png"

  [[ -f "$source_appimage" ]] || fail "Built AppImage not found: $source_appimage. Run npm run dist first."
  [[ -f "$source_icon" ]] || fail "Application icon not found: $source_icon"

  applications_dir="$HOME/Applications"
  icons_dir="$HOME/.local/share/icons"
  launchers_dir="$HOME/.local/share/applications"
  state_dir="$HOME/.local/share/wellness-tracker"

  installed_appimage="$applications_dir/WellnessTracker.AppImage"
  installed_icon="$icons_dir/wellness-tracker.png"
  desktop_file="$launchers_dir/wellness-tracker.desktop"
  ownership_marker="$state_dir/launcher-installation"
  marker_contents='Wellness Tracker launcher installer v1'
  temporary_files=()
  trap cleanup EXIT

  if [[ -e "$ownership_marker" || -L "$ownership_marker" ]]; then
    [[ -f "$ownership_marker" && ! -L "$ownership_marker" ]] || fail "Invalid ownership marker: $ownership_marker"
    [[ "$(< "$ownership_marker")" == "$marker_contents" ]] || fail "Ownership marker is not recognised: $ownership_marker"
    is_managed_installation=true
  fi

  for destination in "$installed_appimage" "$installed_icon" "$desktop_file"; do
    if [[ -e "$destination" || -L "$destination" ]]; then
      existing_destination_count=$((existing_destination_count + 1))
      [[ -f "$destination" && ! -L "$destination" ]] || fail "Refusing to replace non-regular file: $destination"
    fi
  done

  if [[ "$is_managed_installation" == false && "$existing_destination_count" -gt 0 ]]; then
    [[ "$adopt_legacy" == true ]] || fail "Existing files are not marked as installer-managed. Verify them, then rerun with --adopt-legacy to adopt a legacy installation."
    adopt_legacy_installation || fail "Legacy installation verification failed; no files were changed."
    is_managed_installation=true
  elif [[ "$is_managed_installation" == false && "$adopt_legacy" == true ]]; then
    fail "No complete legacy installation was found to adopt."
  fi

  install -d -- "$applications_dir" "$icons_dir" "$launchers_dir" "$state_dir"
  if [[ "$is_managed_installation" == false ]]; then
    write_ownership_marker
  fi

  atomic_install "$source_appimage" "$installed_appimage" 0755
  atomic_install "$source_icon" "$installed_icon" 0644

  desktop_tmp="$(mktemp --tmpdir="$launchers_dir" .wellness-tracker.desktop.XXXXXX)"
  temporary_files+=("$desktop_tmp")
  {
    printf '%s\n' '[Desktop Entry]'
    printf '%s\n' 'Name=Wellness Tracker'
    printf 'Exec="%s"\n' "$installed_appimage"
    printf 'Icon=%s\n' "$installed_icon"
    printf '%s\n' 'Type=Application'
    printf '%s\n' 'Categories=Utility;'
    printf '%s\n' 'Terminal=false'
    printf '%s\n' 'StartupWMClass=wellness-tracker'
  } > "$desktop_tmp"

  chmod 0644 -- "$desktop_tmp"
  mv -f -- "$desktop_tmp" "$desktop_file"

  printf 'Installed Wellness Tracker launcher:\n'
  printf '  AppImage: %s\n' "$installed_appimage"
  printf '  Icon:     %s\n' "$installed_icon"
  printf '  Launcher: %s\n' "$desktop_file"
  printf 'Rerun this script after npm run dist to refresh the installation.\n'
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
