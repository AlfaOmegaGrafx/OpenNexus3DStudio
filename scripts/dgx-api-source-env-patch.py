#!/usr/bin/env python3
"""Ensure 3DAIGC-API start_services_detached.sh sources .env (MSF vars). Run on DGX."""
from pathlib import Path

START = Path('/home/sifr/3DAIGC-API/scripts/start_services_detached.sh')
BLOCK = '''
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
'''
needle = 'source "$ROOT/scripts/env_local_gpu.sh"'


def main() -> None:
    text = START.read_text(encoding='utf-8')
    if 'source "$ROOT/.env"' in text:
        print('start_services_detached.sh already sources .env')
        return
    if needle not in text:
        raise SystemExit(f'needle not found in {START}')
    START.write_text(text.replace(needle, needle + BLOCK, 1), encoding='utf-8')
    print(f'Patched {START} to source .env')


if __name__ == '__main__':
    main()
