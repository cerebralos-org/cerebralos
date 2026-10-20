#!/usr/bin/env python3
"""MiniMax H3 (text -> video + audio) headless generation on a single GPU via ComfyUI.

Designed for Google Colab H100 80GB driven by google-colab-cli, but runs on any
fresh Linux + NVIDIA box with Python 3.10+.

Two ways it gets executed (see README.md):
  1) As a normal process:  python h3_generate.py --prompt "..." --out /content/h3_out/a.mp4
     (the split flow `run_h3_colab.sh` uploads this file and launches it in the background)
  2) Inside the Colab kernel via `colab run --gpu H100 h3_generate.py ...`
     (colab run sends the file body to the IPython kernel with sys.argv set).
     Because of (2) this script never imports torch in-process: everything heavy
     (pip, ComfyUI server, torch checks) runs in subprocesses, so a torch
     reinstall cannot clash with an already-imported torch.

Pipeline:
  preflight (GPU / driver / disk / RAM)
  -> [parallel] download weights from Hugging Face (Comfy-Org/MiniMax-H3)
     and install ComfyUI (+ torch cu130 if needed)
  -> start ComfyUI headless on 127.0.0.1
  -> POST /prompt with an API-format workflow derived from the official
     ComfyUI blueprint "Image to Video (MiniMax H3)" (text-only = t2va mode)
  -> follow /ws events, collect per-node timing, sample nvidia-smi for peak VRAM
  -> copy the saved mp4 to --out, verify it has video+audio streams
  -> write <out>.json with timings / peak VRAM / checkpoints

Exit codes: 0 ok, 2 bad args, 3 preflight failed, 4 install failed,
            5 download failed, 6 ComfyUI start failed, 7 workflow rejected,
            8 execution failed, 9 output missing/invalid.

Sources the workflow is based on (checked 2026-10-13):
  - https://github.com/Comfy-Org/ComfyUI/blob/v0.39.0/blueprints/Image%20to%20Video%20(MiniMax%20H3).json
  - https://github.com/Comfy-Org/ComfyUI/blob/v0.39.0/comfy_extras/nodes_minimax_h3.py
  - https://huggingface.co/Comfy-Org/MiniMax-H3
  - https://docs.comfy.org/tutorials/video/minimax/minimax-h3
"""

import argparse
import concurrent.futures as cf
import datetime as _dt
import json
import os
import random
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

# --------------------------------------------------------------------------------------
# Constants (verified against primary sources, see module docstring)
# --------------------------------------------------------------------------------------
HF_REPO = "Comfy-Org/MiniMax-H3"
# Commit of Comfy-Org/MiniMax-H3 whose file list was verified on 2026-10-13.
# Override with --hf-revision main to follow the latest files.
HF_REVISION_DEFAULT = "e5eb578a89295337b8ff433a035929ce0279e0b6"

COMFY_REPO = "https://github.com/Comfy-Org/ComfyUI.git"
COMFY_REF_DEFAULT = "v0.39.0"  # H3 base templates need >= 0.30.0

FPS = 24
MAX_PIXELS = 768 * 1344  # area cap from nodes_minimax_h3.py
CANVAS_MULTIPLE = 32

# folder (ComfyUI models subdir) / filename, size in GB (HF API, for progress + disk check)
CKPT = {
    "unet_int8": ("diffusion_models", "minimax_h3_fl2va_pruned_int8_convrot.safetensors", 20.97),
    "unet_fp8": ("diffusion_models", "minimax_h3_fl2va_pruned_fp8_scaled.safetensors", 20.96),
    "unet_bf16": ("diffusion_models", "minimax_h3_fl2va_pruned_bf16.safetensors", 40.23),
    "te_nvfp4": ("text_encoders", "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", 15.69),
    "te_int8": ("text_encoders", "qwen3vl_32b_minimax_h3_int8_convrot.safetensors", 27.14),
    "vae_video": ("vae", "minimax_h3_video_vae_fp16.safetensors", 5.21),
    "vae_audio": ("vae", "minimax_h3_audio_vae_fp32.safetensors", 0.61),
    "lora_turbo8": ("loras", "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors", 1.96),
}

SIZE_PRESETS = {
    # 768p = model's native 768 short edge; 1344x768 is the documented 16:9 canvas
    "768p": (1344, 768),
    "768p-landscape": (1344, 768),
    "768p-portrait": (768, 1344),
    "768p-square": (768, 768),
    # smaller canvases for quick smoke tests (outside the documented native size)
    "480p": (832, 480),
    "480p-portrait": (480, 832),
}

REQUIRED_NODES = [
    "UNETLoader", "CLIPLoader", "VAELoader", "MiniMaxH3ImageToVideo", "KSamplerSelect",
    "BasicScheduler", "BasicGuider", "RandomNoise", "SamplerCustomAdvanced", "VAEDecode",
    "VAEDecodeAudio", "CreateVideo", "SaveVideo",
]

EXIT_ARGS, EXIT_PREFLIGHT, EXIT_INSTALL, EXIT_DOWNLOAD = 2, 3, 4, 5
EXIT_COMFY_START, EXIT_REJECTED, EXIT_EXEC, EXIT_OUTPUT = 6, 7, 8, 9

T0 = time.time()


