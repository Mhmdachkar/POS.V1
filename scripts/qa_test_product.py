"""Create or remove a single QA product named testing (Main Depot)."""
from __future__ import annotations

import json
import os
import random
import uuid
from io import BytesIO
from pathlib import Path

import urllib.error
import urllib.request
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / ".env"

TEST_NAME = "testing"
TEST_SERIAL = "TEST-QA-ITEM"


def load_env() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def login(url: str, anon: str, password: str) -> str:
    body = json.dumps({"email": "admin@vhm-pos.internal", "password": password}).encode("utf-8")
    req = urllib.request.Request(
        url.rstrip("/") + "/auth/v1/token?grant_type=password",
        data=body,
        method="POST",
        headers={"apikey": anon, "content-type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))["access_token"]


class Api:
    def __init__(self, url: str, anon: str, token: str):
        self.url = url.rstrip("/")
        self.anon = anon
        self.token = token

    def request(self, method: str, path: str, data=None):
        body = None if data is None else json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            self.url + path,
            data=body,
            method=method,
            headers={
                "apikey": self.anon,
                "authorization": "Bearer %s" % self.token,
                "content-type": "application/json",
                "accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                payload = resp.read()
                return None if not payload else json.loads(payload.decode("utf-8"))
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")
            raise RuntimeError("%s %s -> %s %s" % (method, path, e.code, err)) from e

    def rpc(self, name: str, params: dict):
        return self.request("POST", "/rest/v1/rpc/%s" % name, params)

    def select(self, table: str, query: str):
        return self.request("GET", "/rest/v1/%s?%s" % (table, query))

    def upload_product_photo(self, content: bytes, ext: str) -> str:
        name = "%s.%s" % (uuid.uuid4(), ext)
        content_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[
            ext.lower()
        ]
        req = urllib.request.Request(
            self.url + "/storage/v1/object/product-photos/" + name,
            data=content,
            method="POST",
            headers={
                "apikey": self.anon,
                "authorization": "Bearer %s" % self.token,
                "content-type": content_type,
                "x-upsert": "false",
            },
        )
        with urllib.request.urlopen(req) as resp:
            resp.read()
        return "%s/storage/v1/object/public/product-photos/%s" % (self.url, name)

    def upload_demo_photo(self) -> str:
        img = Image.new("RGB", (720, 720), color=(30, 64, 175))
        draw = ImageDraw.Draw(img)
        draw.rounded_rectangle([48, 48, 672, 672], radius=32, outline=(255, 255, 255), width=6)
        draw.text((210, 320), "TESTING", fill=(255, 255, 255))
        draw.text((250, 380), "QA ITEM", fill=(191, 219, 254))
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=88, optimize=True)
        return self.upload_product_photo(buf.getvalue(), "jpg")


def units_payload(rows: list[dict]) -> list[dict]:
    return [
        {
            "unit_level": row["unit_level"],
            "unit_name": row["unit_name"],
            "serial_number": row["serial_number"],
            "relative_quantity": row.get("relative_quantity"),
            "cost_price_cfa": float(row["cost_price_cfa"]),
            "selling_price_cfa": float(row["selling_price_cfa"]),
        }
        for row in sorted(rows, key=lambda r: r["unit_level"])
    ]


def apply_test_photo(api: Api, product_id: str) -> str:
    photo_url = api.upload_demo_photo()
    rows = api.select(
        "products",
        "select=id,name,category_id,track_low_stock,low_stock_threshold,"
        "product_units(unit_level,unit_name,serial_number,relative_quantity,cost_price_cfa,selling_price_cfa)"
        "&id=eq.%s" % product_id,
    )
    product = (rows or [{}])[0]
    units = product.get("product_units") or []
    api.rpc(
        "update_product",
        {
            "p_product_id": product_id,
            "p_category_id": product["category_id"],
            "p_name": product["name"],
            "p_photo_url": photo_url,
            "p_units": units_payload(units),
            "p_track_low_stock": bool(product.get("track_low_stock")),
            "p_low_stock_threshold": product.get("low_stock_threshold"),
        },
    )
    return photo_url


def main() -> None:
    password = os.environ.get("ADMIN_PASSWORD")
    if not password:
        raise SystemExit("Set ADMIN_PASSWORD")

    env = load_env()
    url = env["VITE_SUPABASE_URL"]
    anon = env["VITE_SUPABASE_ANON_KEY"]
    token = login(url, anon, password)
    api = Api(url, anon, token)

    units = api.select("product_units", "select=serial_number,product_id&serial_number=eq.%s" % TEST_SERIAL)
    existing = (units or [None])[0]

    if os.environ.get("DELETE_TEST_PRODUCT") == "1":
        if not existing:
            print("NO_TEST_PRODUCT serial=%s" % TEST_SERIAL)
            return
        api.rpc("deactivate_product", {"p_product_id": existing["product_id"]})
        print("DEACTIVATED product_id=%s serial=%s" % (existing["product_id"], TEST_SERIAL))
        return

    if existing:
        product_id = existing["product_id"]
        prods = api.select(
            "products",
            "select=id,name,current_stock_pieces,is_active,photo_url&id=eq.%s" % product_id,
        )
        p = (prods or [{}])[0]
        photo_url = p.get("photo_url")
        if os.environ.get("UPDATE_TEST_PHOTO", "1") == "1":
            photo_url = apply_test_photo(api, product_id)
            print("PHOTO_UPDATED product_id=%s photo_url=%s" % (product_id, photo_url))
        print(
            "EXISTS product_id=%s name=%s stock=%s active=%s serial=%s"
            % (p.get("id"), p.get("name"), p.get("current_stock_pieces"), p.get("is_active"), TEST_SERIAL)
        )
        return

    depots = api.select("depots", "select=id,name,code&order=created_at")
    main_depot = next(
        (d for d in (depots or []) if str(d.get("code", "")).upper() in ("MAIN", "MAIN_DEPOT")),
        (depots or [None])[0],
    )
    if not main_depot:
        raise SystemExit("No depot found")

    cats = api.select("categories", "select=id,name,is_active")
    divers = next((c for c in (cats or []) if str(c.get("name", "")).lower() == "divers"), None)
    if not divers:
        divers = api.rpc("create_category", {"p_name": "Divers", "p_parent_id": None})

    qty = random.randint(37, 143)
    cost = 1000.0
    sell = 2500.0
    photo = api.upload_demo_photo()

    created = api.rpc(
        "create_product",
        {
            "p_depot_id": main_depot["id"],
            "p_category_id": divers["id"],
            "p_name": TEST_NAME,
            "p_photo_url": photo,
            "p_units": [
                {
                    "unit_level": 0,
                    "unit_name": "Piece",
                    "serial_number": TEST_SERIAL,
                    "relative_quantity": None,
                    "cost_price_cfa": cost,
                    "selling_price_cfa": sell,
                }
            ],
            "p_track_low_stock": False,
            "p_low_stock_threshold": None,
        },
    )
    product_id = created["id"] if isinstance(created, dict) else created[0]["id"]

    restock = api.rpc(
        "restock_product",
        {
            "p_product_id": product_id,
            "p_unit_level": 0,
            "p_quantity_in_unit": qty,
            "p_note": "QA test product — safe to deactivate after testing",
        },
    )
    stock = restock.get("new_stock_pieces") if isinstance(restock, dict) else None

    report = {
        "product_id": product_id,
        "name": TEST_NAME,
        "serial": TEST_SERIAL,
        "depot": main_depot.get("name"),
        "category": "Divers",
        "quantity_pieces": stock if stock is not None else qty,
        "cost_cfa": cost,
        "sell_cfa": sell,
        "photo_url": photo,
    }
    out = ROOT / "scripts" / "_qa_test_product.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("CREATED", json.dumps(report))


if __name__ == "__main__":
    main()