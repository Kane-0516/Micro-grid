import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent
tag = "20260629-5ad4561"
src = subprocess.check_output(
    [
        "aws",
        "s3",
        "presign",
        f"s3://voltage-mgs/pre-sale/deploy/microgrid-src-{tag}.tgz",
        "--expires-in",
        "7200",
        "--region",
        "us-east-1",
    ],
    text=True,
).strip()
boot = subprocess.check_output(
    [
        "aws",
        "s3",
        "presign",
        "s3://voltage-mgs/pre-sale/deploy/remote-bootstrap.sh",
        "--expires-in",
        "7200",
        "--region",
        "us-east-1",
    ],
    text=True,
).strip()
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent
tag = "20260629-5ad4561"
src = subprocess.check_output(
    [
        "aws",
        "s3",
        "presign",
        f"s3://voltage-mgs/pre-sale/deploy/microgrid-src-{tag}.tgz",
        "--expires-in",
        "7200",
        "--region",
        "us-east-1",
    ],
    text=True,
).strip()
boot = subprocess.check_output(
    [
        "aws",
        "s3",
        "presign",
        "s3://voltage-mgs/pre-sale/deploy/remote-bootstrap.sh",
        "--expires-in",
        "7200",
        "--region",
        "us-east-1",
    ],
    text=True,
).strip()
cmd = (
    "bash -lc "
    + repr(
        f"curl -fsSL '{boot}' -o /tmp/remote-bootstrap.sh && "
        f"sed -i 's/\\r$//' /tmp/remote-bootstrap.sh && "
        f"chmod +x /tmp/remote-bootstrap.sh && "
        f"nohup sudo bash /tmp/remote-bootstrap.sh {tag} '{src}' "
        f"> /tmp/deploy-20260629.log 2>&1 & echo DEPLOY_STARTED"
    )
)
(root / "ssm-start-deploy.json").write_text(
    json.dumps({"command": [cmd]}, ensure_ascii=False),
    encoding="utf-8",
)
print("written", root / "ssm-start-deploy.json")
