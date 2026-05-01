#!/usr/bin/env python3
"""
hawk-health-monitor: 服务健康监控脚本

检查 hawk-bridge/hawk-memory 生态系统中所有关键组件的状态，
包括磁盘使用、xinference 模型、m_flow 服务等。

用法:
    python hawk_health_monitor.py              # 交互模式，输出摘要
    python hawk_health_monitor.py --cron        # Cron 模式，简洁输出
    python hawk_health_monitor.py --report      # 生成详细报告到文件
    python hawk_health_monitor.py --json        # 输出完整 JSON
"""

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

DEFAULT_XINFERENCE_URL = "http://127.0.0.1:9997"
DEFAULT_M_FLOW_PORT = 8000
DEFAULT_HAWK_MEMORY_PORT = 9292

DISK_THRESHOLDS = {
    "/": 85,  # 根分区 >85% 告警
    "/home": 90,
}

LOG_SIZE_THRESHOLD_MB = 3000  # 日志目录超过 3GB 告警
M_FLOW_LOG_GROWTH_MB = 500   # 30分钟内增长超过 500MB 告警
SERVICE_PORT_TIMEOUT = 3  # 端口检测超时秒数

REPORT_DIR = Path.home() / ".hawk" / "health-reports"


# ---------------------------------------------------------------------------
# 数据结构
# ---------------------------------------------------------------------------

@dataclass
class CheckResult:
    name: str
    status: str  # OK | WARNING | ERROR | CRITICAL
    details: Optional[dict] = None
    message: Optional[str] = None


@dataclass
class HealthReport:
    timestamp: str
    overall: str
    checks: list
    runtime_ms: float


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def log(msg: str, level: str = "INFO"):
    print(f"[{level}] {msg}", file=sys.stderr, flush=True)


def run_cmd(cmd: list, timeout: int = 10) -> tuple[int, str, str]:
    """执行 shell 命令，返回 (returncode, stdout, stderr)"""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "timeout"
    except Exception as e:
        return -1, "", str(e)


def check_port(host: str, port: int, timeout: int = 3) -> bool:
    """检查端口是否可达（使用 bash 的 /dev/tcp 或 nc）"""
    cmd = ["bash", "-c", f"echo > /dev/tcp/{host}/{port}"]
    code, _, _ = run_cmd(cmd, timeout=timeout)
    return code == 0


def get_process_cmdline(pid: int) -> Optional[str]:
    """获取进程命令行"""
    try:
        with open(f"/proc/{pid}/cmdline", "r") as f:
            return f.read().replace("\x00", " ").strip()
    except:
        return None


def find_process(pattern: str) -> list:
    """查找包含关键词的进程"""
    try:
        result = subprocess.run(
            ["ps", "aux"],
            capture_output=True,
            text=True
        )
        processes = []
        for line in result.stdout.split("\n"):
            if pattern.lower() in line.lower() and "grep" not in line.lower():
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        pid = int(parts[1])
                        cmdline = " ".join(parts[10:]) if len(parts) > 10 else ""
                        processes.append({"pid": pid, "cmdline": cmdline})
                    except ValueError:
                        continue
        return processes
    except:
        return []


# ---------------------------------------------------------------------------
# 检查实现
# ---------------------------------------------------------------------------

def check_xinference(url: str = DEFAULT_XINFERENCE_URL) -> CheckResult:
    """检查 xinference 服务状态和模型"""
    import urllib.request
    import urllib.error

    details = {"url": url, "models": []}

    # 检查服务可达性
    try:
        req = urllib.request.urlopen(f"{url}/v1/models", timeout=5)
        data = json.loads(req.read().decode())
        models = data.get("data", [])
        details["online"] = True

        # 检查关键模型
        expected = {
            "bge-m3": "embedding",
            "Qwen3-Reranker-0.6B": "rerank",
        }
        online_models = []
        for m in models:
            model_id = m.get("id", "")
            model_type = m.get("model_type", "")
            online_models.append({
                "id": model_id,
                "type": model_type,
                "online": True
            })

        details["models"] = online_models

        # 检查缺失模型
        missing = []
        for expected_name, expected_type in expected.items():
            found = any(
                mo["id"] == expected_name and mo["type"] == expected_type
                for mo in online_models
            )
            if not found:
                missing.append(expected_name)

        if missing:
            status = "ERROR"
            details["missing_models"] = missing
        else:
            status = "OK"

    except urllib.error.URLError as e:
        details["online"] = False
        details["error"] = str(e)
        status = "CRITICAL"

    except Exception as e:
        details["online"] = False
        details["error"] = str(e)
        status = "CRITICAL"

    return CheckResult(name="xinference", status=status, details=details)