class Fail(Exception):
    def __init__(self, code, msg):
        super().__init__(msg)
        self.code = code
        self.msg = msg


def log(msg):
    el = time.time() - T0
    print(f"[h3 {el:7.1f}s] {msg}", flush=True)


# --------------------------------------------------------------------------------------
# Status file (polled by run_h3_colab.sh)
# --------------------------------------------------------------------------------------
class Status:
    def __init__(self, path):
        self.path = path
        self.data = {"state": "running", "phase": "init", "started_at": _dt.datetime.now().isoformat()}
        self.lock = threading.Lock()
        self.write()

    def update(self, **kw):
        with self.lock:
            self.data.update(kw)
            self.data["updated_at"] = _dt.datetime.now().isoformat()
            self.data["elapsed_s"] = round(time.time() - T0, 1)
            self.write()

    def write(self):
        if not self.path:
            return
        tmp = self.path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self.path)
        except OSError:
            pass


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------
def sh(cmd, check=True, capture=False, env=None, cwd=None, timeout=None):
    """Run a subprocess. cmd is a list. Returns CompletedProcess."""
    kw = dict(env=env, cwd=cwd, timeout=timeout, text=True)
    if capture:
        kw.update(stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    p = subprocess.run(cmd, **kw)
    if check and p.returncode != 0:
        out = (p.stdout or "")[-4000:] if capture else ""
        raise subprocess.CalledProcessError(p.returncode, cmd, output=out)
    return p


def pip_install(args, log_path):
    """Install with uv (fast, present on Colab) and fall back to pip."""
    base_cmds = []
    if shutil.which("uv"):
        base_cmds.append(["uv", "pip", "install", "--system"])
    base_cmds.append([sys.executable, "-m", "pip", "install", "-q"])
    last = None
    for base in base_cmds:
        with open(log_path, "a", encoding="utf-8") as lf:
            lf.write(f"\n$ {' '.join(base + args)}\n")
            lf.flush()
            p = subprocess.run(base + args, stdout=lf, stderr=subprocess.STDOUT, text=True)
        if p.returncode == 0:
            return
        last = p.returncode
    raise Fail(EXIT_INSTALL, f"package install failed (rc={last}): {' '.join(args)} -- see {log_path}")


def frames_for_seconds(seconds):
    """Same formula as the official blueprint's ComfyMathExpression:
    max(5, round(a*24)) snapped UP to the model's 17k+5 frame grid."""
    n = max(5, round(seconds * FPS))
    return n + (5 - n % 17) % 17


def parse_size(s):
    s = s.strip().lower()
    if s in SIZE_PRESETS:
        return SIZE_PRESETS[s]
    m = re.fullmatch(r"(\d+)\s*[x*]\s*(\d+)", s)
    if not m:
        raise Fail(EXIT_ARGS, f"--size must be one of {sorted(SIZE_PRESETS)} or WIDTHxHEIGHT, got {s!r}")
    w, h = int(m.group(1)), int(m.group(2))
    if w % CANVAS_MULTIPLE or h % CANVAS_MULTIPLE:
        raise Fail(EXIT_ARGS, f"--size {w}x{h}: width and height must be multiples of {CANVAS_MULTIPLE}")
    if w * h > MAX_PIXELS:
        raise Fail(EXIT_ARGS, f"--size {w}x{h}: area exceeds the model cap 768*1344={MAX_PIXELS} px "
                              "(2K output is only available from MiniMax's hosted service)")
    return w, h


def gpu_info():
    if not shutil.which("nvidia-smi"):
        return None
    p = sh(["nvidia-smi", "--query-gpu=name,memory.total,driver_version",
            "--format=csv,noheader,nounits"], check=False, capture=True)
    if p.returncode != 0 or not p.stdout.strip():
        return None
    name, mem, drv = [x.strip() for x in p.stdout.strip().splitlines()[0].split(",")]
    return {"name": name, "memory_total_mib": int(float(mem)), "driver_version": drv}


def driver_supports_cuda13(drv):
    # CUDA 13.0 requires Linux driver >= 580.65.06
    try:
        parts = [int(x) for x in drv.split(".")]
    except ValueError:
        return False
    parts += [0] * (3 - len(parts))
    return tuple(parts[:3]) >= (580, 65, 6)


def torch_probe():
    """Return (torch_version, cuda_version) of the interpreter's torch, or (None, None)."""
    p = sh([sys.executable, "-c",
            "import torch,json;print(json.dumps([torch.__version__, torch.version.cuda]))"],
           check=False, capture=True)
    if p.returncode != 0:
        return None, None
    try:
        v, c = json.loads(p.stdout.strip().splitlines()[-1])
        return v, c
    except Exception:
        return None, None


def mem_total_gb():
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    return int(line.split()[1]) / 1024 / 1024
    except OSError:
        pass
    return None


class VramSampler(threading.Thread):
    """Samples nvidia-smi memory.used (MiB) -> peak. This is device-wide usage
    (includes the PyTorch caching allocator), i.e. what you need to fit."""

    def __init__(self, interval=0.5):
        super().__init__(daemon=True)
        self.interval = interval
        self.peak = 0
        self.baseline = None
        self._halt = threading.Event()

    def run(self):
        while not self._halt.is_set():
            p = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
            try:
                v = int(float(p.stdout.strip().splitlines()[0]))
                if self.baseline is None:
                    self.baseline = v
                self.peak = max(self.peak, v)
            except Exception:
                pass
            self._halt.wait(self.interval)

    def stop(self):
        self._halt.set()


# --------------------------------------------------------------------------------------
# Workflow (API format)
# --------------------------------------------------------------------------------------
def build_workflow(prompt, width, height, length, seed, steps, unet, clip, vae_video, vae_audio,
                   lora=None, lora_strength=1.0, filename_prefix="h3/h3"):
    """API-format graph equivalent to the official blueprint
    'Image to Video (MiniMax H3)' (ComfyUI v0.39.0) with no first/last frame (= t2va).

    Blueprint facts reproduced here:
      CLIPLoader type="minimax"; KSamplerSelect "res_multistep"; BasicScheduler "simple",
      denoise 1; BasicGuider (no CFG / no negative); RandomNoise; SamplerCustomAdvanced;
      VAEDecode + VAEDecodeAudio on the same AV latent; CreateVideo fps 24 sRGB;
      base 20 steps, turbo 8-step LoRA optional.
    """
    model_ref = ["1", 0]
    wf = {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": unet, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": clip, "type": "minimax", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": vae_video}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": vae_audio}},
        "5": {"class_type": "MiniMaxH3ImageToVideo",
              "inputs": {"clip": ["2", 0], "vae": ["3", 0], "prompt": prompt,
                         "width": width, "height": height, "length": length}},
        "6": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "res_multistep"}},
        "9": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "11": {"class_type": "VAEDecode", "inputs": {"samples": ["10", 0], "vae": ["3", 0]}},
        "12": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["10", 0], "vae": ["4", 0]}},
        "13": {"class_type": "CreateVideo",
               "inputs": {"images": ["11", 0], "audio": ["12", 0], "fps": float(FPS),
                          "bit_depth": "auto", "color_space": "sRGB"}},
        # SaveVideo uses DynamicCombo inputs; nested keys are dot-joined in API format.
        "14": {"class_type": "SaveVideo",
               "inputs": {"video": ["13", 0], "filename_prefix": filename_prefix,
                          "format": "mp4", "format.codec": "auto"}},
    }
    if lora:
        wf["15"] = {"class_type": "LoraLoaderModelOnly",
                    "inputs": {"model": ["1", 0], "lora_name": lora, "strength_model": lora_strength}}
        model_ref = ["15", 0]
    wf["7"] = {"class_type": "BasicScheduler",
               "inputs": {"model": model_ref, "scheduler": "simple", "steps": steps, "denoise": 1.0}}
    wf["8"] = {"class_type": "BasicGuider", "inputs": {"model": model_ref, "conditioning": ["5", 0]}}
    wf["10"] = {"class_type": "SamplerCustomAdvanced",
                "inputs": {"noise": ["9", 0], "guider": ["8", 0], "sampler": ["6", 0],
                           "sigmas": ["7", 0], "latent_image": ["5", 1]}}
    return wf


