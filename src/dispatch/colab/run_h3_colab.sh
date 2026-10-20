#!/usr/bin/env bash
# run_h3_colab.sh -- Mac-side driver: rent a Colab H100, run h3_generate.py in the
# background on the VM, poll progress, download the mp4 + JSON, release the VM.
#
# Usage:
#   ./run_h3_colab.sh [driver options] -- [h3_generate.py options]
#
# Driver options:
#   -s NAME          Colab session name (default: h3-YYYYmmdd-HHMMSS)
#   -o LOCAL.mp4     Local output path (default: ./outputs/<session>.mp4)
#   --gpu GPU        default H100
#   --no-high-mem    do not pass --high-mem to `colab new`
#   --keep           do not `colab stop` at the end (VM keeps billing!)
#   --poll SEC       poll interval (default 60)
#   --max-wait SEC   give up after this many seconds (default 10800 = 3h)
#
# Everything after `--` goes to h3_generate.py on the VM, e.g.
#   ./run_h3_colab.sh -- --prompt "夕暮れの海辺で..." --seconds 5 --seed 42
#
# Env:
#   COLAB_GLOBAL_ARGS   extra global flags for every colab call, e.g. "--auth=oauth2"
#
# Exit code: 0 on success, otherwise the remote h3_generate.py exit code (see its docstring)
# or 1 for driver/colab errors. The VM is always stopped on exit unless --keep.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/h3_generate.py"
SESSION="h3-$(date +%Y%m%d-%H%M%S)"
LOCAL_OUT=""
GPU="H100"
HIGH_MEM=1
KEEP=0
POLL=60
MAX_WAIT=10800
REMOTE_DIR="/content/h3_out"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s) SESSION="$2"; shift 2 ;;
    -o) LOCAL_OUT="$2"; shift 2 ;;
    --gpu) GPU="$2"; shift 2 ;;
    --no-high-mem) HIGH_MEM=0; shift ;;
    --keep) KEEP=1; shift ;;
    --poll) POLL="$2"; shift 2 ;;
    --max-wait) MAX_WAIT="$2"; shift 2 ;;
    --) shift; break ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown driver option: $1 (put h3_generate.py options after --)" >&2; exit 2 ;;
  esac