def check_m_flow(port: int = DEFAULT_M_FLOW_PORT) -> CheckResult:
    """检查 m_flow 服务状态"""
    details = {"port": port}

    # 检查进程
    processes = find_process("m_flow")
    if not processes:
        processes = find_process("mflow_api")

    if not processes:
        # 检查端口
        if check_port("127.0.0.1", port, timeout=2):
            details["process"] = "unknown (port reachable)"
            status = "WARNING"
        else:
            details["process"] = "not found"
            status = "ERROR"
    else:
        details["process"] = processes[0]["cmdline"][:80]
        details["pid"] = processes[0]["pid"]
        status = "OK"

    # 检查端口可达性
    if check_port("127.0.0.1", port, timeout=2):
        details["port_reachable"] = True
    else:
        details["port_reachable"] = False
        status = "ERROR"

    return CheckResult(name="m_flow", status=status, details=details)


def check_hawk_memory_go(port: int = DEFAULT_HAWK_MEMORY_PORT) -> CheckResult:
    """检查 hawk-memory Go 服务状态"""
    details = {"port": port}

    # 检查进程
    processes = find_process("hawk-memory")
    if not processes:
        processes = find_process("lancedb")
        processes = [p for p in processes if "python" not in p["cmdline"].lower()]

    if not processes:
        # 检查端口
        if check_port("127.0.0.1", port, timeout=2):
            details["process"] = "unknown (port reachable)"
            status = "WARNING"
        else:
            details["process"] = "not found"
            status = "ERROR"
    else:
        details["process"] = processes[0]["cmdline"][:80]
        details["pid"] = processes[0]["pid"]
        status = "OK"

    # 检查端口可达性
    if check_port("127.0.0.1", port, timeout=2):
        details["port_reachable"] = True
    else:
        details["port_reachable"] = False

    return CheckResult(name="hawk_memory_go", status=status, details=details)


def check_openclaw_gateway() -> CheckResult:
    """检查 OpenClaw gateway 进程状态"""
    details = {}

    processes = find_process("openclaw")
    gateway_procs = [p for p in processes if "gateway" in p["cmdline"].lower()]

    if not gateway_procs:
        details["gateway_process"] = "not found"
        status = "ERROR"
    else:
        details["gateway_process"] = gateway_procs[0]["cmdline"][:80]
        details["pid"] = gateway_procs[0]["pid"]
        status = "OK"

    return CheckResult(name="openclaw_gateway", status=status, details=details)


def check_hermes_agents() -> CheckResult:
    """检查 hermes agent 进程状态"""
    details = {}

    processes = find_process("hermes")
    if not processes:
        details["agents"] = "none found"
        status = "ERROR"
    else:
        agent_pids = {}
        for p in processes:
            if p["pid"] > 0:
                agent_pids[str(p["pid"])] = p["cmdline"][:60]
        details["agents"] = agent_pids
        details["count"] = len(agent_pids)
        status = "OK" if agent_pids else "WARNING"

    return CheckResult(name="hermes_agents", status=status, details=details)