NODE_PHASE = {
    "1": "load", "2": "load", "3": "load", "4": "load", "15": "load",
    "5": "text_encode", "6": "setup", "7": "setup", "8": "setup", "9": "setup",
    "10": "sample", "11": "decode", "12": "decode", "13": "mux", "14": "mux",
}


# --------------------------------------------------------------------------------------
# Steps
# --------------------------------------------------------------------------------------
def download_weights(files, models_dir, revision, status, workers):
    from huggingface_hub import hf_hub_download  # installed/imported in ensure_hf()

    token = os.environ.get("HF_TOKEN") or None  # repo is NOT gated; token optional
    done = {}

    def one(key):
        sub, name, _gb = CKPT[key]
        target = os.path.join(models_dir, sub, name)
        if os.path.exists(target) and os.path.getsize(target) > 0:
            log(f"cached: {sub}/{name}")
            return key, target, 0.0
        t = time.time()
        p = hf_hub_download(repo_id=HF_REPO, filename=f"{sub}/{name}", revision=revision,
                            local_dir=models_dir, token=token)
        dt = time.time() - t
        size = os.path.getsize(p) / 1e9
        log(f"downloaded {sub}/{name} {size:.2f} GB in {dt:.0f}s ({size / max(dt, 1e-6) * 1000:.0f} MB/s)")
        return key, p, dt

    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(one, k): k for k in files}
        for f in cf.as_completed(futs):
            k = futs[f]
            try:
                key, path, dt = f.result()
            except Exception as e:  # noqa: BLE001
                hint = ""
                if "401" in str(e) or "403" in str(e) or "gated" in str(e).lower():
                    hint = " (auth error: if the repo became gated, pass HF_TOKEN via env; see README)"
                elif "404" in str(e) or "EntryNotFound" in type(e).__name__:
                    hint = (f" (file not found at revision {revision}; the repo may have renamed files. "
                            "Check https://huggingface.co/Comfy-Org/MiniMax-H3/tree/main and "
                            "pass --hf-revision main / adjust CKPT names)")
                raise Fail(EXIT_DOWNLOAD, f"download failed for {CKPT[k][0]}/{CKPT[k][1]}: "
                                          f"{type(e).__name__}: {e}{hint}")
            done[key] = path
            status.update(phase="download", downloaded=sorted(done))
    return done