done
GEN_ARGS=("$@")
[[ ${#GEN_ARGS[@]} -gt 0 ]] || { echo "pass h3_generate.py options after --, at least --prompt" >&2; exit 2; }

for a in "${GEN_ARGS[@]}"; do
  if [[ "$a" == "--out" || "$a" == --out=* ]]; then
    echo "do not pass --out to h3_generate.py here; use the driver's -o LOCAL.mp4" >&2; exit 2
  fi
done
command -v colab >/dev/null || { echo "colab CLI not found (uv tool install google-colab-cli)" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required locally (argument quoting)" >&2; exit 1; }
[[ -f "$SCRIPT" ]] || { echo "missing $SCRIPT" >&2; exit 1; }

# Validate generator args locally before renting a GPU (no downloads, no GPU).
python3 -I "$SCRIPT" "${GEN_ARGS[@]}" --dump-workflow /dev/null >/dev/null

[[ -n "$LOCAL_OUT" ]] || LOCAL_OUT="$PWD/outputs/$SESSION.mp4"
mkdir -p "$(dirname "$LOCAL_OUT")"
LOCAL_BASE="${LOCAL_OUT%.mp4}"
REMOTE_OUT="$REMOTE_DIR/$SESSION.mp4"
REMOTE_JSON="$REMOTE_DIR/$SESSION.json"
REMOTE_STATUS="$REMOTE_OUT.status.json"
REMOTE_LOG="$REMOTE_DIR/run.log"

# shellcheck disable=SC2086
c() { colab ${COLAB_GLOBAL_ARGS:-} "$@"; }

STARTED=0
cleanup() {
  local rc=$?
  if [[ $STARTED -eq 1 && $KEEP -eq 0 ]]; then
    echo "[driver] stopping session $SESSION ..." >&2
    c stop -s "$SESSION" || echo "[driver] WARNING: colab stop failed -- run: colab stop -s $SESSION" >&2
  elif [[ $STARTED -eq 1 ]]; then
    echo "[driver] --keep: session $SESSION is still running (billing). Stop it with: colab stop -s $SESSION" >&2
  fi
  exit $rc
}
trap cleanup EXIT INT TERM

T_START=$(date +%s)
NEW_ARGS=(new -s "$SESSION" --gpu "$GPU")
[[ $HIGH_MEM -eq 1 ]] && NEW_ARGS+=(--high-mem)
echo "[driver] colab ${NEW_ARGS[*]}" >&2
STARTED=1   # set before `new` so a half-created session is still stopped
c "${NEW_ARGS[@]}"

echo "[driver] uploading h3_generate.py" >&2
c upload -s "$SESSION" "$SCRIPT" /content/h3_generate.py

# Build the launcher with a safely quoted argv (handles Japanese / quotes).
# A local --prompt-file is inlined as --prompt because the file does not exist on the VM.
ARGV_LITERAL=$(python3 -I -c '
import json, sys
a, out, i = sys.argv[1:], [], 0
while i < len(a):
    if a[i] == "--prompt-file":
        out += ["--prompt", open(a[i + 1], encoding="utf-8").read().strip()]; i += 2
    elif a[i].startswith("--prompt-file="):
        out += ["--prompt", open(a[i].split("=", 1)[1], encoding="utf-8").read().strip()]; i += 1
    else:
        out.append(a[i]); i += 1
print(repr(json.dumps(out, ensure_ascii=False)))
' "${GEN_ARGS[@]}" --out "$REMOTE_OUT")
LAUNCH=$(cat <<PY
import json, os, subprocess, sys
os.makedirs("$REMOTE_DIR", exist_ok=True)
argv = json.loads($ARGV_LITERAL)
log = open("$REMOTE_LOG", "w")
p = subprocess.Popen([sys.executable, "-u", "/content/h3_generate.py", *argv], stdout=log,
                     stderr=subprocess.STDOUT, cwd="/content", start_new_session=True)
open("$REMOTE_DIR/pid", "w").write(str(p.pid))
print("H3_LAUNCHED pid", p.pid)
PY
)
echo "[driver] launching generator in background on the VM" >&2
echo "$LAUNCH" | c exec -s "$SESSION" --timeout 120 | grep -a "H3_LAUNCHED" \
  || { echo "[driver] launch failed" >&2; exit 1; }

POLL_CODE=$(cat <<PY
import json, os
st = {}
try:
    st = json.load(open("$REMOTE_STATUS"))
except Exception:
    pass
alive = False
try:
    os.kill(int(open("$REMOTE_DIR/pid").read()), 0); alive = True
except Exception:
    pass
try:
    tail = open("$REMOTE_LOG", errors="replace").read().splitlines()[-4:]
except Exception:
    tail = []
for line in tail:
    print("  | " + line[:220])
print("H3STATE=%s ALIVE=%d PHASE=%s RC=%s" % (st.get("state", "starting"), alive, st.get("phase", "-"), st.get("exit_code", "")))
PY
)

STATE="starting"; RC=""; FAILS=0
while :; do
  sleep "$POLL"
  NOW=$(date +%s)
  if (( NOW - T_START > MAX_WAIT )); then
    echo "[driver] max wait ${MAX_WAIT}s exceeded" >&2; STATE="timeout"; break
  fi
  if ! OUT=$(echo "$POLL_CODE" | c exec -s "$SESSION" --timeout 60 2>&1); then
    FAILS=$((FAILS + 1))
    echo "[driver] poll failed ($FAILS/5): $(echo "$OUT" | tail -n 2)" >&2
    (( FAILS >= 5 )) && { STATE="lost"; break; }
    continue
  fi
  FAILS=0
  echo "[driver] +$(( NOW - T_START ))s" >&2
  echo "$OUT" | grep -a "  | " >&2 || true
  LINE=$(echo "$OUT" | grep -a "H3STATE=" | tail -n 1)
  STATE=$(echo "$LINE" | sed -E 's/.*H3STATE=([a-z]+).*/\1/')
  ALIVE=$(echo "$LINE" | sed -E 's/.*ALIVE=([0-9]).*/\1/')
  RC=$(echo "$LINE" | sed -E 's/.*RC=([0-9]*).*/\1/')
  [[ "$STATE" == "done" || "$STATE" == "failed" ]] && break
  if [[ "$ALIVE" == "0" && "$STATE" != "starting" ]]; then
    echo "[driver] generator process died without a final status" >&2; STATE="crashed"; break
  fi
done

echo "[driver] final state: $STATE (remote rc=${RC:-?}); fetching artifacts" >&2
c download -s "$SESSION" "$REMOTE_JSON" "$LOCAL_BASE.json" || true
c download -s "$SESSION" "$REMOTE_LOG" "$LOCAL_BASE.run.log" || true
if [[ "$STATE" == "done" ]]; then
  c download -s "$SESSION" "$REMOTE_OUT" "$LOCAL_OUT"
  echo "[driver] OK -> $LOCAL_OUT  (report: $LOCAL_BASE.json, wall $(( $(date +%s) - T_START ))s)" >&2
  exit 0
fi
c download -s "$SESSION" "$REMOTE_DIR/_work/comfyui.log" "$LOCAL_BASE.comfyui.log" || true
c download -s "$SESSION" "$REMOTE_DIR/_work/install.log" "$LOCAL_BASE.install.log" || true
echo "[driver] FAILED ($STATE). See $LOCAL_BASE.json / .run.log / .comfyui.log" >&2
[[ -n "$RC" && "$RC" != "0" ]] && exit "$RC"
exit 1