def check_disk_usage() -> CheckResult:
    """检查磁盘使用率"""
    details = {}

    # 使用 df 获取磁盘信息
    code, stdout, _ = run_cmd(["df", "-h"], timeout=5)
    if code != 0:
        return CheckResult(name="disk_usage", status="ERROR", details={"error": "df failed"})

    lines = stdout.strip().split("\n")
    disks = {}
    alert_levels = []

    for line in lines[1:]:  # 跳过 header
        parts = line.split()
        if len(parts) < 6:
            continue
        mount = parts[5]
        use_pct_str = parts[4].rstrip("%")
        try:
            use_pct = int(use_pct_str)
        except ValueError:
            continue

        if mount in DISK_THRESHOLDS:
            threshold = DISK_THRESHOLDS[mount]
            if use_pct > threshold:
                alert_levels.append("ERROR" if use_pct > threshold + 5 else "WARNING")
            disks[mount] = {"used_pct": use_pct, "threshold": threshold, "alert": use_pct > threshold}
        elif mount == "/" or mount.startswith("/home"):
            disks[mount] = {"used_pct": use_pct}

    if any(d.get("alert") for d in disks.values() if isinstance(d, dict)):
        status = "ERROR" if "ERROR" in alert_levels else "WARNING"
    else:
        status = "OK"

    details["disks"] = disks

    return CheckResult(name="disk_usage", status=status, details=details)