def install_stack(comfy_dir, comfy_ref, torch_action, log_path, status):
    t = time.time()
    status.update(phase="install")
    if torch_action == "cu130":
        log("installing torch (cu130 wheels) ...")
        pip_install(["--upgrade", "torch", "torchvision", "torchaudio",
                     "--index-url", "https://download.pytorch.org/whl/cu130"], log_path)
    if not os.path.isdir(os.path.join(comfy_dir, ".git")):
        log(f"cloning ComfyUI {comfy_ref} ...")
        # 重みの並列ダウンロードが先に comfy_dir/models を作るため、直接 clone できない。
        # 別の場所に clone してから、既存ファイル（重み）を上書きせずに重ねる。
        src = comfy_dir.rstrip("/") + "_src"
        sh(["rm", "-rf", src], check=False)
        p = sh(["git", "clone", "--depth", "1", "--branch", comfy_ref, COMFY_REPO, src],
               check=False, capture=True)
        if p.returncode != 0:
            raise Fail(EXIT_INSTALL, f"git clone ComfyUI {comfy_ref} failed:\n{p.stdout[-2000:]}")
        os.makedirs(comfy_dir, exist_ok=True)
        p = sh(["cp", "-an", src + "/.", comfy_dir + "/"], check=False, capture=True)
        if p.returncode != 0:
            raise Fail(EXIT_INSTALL, f"merging ComfyUI checkout failed:\n{p.stdout[-2000:]}")
        sh(["rm", "-rf", src], check=False)
    log("installing ComfyUI requirements ...")
    pip_install(["-r", os.path.join(comfy_dir, "requirements.txt")], log_path)
    pip_install(["websocket-client"], log_path)
    v, c = torch_probe()
    if v is None:
        raise Fail(EXIT_INSTALL, f"torch is not importable after install -- see {log_path}")
    log(f"torch {v} (cuda {c}); install took {time.time() - t:.0f}s")
    return v, c, time.time() - t


def ensure_hf(log_path):
    """Make huggingface_hub + hf_xet importable WITHOUT upgrading an existing
    huggingface_hub (Colab's transformers may pin it). Checked in a subprocess so
    nothing stale is cached in this interpreter."""
    probe = "import huggingface_hub, hf_xet; print(huggingface_hub.__version__)"
    if sh([sys.executable, "-c", probe], check=False, capture=True).returncode != 0:
        have_hub = sh([sys.executable, "-c", "import huggingface_hub"], check=False, capture=True).returncode == 0
        pip_install(["hf_xet"] if have_hub else ["huggingface_hub", "hf_xet"], log_path)
    # Import now (before the concurrent pip installs touch site-packages) so the
    # download threads use fully-loaded modules.
    from huggingface_hub import hf_hub_download  # noqa: F401
    import hf_xet  # noqa: F401


def http_json(url, data=None, timeout=30):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def start_comfy(comfy_dir, port, out_dir, models_dir, extra_args, log_path, timeout_s):
    cmd = [sys.executable, "main.py", "--listen", "127.0.0.1", "--port", str(port),
           "--disable-auto-launch", "--output-directory", out_dir]
    default_models = os.path.join(comfy_dir, "models")
    if os.path.abspath(models_dir) != os.path.abspath(default_models):
        yml = os.path.join(comfy_dir, "extra_model_paths.h3.yaml")
        with open(yml, "w") as f:
            f.write("h3:\n"
                    f"  base_path: {models_dir}\n"
                    "  diffusion_models: diffusion_models\n"
                    "  text_encoders: text_encoders\n"
                    "  vae: vae\n"
                    "  loras: loras\n")
        cmd += ["--extra-model-paths-config", yml]
    cmd += extra_args
    log(f"starting ComfyUI: {' '.join(cmd)}")
    lf = open(log_path, "a", encoding="utf-8")
    proc = subprocess.Popen(cmd, cwd=comfy_dir, stdout=lf, stderr=subprocess.STDOUT,
                            start_new_session=True)
    base = f"http://127.0.0.1:{port}"
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if proc.poll() is not None:
            raise Fail(EXIT_COMFY_START, f"ComfyUI exited during startup (rc={proc.returncode}).\n"
                                         f"{tail(log_path)}")
        try:
            stats = http_json(base + "/system_stats", timeout=5)
            log(f"ComfyUI up: {json.dumps(stats.get('system', {}).get('comfyui_version'))}")
            return proc, base, stats
        except Exception:
            time.sleep(2)
    raise Fail(EXIT_COMFY_START, f"ComfyUI did not answer within {timeout_s}s.\n{tail(log_path)}")


def tail(path, n=60):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        return "---- last log lines (" + path + ") ----\n" + "".join(lines[-n:])
    except OSError:
        return ""


def verify_nodes(base, needed):
    info = http_json(base + "/object_info", timeout=60)
    missing = [n for n in needed if n not in info]
    if missing:
        raise Fail(EXIT_REJECTED, f"ComfyUI lacks required nodes: {missing}. "
                                  "MiniMax H3 needs ComfyUI >= 0.30.0 (this script pins --comfy-ref).")
    return info


def check_files_visible(info, wf):
    """Make sure every checkpoint name in the graph is in the loader's dropdown."""
    pairs = [("UNETLoader", "unet_name"), ("CLIPLoader", "clip_name"), ("VAELoader", "vae_name"),
             ("LoraLoaderModelOnly", "lora_name")]
    for cls, field in pairs:
        try:
            spec = info[cls]["input"]["required"][field]
            options = spec[0]
            if options == "COMBO":  # newer combo spec: ["COMBO", {"options": [...]}]
                options = (spec[1] if len(spec) > 1 else {}).get("options", [])
        except Exception:
            continue
        for node in wf.values():
            if node["class_type"] == cls:
                v = node["inputs"][field]
                if isinstance(options, list) and options and v not in options:
                    raise Fail(EXIT_REJECTED, f"{cls}.{field}={v!r} is not visible to ComfyUI. "
                                              f"Visible: {options[:20]}")


def run_prompt(base, wf, status, exec_timeout):
    import websocket  # websocket-client

    client_id = uuid.uuid4().hex
    ws = websocket.create_connection(base.replace("http", "ws") + f"/ws?clientId={client_id}", timeout=30)
    try:
        try:
            r = http_json(base + "/prompt", {"prompt": wf, "client_id": client_id}, timeout=60)
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            raise Fail(EXIT_REJECTED, f"/prompt rejected the workflow (HTTP {e.code}):\n{body[:4000]}")
        if r.get("node_errors"):
            raise Fail(EXIT_REJECTED, f"workflow node_errors: {json.dumps(r['node_errors'], ensure_ascii=False)[:4000]}")
        pid = r["prompt_id"]
        log(f"queued prompt {pid}")

        node_t = {}
        cur, cur_start = None, None
        t_start = time.time()
        last_prog = 0.0
        ws.settimeout(30)
        while True:
            if time.time() - t_start > exec_timeout:
                raise Fail(EXIT_EXEC, f"generation exceeded --exec-timeout {exec_timeout}s")
            try:
                msg = ws.recv()
            except websocket.WebSocketTimeoutException:
                continue
            if isinstance(msg, bytes):
                continue  # previews
            m = json.loads(msg)
            typ, data = m.get("type"), m.get("data", {})
            if data.get("prompt_id") not in (None, pid):
                continue
            now = time.time()
            if typ == "executing":
                if cur is not None:
                    node_t[cur] = node_t.get(cur, 0.0) + (now - cur_start)
                node = data.get("node")
                if node is None:
                    break  # finished
                cur, cur_start = node, now
                cls = wf.get(node, {}).get("class_type", node)
                log(f"executing node {node} ({cls})")
                status.update(phase="generate", node=cls)
            elif typ == "progress":
                v, mx = data.get("value", 0), data.get("max", 1)
                if now - last_prog > 10 or v == mx:
                    last_prog = now
                    cls = wf.get(str(data.get("node")), {}).get("class_type", "")
                    log(f"progress {cls} {v}/{mx}")
                    status.update(progress=f"{v}/{mx}")
            elif typ == "execution_error":
                raise Fail(EXIT_EXEC, "ComfyUI execution_error in node "
                                      f"{data.get('node_id')} ({data.get('node_type')}): "
                                      f"{data.get('exception_type')}: {data.get('exception_message')}\n"
                                      + "".join(data.get("traceback", [])[-15:]))
            elif typ == "execution_interrupted":
                raise Fail(EXIT_EXEC, "ComfyUI execution was interrupted")
            elif typ == "execution_success":
                if cur is not None:
                    node_t[cur] = node_t.get(cur, 0.0) + (now - cur_start)
                break
        hist = http_json(base + f"/history/{pid}", timeout=30).get(pid, {})
        return pid, node_t, hist
    finally:
        try:
            ws.close()
        except Exception:
            pass


def find_output_mp4(hist, out_dir, after_ts):
    # 1) from history
    for node_out in (hist.get("outputs") or {}).values():
        for key in ("images", "videos", "gifs", "video"):
            for item in node_out.get(key, []) or []:
                if isinstance(item, dict) and str(item.get("filename", "")).endswith(".mp4"):
                    p = os.path.join(out_dir, item.get("subfolder", ""), item["filename"])
                    if os.path.exists(p):
                        return p
    # 2) newest mp4 in output dir
    best = None
    for root, _d, files in os.walk(out_dir):
        for fn in files:
            if fn.endswith(".mp4"):
                p = os.path.join(root, fn)
                mt = os.path.getmtime(p)
                if mt >= after_ts and (best is None or mt > best[0]):
                    best = (mt, p)
    return best[1] if best else None


def probe_mp4(path):
    if not shutil.which("ffprobe"):
        return {"note": "ffprobe not available; streams not verified"}
    p = sh(["ffprobe", "-v", "error", "-show_entries",
            "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration",
            "-of", "json", path], check=False, capture=True)
    if p.returncode != 0:
        raise Fail(EXIT_OUTPUT, f"ffprobe failed on {path}: {p.stdout[-1000:]}")
    return json.loads(p.stdout)