def check_directory_sizes() -> CheckResult:
    """检查关键目录大小"""
    details = {}

    paths_to_check = {
        "m_flow_logs": Path.home() / "repos" / "m_flow" / "logs",
        "xinference_cache": Path.home() / ".xinference" / "huggingface",
        "hermes_state": Path.home() / ".hermes",
        "openclaw_plugins": Path.home() / ".openclaw" / "plugin-runtime-deps",
    }

    alerts = []
    for name, path in paths_to_check.items():
        if not path.exists():
            details[name] = {"exists": False}
            continue

        # 计算目录大小
        try:
            result = subprocess.run(
                ["du", "-sm", str(path)],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                size_mb = int(result.stdout.split()[0])
                details[name] = {
                    "size_mb": size_mb,
                    "path": str(path),
                }
                # m_flow logs 特殊阈值
                if name == "m_flow_logs" and size_mb > LOG_SIZE_THRESHOLD_MB:
                    details[name]["alert"] = True
                    alerts.append(f"m_flow logs {size_mb}MB > {LOG_SIZE_THRESHOLD_MB}MB")
        except Exception as e:
            details[name] = {"error": str(e)}

    status = "ERROR" if alerts else "OK"
    if alerts:
        details["alerts"] = alerts

    return CheckResult(name="directory_sizes", status=status, details=details)


def check_large_files_modified_recently(base_dir: str, hours: int = 24, min_size_mb: int = 50) -> CheckResult:
    """检查最近 N 小时内修改的大文件（>min_size_mb）"""
    details = {
        "base_dir": base_dir,
        "hours": hours,
        "min_size_mb": min_size_mb,
        "files": []
    }

    try:
        find_expr = f"-type f -size +{min_size_mb}M -mmin -{hours * 60}"
        result = subprocess.run(
            ["find", base_dir, "-type", "f", "-size", f"+{min_size_mb}M",
             "-mmin", f"-{hours * 60}", "-ls"],
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode == 0 and result.stdout.strip():
            lines = result.stdout.strip().split("\n")
            for line in lines[:20]:  # 最多20个
                parts = line.split()
                if len(parts) >= 11:
                    size_bytes = int(parts[6])
                    size_mb = size_bytes / 1024 / 1024  # bytes → MB
                    path = " ".join(parts[10:]) if len(parts) > 10 else parts[-1]
                    details["files"].append({
                        "size_mb": round(size_mb, 1),
                        "path": path[:120]
                    })

        details["count"] = len(details["files"])

    except Exception as e:
        details["error"] = str(e)

    status = "WARNING" if details["files"] else "OK"
    return CheckResult(name="large_files_recent", status=status, details=details)


def check_kuzu_graph_db() -> CheckResult:
    """检查 kuzu 图数据库大小"""
    details = {}

    kuzu_paths = [
        Path.home() / "repos" / "m_flow" / "m_flow" / ".mflow" / "system" / "databases" / "m_flow_graph_kuzu",
        Path.home() / "repos" / "m_flow" / "m_flow" / ".m_flow_system" / "databases" / "m_flow_graph_kuzu",
    ]

    total_size = 0
    found_paths = []

    for path in kuzu_paths:
        if path.exists():
            try:
                result = subprocess.run(
                    ["du", "-sm", str(path)],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode == 0:
                    size_mb = int(result.stdout.split()[0])
                    total_size += size_mb
                    found_paths.append({"path": str(path), "size_mb": size_mb})
            except:
                pass

    details["databases"] = found_paths
    details["total_size_mb"] = total_size

    # kuzu 数据库 > 5GB 且可重建，标记为 WARNING
    if total_size > 5000:
        status = "WARNING"
        details["note"] = "Consider cleaning if graph is rebuildable"
    elif total_size > 0:
        status = "OK"
    else:
        status = "OK"  # 不存在也没问题

    return CheckResult(name="kuzu_graph_db", status=status, details=details)


def check_xinference_reranker() -> CheckResult:
    """检查 xinference reranker 模型状态"""
    url = DEFAULT_XINFERENCE_URL
    details = {}

    try:
        import urllib.request
        req = urllib.request.urlopen(f"{url}/v1/models", timeout=5)
        data = json.loads(req.read().decode())
        models = data.get("data", [])

        rerankers = [m for m in models if m.get("model_type") in ("rerank", "ranker")]
        reranker_names = [m["id"] for m in rerankers]

        details["rerankers"] = rerankers
        details["count"] = len(rerankers)

        # 检查 bge-reranker-v2-m3 是否存在（可选）
        expected_reranker = "bge-reranker-v2-m3"
        has_expected = expected_reranker in reranker_names

        if not rerankers:
            status = "ERROR"
            details["missing"] = "No reranker models found"
        elif not has_expected:
            status = "WARNING"
            details["note"] = f"{expected_reranker} not registered (optional)"
        else:
            status = "OK"

    except Exception as e:
        details["error"] = str(e)
        status = "CRITICAL"

    return CheckResult(name="xinference_rerankers", status=status, details=details)


# ---------------------------------------------------------------------------
# 主逻辑
# ---------------------------------------------------------------------------

def run_all_checks() -> HealthReport:
    """运行所有检查项"""
    start = time.time()

    checks = [
        check_xinference(),
        check_xinference_reranker(),
        check_m_flow(),
        check_hawk_memory_go(),
        check_openclaw_gateway(),
        check_hermes_agents(),
        check_disk_usage(),
        check_directory_sizes(),
        check_kuzu_graph_db(),
    ]

    # 大文件检查（限制在 home 目录，限时 60s）
    large_files_check = check_large_files_modified_recently(
        str(Path.home()),
        hours=24,
        min_size_mb=100
    )
    checks.append(large_files_check)

    # 确定整体状态
    status_priority = {"CRITICAL": 0, "ERROR": 1, "WARNING": 2, "OK": 3}
    overall = "OK"
    for c in checks:
        p = status_priority.get(c.status, 99)
        op = status_priority.get(overall, 99)
        if p < op:
            overall = c.status

    runtime_ms = (time.time() - start) * 1000

    return HealthReport(
        timestamp=datetime.now().strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        overall=overall,
        checks=[asdict(c) for c in checks],
        runtime_ms=round(runtime_ms, 1)
    )


def print_cron_summary(report: HealthReport):
    """Cron 模式输出简洁摘要"""
    status_icon = {
        "OK": "✅",
        "WARNING": "⚠️",
        "ERROR": "❌",
        "CRITICAL": "🚨"
    }
    icon = status_icon.get(report.overall, "?")
    print(f"{icon} hawk-health {report.timestamp} overall={report.overall}")

    for check in report.checks:
        if check["status"] != "OK":
            c_icon = status_icon.get(check["status"], "?")
            print(f"  {c_icon} {check['name']}: {check['status']}")
            if check.get("message"):
                print(f"     {check['message']}")


def format_text_report(report: HealthReport) -> str:
    """生成文本格式报告"""
    lines = [
        "=" * 60,
        " hawk-bridge 服务健康监控报告",
        "=" * 60,
        f"时间: {report.timestamp}",
        f"整体状态: {report.overall}",
        f"检查耗时: {report.runtime_ms}ms",
        "",
    ]

    status_icon = {
        "OK": "✅",
        "WARNING": "⚠️",
        "ERROR": "❌",
        "CRITICAL": "🚨"
    }

    for check in report.checks:
        icon = status_icon.get(check["status"], "?")
        lines.append(f"{icon} [{check['status']}] {check['name']}")

        if check.get("details"):
            d = check["details"]
            if "models" in d:
                for m in d["models"]:
                    lines.append(f"      - {m['id']} ({m.get('type','?')}): {'在线' if m.get('online') else '离线'}")
            if "disks" in d:
                for mount, info in d["disks"].items():
                    if isinstance(info, dict):
                        lines.append(f"      - {mount}: {info.get('used_pct','?')}% (阈值 {info.get('threshold','?')}%)")
            if "databases" in d:
                for db in d["databases"]:
                    lines.append(f"      - kuzu: {db['size_mb']}MB @ {db['path']}")
            if "files" in d and d["files"]:
                lines.append(f"      - 大文件 ({d['count']} 个):")
                for f in d["files"][:5]:
                    lines.append(f"        {f['size_mb']}MB: {f['path']}")
            if "alerts" in d:
                for alert in d["alerts"]:
                    lines.append(f"      ⚠️ {alert}")

        if check.get("message"):
            lines.append(f"      {check['message']}")

        lines.append("")

    lines.append("=" * 60)
    return "\n".join(lines)


def save_report(report: HealthReport, report_dir: Path = REPORT_DIR):
    """保存报告到文件"""
    report_dir.mkdir(parents=True, exist_ok=True)
    timestamp_str = datetime.now().strftime("%Y%m%d-%H%M%S")
    json_path = report_dir / f"health-{timestamp_str}.json"
    txt_path = report_dir / f"health-{timestamp_str}.txt"

    with open(json_path, "w") as f:
        json.dump(asdict(report), f, indent=2)

    with open(txt_path, "w") as f:
        f.write(format_text_report(report))

    return json_path, txt_path


def main():
    parser = argparse.ArgumentParser(
        description="hawk-bridge 服务健康监控",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python hawk_health_monitor.py              # 交互模式
  python hawk_health_monitor.py --cron       # Cron 模式
  python hawk_health_monitor.py --report     # 生成报告
  python hawk_health_monitor.py --json       # JSON 输出
        """
    )
    parser.add_argument("--cron", action="store_true", help="Cron 模式")
    parser.add_argument("--report", action="store_true", help="保存详细报告到文件")
    parser.add_argument("--json", action="store_true", help="JSON 输出")
    parser.add_argument("--quiet", action="store_true", help="静默模式（只返回退出码）")
    parser.add_argument(
        "--disk-threshold", type=int, default=None,
        help=f"根分区告警阈值（默认 {DISK_THRESHOLDS['/']}%%）"
    )

    args = parser.parse_args()

    # 可选：覆盖磁盘阈值
    if args.disk_threshold:
        DISK_THRESHOLDS["/"] = args.disk_threshold

    # 运行检查
    report = run_all_checks()

    # 输出
    if args.quiet:
        # 静默模式：只返回退出码（0=OK, 1=WARNING/ERROR）
        sys.exit(0 if report.overall == "OK" else 1)

    if args.json:
        print(json.dumps(asdict(report), indent=2))
    elif args.cron:
        print_cron_summary(report)
    else:
        # 默认：文本报告
        print(format_text_report(report))

    if args.report:
        json_path, txt_path = save_report(report)
        print(f"\n报告已保存:")
        print(f"  JSON: {json_path}")
        print(f"  TXT:  {txt_path}", file=sys.stderr)

    # 退出码：CRITICAL/ERROR/WARNING 都算异常
    if report.overall in ("CRITICAL", "ERROR", "WARNING"):
        sys.exit(1)


if __name__ == "__main__":
    main()