# --------------------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------------------
def parse_args(argv=None):
    ap = argparse.ArgumentParser(description="MiniMax H3 text->video+audio via headless ComfyUI")
    ap.add_argument("--prompt", help="Text prompt (any language; passed through untranslated)")
    ap.add_argument("--prompt-file", help="Read the prompt from a UTF-8 file instead of --prompt")
    ap.add_argument("--seconds", type=float, default=5.0, help="Duration 4..15 s (default 5)")
    ap.add_argument("--size", default="768p",
                    help="768p (=1344x768, default), 768p-portrait, 768p-square, 480p, or WxH (multiples of 32)")
    ap.add_argument("--seed", type=int, default=None, help="Noise seed (default: random, recorded in JSON)")
    ap.add_argument("--out", default="/content/h3_out/h3.mp4", help="Output mp4 path on this machine")
    ap.add_argument("--steps", type=int, default=None, help="Sampling steps (default 20, or 8 with --turbo)")
    ap.add_argument("--turbo", action="store_true",
                    help="Use the official 8-step turbo LoRA (faster; speech quality drops below ~12 steps)")
    ap.add_argument("--variant", choices=["auto", "int8", "fp8", "bf16"], default="auto",
                    help="Diffusion checkpoint precision. auto = int8_convrot if torch is cu130, else fp8_scaled")
    ap.add_argument("--text-encoder", choices=["nvfp4", "int8"], default="nvfp4",
                    help="Qwen3-VL-32B text encoder file (nvfp4_awq is the blueprint default, 15.7 GB)")
    ap.add_argument("--torch", dest="torch_policy", choices=["auto", "keep", "cu130"], default="auto",
                    help="auto: install torch cu130 if missing and the driver supports CUDA 13")
    ap.add_argument("--comfy-dir", default="/content/ComfyUI")
    ap.add_argument("--comfy-ref", default=COMFY_REF_DEFAULT, help="ComfyUI git tag/branch (>= v0.30.0)")
    ap.add_argument("--models-dir", default=None,
                    help="Where weights live/download to (default <comfy-dir>/models). "
                         "Point at a mounted Drive folder to reuse a cache.")
    ap.add_argument("--hf-revision", default=HF_REVISION_DEFAULT)
    ap.add_argument("--dl-workers", type=int, default=4)
    ap.add_argument("--port", type=int, default=8188)
    ap.add_argument("--comfy-args", default="", help="Extra args for ComfyUI main.py, e.g. '--use-ck-attention'")
    ap.add_argument("--exec-timeout", type=int, default=5400, help="Max seconds for the generation itself")
    ap.add_argument("--min-free-disk-gb", type=float, default=10.0)
    ap.add_argument("--keep-server", action="store_true", help="Leave ComfyUI running after finishing")
    ap.add_argument("--status-file", default=None, help="Progress JSON path (default <out>.status.json)")
    ap.add_argument("--dump-workflow", metavar="PATH",
                    help="Only write the API-format workflow JSON (no GPU, no downloads) and exit")
    return ap.parse_args(argv)


def main(argv=None):
    a = parse_args(argv)

    # ---- argument validation (before spending anything) ----
    prompt = a.prompt
    if a.prompt_file:
        with open(a.prompt_file, encoding="utf-8") as f:
            prompt = f.read().strip()
    if not prompt and not a.dump_workflow:
        raise Fail(EXIT_ARGS, "--prompt (or --prompt-file) is required")
    if not (4.0 <= a.seconds <= 15.0):
        raise Fail(EXIT_ARGS, f"--seconds must be within 4..15 (got {a.seconds})")
    width, height = parse_size(a.size)
    length = frames_for_seconds(a.seconds)
    seed = a.seed if a.seed is not None else random.randint(0, 2**53 - 1)
    steps = a.steps if a.steps is not None else (8 if a.turbo else 20)
    if steps < 1 or steps > 100:
        raise Fail(EXIT_ARGS, f"--steps out of range: {steps}")

    te_key = "te_nvfp4" if a.text_encoder == "nvfp4" else "te_int8"

    if a.dump_workflow:
        unet_key = {"auto": "unet_int8", "int8": "unet_int8", "fp8": "unet_fp8", "bf16": "unet_bf16"}[a.variant]
        wf = build_workflow(prompt or "<PROMPT>", width, height, length, seed, steps,
                            CKPT[unet_key][1], CKPT[te_key][1], CKPT["vae_video"][1], CKPT["vae_audio"][1],
                            lora=CKPT["lora_turbo8"][1] if a.turbo else None)
        with open(a.dump_workflow, "w", encoding="utf-8") as f:
            json.dump(wf, f, ensure_ascii=False, indent=2)
        print(f"wrote {a.dump_workflow} ({width}x{height}, {length} frames, {steps} steps)")
        return 0

    out = os.path.abspath(a.out)
    if not out.lower().endswith(".mp4"):
        raise Fail(EXIT_ARGS, "--out must end with .mp4")
    out_dir = os.path.dirname(out)
    os.makedirs(out_dir, exist_ok=True)
    json_path = os.path.splitext(out)[0] + ".json"
    status = Status(a.status_file or out + ".status.json")
    work_dir = os.path.join(out_dir, "_work")
    os.makedirs(work_dir, exist_ok=True)
    install_log = os.path.join(work_dir, "install.log")
    comfy_log = os.path.join(work_dir, "comfyui.log")
    comfy_out = os.path.join(work_dir, "comfy_output")
    models_dir = os.path.abspath(a.models_dir or os.path.join(a.comfy_dir, "models"))

    report = {
        "ok": False, "prompt": prompt, "seconds_requested": a.seconds, "frames": length,
        "duration_s_nominal": round(length / FPS, 3), "fps": FPS, "width": width, "height": height,
        "seed": seed, "steps": steps, "turbo_lora": a.turbo, "hf_repo": HF_REPO,
        "hf_revision": a.hf_revision, "comfyui_ref": a.comfy_ref, "timings_s": {},
        "started_at": _dt.datetime.now().isoformat(),
    }

    def finish(ok, err=None, code=0):
        report["ok"] = ok
        report["timings_s"]["total"] = round(time.time() - T0, 1)
        report["finished_at"] = _dt.datetime.now().isoformat()
        if err:
            report["error"] = err
            report["exit_code"] = code
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        status.update(state="done" if ok else "failed", exit_code=code, error=err,
                      out=out if ok else None, report=json_path)

    comfy_proc = None
    vram = None
    try:
        # ---- preflight ----
        status.update(phase="preflight")
        g = gpu_info()
        if not g:
            raise Fail(EXIT_PREFLIGHT, "no NVIDIA GPU visible (nvidia-smi failed). Use `--gpu H100`.")
        report["gpu"] = g
        log(f"GPU: {g}")
        if g["memory_total_mib"] < 40000:
            log("WARNING: GPU has < 40 GB VRAM; ComfyUI will offload heavily (slow) or OOM.")
        ram = mem_total_gb()
        report["host_ram_gb"] = round(ram, 1) if ram else None
        if ram and ram < 60:
            log(f"WARNING: host RAM {ram:.0f} GB. Weights total ~43 GB; consider `--high-mem`.")
        tv, tc = torch_probe()
        log(f"current torch: {tv} (cuda {tc})")
        torch_action = "none"
        cu13_now = bool(tc and str(tc).startswith("13"))
        if a.torch_policy == "cu130" or (a.torch_policy == "auto" and not cu13_now):
            if driver_supports_cuda13(g["driver_version"]):
                torch_action = "cu130"
            elif a.torch_policy == "cu130":
                raise Fail(EXIT_PREFLIGHT, f"driver {g['driver_version']} is too old for CUDA 13 (needs >= 580.65.06)")
            else:
                log(f"driver {g['driver_version']} < 580.65 -> keeping torch {tv}")
        will_be_cu13 = cu13_now or torch_action == "cu130"
        if a.variant == "auto":
            unet_key = "unet_int8" if will_be_cu13 else "unet_fp8"
        else:
            unet_key = {"int8": "unet_int8", "fp8": "unet_fp8", "bf16": "unet_bf16"}[a.variant]
            if unet_key == "unet_int8" and not will_be_cu13:
                log("WARNING: int8_convrot is recommended only with torch cu130 (HF model card).")
        files = [unet_key, te_key, "vae_video", "vae_audio"] + (["lora_turbo8"] if a.turbo else [])
        need_gb = sum(CKPT[k][2] for k in files)
        report["checkpoints"] = {k: f"{CKPT[k][0]}/{CKPT[k][1]}" for k in files}
        report["download_size_gb"] = round(need_gb, 2)
        os.makedirs(models_dir, exist_ok=True)
        free_gb = shutil.disk_usage(models_dir).free / 1e9
        already = sum(CKPT[k][2] for k in files
                      if os.path.exists(os.path.join(models_dir, CKPT[k][0], CKPT[k][1])))
        if free_gb < (need_gb - already) + a.min_free_disk_gb:
            raise Fail(EXIT_PREFLIGHT, f"not enough disk at {models_dir}: free {free_gb:.0f} GB, "
                                       f"need {need_gb - already:.0f} GB + {a.min_free_disk_gb:.0f} GB margin")
        log(f"plan: {report['checkpoints']} (~{need_gb:.1f} GB), torch action: {torch_action}, "
            f"{width}x{height}, {length} frames (~{length / FPS:.2f}s), {steps} steps, seed {seed}")

        # ---- download + install in parallel ----
        # Must be set before huggingface_hub is imported. HF_XET_HIGH_PERFORMANCE replaces
        # the deprecated HF_HUB_ENABLE_HF_TRANSFER (hf_transfer no longer used on Xet storage).
        os.environ.setdefault("HF_XET_HIGH_PERFORMANCE", "1")
        os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
        status.update(phase="download")
        ensure_hf(install_log)
        t_dl0 = time.time()
        with cf.ThreadPoolExecutor(max_workers=2) as ex:
            f_dl = ex.submit(download_weights, files, models_dir, a.hf_revision, status, a.dl_workers)
            f_in = ex.submit(install_stack, a.comfy_dir, a.comfy_ref, torch_action, install_log, status)
            try:
                tv2, tc2, t_install = f_in.result()
            except Fail:
                raise
            except Exception as e:  # noqa: BLE001
                raise Fail(EXIT_INSTALL, f"install failed: {type(e).__name__}: {e}\n{tail(install_log)}")
            paths = f_dl.result()
            t_dl = time.time() - t_dl0
        report["torch"] = {"version": tv2, "cuda": tc2, "action": torch_action}
        report["timings_s"]["install"] = round(t_install, 1)
        report["timings_s"]["download_and_install_wall"] = round(t_dl, 1)
        if unet_key == "unet_int8" and not str(tc2).startswith("13"):
            log(f"WARNING: running int8_convrot with torch cuda {tc2} (not cu130)")
        log(f"weights ready in {t_dl:.0f}s: {list(paths)}")

        # ---- ComfyUI ----
        status.update(phase="comfy_start")
        os.makedirs(comfy_out, exist_ok=True)
        t_cs = time.time()
        comfy_proc, base, stats = start_comfy(a.comfy_dir, a.port, comfy_out, models_dir,
                                              a.comfy_args.split() if a.comfy_args else [],
                                              comfy_log, timeout_s=600)
        report["timings_s"]["comfy_start"] = round(time.time() - t_cs, 1)
        report["comfyui_version"] = stats.get("system", {}).get("comfyui_version")

        wf = build_workflow(prompt, width, height, length, seed, steps,
                            CKPT[unet_key][1], CKPT[te_key][1], CKPT["vae_video"][1], CKPT["vae_audio"][1],
                            lora=CKPT["lora_turbo8"][1] if a.turbo else None,
                            filename_prefix=f"h3/{os.path.splitext(os.path.basename(out))[0]}")
        with open(os.path.join(work_dir, "workflow_api.json"), "w", encoding="utf-8") as f:
            json.dump(wf, f, ensure_ascii=False, indent=2)
        info = verify_nodes(base, REQUIRED_NODES + (["LoraLoaderModelOnly"] if a.turbo else []))
        check_files_visible(info, wf)

        # ---- generate ----
        vram = VramSampler()
        vram.start()
        t_gen0 = time.time()
        pid, node_t, hist = run_prompt(base, wf, status, a.exec_timeout)
        t_gen = time.time() - t_gen0
        vram.stop()
        phases = {}
        for node, sec in node_t.items():
            ph = NODE_PHASE.get(str(node), "other")
            phases[ph] = round(phases.get(ph, 0.0) + sec, 1)
        report["prompt_id"] = pid
        report["timings_s"]["comfy_total"] = round(t_gen, 1)
        report["timings_s"]["phases"] = phases
        report["timings_s"]["per_node"] = {f"{n}:{wf.get(str(n), {}).get('class_type', '?')}": round(s, 1)
                                           for n, s in node_t.items()}
        report["timings_note"] = ("load = loader nodes (weights read to RAM); text_encode includes moving the "
                                  "Qwen3-VL encoder to GPU; sample includes moving the DiT to GPU + all steps; "
                                  "decode = video+audio VAE decode; mux = mp4 encode/write.")
        report["vram_peak_mib"] = vram.peak
        report["vram_baseline_mib"] = vram.baseline
        report["vram_note"] = "nvidia-smi memory.used peak (device-wide, includes PyTorch cache)"

        # ---- output ----
        status.update(phase="output")
        src = find_output_mp4(hist, comfy_out, t_gen0 - 5)
        if not src:
            raise Fail(EXIT_OUTPUT, f"generation finished but no mp4 found under {comfy_out}. "
                                    f"history outputs: {json.dumps(hist.get('outputs'))[:1500]}")
        shutil.copyfile(src, out)
        pr = probe_mp4(out)
        report["ffprobe"] = pr
        streams = pr.get("streams")
        if streams is not None:
            kinds = {s.get("codec_type") for s in streams}
            if "video" not in kinds:
                raise Fail(EXIT_OUTPUT, f"{out} has no video stream: {pr}")
            if "audio" not in kinds:
                raise Fail(EXIT_OUTPUT, f"{out} has no audio stream (expected H3 stereo audio): {pr}")
        report["out"] = out
        report["out_size_mb"] = round(os.path.getsize(out) / 1e6, 2)
        finish(True)
        log(f"DONE -> {out} ({report['out_size_mb']} MB), report {json_path}")
        print(json.dumps({k: report[k] for k in ("out", "timings_s", "vram_peak_mib", "checkpoints")},
                         ensure_ascii=False, indent=2), flush=True)
        return 0
    except Fail as e:
        log(f"ERROR ({e.code}): {e.msg}")
        if e.code in (EXIT_COMFY_START, EXIT_REJECTED, EXIT_EXEC, EXIT_OUTPUT):
            print(tail(comfy_log), flush=True)
        finish(False, e.msg, e.code)
        return e.code
    except KeyboardInterrupt:
        finish(False, "interrupted", 130)
        return 130
    except Exception as e:  # noqa: BLE001
        import traceback
        tb = traceback.format_exc()
        log(f"UNEXPECTED ERROR: {tb}")
        finish(False, f"{type(e).__name__}: {e}", 1)
        return 1
    finally:
        if vram:
            vram.stop()
        if comfy_proc and not a.keep_server and comfy_proc.poll() is None:
            try:
                os.killpg(comfy_proc.pid, signal.SIGTERM)
                comfy_proc.wait(timeout=30)
            except Exception:
                try:
                    os.killpg(comfy_proc.pid, signal.SIGKILL)
                except Exception:
                    pass


if __name__ == "__main__":
    try:
        _rc = main()
    except Fail as _e:  # argument errors before the status file exists
        print(f"[h3] ERROR ({_e.code}): {_e.msg}", file=sys.stderr, flush=True)
        _rc = _e.code
    # In `colab run` this runs inside the IPython kernel: sys.exit(N) is mapped to exit code N.
    if _rc:
        sys.exit(_rc)
